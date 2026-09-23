import { env } from "cloudflare:workers";
import {
  isProfileReviewStatus,
  profileReviewStatuses,
  reviewRatingConfig,
  type ProfileReviewStatus,
} from "@/lib/profile-review-domain";
import {
  applyAtomicProfileReviewModeration,
  profileReviewAdminActions,
  profileReviewModerationReasonCodes,
  ProfileReviewModerationConflictError,
  type ProfileReviewAdminAction,
  type ProfileReviewModerationReasonCode,
} from "@/lib/profile-review-admin-transition";
import { normalizePlainText, safeAuditJson } from "@/lib/submission-security";

export const PROFILE_REVIEW_ADMIN_PAGE_SIZE = 25;
export const profileReviewAdminEntityTypes = ["DIRECTORY_PROFILE", "HELP_ORGANIZATION"] as const;
export type ProfileReviewAdminEntityType = (typeof profileReviewAdminEntityTypes)[number];

type RuntimeBindings = { DB?: D1Database };

type AdminReviewListRow = {
  id: string;
  status: ProfileReviewStatus;
  overall_rating: number;
  body: string;
  created_at: string;
  updated_at: string;
  risk_flags_json: string;
  resource_id: string;
  entity_type: ProfileReviewAdminEntityType;
  target_name: string | null;
  target_slug: string | null;
  target_category: string | null;
  display_name: string | null;
  author_id: string;
  report_count: number;
};

type AdminReviewDetailRow = AdminReviewListRow & {
  service_month: string | null;
  service_type_key: string | null;
  rating_schema_version: number;
  published_at: string | null;
  deleted_at: string | null;
  reviewer_status: string;
};

type RatingValueRow = { dimension_key: string; value: number };
type AuditRow = {
  id: string;
  action: string;
  actor_type: string;
  actor_ref: string | null;
  from_status: string | null;
  to_status: string | null;
  reason_code: string | null;
  changed_fields_json: string;
  request_id: string | null;
  created_at: string;
};
type ReportSummaryRow = {
  report_count: number;
  open_count: number;
  in_review_count: number;
  resolved_count: number;
  dismissed_count: number;
};

export class ProfileReviewAdminError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(message: string, status = 400, code = "PROFILE_REVIEW_ADMIN_ERROR") {
    super(message);
    this.name = "ProfileReviewAdminError";
    this.status = status;
    this.code = code;
  }
}

export { ProfileReviewModerationConflictError, profileReviewAdminActions, profileReviewModerationReasonCodes };

function getDatabase(database?: D1Database) {
  const db = database ?? (env as unknown as RuntimeBindings).DB;
  if (!db?.prepare) throw new ProfileReviewAdminError("Databáza profilových recenzií nie je dostupná.", 503, "DATABASE_UNAVAILABLE");
  return db;
}

function getMutationDatabase(database?: D1Database) {
  const db = getDatabase(database);
  if (typeof db.batch !== "function") throw new ProfileReviewAdminError("Databáza nepodporuje atómovú moderáciu.", 503, "DATABASE_UNAVAILABLE");
  return db;
}

function clampPage(value: unknown) {
  const parsed = Number.parseInt(String(value ?? "1"), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeSearch(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 120) : "";
}

function publicHref(row: { entity_type: string; target_slug: string | null; target_category: string | null }) {
  if (!row.target_slug) return null;
  if (row.entity_type === "DIRECTORY_PROFILE" && row.target_category) {
    return `/adresar/${row.target_category}/${row.target_slug}`;
  }
  if (row.entity_type === "HELP_ORGANIZATION") return `/organizacie/${row.target_slug}`;
  return null;
}

function parseRiskFlags(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(value ?? "[]") as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string").slice(0, 50)
      : [];
  } catch {
    return [];
  }
}

function parseAuditMetadata(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed)) return { fields: parsed.filter((item): item is string => typeof item === "string"), moderatorNote: null };
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      return {
        fields: Array.isArray(record.fields) ? record.fields.filter((item): item is string => typeof item === "string") : [],
        moderatorNote: typeof record.moderatorNote === "string" ? record.moderatorNote : null,
      };
    }
  } catch {
    // Historical audit payloads are allowed to be unreadable without breaking admin detail.
  }
  return { fields: [] as string[], moderatorNote: null as string | null };
}

function isEntityType(value: unknown): value is ProfileReviewAdminEntityType {
  return typeof value === "string" && (profileReviewAdminEntityTypes as readonly string[]).includes(value);
}

export function normalizeProfileReviewAdminFilters(input: {
  status?: unknown;
  entityType?: unknown;
  rating?: unknown;
  q?: unknown;
  page?: unknown;
}) {
  const status = input.status === "all" ? "all" : isProfileReviewStatus(input.status) ? input.status : "PENDING_REVIEW";
  const entityType = input.entityType === "all" ? "all" : isEntityType(input.entityType) ? input.entityType : "all";
  const ratingNumber = Number.parseInt(String(input.rating ?? ""), 10);
  const rating = Number.isInteger(ratingNumber) && ratingNumber >= 1 && ratingNumber <= 5 ? ratingNumber : null;
  return {
    status,
    entityType,
    rating,
    q: normalizeSearch(input.q),
    page: clampPage(input.page),
  };
}

function mapListRow(row: AdminReviewListRow) {
  return {
    id: row.id,
    status: row.status,
    overallRating: Number(row.overall_rating),
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resourceId: row.resource_id,
    entityType: row.entity_type,
    targetName: row.target_name ?? "Neznámy profil",
    targetCategory: row.target_category,
    targetHref: publicHref(row),
    reviewerDisplayName: row.display_name?.trim() || "Používateľ Psipedia.sk",
    reviewerId: row.author_id,
    reportCount: Math.max(0, Number(row.report_count ?? 0)),
    riskFlags: parseRiskFlags(row.risk_flags_json),
  };
}

export async function listProfileReviewsAdmin(input: {
  status?: unknown;
  entityType?: unknown;
  rating?: unknown;
  q?: unknown;
  page?: unknown;
  pageSize?: number;
  database?: D1Database;
} = {}) {
  const db = getDatabase(input.database);
  const filters = normalizeProfileReviewAdminFilters(input);
  const pageSize = Math.max(1, Math.min(100, Math.trunc(input.pageSize ?? PROFILE_REVIEW_ADMIN_PAGE_SIZE)));
  const where: string[] = [];
  const binds: unknown[] = [];

  if (filters.status !== "all") {
    where.push("review.status=?");
    binds.push(filters.status);
  }
  if (filters.entityType !== "all") {
    where.push("resource.entity_type=?");
    binds.push(filters.entityType);
  }
  if (filters.rating !== null) {
    where.push("review.overall_rating=?");
    binds.push(filters.rating);
  }
  if (filters.q) {
    where.push("(LOWER(review.body) LIKE LOWER(?) OR LOWER(COALESCE(author.display_name,'')) LIKE LOWER(?) OR LOWER(COALESCE(directory.name,organization.name,'')) LIKE LOWER(?))");
    const pattern = `%${filters.q}%`;
    binds.push(pattern, pattern, pattern);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countSql = `
    SELECT COUNT(*) AS count
    FROM profile_reviews review
    JOIN partner_resources resource ON resource.id=review.resource_id
    JOIN review_authors author ON author.id=review.author_id
    LEFT JOIN directory_profiles directory ON directory.id=resource.directory_profile_id
    LEFT JOIN help_organizations organization ON organization.id=resource.help_organization_id
    ${whereSql}
  `;

  const countRow = await db.prepare(countSql).bind(...binds).first<{ count: number }>();
  const total = Math.max(0, Number(countRow?.count ?? 0));
  const totalPages = total ? Math.ceil(total / pageSize) : 0;
  const page = totalPages ? Math.min(filters.page, totalPages) : 1;
  const offset = (page - 1) * pageSize;

  const listSql = `
    SELECT
      review.id, review.status, review.overall_rating, review.body, review.created_at, review.updated_at,
      review.risk_flags_json, review.resource_id,
      resource.entity_type,
      COALESCE(directory.name, organization.name) AS target_name,
      COALESCE(directory.slug, organization.slug) AS target_slug,
      directory.category AS target_category,
      author.display_name, review.author_id,
      (SELECT COUNT(*) FROM profile_review_reports report WHERE report.review_id=review.id) AS report_count
    FROM profile_reviews review
    JOIN partner_resources resource ON resource.id=review.resource_id
    JOIN review_authors author ON author.id=review.author_id
    LEFT JOIN directory_profiles directory ON directory.id=resource.directory_profile_id
    LEFT JOIN help_organizations organization ON organization.id=resource.help_organization_id
    ${whereSql}
    ORDER BY
      CASE WHEN review.status='PENDING_REVIEW' THEN 0 ELSE 1 END,
      CASE WHEN review.status='PENDING_REVIEW' THEN review.created_at END DESC,
      review.created_at DESC,
      review.id DESC
    LIMIT ? OFFSET ?
  `;

  const { results } = await db.prepare(listSql).bind(...binds, pageSize, offset).all<AdminReviewListRow>();
  return {
    items: results.map(mapListRow),
    filters,
    pagination: { page, pageSize, total, totalPages },
    statuses: profileReviewStatuses,
  };
}

export async function getProfileReviewAdmin(id: string, database?: D1Database) {
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(id)) return null;
  const db = getDatabase(database);
  const row = await db.prepare(`
    SELECT
      review.id, review.status, review.overall_rating, review.body, review.service_month,
      review.service_type_key, review.rating_schema_version, review.risk_flags_json,
      review.created_at, review.updated_at, review.published_at, review.deleted_at, review.resource_id,
      resource.entity_type,
      COALESCE(directory.name, organization.name) AS target_name,
      COALESCE(directory.slug, organization.slug) AS target_slug,
      directory.category AS target_category,
      author.display_name, author.id AS author_id, author.status AS reviewer_status,
      (SELECT COUNT(*) FROM profile_review_reports report WHERE report.review_id=review.id) AS report_count
    FROM profile_reviews review
    JOIN partner_resources resource ON resource.id=review.resource_id
    JOIN review_authors author ON author.id=review.author_id
    LEFT JOIN directory_profiles directory ON directory.id=resource.directory_profile_id
    LEFT JOIN help_organizations organization ON organization.id=resource.help_organization_id
    WHERE review.id=?
    LIMIT 1
  `).bind(id).first<AdminReviewDetailRow>();
  if (!row) return null;

  const [dimensionResult, auditResult, reportSummary] = await Promise.all([
    db.prepare(`
      SELECT dimension_key, value
      FROM profile_review_rating_values
      WHERE review_id=?
      ORDER BY dimension_key ASC
    `).bind(id).all<RatingValueRow>(),
    db.prepare(`
      SELECT id, action, actor_type, actor_ref, from_status, to_status, reason_code,
        changed_fields_json, request_id, created_at
      FROM moderation_events
      WHERE resource_type='PROFILE_REVIEW' AND subject_id=?
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `).bind(id).all<AuditRow>(),
    db.prepare(`
      SELECT
        COUNT(*) AS report_count,
        SUM(CASE WHEN status='OPEN' THEN 1 ELSE 0 END) AS open_count,
        SUM(CASE WHEN status='IN_REVIEW' THEN 1 ELSE 0 END) AS in_review_count,
        SUM(CASE WHEN status='RESOLVED' THEN 1 ELSE 0 END) AS resolved_count,
        SUM(CASE WHEN status='DISMISSED' THEN 1 ELSE 0 END) AS dismissed_count
      FROM profile_review_reports
      WHERE review_id=?
    `).bind(id).first<ReportSummaryRow>(),
  ]);

  const config = reviewRatingConfig({
    entityType: row.entity_type,
    category: row.target_category,
  });
  const labels = new Map(config.dimensions.map((item) => [item.key, item.label]));

  return {
    ...mapListRow(row),
    serviceMonth: row.service_month,
    serviceTypeKey: row.service_type_key,
    ratingSchemaVersion: Number(row.rating_schema_version),
    publishedAt: row.published_at,
    deletedAt: row.deleted_at,
    reviewerStatus: row.reviewer_status,
    dimensions: dimensionResult.results.map((item) => ({
      key: item.dimension_key,
      label: labels.get(item.dimension_key) ?? item.dimension_key,
      value: Number(item.value),
    })),
    reports: {
      total: Number(reportSummary?.report_count ?? 0),
      open: Number(reportSummary?.open_count ?? 0),
      inReview: Number(reportSummary?.in_review_count ?? 0),
      resolved: Number(reportSummary?.resolved_count ?? 0),
      dismissed: Number(reportSummary?.dismissed_count ?? 0),
    },
    audit: auditResult.results.map((item) => ({
      id: item.id,
      action: item.action,
      actorType: item.actor_type,
      actorRef: item.actor_ref,
      fromStatus: item.from_status,
      toStatus: item.to_status,
      reasonCode: item.reason_code,
      requestId: item.request_id,
      createdAt: item.created_at,
      ...parseAuditMetadata(item.changed_fields_json),
    })),
  };
}

function isAdminAction(value: unknown): value is ProfileReviewAdminAction {
  return typeof value === "string" && (profileReviewAdminActions as readonly string[]).includes(value);
}

function normalizeReasonCode(value: unknown): ProfileReviewModerationReasonCode | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !(profileReviewModerationReasonCodes as readonly string[]).includes(value)) {
    throw new ProfileReviewAdminError("Neplatný dôvod moderácie.", 400, "INVALID_REASON");
  }
  return value as ProfileReviewModerationReasonCode;
}

function normalizeModeratorNote(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  try {
    return normalizePlainText(value, { max: 1000, field: "moderatorNote" });
  } catch {
    throw new ProfileReviewAdminError("Interná poznámka nie je platná.", 400, "INVALID_NOTE");
  }
}

function normalizeRequestId(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  return /^[A-Za-z0-9._:-]{1,120}$/.test(clean) ? clean : null;
}

export async function moderateProfileReviewAdmin(input: {
  id: string;
  action: unknown;
  expectedStatus: unknown;
  reasonCode?: unknown;
  moderatorNote?: unknown;
  actorRef: string;
  requestId?: string | null;
  database?: D1Database;
  now?: Date;
}) {
  if (!isAdminAction(input.action)) throw new ProfileReviewAdminError("Neplatná moderation akcia.", 400, "INVALID_ACTION");
  if (!isProfileReviewStatus(input.expectedStatus)) throw new ProfileReviewAdminError("Neplatný očakávaný stav.", 400, "INVALID_EXPECTED_STATUS");

  const db = getMutationDatabase(input.database);
  const current = await db.prepare("SELECT id,status,published_at FROM profile_reviews WHERE id=? LIMIT 1")
    .bind(input.id)
    .first<{ id: string; status: ProfileReviewStatus; published_at: string | null }>();
  if (!current) throw new ProfileReviewAdminError("Recenzia sa nenašla.", 404, "NOT_FOUND");
  if (current.status !== input.expectedStatus) throw new ProfileReviewModerationConflictError();

  const reasonCode = normalizeReasonCode(input.reasonCode);
  const moderatorNote = normalizeModeratorNote(input.moderatorNote);
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();

  const fields = ["status", "updated_at"];
  if (input.action === "APPROVE" && !current.published_at) fields.push("published_at");
  if (input.action === "REMOVE") fields.push("deleted_at");

  try {
    await applyAtomicProfileReviewModeration(db, {
      id: input.id,
      expectedStatus: current.status,
      action: input.action,
      actorRef: input.actorRef,
      reasonCode,
      requestId: normalizeRequestId(input.requestId),
      eventId: crypto.randomUUID(),
      changedFieldsJson: safeAuditJson({ fields, moderatorNote }),
      now: nowIso,
    });
  } catch (error) {
    if (error instanceof ProfileReviewModerationConflictError) throw error;
    if (error instanceof Error && /Invalid profile review transition/.test(error.message)) {
      throw new ProfileReviewAdminError("Tento prechod stavu nie je povolený.", 409, "INVALID_TRANSITION");
    }
    if (error instanceof Error && error.message === "Moderation reason is required") {
      throw new ProfileReviewAdminError("Pre túto akciu je povinný dôvod moderácie.", 422, "REASON_REQUIRED");
    }
    throw error;
  }

  return getProfileReviewAdmin(input.id, db);
}
