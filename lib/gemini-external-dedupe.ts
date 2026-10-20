import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { checkGeminiCandidateDedupe } from "./gemini-automation-dedupe.ts";
import { checkGeminiEventDedupe } from "./gemini-automation-event-dedupe.ts";
import type { GeminiD1 } from "./gemini-automation-store.ts";
import type { GeminiDiscoveryCandidateV1 } from "./gemini-automation-discovery-contract.ts";
import type { GeminiEventCandidateV1 } from "./gemini-automation-event-contract.ts";

type Candidate = {
  name: string; city: string; website: string; source: string;
  start_date: string; organizer: string; venue: string;
};
export type ExternalDedupeStatus = "NEW" | "DUPLICATE" | "POSSIBLE_DUPLICATE" | "REJECTED_BEFORE" | "BLOCKED";
type Decision = { httpStatus: number; status: ExternalDedupeStatus };
const blocked = (httpStatus = 200): Decision => ({ httpStatus, status: "BLOCKED" });
const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const allowed = ["name", "city", "website", "source", "start_date", "organizer", "venue"];
const safeUrl = (value: string): string | null => {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      /^(localhost|.*\.(?:local|localhost|internal))$/i.test(url.hostname) ||
      /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname)) return null;
    return url.href;
  } catch { return null; }
};
function safeCandidate(value: unknown): Candidate | null {
  if (!isRecord(value) || Object.keys(value).length !== allowed.length ||
      allowed.some(key => typeof value[key] !== "string")) return null;
  const v = value as Candidate;
  if (!v.name.trim() || v.name.length > 160 || v.city.length > 100 ||
      v.website.length > 2048 || v.source.length > 2048 ||
      v.start_date.length > 30 || v.organizer.length > 160 || v.venue.length > 160 ||
      (v.website && !safeUrl(v.website)) || (v.source && !safeUrl(v.source))) return null;
  return v;
}
async function verifiedSignature(body: string, signature: string | null, secret: string): Promise<boolean> {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature ?? "") || body.length > 4096) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const bytes = Uint8Array.from((signature ?? "").slice(7).match(/.{2}/g) ?? [], x => parseInt(x, 16));
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(body));
}

/** Authenticated READ-ONLY gate. Never returns canonical IDs, contacts, GEO or snippets. */
export async function checkExternalGeminiIdentity(input: {
  db: GeminiD1; env: { GEMINI_AGENT_CALLBACK_SECRET?: string; GEMINI_EXTERNAL_AGENT_ENABLED?: string };
  body: string; signature: string | null; now?: number;
}): Promise<Decision> {
  if (!["true", "1"].includes(input.env.GEMINI_EXTERNAL_AGENT_ENABLED ?? "")) return blocked(503);
  if (!await verifiedSignature(input.body, input.signature, input.env.GEMINI_AGENT_CALLBACK_SECRET ?? ""))
    return blocked(401);
  let data: Record<string, unknown>;
  try { data = JSON.parse(input.body) as Record<string, unknown>; }
  catch { return blocked(400); }
  if (!isRecord(data) || Object.keys(data).length !== 4 ||
      !["job_id", "stable_key", "issued_at", "candidate"].every(key => Object.hasOwn(data, key)) ||
      !Number.isSafeInteger(data.job_id) || Number(data.job_id) < 1 ||
      typeof data.stable_key !== "string" || !getGeminiCatalogItem(data.stable_key) ||
      !Number.isSafeInteger(data.issued_at) ||
      Math.abs((input.now ?? Date.now()) - Number(data.issued_at)) > 120000) return blocked(400);
  const candidate = safeCandidate(data.candidate);
  if (!candidate) return blocked(400);
  let job: { stable_key: string; status: string; error_code: string } | null;
  try {
    job = await input.db.prepare("SELECT stable_key,status,error_code FROM gemini_manual_background_jobs WHERE id=?")
      .bind(data.job_id).first<{ stable_key: string; status: string; error_code: string }>();
  } catch { return blocked(503); }
  if (!job || job.status !== "RUNNING" || !job.error_code?.startsWith("EXT_") ||
      job.stable_key !== data.stable_key) return blocked(409);
  const catalog = getGeminiCatalogItem(job.stable_key)!;
  // No canonical D1 check is currently proved for the six distinct Help models:
  // do NOT substitute a directory match or pretend that the Notion scan suffices.
  if (catalog.section === "help") return blocked();
  try {
    if (catalog.section === "directory") {
      const evidenceUrl = safeUrl(candidate.source) ?? safeUrl(candidate.website);
      if (!evidenceUrl || !candidate.city.trim()) return blocked();
      const normalized: GeminiDiscoveryCandidateV1 = {
        name: candidate.name, primary_url: safeUrl(candidate.website),
        source_urls: [evidenceUrl], description: null,
        location: { country: "Slovakia", region: null, district: null, city: candidate.city, address: null },
        contacts: { phone: null, email: null, website: safeUrl(candidate.website), facebook: null, instagram: null },
        confidence: 1, evidence: [{ source_url: evidenceUrl, fields: ["name"] }],
      };
      const result = await checkGeminiCandidateDedupe(input.db, {
        stableKey: job.stable_key, section: "directory", subcategory: catalog.subcategory, candidate: normalized,
      });
      return { httpStatus: 200, status: result.status };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate.start_date) ||
        !candidate.organizer.trim() || !candidate.city.trim() ||
        !(safeUrl(candidate.source) ?? safeUrl(candidate.website))) return blocked();
    const event: GeminiEventCandidateV1 = {
      title: candidate.name, organizer: candidate.organizer, start_date: candidate.start_date,
      start_time: null, end_date: null, end_time: null, all_day: false,
      venue: candidate.venue || null, city: candidate.city, region: null, online: false,
      event_url: safeUrl(candidate.website), registration_url: null, description: "",
      source_urls: [safeUrl(candidate.source) ?? safeUrl(candidate.website)!],
      evidence: [], cancelled: false,
    };
    const result = await checkGeminiEventDedupe(input.db, job.stable_key, event);
    return { httpStatus: 200, status: result.status };
  } catch { return blocked(503); } // D1 failure never becomes NEW.
}
