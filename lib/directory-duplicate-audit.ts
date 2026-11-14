/**
 * Read-only identity audit for existing directory records.
 *
 * A shared name or contact is a candidate for editorial review, never
 * permission to merge, archive, delete, redirect, or modify a profile.
 * Keep this module independent of the D1 runtime for deterministic tests.
 */
export type DirectoryAuditRow = {
  id: number;
  name: string;
  category: string;
  status: string;
  city: string;
  website_url: string | null;
  phone: string | null;
  email: string | null;
  additional_categories_json: string | null;
};

export type DirectoryDuplicateCandidate = {
  a: Pick<DirectoryAuditRow, "id" | "name" | "category" | "status" | "city">;
  b: Pick<DirectoryAuditRow, "id" | "name" | "category" | "status" | "city">;
  confidence: "strong-signals" | "name-location-only";
  signals: string[];
  alreadyCrossListed: boolean;
};

export type DirectoryDuplicateAudit = {
  scanned: number;
  incomplete: boolean;
  totalCandidates: number;
  candidates: DirectoryDuplicateCandidate[];
};

const normalize = (value: string | null | undefined) => (value ?? "")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

function site(value: string | null): string {
  if (!value?.trim()) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : "https://" + value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || ["facebook.com", "instagram.com", "linktr.ee"].includes(host)) return "";
    return host + url.pathname.replace(/\/+$/, "").toLowerCase();
  } catch { return ""; }
}

const phone = (value: string | null) => {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("421") ? "0" + digits.slice(3) : digits.length >= 9 ? digits : "";
};
const email = (value: string | null) => {
  const clean = (value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) ? clean : "";
};
function extraCategories(value: string | null): Set<string> {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch { return new Set(); }
}

/** Review candidates are bounded, sorted deterministically, and never self-matches. */
export function auditExistingDirectoryDuplicates(
  rows: DirectoryAuditRow[],
  options: { incomplete?: boolean; limit?: number } = {},
): DirectoryDuplicateAudit {
  const maxResults = Math.max(1, Math.min(500, Math.floor(options.limit ?? 150)));
  const groups = new Map<string, DirectoryAuditRow[]>();
  for (const row of rows) {
    if (!Number.isSafeInteger(row.id) || row.id <= 0 || row.status === "archived") continue;
    const name = normalize(row.name);
    if (!name || name.length < 3) continue;
    const group = groups.get(name) ?? [];
    group.push(row);
    groups.set(name, group);
  }
  const candidates: DirectoryDuplicateCandidate[] = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.id - b.id);
    for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const a = group[i], b = group[j];
      if (a.id === b.id) continue;
      const cityA = normalize(a.city), cityB = normalize(b.city);
      // Separate cities may be distinct premises/franchise branches, even
      // when they share a phone, website, or organization name.
      if (cityA && cityB && cityA !== cityB) continue;
      const signals: string[] = [];
      if (cityA && cityA === cityB) signals.push("rovnaké mesto");
      const webA = site(a.website_url), webB = site(b.website_url);
      if (webA && webA === webB) signals.push("rovnaký web");
      const phoneA = phone(a.phone), phoneB = phone(b.phone);
      if (phoneA && phoneA === phoneB) signals.push("rovnaký telefón");
      const emailA = email(a.email), emailB = email(b.email);
      if (emailA && emailA === emailB) signals.push("rovnaký e-mail");
      if (signals.length === 0 && !(cityA === "" || cityB === "")) continue;
      const aExtra = extraCategories(a.additional_categories_json);
      const bExtra = extraCategories(b.additional_categories_json);
      candidates.push({
        a: { id: a.id, name: a.name, category: a.category, status: a.status, city: a.city },
        b: { id: b.id, name: b.name, category: b.category, status: b.status, city: b.city },
        confidence: signals.some(s => s !== "rovnaké mesto") ? "strong-signals" : "name-location-only",
        signals,
        alreadyCrossListed: aExtra.has(b.category) || bExtra.has(a.category),
      });
    }
  }
  candidates.sort((a, b) =>
    Number(b.confidence === "strong-signals") - Number(a.confidence === "strong-signals") ||
    Number(a.alreadyCrossListed) - Number(b.alreadyCrossListed) ||
    a.a.id - b.a.id || a.b.id - b.b.id,
  );
  return {
    scanned: rows.length,
    incomplete: options.incomplete === true,
    totalCandidates: candidates.length,
    candidates: candidates.slice(0, maxResults),
  };
}
