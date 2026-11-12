/**
 * Article SEO parity: canonical property names in the existing Notion Články data source.
 *
 * Keep these names stable. The Admin editor uses different camelCase keys, but
 * creating similarly named Notion columns ("OG description", etc.) would split data.
 * Transport / publication behaviour is implemented separately; the mapping alone
 * must not be mistaken for completed bidirectional synchronization.
 */
export const ARTICLE_NOTION_SEO_PROPERTIES = {
  seoTitle: { name: "SEO title", type: "rich_text" },
  metaDescription: { name: "Meta description", type: "rich_text" },
  focusKeyword: { name: "Hlavné kľúčové slovo", type: "rich_text" },
  canonicalUrl: { name: "Canonical URL", type: "url" },
  noindex: { name: "Noindex", type: "checkbox" },
  ogTitle: { name: "OG title", type: "rich_text" },
  ogDescription: { name: "OG popis", type: "rich_text" },
  ogImageUrl: { name: "OG obrázok", type: "url" },
} as const satisfies Record<string, { name: string; type: "rich_text" | "url" | "checkbox" }>;

export type ArticleNotionSeoKey = keyof typeof ARTICLE_NOTION_SEO_PROPERTIES;
import { articleSeoExplicitClears, type ArticleSeoRemoteValues } from "./notion-article-seo-receipt";


/** SEO values on a canonical article. New Notion properties are empty for
 * historic articles; an initial import must not erase established Admin SEO.
 * Deliberate clears and unchecking noindex are handled by the field-delta
 * synchronization phase, not by interpreting a default Notion blank as a clear.
 */
export type ExistingArticleSeo = {
  seo?: {
    title?: string; description?: string; focusKeyword?: string;
    canonicalUrl?: string; noindex?: boolean;
    ogTitle?: string; ogDescription?: string; ogImage?: string | null;
  };
  ogImageKey?: string | null;
};

type SeoNotionPage = { properties?: Record<string, unknown> };
type NotionProperty = Record<string, unknown>;

function property(page: SeoNotionPage, name: string): NotionProperty | null {
  const value = page.properties?.[name];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as NotionProperty : null;
}

function textProperty(page: SeoNotionPage, name: string): string {
  const raw = property(page, name)?.rich_text;
  if (!Array.isArray(raw)) return "";
  return raw.map((item: unknown) => {
    if (!item || typeof item !== "object") return "";
    const node = item as { plain_text?: unknown; text?: { content?: unknown } };
    return typeof node.plain_text === "string"
      ? node.plain_text : typeof node.text?.content === "string" ? node.text.content : "";
  }).join("").trim();
}

function urlProperty(page: SeoNotionPage, name: string): string {
  const raw = property(page, name)?.url;
  return typeof raw === "string" ? raw.trim() : "";
}

/** Parses all eight SEO properties; does not change status, slug or article ID.
 * Positive Notion values override Admin. Empty/unset properties on historical
 * records fall back to Admin until field-level clearing is implemented.
 */
export function articleSeoFromNotion(
  page: SeoNotionPage,
  existing?: ExistingArticleSeo,
  confirmedPrevious?: ArticleSeoRemoteValues | null,
) {
  const cleared = articleSeoExplicitClears(page, confirmedPrevious);
  const old = existing?.seo;
  const seoTitle = cleared.has("seoTitle") ? "" : textProperty(page, ARTICLE_NOTION_SEO_PROPERTIES.seoTitle.name)
    || old?.title || "";
  const metaDescription = cleared.has("metaDescription") ? "" : textProperty(page, ARTICLE_NOTION_SEO_PROPERTIES.metaDescription.name)
    || old?.description || "";
  const focusKeyword = cleared.has("focusKeyword") ? "" : textProperty(page, ARTICLE_NOTION_SEO_PROPERTIES.focusKeyword.name)
    || old?.focusKeyword || "";
  const canonicalUrl = cleared.has("canonicalUrl") ? "" : urlProperty(page, ARTICLE_NOTION_SEO_PROPERTIES.canonicalUrl.name)
    || old?.canonicalUrl || "";
  const noindex = cleared.has("noindex") ? false
    : property(page, ARTICLE_NOTION_SEO_PROPERTIES.noindex.name)?.checkbox === true || old?.noindex === true;
  const ogTitle = cleared.has("ogTitle") ? "" : textProperty(page, ARTICLE_NOTION_SEO_PROPERTIES.ogTitle.name)
    || old?.ogTitle || seoTitle;
  const ogDescription = cleared.has("ogDescription") ? "" : textProperty(page, ARTICLE_NOTION_SEO_PROPERTIES.ogDescription.name)
    || old?.ogDescription || metaDescription;
  const ogImageUrl = cleared.has("ogImageUrl") ? null : urlProperty(page, ARTICLE_NOTION_SEO_PROPERTIES.ogImageUrl.name)
    || old?.ogImage || null;
  // The public absolute URL and the Admin media-relative path may refer to
  // the same R2 object. Never lose the key for an unchanged image.
  const isSameOgImage = (left: string | null | undefined, right: string | null | undefined) => {
    if (!left || !right) return false;
    try {
      return new URL(left, "https://psipedia.sk").href === new URL(right, "https://psipedia.sk").href;
    } catch { return left === right; }
  };
  const ogImageKey = isSameOgImage(ogImageUrl, old?.ogImage)
    ? existing?.ogImageKey ?? null : null;
  return {
    seoTitle, metaDescription, focusKeyword, canonicalUrl, noindex,
    ogTitle, ogDescription, ogImageUrl, ogImageKey,
  };
}
