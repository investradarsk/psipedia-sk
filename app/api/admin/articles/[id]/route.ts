import { env } from "cloudflare:workers";
import {
  deleteManagedArticle,
  getManagedArticleById,
  isArticleSlugConflict,
  updateManagedArticle,
  rescheduleManagedArticle,
  ArticleRescheduleConflictError,
  type ManagedArticleInput,
} from "@/lib/article-store";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { articleBlockImageKeys } from "@/lib/article-blocks";
import { isArticlePublishIntegrityError } from "@/lib/article-content-qa";
import {
  writeBackPublishedArticleToNotion,
  type NotionSyncBindings,
} from "@/lib/notion-article-sync";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };
type ArticleRouteBindings = NotionSyncBindings & {
  BUCKET?: R2Bucket;
  DB?: D1Database;
};

async function parsedId(params: RouteProps["params"]) {
  const { id } = await params;
  const value = Number.parseInt(id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function updateErrorResponse(error: unknown) {
  if (isArticlePublishIntegrityError(error)) {
    return Response.json({ error: error.message, issues: error.issues }, { status: 422 });
  }
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  const status = error instanceof ArticleRescheduleConflictError || isArticleSlugConflict(error) ? 409 : 400;
  return Response.json(
    { error: isArticleSlugConflict(error) ? "Túto adresu už používa iný článok." : message },
    { status },
  );
}

export async function GET(_request: Request, { params }: RouteProps) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID článku." }, { status: 400 });

  try {
    const article = await getManagedArticleById(id);
    return article
      ? Response.json({ article })
      : Response.json({ error: "Článok sa nenašiel." }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Článok sa nepodarilo načítať." },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: RouteProps) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID článku." }, { status: 400 });

  try {
    const before = await getManagedArticleById(id);
    if (!before) return Response.json({ error: "Článok sa nenašiel." }, { status: 404 });
    const payload = (await request.json()) as ManagedArticleInput;
    const article = await updateManagedArticle(id, payload, user.email, before);
    if (!article) return Response.json({ error: "Článok sa nenašiel." }, { status: 404 });

    if (before.imageKey && before.imageKey !== article.imageKey) {
      const bucket = (env as unknown as ArticleRouteBindings).BUCKET;
      if (bucket) await bucket.delete(before.imageKey).catch(() => undefined);
    }
    if (before.ogImageKey && before.ogImageKey !== article.ogImageKey) {
      const bucket = (env as unknown as ArticleRouteBindings).BUCKET;
      if (bucket) await bucket.delete(before.ogImageKey).catch(() => undefined);
    }

    if (before.status !== "published" && article.status === "published") {
      const bindings = env as unknown as ArticleRouteBindings;
      if (bindings.DB) {
        try {
          await writeBackPublishedArticleToNotion({
            database: bindings.DB,
            bindings,
            article,
          });
        } catch (error) {
          console.error(JSON.stringify({
            event: "notion_article_publish_writeback_failed",
            articleId: article.id,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      }
    }

    const currentKeys = new Set(articleBlockImageKeys(article.blocks ?? []));
    const removedKeys = articleBlockImageKeys(before.blocks ?? []).filter((key) => !currentKeys.has(key));
    const bucket = (env as unknown as ArticleRouteBindings).BUCKET;
    if (bucket && removedKeys.length) {
      await Promise.all(removedKeys.map((key) => bucket.delete(key).catch(() => undefined)));
    }

    return Response.json({ article });
  } catch (error) {
    return updateErrorResponse(error);
  }
}

/**
 * Calendar rescheduling lives on the existing canonical article resource.
 * It delegates to updateManagedArticle rather than introducing a new
 * scheduling backend or altering the publication lifecycle.
 */
export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID článku." }, { status: 400 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Neplatná požiadavka." }, { status: 400 });
    }
    const { publishedAt, expectedUpdatedAt } = body as Record<string, unknown>;
    if (typeof publishedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(publishedAt) ||
      !Number.isFinite(Date.parse(publishedAt)) ||
      typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) {
      return Response.json({ error: "Vyber platný dátum a čas a obnov detail článku." }, { status: 400 });
    }
    const article = await rescheduleManagedArticle(id, publishedAt, expectedUpdatedAt, auth.user.email);
    return article
      ? Response.json({ article })
      : Response.json({ error: "Článok sa nenašiel." }, { status: 404 });
  } catch (error) {
    return updateErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteProps) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID článku." }, { status: 400 });

  try {
    const article = await deleteManagedArticle(id);
    if (!article) return Response.json({ error: "Článok sa nenašiel." }, { status: 404 });
    const bucket = (env as unknown as ArticleRouteBindings).BUCKET;
    if (bucket) {
      const keys = [...new Set([article.imageKey, article.ogImageKey, ...articleBlockImageKeys(article.blocks ?? [])].filter((key): key is string => Boolean(key)))];
      await Promise.all(keys.map((key) => bucket.delete(key).catch(() => undefined)));
    }
    return Response.json({ deleted: true, id });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Článok sa nepodarilo odstrániť." },
      { status: 500 },
    );
  }
}
