/**
 * Versioned baseline for the raw Notion SEO fields, stored inside the existing
 * article_notion_sync.content_hash TEXT column. No schema migration is needed.
 *
 * Older 64-char hashes remain readable but do not authorize clearing SEO.
 * An acknowledged sync upgrades its receipt, so future raw-empty transitions
 * (including Noindex true -> false) can be distinguished from legacy blanks.
 */
import { ARTICLE_NOTION_SEO_PROPERTIES as SEO } from "./notion-article-seo-properties";
import type { ArticleNotionSeoKey } from "./notion-article-seo-properties";

export type ArticleSeoRemoteValues = Partial<Record<ArticleNotionSeoKey, string | boolean>>;
export type ArticleSeoReceipt = { hash: string; seo: ArticleSeoRemoteValues | null };
const PREFIX = "seo2:";

function safeValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Returns only fields genuinely present, never synthesizes missing columns. */
export function articleSeoRemoteValues(page: {properties?: Record<string, unknown>}): ArticleSeoRemoteValues {
  const result: ArticleSeoRemoteValues = {};
  for (const field of Object.keys(SEO) as ArticleNotionSeoKey[]) {
    const { name, type } = SEO[field];
    if (!Object.hasOwn(page.properties ?? {}, name)) continue;
    const raw = page.properties?.[name];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
    }
    const record = raw as Record<string, unknown>;
    if (record.type && record.type !== type) throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
    if (type === "checkbox") {
      if (typeof record.checkbox !== "boolean") throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
      result[field] = record.checkbox;
    } else if (type === "url") {
      if (record.url !== null && typeof record.url !== "string") {
        throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
      }
      result[field] = safeValue(record.url);
    } else {
      if (!Array.isArray(record.rich_text)) throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
      result[field] = record.rich_text.map(item => {
        if (!item || typeof item !== "object") throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
        const node = item as Record<string, unknown>;
        if (typeof node.plain_text === "string") return node.plain_text;
        const text = node.text;
        if (text && typeof text === "object" &&
            typeof (text as Record<string, unknown>).content === "string") {
          return (text as Record<string, string>).content;
        }
        throw new Error("NOTION_ARTICLE_SEO_TYPE_MISMATCH");
      }).join("").trim();
    }
  }
  return result;
}

/** Reads old hash-only receipts conservatively (no clear evidence). */
export function decodeArticleSeoReceipt(value: string): ArticleSeoReceipt {
  if (!value.startsWith(PREFIX)) return { hash: value, seo: null };
  try {
    const payload: unknown = JSON.parse(value.slice(PREFIX.length));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw Error();
    const decoded = payload as Record<string, unknown>;
    if (typeof decoded.hash !== "string" || !/^[0-9a-f]{64}$/i.test(decoded.hash) ||
        !decoded.seo || typeof decoded.seo !== "object" || Array.isArray(decoded.seo)) throw Error();
    const seo: ArticleSeoRemoteValues = {};
    for (const field of Object.keys(SEO) as ArticleNotionSeoKey[]) {
      const entry = (decoded.seo as Record<string, unknown>)[field];
      if (entry === undefined) continue;
      if ((field === "noindex" && typeof entry !== "boolean") ||
          (field !== "noindex" && typeof entry !== "string")) throw Error();
      (seo as Record<string, unknown>)[field] = entry;
    }
    return { hash: decoded.hash, seo };
  } catch {
    throw new Error("NOTION_ARTICLE_SEO_RECEIPT_INVALID");
  }
}

export function encodeArticleSeoReceipt(hash: string, page: {
  properties?: Record<string, unknown>
}): string {
  if (!/^[0-9a-f]{64}$/i.test(hash)) throw new Error("NOTION_ARTICLE_SEO_RECEIPT_INVALID");
  return PREFIX + JSON.stringify({ hash, seo: articleSeoRemoteValues(page) });
}

/** Explicit blank/false only after we have PROOF of a previously nonblank
 * value. First sight of an empty Notion property never erases Admin data.
 */
export function articleSeoExplicitClears(
  page: {properties?: Record<string, unknown>},
  previous: ArticleSeoRemoteValues | null | undefined,
): Set<ArticleNotionSeoKey> {
  const cleared = new Set<ArticleNotionSeoKey>();
  if (!previous) return cleared;
  const current = articleSeoRemoteValues(page);
  for (const field of Object.keys(SEO) as ArticleNotionSeoKey[]) {
    if (!Object.hasOwn(current, field) || !Object.hasOwn(previous, field)) continue;
    const oldValue = previous[field];
    const newValue = current[field];
    if (field === "noindex") {
      if (oldValue === true && newValue === false) cleared.add(field);
    } else if (typeof oldValue === "string" && oldValue.length > 0 &&
        newValue === "") {
      cleared.add(field);
    }
  }
  return cleared;
}
