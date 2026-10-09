import { getGeminiCatalogItem } from "./gemini-automation-catalog.ts";
import { normalizeGeminiWebsite } from "./gemini-automation-identity.ts";
import type { GeminiD1 } from "./gemini-automation-store.ts";

export const GEMINI_EXCLUSION_MAX_ENTRIES = 120;
export const GEMINI_EXCLUSION_MAX_CHARS = 10_000;

type Hint = { kind: "canonical" | "rejected"; name: string; city: string | null; domain: string | null };
export type GeminiCategoryExclusionContext = { serialized: string; count: number; truncated: boolean };

// D1 labels are untrusted data, never prompt instructions. Keep legitimate
// names verbatim, but reject controls, markup delimiters and embedded URLs.
// The prompt separately serializes accepted labels as JSON DATA, not instructions.
function safeLabel(value: unknown, max: number): string | null {
  if (typeof value !== "string" || /[\p{C}\p{Zl}\p{Zp}]/u.test(value)) return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  // Supports combining marks, Unicode dashes and ordinary business punctuation.
  // Deliberately excludes Markdown [], HTML <>, backticks and raw markup symbols.
  if (!/^[\p{L}\p{M}\p{N} .,'’‘‚"„“”«»&()+\/:;!?\p{Pd}]+$/u.test(text)) return null;
  if (/(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.)/iu.test(text)) return null;
  return text;
}
function websiteDomain(value: string | null): string | null {
  const host = normalizeGeminiWebsite(value)?.domain ?? null;
  return host && host.length <= 180 && host !== "psipedia.sk" ? host : null;
}

/** Same-category canonical + rejected memory, read-only. Never reads Notion. */
export async function loadGeminiCategoryMemory(db: GeminiD1, stableKey: string): Promise<GeminiCategoryExclusionContext> {
  const catalog = getGeminiCatalogItem(stableKey);
  if (!catalog || catalog.section !== "directory") throw new Error("GEMINI_EXCLUSION_INVALID_SCOPE");
  const canonical = await db.prepare(`SELECT name, city, website_url FROM directory_profiles
    WHERE category = ? AND status IN ('published','draft','archived')
    ORDER BY id ASC LIMIT ?`).bind(catalog.subcategory, GEMINI_EXCLUSION_MAX_ENTRIES + 1)
    .all<{ name: string; city: string | null; website_url: string | null }>();
  const rejected = await db.prepare(`SELECT candidate_name FROM gemini_automation_rejections
    WHERE stable_key = ? ORDER BY id ASC LIMIT ?`).bind(stableKey, GEMINI_EXCLUSION_MAX_ENTRIES + 1)
    .all<{ candidate_name: string }>();

  const entries: Hint[] = [];
  const seen = new Set<string>();
  let truncated = canonical.results.length > GEMINI_EXCLUSION_MAX_ENTRIES ||
    rejected.results.length > GEMINI_EXCLUSION_MAX_ENTRIES;
  let serialized = "[]";
  const add = (entry: Hint) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return;
    const next = JSON.stringify([...entries, entry]);
    if (entries.length >= GEMINI_EXCLUSION_MAX_ENTRIES || next.length > GEMINI_EXCLUSION_MAX_CHARS) {
      truncated = true;
      return;
    }
    seen.add(key);
    entries.push(entry);
    serialized = next;
  };
  for (const row of canonical.results) {
    const name = safeLabel(row.name, 160);
    if (name) add({ kind: "canonical", name, city: safeLabel(row.city, 100), domain: websiteDomain(row.website_url) });
  }
  for (const row of rejected.results) {
    const name = safeLabel(row.candidate_name, 160);
    if (name) add({ kind: "rejected", name, city: null, domain: null });
  }
  return { serialized, count: entries.length, truncated };
}
