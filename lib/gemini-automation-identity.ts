import type { GeminiDiscoveryCandidateV1 } from "./gemini-automation-discovery-contract.ts";

/** Deterministic Slovak identity v1; never use Gemini evidence/source URLs as business websites. */
export function normalizeGeminiText(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLocaleLowerCase("sk")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ") : "";
}
export const normalizeGeminiName = normalizeGeminiText;
export const normalizeGeminiCity = normalizeGeminiText;

export function normalizeGeminiWebsite(value: string | null | undefined): { url: string; domain: string } | null {
  if (!value || typeof value !== "string" || value.length > 2048) return null;
  try {
    const u = new URL(value.trim());
    if (!["http:", "https:"].includes(u.protocol) || !u.hostname || u.username || u.password) return null;
    if (/^(localhost|.*\.localhost|.*\.local)$/i.test(u.hostname)) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    // Protocol-independent website identity, but keep significant subdomains, ports, paths and query.
    const domain = host + (u.port ? ":" + u.port : "");
    const pathname = u.pathname.replace(/\/+$/, "") || "/";
    const query = [...u.searchParams.entries()].filter(([k]) => !/^utm_/i.test(k))
      .sort(([ak,av],[bk,bv]) => ak.localeCompare(bk) || av.localeCompare(bv));
    const params = new URLSearchParams(query).toString();
    return { domain, url: domain + pathname + (params ? "?" + params : "") };
  } catch { return null; }
}
export function normalizeGeminiPhone(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const compact = value.trim().replace(/[\s()./-]/g, "");
  if (!/^\+?\d+$/.test(compact)) return "";
  let normalized = compact;
  if (/^00421\d{9}$/.test(compact)) normalized = "+421" + compact.slice(5);
  else if (/^421\d{9}$/.test(compact)) normalized = "+" + compact;
  else if (/^0\d{9}$/.test(compact)) normalized = "+421" + compact.slice(1);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return "";
  return normalized;
}
export function normalizeGeminiEmail(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  const text = value.trim().toLowerCase();
  return text.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}
export type GeminiIdentityKind = "phone" | "email" | "url_name_city" | "domain_name_city" | "name_city";
export type GeminiIdentity = { kind: GeminiIdentityKind; key: string };
export type GeminiSignals = {
  name: string; city: string; website: { url: string; domain: string } | null;
  phone: string; email: string;
};

/** The official website/contact field is identity; primary_url is evidence unless it equals website. */
export function geminiCandidateSignals(candidate: GeminiDiscoveryCandidateV1): GeminiSignals {
  return {
    name: normalizeGeminiName(candidate.name),
    city: normalizeGeminiCity(candidate.location.city),
    website: normalizeGeminiWebsite(candidate.contacts.website),
    phone: normalizeGeminiPhone(candidate.contacts.phone),
    email: normalizeGeminiEmail(candidate.contacts.email),
  };
}

/**
 * Rejection identities are intentionally narrower than possible-match signals.
 * Shared domains are never a standalone rejection fingerprint. Name+city is a
 * fallback only when no stronger signal exists, avoiding a different business
 * with the same name/city and a distinct phone or website being suppressed.
 */
export function geminiRejectionIdentities(signals: GeminiSignals): GeminiIdentity[] {
  const identities: GeminiIdentity[] = [];
  if (signals.phone) identities.push({ kind: "phone", key: signals.phone });
  if (signals.email) identities.push({ kind: "email", key: signals.email });
  if (signals.name && signals.website) {
    const suffix = "|" + signals.name + "|" + signals.city;
    identities.push({ kind: "url_name_city", key: signals.website.url + suffix });
    identities.push({ kind: "domain_name_city", key: signals.website.domain + suffix });
  }
  if (identities.length === 0 && signals.name && signals.city) {
    identities.push({ kind: "name_city", key: signals.name + "|" + signals.city });
  }
  return identities;
}

/** Versioned SHA-256; persists no phone, email or website identity in D1 memory. */
export async function geminiIdentityHash(stableKey: string, identity: GeminiIdentity): Promise<string> {
  const bytes = new TextEncoder().encode(["gemini-rejection-v1", stableKey, identity.kind, identity.key].join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
