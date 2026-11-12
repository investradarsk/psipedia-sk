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
