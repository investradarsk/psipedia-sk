import type { GeminiD1 } from "./gemini-automation-store.ts";
import type { GeminiDiscoveryCandidateV1 } from "./gemini-automation-discovery-contract.ts";
import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { geminiCandidateSignals, geminiIdentityHash, geminiRejectionIdentities, normalizeGeminiWebsite,
  normalizeGeminiName, normalizeGeminiCity, normalizeGeminiPhone, normalizeGeminiEmail,
  type GeminiSignals,
} from "./gemini-automation-identity.ts";
import { readDirectoryPublicContacts, type DirectoryImportData } from "./directory-profile-metadata.ts";

export type GeminiRejectionMatch = { identityKind: string; reasonCode: string | null };
function validScope(stableKey: string) {
  if (!getGeminiCatalogItem(stableKey)) throw new Error("GEMINI_DEDUPE_INVALID_SCOPE");
}
async function fingerprintSignals(stableKey: string, signals: GeminiSignals) {
  validScope(stableKey);
  const identities = geminiRejectionIdentities(signals);
  return Promise.all(identities.map(async ({ kind, key }) => ({
    kind, hash: await geminiIdentityHash(stableKey, { kind, key }),
  })));
}
async function fingerprints(stableKey: string, candidate: GeminiDiscoveryCandidateV1) {
  const signals = geminiCandidateSignals(candidate);
  // Evidence/aggregator primary_url must NEVER be rejection identity.
  signals.website = normalizeGeminiWebsite(candidate.contacts.website);
  return fingerprintSignals(stableKey, signals);
}

export type GeminiRejectionPlan = {
  stableKey: string;
  candidateName: string;
  reasonCode: string | null;
  rejectedAt: string;
  ids: { kind: string; hash: string }[];
};
function validateRejectionPlan(plan: GeminiRejectionPlan) {
  if (!plan.ids.length) throw new Error("GEMINI_DEDUPE_NO_REJECTION_IDENTITY");
  if (plan.reasonCode !== null && !/^[A-Z0-9_]{1,64}$/.test(plan.reasonCode))
    throw new Error("GEMINI_DEDUPE_INVALID_REASON");
  if (!Number.isFinite(Date.parse(plan.rejectedAt))) throw new Error("GEMINI_DEDUPE_INVALID_TIMESTAMP");
  if (!plan.candidateName) throw new Error("GEMINI_DEDUPE_INVALID_LABEL");
}
function makeRejectionPlan(stableKey: string, name: string, ids: GeminiRejectionPlan["ids"],
  reasonCode: string | null, at: string): GeminiRejectionPlan {
  const plan = { stableKey, candidateName: name.trim().slice(0, 160), ids, reasonCode, rejectedAt: at };
  validateRejectionPlan(plan);
  return plan;
}

export async function prepareGeminiCanonicalRejection(input: {
  stableKey: string;
  profile: {
    name: string;
    city: string;
    websiteUrl: string | null;
    importData: DirectoryImportData | null;
  };
  reasonCode?: string | null;
  at?: string;
}): Promise<GeminiRejectionPlan> {
  const contacts = readDirectoryPublicContacts(input.profile.importData, input.profile.websiteUrl ?? "");
  const signals: GeminiSignals = {
    name: normalizeGeminiName(input.profile.name),
    city: normalizeGeminiCity(input.profile.city),
    website: normalizeGeminiWebsite(contacts.website),
    phone: normalizeGeminiPhone(contacts.phone),
    email: normalizeGeminiEmail(contacts.email),
  };
  return makeRejectionPlan(input.stableKey, input.profile.name,
    await fingerprintSignals(input.stableKey, signals), input.reasonCode ?? null,
    input.at ?? new Date().toISOString());
}

/** UPSERT hashed identities only, after a successful canonical archive. */
export async function persistGeminiRejectionPlan(db: GeminiD1, plan: GeminiRejectionPlan): Promise<number> {
  validateRejectionPlan(plan);
  validScope(plan.stableKey);
  for (const { kind, hash } of plan.ids) {
    await db.prepare(`INSERT INTO gemini_automation_rejections
      (stable_key, identity_kind, identity_hash, candidate_name, reason_code, rejected_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stable_key, identity_kind, identity_hash) DO UPDATE SET
      updated_at = excluded.updated_at,
      reason_code = COALESCE(excluded.reason_code, gemini_automation_rejections.reason_code)`
    ).bind(plan.stableKey, kind, hash, plan.candidateName, plan.reasonCode,
      plan.rejectedAt, plan.rejectedAt).run();
  }
  return plan.ids.length;
}

/** Lookup is read-only. Never records rejection as a side-effect of discovery. */
export async function isGeminiCandidateRejected(
  db: GeminiD1, input: { stableKey: string; candidate: GeminiDiscoveryCandidateV1 },
): Promise<GeminiRejectionMatch | null> {
  const ids = await fingerprints(input.stableKey, input.candidate);
  if (!ids.length) return null;
  const where = ids.map(() => "(identity_kind = ? AND identity_hash = ?)").join(" OR ");
  const params = ids.flatMap((item) => [item.kind, item.hash]);
  const row = await db.prepare(
    "SELECT identity_kind, reason_code FROM gemini_automation_rejections WHERE stable_key = ? AND (" +
    where + ") ORDER BY id ASC LIMIT 1",
  ).bind(input.stableKey, ...params).first<{ identity_kind: string; reason_code: string | null }>();
  return row ? { identityKind: row.identity_kind, reasonCode: row.reason_code } : null;
}

/** To be called ONLY after a future explicit review action, never by dedupe itself. */
export async function rememberGeminiRejection(
  db: GeminiD1, input: {
    stableKey: string; candidate: GeminiDiscoveryCandidateV1;
    reasonCode?: string | null; at?: string;
  },
): Promise<number> {
  const ids = await fingerprints(input.stableKey, input.candidate);
  const plan = makeRejectionPlan(input.stableKey, input.candidate.name, ids,
    input.reasonCode ?? null, input.at ?? new Date().toISOString());
  return persistGeminiRejectionPlan(db, plan);
}
