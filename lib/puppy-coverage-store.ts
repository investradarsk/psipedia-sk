import { env } from "cloudflare:workers";
import { portalSections, type PortalSubpage } from "@/lib/portal";
import {
  requirePuppyCoverageArticleRows,
  type PuppyCoverageArticle,
  type PuppyCoverageArea,
} from "@/lib/puppy-coverage";

type RuntimeBindings = { DB?: D1Database };
type PuppySectionRow = { subpages_json: string };
type PuppyArticleRow = {
  id: number;
  slug: string;
  title: string;
  portal_subpage: string | null;
  status: string;
};

function database() {
  const db = (env as unknown as RuntimeBindings).DB;
  return db && typeof db.prepare === "function" ? db : null;
}

function defaultPuppyAreas(): PortalSubpage[] {
  return portalSections.find((section) => section.slug === "steniatka")?.subpages ?? [];
}

function mergeManagedPuppyAreas(value: string | null | undefined): PuppyCoverageArea[] {
  const fallback = defaultPuppyAreas();
  if (!value) return fallback.filter((area) => !area.href);

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return fallback.filter((area) => !area.href);

    const stored = parsed
      .map((raw) => raw as Partial<PortalSubpage>)
      .filter((area): area is Partial<PortalSubpage> & Pick<PortalSubpage, "slug" | "label"> => Boolean(area.slug && area.label))
      .map((area) => {
        const defaults = fallback.find((candidate) => candidate.slug === area.slug);
        const merged = defaults ? { ...defaults, ...area } : area as PortalSubpage;
        const normalizedLabel = String(merged.label ?? "").trim().replace(/\s+/g, " ");
        if (merged.slug === "prve-dni" && normalizedLabel === "Prvé dni doma so šteniatkom Adresa URL" && defaults) {
          return { ...merged, label: defaults.label };
        }
        return merged;
      });

    const storedSlugs = new Set(stored.map((area) => area.slug));
    return [...stored, ...fallback.filter((area) => !storedSlugs.has(area.slug))]
      .filter((area) => !area.href)
      .map((area) => ({
        slug: area.slug,
        label: area.label,
        description: area.description,
        href: area.href,
      }));
  } catch {
    return fallback.filter((area) => !area.href);
  }
}

function mapArticle(row: PuppyArticleRow): PuppyCoverageArticle {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    portalSubpage: row.portal_subpage,
    status: row.status === "published" ? "published" : row.status === "scheduled" ? "scheduled" : "draft",
  };
}

export async function getPuppyCoverageSource(): Promise<{
  areas: PuppyCoverageArea[];
  articles: PuppyCoverageArticle[];
}> {
  const db = database();
  if (!db) throw new Error("Puppy coverage database binding is unavailable");

  const sectionQuery = db
    .prepare("SELECT subpages_json FROM portal_section_settings WHERE slug = 'steniatka' LIMIT 1")
    .first<PuppySectionRow>()
    .catch(() => null);

  const articleQuery = requirePuppyCoverageArticleRows(
    db.prepare(`
      SELECT id, slug, title, portal_subpage, status
      FROM managed_articles
      WHERE portal_section = 'steniatka'
      ORDER BY portal_subpage, updated_at DESC, id DESC
    `).all<PuppyArticleRow>(),
  );

  const [sectionRow, articleRows] = await Promise.all([sectionQuery, articleQuery]);

  return {
    areas: mergeManagedPuppyAreas(sectionRow?.subpages_json),
    articles: articleRows.map(mapArticle),
  };
}
