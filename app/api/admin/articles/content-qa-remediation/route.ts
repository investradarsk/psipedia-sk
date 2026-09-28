import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { normalizeArticleBlocks, type ArticleBlock } from "@/lib/article-blocks";
import { buildDentalArticleRemediation, DENTAL_ARTICLE_SLUG } from "@/lib/article-content-remediation";
import type { ArticleSection } from "@/lib/content";

export const dynamic = "force-dynamic";

type Bindings = { DB?: D1Database };
type DentalRow = {
  id: number;
  slug: string;
  sections_json: string;
  blocks_json: string;
  updated_at: string;
};
type RelatedRow = { slug: string; portal_section: string };

function database() {
  const db = (env as unknown as Bindings).DB;
  if (!db) throw new Error("Databáza redakcie nie je pripojená.");
  return db;
}

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

async function loadPreview(db: D1Database) {
  const article = await db.prepare(
    "SELECT id, slug, sections_json, blocks_json, updated_at FROM managed_articles WHERE slug = ? LIMIT 1",
  ).bind(DENTAL_ARTICLE_SLUG).first<DentalRow>();
  if (!article) return null;

  const related = await db.prepare(`
    SELECT slug, portal_section
    FROM managed_articles
    WHERE title = ?
      AND (status = 'published' OR (status = 'scheduled' AND published_at <= ?))
    ORDER BY published_at DESC, id DESC
    LIMIT 1
  `).bind("Ako vybrať granule bez marketingových mýtov", new Date().toISOString()).first<RelatedRow>();

  const sections = parseArray<ArticleSection>(article.sections_json);
  const blocks = normalizeArticleBlocks(parseArray<ArticleBlock>(article.blocks_json));
  const relatedHref = related
    ? `/${related.portal_section === "clanky" ? "clanky" : related.portal_section}/${related.slug}`
    : null;
  const preview = buildDentalArticleRemediation({ sections, blocks, relatedNutritionArticleHref: relatedHref });

  return {
    articleId: article.id,
    slug: article.slug,
    expectedUpdatedAt: article.updated_at,
    ...preview,
  };
}

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  try {
    const preview = await loadPreview(database());
    return preview
      ? Response.json({ mode: "preview", preview })
      : Response.json({ error: "Dentálny článok sa nenašiel." }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Preview opravy sa nepodarilo vytvoriť." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  try {
    const body = await request.json() as { confirmSlug?: string; expectedUpdatedAt?: string };
    if (body.confirmSlug !== DENTAL_ARTICLE_SLUG || !body.expectedUpdatedAt) {
      return Response.json(
        { error: "Oprava vyžaduje presný slug a expectedUpdatedAt z bezprostredného preview." },
        { status: 400 },
      );
    }

    const db = database();
    const preview = await loadPreview(db);
    if (!preview) return Response.json({ error: "Dentálny článok sa nenašiel." }, { status: 404 });
    if (preview.expectedUpdatedAt !== body.expectedUpdatedAt) {
      return Response.json(
        { error: "Článok sa od preview zmenil. Načítaj nový preview a skontroluj rozdiely." },
        { status: 409 },
      );
    }
    if (!preview.changed) {
      return Response.json({ applied: false, idempotent: true, preview });
    }

    const now = new Date().toISOString();
    const result = await db.prepare(`
      UPDATE managed_articles
      SET sections_json = ?, blocks_json = ?, updated_at = ?, updated_by = ?
      WHERE id = ? AND slug = ? AND updated_at = ?
    `).bind(
      JSON.stringify(preview.sections),
      JSON.stringify(preview.blocks),
      now,
      user.email,
      preview.articleId,
      DENTAL_ARTICLE_SLUG,
      body.expectedUpdatedAt,
    ).run();

    if (!result.success || Number(result.meta.changes ?? 0) !== 1) {
      return Response.json(
        { error: "Oprava nebola aplikovaná, pretože optimistic lock neprešiel." },
        { status: 409 },
      );
    }

    return Response.json({
      applied: true,
      slug: DENTAL_ARTICLE_SLUG,
      removedEditorialNotes: preview.removedEditorialNotes,
      addedRelatedArticle: preview.addedRelatedArticle,
      manualRequired: preview.manualRequired,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Opravu sa nepodarilo aplikovať." },
      { status: 500 },
    );
  }
}
