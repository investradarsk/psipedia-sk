import { env } from "cloudflare:workers";
import { isArticlePortalSection, type ArticlePortalSection } from "@/lib/portal";

export type PublicArticleListMeta = {
  slug: string;
  topic: string;
  date: string;
  dateIso: string;
  portalSection: ArticlePortalSection;
};

type RuntimeBindings = { DB?: D1Database };

type Row = {
  slug: string;
  category: string;
  portal_section: string;
  published_at: string;
};

function formatSlovakDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const months = [
    "januára", "februára", "marca", "apríla", "mája", "júna",
    "júla", "augusta", "septembra", "októbra", "novembra", "decembra",
  ];
  return `${date.getUTCDate()}. ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export async function getPublicArticleListMeta(slugs: readonly string[]): Promise<Map<string, PublicArticleListMeta>> {
  const unique = [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (!unique.length) return new Map();
  const database = (env as unknown as RuntimeBindings).DB;
  if (!database || typeof database.prepare !== "function") return new Map();

  const placeholders = unique.map(() => "?").join(",");
  const now = new Date().toISOString();
  try {
    const result = await database.prepare(
      `SELECT slug,category,portal_section,published_at FROM managed_articles WHERE slug IN (${placeholders}) AND (status='published' OR (status='scheduled' AND published_at<=?))`,
    ).bind(...unique, now).all<Row>();
    return new Map(result.results.flatMap((row) => {
      if (!row.published_at || !isArticlePortalSection(row.portal_section)) return [];
      return [[row.slug, {
        slug: row.slug,
        topic: row.category,
        date: formatSlovakDate(row.published_at),
        dateIso: row.published_at.slice(0, 10),
        portalSection: row.portal_section,
      } satisfies PublicArticleListMeta] as const];
    }));
  } catch (error) {
    console.error("public_article_list_meta_unavailable", error);
    return new Map();
  }
}
