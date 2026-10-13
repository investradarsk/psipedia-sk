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
import { orphanedArticleMediaKeys } from "@/lib/article-media-key-preservation";
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
    const payload = (await request.json()) as ManagedArticleInput & { expectedUpdatedAt?: unknown };
    // Reject a stale editor tab rather than silently overwriting a newer Notion import.
    if (payload.expectedUpdatedAt !== undefined &&
        (typeof payload.expectedUpdatedAt !== "string" || payload.expectedUpdatedAt !== before.updatedAt)) {
      return Response.json(
        { error: "Článok sa medzičasom zmenil. Obnov editor a skontroluj nové údaje pred uložením." },
        { status: 409 },
      );
    }

    // Fields omitted by a client are not instructions to erase legacy/hidden content.
    // Explicit empty arrays and null values still mean intentional edits.
    const updatePayload: ManagedArticleInput = {
      ...payload,
      sections: payload.sections === undefined ? before.sections : payload.sections,
      sources: payload.sources === undefined ? before.sources : payload.sources,
      imageDisplay: payload.imageDisplay === undefined ? before.imageDisplay : payload.imageDisplay,
      imageFocusX: payload.imageFocusX === undefined ? before.imageFocusX : payload.imageFocusX,
      imageFocusY: payload.imageFocusY === undefined ? before.imageFocusY : payload.imageFocusY,
      portalSubpage: payload.portalSubpage === undefined && payload.portalSection === before.portalSection
        ? before.portalSubpage
        : payload.portalSubpage,
    };
    const article = await updateManagedArticle(id, updatePayload, user.email, before);
    if (!article) return Response.json({ error: "Článok sa nenašiel." }, { status: 404 });

    // Notion-imported hero and OG images often share one R2 object.
    // Delete only keys that neither the resulting hero, OG nor any block uses.
    const removedKeys = orphanedArticleMediaKeys(
      [before.imageKey, before.ogImageKey, ...articleBlockImageKeys(before.blocks ?? [])],
      [article.imageKey, article.ogImageKey, ...articleBlockImageKeys(article.blocks ?? [])],
    );
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
