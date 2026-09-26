import { env } from "cloudflare:workers";
import { canonicalizeSourceUrl, isSafeAutomationSourceUrl } from "./data-automation";

export type AutomationGovernanceDatabase = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

export type AutomationGovernanceSubjectType = "DISCOVERY_ROOT" | "AUTOMATION_SOURCE";
export type AutomationGovernanceSubject = { type: AutomationGovernanceSubjectType; id: number };

export type AutomationGovernanceState = {
  id: number;
  subjectType: AutomationGovernanceSubjectType;
  subjectId: number;
  accessStatus: "UNKNOWN" | "ALLOWED" | "RESTRICTED" | "BLOCKED";
  robotsStatus: "UNKNOWN" | "ALLOWED" | "RESTRICTED" | "DISALLOWED" | "NOT_APPLICABLE";
  termsStatus: "UNKNOWN" | "ALLOWED" | "REQUIRES_REVIEW" | "RESTRICTED" | "BLOCKED";
  recurringStatus: "UNKNOWN" | "APPROVED" | "RESTRICTED" | "DENIED";
  retentionStatus: "UNKNOWN" | "APPROVED" | "RESTRICTED" | "DENIED";
  retainUrl: boolean;
  retainTitle: boolean;
  retainSnippet: boolean;
  retainMetadata: boolean;
  retentionDays: number | null;
  minCadenceMinutes: number | null;
  maxRequestsPerDay: number | null;
  manualOnly: boolean;
  pathScope: string | null;
  restrictionsNote: string | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  robotsUrl: string | null;
  evidenceUrl: string | null;
  reviewedAt: string;
  reviewedBy: string;
  rationale: string;
  expiresAt: string | null;
  reviewDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationGovernanceRead = {
  schemaAvailable: boolean;
  state: AutomationGovernanceState | null;
};

export type AutomationGovernanceInput = Omit<
  AutomationGovernanceState,
  "id" | "subjectType" | "subjectId" | "reviewedAt" | "reviewedBy" | "createdAt" | "updatedAt"
> & {
  expectedUpdatedAt?: string | null;
};

export type AutomationGovernanceBlockingReason =
  | "GOVERNANCE_SCHEMA_UNAVAILABLE"
  | "GOVERNANCE_MISSING"
  | "GOVERNANCE_EXPIRED"
  | "ACCESS_NOT_ALLOWED"
  | "ROBOTS_NOT_ALLOWED"
  | "TERMS_NOT_ALLOWED"
  | "RECURRING_USE_NOT_APPROVED"
  | "MANUAL_ONLY"
  | "CADENCE_TOO_FREQUENT"
  | "RETENTION_NOT_APPROVED"
  | "RETENTION_URL_NOT_ALLOWED"
  | "RETENTION_TITLE_NOT_ALLOWED"
  | "RETENTION_SNIPPET_NOT_ALLOWED"
  | "RETENTION_METADATA_NOT_ALLOWED";

export type AutomationGovernanceEvaluation = {
  allowed: boolean;
  blockingReasons: AutomationGovernanceBlockingReason[];
  storageProfile: {
    url: boolean;
    title: boolean;
    snippet: boolean;
    metadata: boolean;
    retentionDays: number | null;
  };
};

function database(input?: AutomationGovernanceDatabase) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Governance nemá pripojenú databázu.");
}

function num(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function mapState(row: Record<string, unknown>): AutomationGovernanceState {
  return {
    id: num(row.id),
    subjectType: String(row.subject_type) as AutomationGovernanceSubjectType,
    subjectId: num(row.subject_id),
    accessStatus: String(row.access_status) as AutomationGovernanceState["accessStatus"],
    robotsStatus: String(row.robots_status) as AutomationGovernanceState["robotsStatus"],
    termsStatus: String(row.terms_status) as AutomationGovernanceState["termsStatus"],
    recurringStatus: String(row.recurring_status) as AutomationGovernanceState["recurringStatus"],
    retentionStatus: String(row.retention_status) as AutomationGovernanceState["retentionStatus"],
    retainUrl: Boolean(row.retain_url),
    retainTitle: Boolean(row.retain_title),
    retainSnippet: Boolean(row.retain_snippet),
    retainMetadata: Boolean(row.retain_metadata),
    retentionDays: nullableNumber(row.retention_days),
    minCadenceMinutes: nullableNumber(row.min_cadence_minutes),
    maxRequestsPerDay: nullableNumber(row.max_requests_per_day),
    manualOnly: Boolean(row.manual_only),
    pathScope: row.path_scope ? String(row.path_scope) : null,
    restrictionsNote: row.restrictions_note ? String(row.restrictions_note) : null,
    termsUrl: row.terms_url ? String(row.terms_url) : null,
    privacyUrl: row.privacy_url ? String(row.privacy_url) : null,
    robotsUrl: row.robots_url ? String(row.robots_url) : null,
    evidenceUrl: row.evidence_url ? String(row.evidence_url) : null,
    reviewedAt: String(row.reviewed_at ?? ""),
    reviewedBy: String(row.reviewed_by ?? ""),
    rationale: String(row.rationale ?? ""),
    expiresAt: row.expires_at ? String(row.expires_at) : null,
    reviewDueAt: row.review_due_at ? String(row.review_due_at) : null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function isMissingSchema(error: unknown) {
  return /no such table:\s*automation_governance_reviews/i.test(error instanceof Error ? error.message : String(error));
}

export async function getGovernanceState(
  subject: AutomationGovernanceSubject,
  databaseInput?: AutomationGovernanceDatabase,
): Promise<AutomationGovernanceRead> {
  const db = database(databaseInput);
  try {
    const row = await db.prepare(
      "SELECT * FROM automation_governance_reviews WHERE subject_type=? AND subject_id=? LIMIT 1",
    ).bind(subject.type, subject.id).first<Record<string, unknown>>();
    return { schemaAvailable: true, state: row ? mapState(row) : null };
  } catch (error) {
    if (isMissingSchema(error)) return { schemaAvailable: false, state: null };
    throw error;
  }
}

function isoExpired(value: string | null, now: Date) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now.getTime();
}

export function evaluateGovernanceForActivation(
  read: AutomationGovernanceRead,
  usage: {
    recurring: boolean;
    cadenceMinutes?: number | null;
    storageFields?: Array<"url" | "title" | "snippet" | "metadata">;
  },
  now = new Date(),
): AutomationGovernanceEvaluation {
  const state = read.state;
  const reasons: AutomationGovernanceBlockingReason[] = [];
  if (!read.schemaAvailable) reasons.push("GOVERNANCE_SCHEMA_UNAVAILABLE");
  if (!state) reasons.push("GOVERNANCE_MISSING");
  if (state) {
    if (isoExpired(state.expiresAt, now)) reasons.push("GOVERNANCE_EXPIRED");
    if (state.accessStatus !== "ALLOWED") reasons.push("ACCESS_NOT_ALLOWED");
    if (!["ALLOWED", "NOT_APPLICABLE"].includes(state.robotsStatus)) reasons.push("ROBOTS_NOT_ALLOWED");
    if (state.termsStatus !== "ALLOWED") reasons.push("TERMS_NOT_ALLOWED");
    if (usage.recurring && state.recurringStatus !== "APPROVED") reasons.push("RECURRING_USE_NOT_APPROVED");
    if (usage.recurring && state.manualOnly) reasons.push("MANUAL_ONLY");
    if (
      usage.recurring
      && state.minCadenceMinutes
      && usage.cadenceMinutes
      && usage.cadenceMinutes < state.minCadenceMinutes
    ) reasons.push("CADENCE_TOO_FREQUENT");

    const fields = new Set(usage.storageFields ?? []);
    if (fields.size && !["APPROVED", "RESTRICTED"].includes(state.retentionStatus)) reasons.push("RETENTION_NOT_APPROVED");
    if (fields.has("url") && !state.retainUrl) reasons.push("RETENTION_URL_NOT_ALLOWED");
    if (fields.has("title") && !state.retainTitle) reasons.push("RETENTION_TITLE_NOT_ALLOWED");
    if (fields.has("snippet") && !state.retainSnippet) reasons.push("RETENTION_SNIPPET_NOT_ALLOWED");
    if (fields.has("metadata") && !state.retainMetadata) reasons.push("RETENTION_METADATA_NOT_ALLOWED");
  }
  return {
    allowed: reasons.length === 0,
    blockingReasons: [...new Set(reasons)],
    storageProfile: {
      url: Boolean(state?.retainUrl),
      title: Boolean(state?.retainTitle),
      snippet: Boolean(state?.retainSnippet),
      metadata: Boolean(state?.retainMetadata),
      retentionDays: state?.retentionDays ?? null,
    },
  };
}

const ACCESS = new Set(["UNKNOWN", "ALLOWED", "RESTRICTED", "BLOCKED"]);
const ROBOTS = new Set(["UNKNOWN", "ALLOWED", "RESTRICTED", "DISALLOWED", "NOT_APPLICABLE"]);
const TERMS = new Set(["UNKNOWN", "ALLOWED", "REQUIRES_REVIEW", "RESTRICTED", "BLOCKED"]);
const RECURRING = new Set(["UNKNOWN", "APPROVED", "RESTRICTED", "DENIED"]);
const RETENTION = new Set(["UNKNOWN", "APPROVED", "RESTRICTED", "DENIED"]);

function bounded(value: unknown, max: number, required = false) {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error("automation_governance_rationale_required");
  if (text.length > max) throw new Error("automation_governance_value_too_long");
  return text || null;
}

function enumValue<T extends string>(value: unknown, allowed: Set<string>, code: string) {
  const normalized = String(value ?? "");
  if (!allowed.has(normalized)) throw new Error(code);
  return normalized as T;
}

function integerOrNull(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new Error("automation_governance_number_invalid");
  return result;
}

function urlOrNull(value: unknown) {
  const text = bounded(value, 1000);
  if (!text) return null;
  const url = canonicalizeSourceUrl(text);
  if (!url || !isSafeAutomationSourceUrl(url)) throw new Error("automation_governance_url_not_safe");
  return url;
}

export function parseAutomationGovernanceInput(value: unknown): AutomationGovernanceInput {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    accessStatus: enumValue(input.accessStatus, ACCESS, "automation_governance_access_invalid"),
    robotsStatus: enumValue(input.robotsStatus, ROBOTS, "automation_governance_robots_invalid"),
    termsStatus: enumValue(input.termsStatus, TERMS, "automation_governance_terms_invalid"),
    recurringStatus: enumValue(input.recurringStatus, RECURRING, "automation_governance_recurring_invalid"),
    retentionStatus: enumValue(input.retentionStatus, RETENTION, "automation_governance_retention_invalid"),
    retainUrl: Boolean(input.retainUrl),
    retainTitle: Boolean(input.retainTitle),
    retainSnippet: Boolean(input.retainSnippet),
    retainMetadata: Boolean(input.retainMetadata),
    retentionDays: integerOrNull(input.retentionDays, 1, 3650),
    minCadenceMinutes: integerOrNull(input.minCadenceMinutes, 60, 43200),
    maxRequestsPerDay: integerOrNull(input.maxRequestsPerDay, 1, 100000),
    manualOnly: Boolean(input.manualOnly),
    pathScope: bounded(input.pathScope, 500),
    restrictionsNote: bounded(input.restrictionsNote, 2000),
    termsUrl: urlOrNull(input.termsUrl),
    privacyUrl: urlOrNull(input.privacyUrl),
    robotsUrl: urlOrNull(input.robotsUrl),
    evidenceUrl: urlOrNull(input.evidenceUrl),
    rationale: bounded(input.rationale, 2000, true)!,
    expiresAt: bounded(input.expiresAt, 40),
    reviewDueAt: bounded(input.reviewDueAt, 40),
    expectedUpdatedAt: typeof input.expectedUpdatedAt === "string" ? input.expectedUpdatedAt : null,
  };
}


export async function upsertGovernanceReview(input: {
  subject: AutomationGovernanceSubject;
  review: AutomationGovernanceInput;
  actor: string;
  now?: Date;
}, databaseInput?: AutomationGovernanceDatabase) {
  const db = database(databaseInput);
  const beforeRead = await getGovernanceState(input.subject, db);
  if (!beforeRead.schemaAvailable) throw new Error("automation_governance_schema_unavailable");
  const before = beforeRead.state;
  if ((before?.updatedAt ?? null) !== (input.review.expectedUpdatedAt ?? null)) {
    throw new Error("automation_governance_stale_update");
  }

  const at = (input.now ?? new Date()).toISOString();
  const actor = input.actor.trim().toLowerCase().slice(0, 320);
  const r = input.review;
  const fields = [
    input.subject.type, input.subject.id,
    r.accessStatus, r.robotsStatus, r.termsStatus, r.recurringStatus, r.retentionStatus,
    r.retainUrl ? 1 : 0, r.retainTitle ? 1 : 0, r.retainSnippet ? 1 : 0, r.retainMetadata ? 1 : 0,
    r.retentionDays, r.minCadenceMinutes, r.maxRequestsPerDay, r.manualOnly ? 1 : 0,
    r.pathScope, r.restrictionsNote, r.termsUrl, r.privacyUrl, r.robotsUrl, r.evidenceUrl,
    at, actor, r.rationale, r.expiresAt, r.reviewDueAt, before?.createdAt ?? at, at,
  ] as const;

  if (!before) {
    await db.prepare(`INSERT INTO automation_governance_reviews (
      subject_type,subject_id,access_status,robots_status,terms_status,recurring_status,retention_status,
      retain_url,retain_title,retain_snippet,retain_metadata,retention_days,min_cadence_minutes,max_requests_per_day,
      manual_only,path_scope,restrictions_note,terms_url,privacy_url,robots_url,evidence_url,
      reviewed_at,reviewed_by,rationale,expires_at,review_due_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...fields).run();
  } else {
    const result = await db.prepare(`UPDATE automation_governance_reviews SET
      access_status=?,robots_status=?,terms_status=?,recurring_status=?,retention_status=?,
      retain_url=?,retain_title=?,retain_snippet=?,retain_metadata=?,retention_days=?,min_cadence_minutes=?,max_requests_per_day=?,
      manual_only=?,path_scope=?,restrictions_note=?,terms_url=?,privacy_url=?,robots_url=?,evidence_url=?,
      reviewed_at=?,reviewed_by=?,rationale=?,expires_at=?,review_due_at=?,updated_at=?
      WHERE subject_type=? AND subject_id=? AND updated_at=?`).bind(
        r.accessStatus,r.robotsStatus,r.termsStatus,r.recurringStatus,r.retentionStatus,
        r.retainUrl?1:0,r.retainTitle?1:0,r.retainSnippet?1:0,r.retainMetadata?1:0,
        r.retentionDays,r.minCadenceMinutes,r.maxRequestsPerDay,r.manualOnly?1:0,
        r.pathScope,r.restrictionsNote,r.termsUrl,r.privacyUrl,r.robotsUrl,r.evidenceUrl,
        at,actor,r.rationale,r.expiresAt,r.reviewDueAt,at,
        input.subject.type,input.subject.id,before.updatedAt,
      ).run();
    if (!result.meta.changes) throw new Error("automation_governance_stale_update");
  }

  const after = (await getGovernanceState(input.subject, db)).state;
  if (!after) throw new Error("automation_governance_write_failed");
  return after;
}

export async function listGovernanceHistory(
  subject: AutomationGovernanceSubject,
  databaseInput?: AutomationGovernanceDatabase,
  limit = 20,
) {
  const db = database(databaseInput);
  try {
    const result = await db.prepare(`SELECT id,before_json,after_json,actor,rationale,changed_at
      FROM automation_governance_review_history
      WHERE subject_type=? AND subject_id=? ORDER BY changed_at DESC,id DESC LIMIT ?`)
      .bind(subject.type, subject.id, Math.max(1, Math.min(100, limit)))
      .all<Record<string, unknown>>();
    return result.results;
  } catch (error) {
    if (isMissingSchema(error) || /no such table:\s*automation_governance_review_history/i.test(error instanceof Error ? error.message : String(error))) return [];
    throw error;
  }
}
