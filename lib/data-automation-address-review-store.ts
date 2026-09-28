import { env } from "cloudflare:workers";
import {
  automationCanonicalAdminHref,
  canonicalizeSourceUrl,
  sha256Hex,
} from "./data-automation.ts";
import type {
  DirectoryAddressReviewCandidate,
  DirectoryAddressReviewReason,
} from "./directory-address-provider.ts";

type Database = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

export type AutomationAddressReviewStatus = "OPEN" | "RESOLVED" | "DISMISSED" | "STALE";
export type AutomationAddressReviewCategory = "veterinari" | "psie-sluzby";

export type StoredAutomationAddressReviewCandidate = DirectoryAddressReviewCandidate & {
  candidateHash: string;
};

export type AutomationAddressReviewCase = {
  id: number;
  entityType: "DIRECTORY";
  canonicalEntityId: number;
  categorySlug: AutomationAddressReviewCategory;
  canonicalName: string;
  canonicalStatus: string;
  canonicalHref: string;
  externalSourceUrl: string;
  externalRecordId: string;
  reason: DirectoryAddressReviewReason;
  evidence: string;
  candidates: StoredAutomationAddressReviewCandidate[];
  fingerprint: string;
  status: AutomationAddressReviewStatus;
  canonicalBefore: Record<string, unknown>;
  currentAddress: Record<string, unknown> | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
  selectedCandidateHash: string | null;
  verifiedProvider: string | null;
};

function database(input?: Database) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Automation address review nemá pripojenú databázu.");
}

function parseObject(value: unknown) {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseCandidates(value: unknown): StoredAutomationAddressReviewCandidate[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is StoredAutomationAddressReviewCandidate =>
          Boolean(item && typeof item === "object" && typeof item.candidateHash === "string"))
        .slice(0, 5)
      : [];
  } catch {
    return [];
  }
}

function evidenceText(value: unknown) {
  return String(parseObject(value).text ?? "").replace(/\s+/g, " ").trim().slice(0, 320);
}

function canonicalSnapshot(row: Record<string, unknown>) {
  return {
    region: String(row.region ?? ""),
    district: String(row.district ?? ""),
    city: String(row.city ?? ""),
    address: String(row.address ?? ""),
    postalCode: String(row.postal_code ?? ""),
    street: String(row.street ?? ""),
    houseNumber: String(row.house_number ?? ""),
    addressFormat: String(row.address_format ?? ""),
    serviceAddressConfirmation: String(row.service_address_confirmation ?? ""),
    online: Boolean(row.online),
    updatedAt: String(row.updated_at ?? ""),
  };
}

function mapCase(row: Record<string, unknown>): AutomationAddressReviewCase {
  const canonicalEntityId = Number(row.canonical_entity_id);
  const canonicalName = String(row.canonical_name ?? "");
  const currentAddress = row.canonical_name == null ? null : canonicalSnapshot(row);
  return {
    id: Number(row.id),
    entityType: "DIRECTORY",
    canonicalEntityId,
    categorySlug: String(row.category_slug) as AutomationAddressReviewCategory,
    canonicalName,
    canonicalStatus: String(row.canonical_status ?? ""),
    canonicalHref: automationCanonicalAdminHref("DIRECTORY", canonicalEntityId) ?? `/admin/adresar/${canonicalEntityId}`,
    externalSourceUrl: String(row.external_source_url ?? ""),
    externalRecordId: String(row.external_record_id ?? ""),
    reason: String(row.reason) as DirectoryAddressReviewReason,
    evidence: evidenceText(row.evidence_json),
    candidates: parseCandidates(row.candidate_json),
    fingerprint: String(row.fingerprint ?? ""),
    status: String(row.status) as AutomationAddressReviewStatus,
    canonicalBefore: parseObject(row.canonical_before_json),
    currentAddress,
    firstDetectedAt: String(row.first_detected_at ?? ""),
    lastDetectedAt: String(row.last_detected_at ?? ""),
    resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : null,
    resolution: row.resolution ? String(row.resolution) : null,
    selectedCandidateHash: row.selected_candidate_hash ? String(row.selected_candidate_hash) : null,
    verifiedProvider: row.verified_provider ? String(row.verified_provider) : null,
  };
}

const CASE_SELECT = `
  SELECT r.*,
    p.name AS canonical_name,
    p.status AS canonical_status,
    p.region,p.district,p.city,p.address,p.postal_code,p.street,p.house_number,
    p.address_format,p.service_address_confirmation,p.online,p.updated_at
  FROM automation_address_review_cases r
  LEFT JOIN directory_profiles p
    ON r.entity_type='DIRECTORY' AND p.id=r.canonical_entity_id
`;

export async function automationAddressReviewCandidateHash(candidate: DirectoryAddressReviewCandidate) {
  return sha256Hex({
    provider: candidate.provider,
    providerResultId: candidate.providerResultId ?? "",
    region: candidate.region,
    district: candidate.district,
    city: candidate.city,
    postalCode: candidate.postalCode,
    street: candidate.street,
    houseNumber: candidate.houseNumber,
    addressFormat: candidate.addressFormat,
  });
}

async function boundedStoredCandidates(candidates: DirectoryAddressReviewCandidate[]) {
  const output: StoredAutomationAddressReviewCandidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates.slice(0, 5)) {
    const candidateHash = await automationAddressReviewCandidateHash(candidate);
    if (seen.has(candidateHash)) continue;
    seen.add(candidateHash);
    output.push({ ...candidate, candidateHash });
  }
  return output;
}

async function loadCanonicalSnapshot(canonicalEntityId: number, db: Database) {
  const row = await db.prepare(`
    SELECT id,name,category,status,region,district,city,address,postal_code,street,house_number,
      address_format,service_address_confirmation,online,updated_at
    FROM directory_profiles WHERE id=? LIMIT 1
  `).bind(canonicalEntityId).first<Record<string, unknown>>();
  return row ? canonicalSnapshot(row) : null;
}

export async function upsertAutomationAddressReviewCase(input: {
  canonicalEntityId: number;
  categorySlug: AutomationAddressReviewCategory;
  externalSourceUrl?: string | null;
  externalRecordId: string;
  reason: DirectoryAddressReviewReason;
  evidence: string;
  candidates: DirectoryAddressReviewCandidate[];
  detectedAt: string;
}, databaseInput?: Database) {
  const db = database(databaseInput);
  if (!Number.isSafeInteger(input.canonicalEntityId) || input.canonicalEntityId <= 0) return null;
  const candidates = await boundedStoredCandidates(input.candidates);
  if (candidates.length < 2) return null;
  const before = await loadCanonicalSnapshot(input.canonicalEntityId, db);
  if (!before) return null;

  const externalSourceUrl = canonicalizeSourceUrl(input.externalSourceUrl) ?? "";
  const externalRecordId = input.externalRecordId.trim().slice(0, 240);
  const evidence = input.evidence.replace(/\s+/g, " ").trim().slice(0, 320);
  if (!externalRecordId || !evidence) return null;
  const fingerprint = await sha256Hex({
    entityType: "DIRECTORY",
    canonicalEntityId: input.canonicalEntityId,
    externalSourceUrl,
    externalRecordId,
    evidence,
    candidates: candidates.map((candidate) => candidate.candidateHash).sort(),
  });
  await db.prepare(`
    INSERT INTO automation_address_review_cases (
      entity_type,canonical_entity_id,category_slug,external_source_url,external_record_id,
      reason,evidence_json,candidate_json,fingerprint,status,canonical_before_json,
      first_detected_at,last_detected_at,created_at,updated_at
    ) VALUES ('DIRECTORY',?,?,?,?,?,?,?,?,'OPEN',?,?,?,?,?)
    ON CONFLICT(fingerprint) DO UPDATE SET
      last_detected_at=excluded.last_detected_at,
      updated_at=excluded.updated_at
  `).bind(
    input.canonicalEntityId,
    input.categorySlug,
    externalSourceUrl,
    externalRecordId,
    input.reason,
    JSON.stringify({ text: evidence }),
    JSON.stringify(candidates),
    fingerprint,
    JSON.stringify(before),
    input.detectedAt,
    input.detectedAt,
    input.detectedAt,
    input.detectedAt,
  ).run();

  const row = await db.prepare(CASE_SELECT + " WHERE r.fingerprint=? LIMIT 1")
    .bind(fingerprint).first<Record<string, unknown>>();
  return row ? mapCase(row) : null;
}

export async function countOpenAutomationAddressReviews(
  categorySlug?: AutomationAddressReviewCategory | null,
  databaseInput?: Database,
) {
  const db = database(databaseInput);
  const sql = `SELECT COUNT(*) AS count
    FROM automation_address_review_cases r
    JOIN directory_profiles p ON p.id=r.canonical_entity_id AND r.entity_type='DIRECTORY'
    WHERE r.status='OPEN'${categorySlug ? " AND r.category_slug=?" : ""}`;
  const row = categorySlug
    ? await db.prepare(sql).bind(categorySlug).first<{ count: number }>()
    : await db.prepare(sql).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function listOpenAutomationAddressReviews(input: {
  categorySlug?: AutomationAddressReviewCategory | null;
  limit?: number;
  offset?: number;
} = {}, databaseInput?: Database) {
  const db = database(databaseInput);
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  const categoryClause = input.categorySlug ? " AND r.category_slug=?" : "";
  const statement = db.prepare(CASE_SELECT + `
    WHERE r.status='OPEN' AND p.id IS NOT NULL${categoryClause}
    ORDER BY r.last_detected_at DESC,r.id DESC LIMIT ? OFFSET ?
  `);
  const result = input.categorySlug
    ? await statement.bind(input.categorySlug, limit, offset).all<Record<string, unknown>>()
    : await statement.bind(limit, offset).all<Record<string, unknown>>();
  return result.results.map(mapCase);
}

export async function getAutomationAddressReviewCase(id: number, databaseInput?: Database) {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const db = database(databaseInput);
  const row = await db.prepare(CASE_SELECT + " WHERE r.id=? LIMIT 1")
    .bind(id).first<Record<string, unknown>>();
  return row ? mapCase(row) : null;
}

export function buildResolveAutomationAddressReviewStatement(input: {
  database: Database;
  id: number;
  fingerprint: string;
  actorRef: string;
  candidateHash: string;
  verifiedProvider: string;
  canonicalUpdatedAt: string;
  now: string;
}) {
  return input.database.prepare(`
    UPDATE automation_address_review_cases SET
      status='RESOLVED',resolved_at=?,resolved_by=?,resolution='APPLIED',
      selected_candidate_hash=?,verified_provider=?,updated_at=?
    WHERE id=? AND status='OPEN' AND fingerprint=?
      AND EXISTS (
        SELECT 1 FROM directory_profiles p
        WHERE p.id=automation_address_review_cases.canonical_entity_id
          AND p.updated_at=?
      )
  `).bind(
    input.now,
    input.actorRef,
    input.candidateHash,
    input.verifiedProvider,
    input.now,
    input.id,
    input.fingerprint,
    input.canonicalUpdatedAt,
  );
}

export async function dismissAutomationAddressReviewCase(input: {
  id: number;
  actorRef: string;
  expectedFingerprint: string;
  now?: Date;
}, databaseInput?: Database) {
  const db = database(databaseInput);
  const now = (input.now ?? new Date()).toISOString();
  await db.prepare(`
    UPDATE automation_address_review_cases SET
      status='DISMISSED',resolved_at=?,resolved_by=?,resolution='NO_CANDIDATE_MATCH',
      selected_candidate_hash=NULL,verified_provider=NULL,updated_at=?
    WHERE id=? AND status='OPEN' AND fingerprint=?
  `).bind(now, input.actorRef, now, input.id, input.expectedFingerprint).run();
  return getAutomationAddressReviewCase(input.id, db);
}

export async function markAutomationAddressReviewStale(
  id: number,
  databaseInput?: Database,
  now = new Date(),
) {
  const db = database(databaseInput);
  const at = now.toISOString();
  await db.prepare(`
    UPDATE automation_address_review_cases SET status='STALE',resolved_at=?,resolution='STALE',updated_at=?
    WHERE id=? AND status='OPEN'
  `).bind(at, at, id).run();
}
