import type { GeminiD1 } from "./gemini-automation-store.ts";
import type { GeminiDiscoveryCandidateV1 } from "./gemini-automation-discovery-contract.ts";
import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { geminiCandidateSignals, geminiIdentityHash, geminiRejectionIdentities, normalizeGeminiWebsite } from "./gemini-automation-identity.ts";

export type GeminiRejectionMatch = { identityKind: string; reasonCode: string | null };
function validScope(stableKey: string) {
  if (!getGeminiCatalogItem(stableKey)) throw new Error("GEMINI_DEDUPE_INVALID_SCOPE");
}
async function fingerprints(stableKey: string, candidate: GeminiDiscoveryCandidateV1) {
  validScope(stableKey);
  const signals = geminiCandidateSignals(candidate);
  // Provider primary_url may be an evidence/aggregator URL and change between
  // searches. Persist only explicit website/contact identity or name+city fallback.
  signals.website = normalizeGeminiWebsite(candidate.contacts.website);
  const identities = geminiRejectionIdentities(signals);
  return Promise.all(identities.map(async ({ kind, key }) => ({
    kind, hash: await geminiIdentityHash(stableKey, { kind, key }),
  })));
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
  if (!ids.length) throw new Error("GEMINI_DEDUPE_NO_REJECTION_IDENTITY");
  const label = input.candidate.name.trim().slice(0, 160);
  const reason = input.reasonCode ?? null;
  if (reason !== null && !/^[A-Z0-9_]{1,64}$/.test(reason)) throw new Error("GEMINI_DEDUPE_INVALID_REASON");
  const at = input.at ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(at))) throw new Error("GEMINI_DEDUPE_INVALID_TIMESTAMP");
  for (const { kind, hash } of ids) {
    await db.prepare(`INSERT INTO gemini_automation_rejections
      (stable_key, identity_kind, identity_hash, candidate_name, reason_code, rejected_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(stable_key, identity_kind, identity_hash) DO UPDATE SET
      updated_at = excluded.updated_at,
      reason_code = COALESCE(excluded.reason_code, gemini_automation_rejections.reason_code)`
    ).bind(input.stableKey, kind, hash, label, reason, at, at).run();
  }
  return ids.length;
}
