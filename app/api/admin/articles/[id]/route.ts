import { env } from "cloudflare:workers";
import {
  deleteManagedArticle,
  getManagedArticleById,
  isArticleSlugConflict,
  updateManagedArticle,
  type ManagedArticleInput,
} from "@/lib/article-store";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { articleBlockImageKeys } from "@/lib/article-blocks";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };
type UploadBindings = { BUCKET?: R2Bucket };

async function parsedId(params: RouteProps["params"]) {
  const { id } = await params;
  const value = Number.parseInt(id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function updateErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  const status = isArticleSlugConflict(error) ? 409 : 400;
  return Response.json(
    { error: status === 409 ? "Túto adresu už používa iný článok." : message },
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
    const article = await updateManagedArticle(id, payload, user.email);
    if (!article) return Response.json({ error: "Článok sa nenašiel." }, { status: 404 });

    if (before.imageKey && before.imageKey !== article.imageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(before.imageKey).catch(() => undefined);
    }
    if (before.ogImageKey && before.ogImageKey !== article.ogImageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(before.ogImageKey).catch(() => undefined);
    }

    const currentKeys = new Set(articleBlockImageKeys(article.blocks ?? []));
    const removedKeys = articleBlockImageKeys(before.blocks ?? []).filter((key) => !currentKeys.has(key));
    const bucket = (env as unknown as UploadBindings).BUCKET;
    if (bucket && removedKeys.length) {
      await Promise.all(removedKeys.map((key) => bucket.delete(key).catch(() => undefined)));
    }

    return Response.json({ article });
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
    const bucket = (env as unknown as UploadBindings).BUCKET;
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
