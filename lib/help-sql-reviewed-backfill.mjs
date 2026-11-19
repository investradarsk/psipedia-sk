/**
 * Step 3/6 — a NON-EXECUTING, narrowly allowlisted legacy Help backfill planner.
 *
 * Historical help_cases entries are NOT a second live editor database.
 * Nothing is imported or overwritten without a field-specific human review
 * receipt containing exact canonical/source identity, revisions and source hash.
 *
 * This module only SELECTs D1 and returns a guarded SQL statement for a later,
 * separately protected workflow. No execute/run calls, no logging of values,
 * no Notion reads/writes, no automatic migration, no source cleanup.
 */
import { createHash } from "node:crypto";

const ADOPTION = Object.freeze({
  agenda: "adoptions",
  category: "adopcia",
  table: "adoption_dogs",
  targetStatuses: Object.freeze(["DRAFT", "ACTIVE", "RESERVED"]),
  provenanceColumn: "created_by",
  provenanceValue: "adoption-staging-import:v1",
  reviewType: "ADOPTION",
  partnerOwnershipSql: "EXISTS(SELECT 1 FROM partner_help_claims pc " +
    "WHERE pc.adoption_dog_id=adoption_dogs.id AND pc.status='APPROVED')",
  fields: Object.freeze({
    main_image: "image_url",
    short_description: "excerpt",
    description: "description",
  }),
});
const ORGANIZATION = Object.freeze({
  agenda: "organizations",
  category: "utulky",
  table: "help_organizations",
  targetStatuses: Object.freeze(["DRAFT", "PUBLISHED"]),
  provenanceColumn: "import_key",
  provenanceValue: null, // exactly help-org:{slug}; checked on read and at UPDATE
  reviewType: "ORGANIZATION",
  partnerOwnershipSql: "EXISTS(SELECT 1 FROM partner_resources pr " +
    "JOIN partner_memberships pm ON pm.resource_id=pr.id " +
    "WHERE pr.help_organization_id=help_organizations.id AND pm.revoked_at IS NULL)",
  fields: Object.freeze({
    image_url: "image_url",
    short_description: "excerpt",
    description: "description",
  }),
});
export const HELP_REVIEWED_BACKFILL_RULES = Object.freeze({
  adoptions: ADOPTION,
  organizations: ORGANIZATION,
});

/**
 * Same D1-owned lock contract as Admin ↔ Notion and partner approval:
 * admin_entity_reviews is sticky, while active partner ownership is an
 * independent lock. The target table is fixed by the allowlisted agenda.
 */
function lockedSql(rule) {
  return "(EXISTS(SELECT 1 FROM admin_entity_reviews ar " +
    "WHERE ar.entity_type='" + rule.reviewType + "' " +
    "AND ar.entity_id=" + rule.table + ".id) OR " +
    rule.partnerOwnershipSql + ")";
}


/** Private source strings are deliberately never emitted in a report. */
export function hashHelpBackfillValue(value) {
  if (typeof value !== "string") throw new Error("HELP_BACKFILL_NON_TEXT_VALUE");
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function checkedId(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("HELP_BACKFILL_INVALID_" + label);
  return value;
}
function checkedRevision(value, label) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)) ||
      !/^\d{4}-\d\d-\d\dT/.test(value))
    throw new Error("HELP_BACKFILL_INVALID_" + label);
  return value;
}
function verifiedReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || receipt.approved !== true)
    throw new Error("HELP_BACKFILL_REVIEW_REQUIRED");
  const rule = Object.hasOwn(HELP_REVIEWED_BACKFILL_RULES, receipt.agenda)
    ? HELP_REVIEWED_BACKFILL_RULES[receipt.agenda] : null;
  const sourceColumn = rule && Object.hasOwn(rule.fields, receipt.field)
    ? rule.fields[receipt.field] : null;
  if (!rule || !sourceColumn) throw new Error("HELP_BACKFILL_FIELD_NOT_ALLOWLISTED");
  if (typeof receipt.slug !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(receipt.slug))
    throw new Error("HELP_BACKFILL_INVALID_SLUG");
  checkedId(receipt.sourceId, "SOURCE_ID");
  checkedId(receipt.targetId, "TARGET_ID");
  checkedRevision(receipt.sourceUpdatedAt, "SOURCE_REVISION");
  checkedRevision(receipt.targetUpdatedAt, "TARGET_REVISION");
  if (typeof receipt.sourceSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(receipt.sourceSha256))
    throw new Error("HELP_BACKFILL_INVALID_SOURCE_HASH");
  if (receipt.targetWas !== "NULL" && receipt.targetWas !== "EMPTY")
    throw new Error("HELP_BACKFILL_EXPECTED_BLANK_STATE_REQUIRED");
  return { rule, sourceColumn };
}

function checkedCount(row) {
  if (!row || !Number.isSafeInteger(Number(row.n)) || Number(row.n) < 0)
    throw new Error("HELP_BACKFILL_UNREADABLE_COUNT");
  return Number(row.n);
}
function result(reason, extra = {}) {
  return { decision: "BLOCKED", reason, ...extra };
}
const MATCHED = Object.freeze({ decision: "ALREADY_APPLIED", reason: "CANONICAL_ALREADY_EQUAL" });

/**
 * Prepare an evidence-bound *single-field* D1 mutation for step 6.
 *
 * A receipt must be independently reviewed, never auto-generated from a JSON
 * candidate scan. Source and target values are loaded transiently from D1.
 * Only a matching legacy category+slug pair may be used.
 *
 * @param {object} database D1 compatible { prepare().bind().first() }
 * @param {object} receipt Explicit human-approved exact-identity snapshot
 * @returns {Promise<object>} Safe decision; READY contains an SQL statement and
 *   private binds, which callers must never write into logs/artifacts.
 */
export async function prepareReviewedHelpBackfill(database, receipt) {
  const { rule, sourceColumn } = verifiedReceipt(receipt);
  if (!database || typeof database.prepare !== "function")
    throw new Error("HELP_BACKFILL_DB_UNAVAILABLE");
  const srcCount = checkedCount(await database.prepare(
    "SELECT COUNT(*) AS n FROM help_cases WHERE category=? AND slug=?"
  ).bind(rule.category, receipt.slug).first());
  const dstCount = checkedCount(await database.prepare(
    "SELECT COUNT(*) AS n FROM " + rule.table + " WHERE slug=?"
  ).bind(receipt.slug).first());
  if (srcCount !== 1 || dstCount !== 1) return result("IDENTITY_NOT_UNIQUE_OR_MISSING");

  const source = await database.prepare(
    "SELECT id,slug,category,status,updated_at," + sourceColumn +
    " AS candidate FROM help_cases WHERE id=? AND category=? AND slug=?"
  ).bind(receipt.sourceId, rule.category, receipt.slug).first();
  const target = await database.prepare(
    "SELECT id,slug,status,updated_at," + receipt.field +
    " AS canonical," + rule.provenanceColumn + " AS provenance, " +
    lockedSql(rule) + " AS editorial_locked FROM " +
    rule.table + " WHERE id=? AND slug=?"
  ).bind(receipt.targetId, receipt.slug).first();
  if (!source || !target || source.id !== receipt.sourceId ||
      target.id !== receipt.targetId || source.slug !== receipt.slug ||
      target.slug !== receipt.slug)
    return result("IDENTITY_MISMATCH");
  if (source.status !== "published" || !rule.targetStatuses.includes(target.status))
    return result("LIFECYCLE_NOT_ELIGIBLE");
  const requiredProvenance = rule.provenanceValue ?? ("help-org:" + receipt.slug);
  if (target.provenance !== requiredProvenance) return result("PROVENANCE_NOT_VERIFIED");
  // Never apply old historical content to an Admin-reviewed or partner-owned
  // canonical profile, even with an earlier operator receipt.
  if (Number(target.editorial_locked) !== 0) return result("CANONICAL_EDITORIAL_LOCKED");
  if (source.updated_at !== receipt.sourceUpdatedAt)
    return result("SOURCE_REVISION_CHANGED");
  if (typeof source.candidate !== "string" || !source.candidate.trim())
    return result("SOURCE_EMPTY_OR_INVALID");
  if (hashHelpBackfillValue(source.candidate) !== receipt.sourceSha256)
    return result("SOURCE_VALUE_CHANGED");

  // Re-running a successful backfill is a no-op, never another UPDATE.
  if (target.canonical === source.candidate) return MATCHED;
  if (target.updated_at !== receipt.targetUpdatedAt)
    return result("CANONICAL_REVISION_CHANGED");

  const requestedBlank = receipt.targetWas === "NULL" ? null : "";
  if (target.canonical !== requestedBlank) return result("CANONICAL_NOT_APPROVED_BLANK");

  // Final UPDATE rechecks source + target + identity + field emptiness and
  // statuses atomically. Source hash was checked in memory; source value is
  // rechecked in the SQL EXISTS to reject concurrent edits before mutation.
  const emptyGuard = requestedBlank === null ? receipt.field + " IS NULL"
    : receipt.field + " = ''";
  const provenanceGuard = rule.provenanceColumn + " = ?";
  const statuses = rule.targetStatuses.map(() => "?").join(",");
  const sql =
    "UPDATE " + rule.table + " SET " + receipt.field + "=?,updated_at=?,updated_by=? " +
    "WHERE id=? AND slug=? AND updated_at=? AND " + emptyGuard + " " +
    "AND status IN (" + statuses + ") AND " + provenanceGuard + " " +
    "AND NOT " + lockedSql(rule) + " " +
    "AND EXISTS (SELECT 1 FROM help_cases h WHERE h.id=? AND h.category=? " +
    "AND h.slug=? AND h.status='published' AND h.updated_at=? AND h." +
    sourceColumn + "=?)";
  const now = new Date().toISOString();
  if (Date.parse(now) <= Date.parse(target.updated_at))
    return result("CLOCK_NOT_AFTER_TARGET_REVISION");
  const binds = [
    source.candidate, now, "help-sql-reviewed-backfill:v1",
    receipt.targetId, receipt.slug, receipt.targetUpdatedAt,
    ...rule.targetStatuses, requiredProvenance,
    receipt.sourceId, rule.category, receipt.slug, receipt.sourceUpdatedAt,
    source.candidate,
  ];
  return {
    decision: "READY",
    reason: "EXACT_APPROVED_EMPTY_FIELD",
    agenda: rule.agenda, field: receipt.field,
    // Private: never log or export this object. Step 6 workflow owns execution.
    statement: { sql, binds },
  };
}

/**
 * Public-safe legacy coverage queries: counts only, no IDs, fields or PII.
 * Every scope is an exact D1 owner; missing target rows remain review blockers.
 * Lost/found cannot be linked by slug alone because type is significant.
 */
export const HELP_LEGACY_COVERAGE = Object.freeze([
  Object.freeze({ category: "adopcia", target: "adoption_dogs" }),
  Object.freeze({ category: "utulky", target: "help_organizations" }),
]);
export function helpLegacyCoverageQueries() {
  return HELP_LEGACY_COVERAGE.map(({ category, target }) => ({
    category,
    sql: "SELECT COUNT(*) AS legacy_total, " +
      "COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM " + target +
      " t WHERE t.slug=h.slug) THEN 1 ELSE 0 END),0) AS matched, " +
      "COALESCE(SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM " + target +
      " t WHERE t.slug=h.slug) THEN 1 ELSE 0 END),0) AS unmatched " +
      "FROM help_cases h WHERE h.category='" + category + "'",
  }));
}


/**
 * Historic lost/found Help slug coverage is read-only and cannot authorize a
 * migration. A single slug match still lacks the essential LOST/FOUND type:
 * it must be reviewed; multiple types for the same slug are ambiguous.
 * Only aggregate counts leave D1 — no IDs, locations, contacts or notes.
 */
export function helpLegacyLostFoundCoverageQuery() {
  const count = "(SELECT COUNT(*) FROM lost_found_dog_reports r WHERE r.slug=h.slug)";
  return "SELECT COUNT(*) AS legacy_total, " +
    "COALESCE(SUM(CASE WHEN " + count + "=0 THEN 1 ELSE 0 END),0) AS no_slug_match, " +
    "COALESCE(SUM(CASE WHEN " + count + "=1 THEN 1 ELSE 0 END),0) AS needs_type_review, " +
    "COALESCE(SUM(CASE WHEN " + count + ">1 THEN 1 ELSE 0 END),0) AS ambiguous_type_match " +
    "FROM help_cases h WHERE h.category='stratene-a-najdene'";
}

/**
 * Field-level aggregate *candidate* counts, NOT proof of source precedence.
 * A nonempty legacy value and blank canonical value may also mean a deliberate
 * Admin/Notion deletion; only an independently approved receipt can authorize
 * a later write. All output is numerical, with no field values or profile IDs.
 */
export function helpLegacyFieldCandidateQueries() {
  const queries = [];
  for (const rule of Object.values(HELP_REVIEWED_BACKFILL_RULES)) {
    const statuses = rule.targetStatuses.map(value => "'" + value + "'").join(",");
    const provenance = rule.provenanceColumn + "='" +
      (rule.provenanceValue ?? "help-org:") + "'";
    const provenanceGuard = rule.provenanceValue === null
      ? "t.import_key=('help-org:' || t.slug)" : "t." + provenance;
    for (const [field, sourceColumn] of Object.entries(rule.fields)) {
      const from = "h." + sourceColumn, to = "t." + field;
      const hasSource = from + " IS NOT NULL AND TRIM(" + from + ")<>''";
      const targetBlank = "(" + to + " IS NULL OR TRIM(" + to + ")='')";
      const otherValue = to + " IS NOT NULL AND TRIM(" + to +
        ")<>'' AND " + to + "<>" + from;
      queries.push({
        agenda: rule.agenda, field,
        sql: "SELECT COUNT(*) AS joined_pairs, " +
          "COALESCE(SUM(CASE WHEN " + hasSource + " AND " + targetBlank +
          " THEN 1 ELSE 0 END),0) AS potential_missing, " +
          "COALESCE(SUM(CASE WHEN " + hasSource + " AND " + otherValue +
          " THEN 1 ELSE 0 END),0) AS different_nonempty " +
          "FROM help_cases h JOIN " + rule.table + " t ON t.slug=h.slug " +
          "WHERE h.category='" + rule.category + "' AND h.status='published' " +
          "AND t.status IN (" + statuses + ") AND " + provenanceGuard,
      });
    }
  }
  return queries;
}
