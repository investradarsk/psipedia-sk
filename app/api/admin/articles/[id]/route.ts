import { acknowledgeAdminPublication } from "@/lib/admin-record-lifecycle";
import { env } from "cloudflare:workers";
import {
  deleteManagedArticle,
  getManagedArticleById,
  isArticleSlugConflict,
  updateManagedArticle,
  updateManagedArticleInlineExcerpt,
  rescheduleManagedArticle,
  ArticleRescheduleConflictError,
  ArticleUpdateConflictError,
  type ManagedArticleInput,
} from "@/lib/article-store";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { articleBlockImageKeys } from "@/lib/article-blocks";
import { orphanedArticleMediaKeys } from "@/lib/article-media-key-preservation";
import { articleSeoChangedFields } from "@/lib/notion-article-seo-writeback";
import { isBreedArticleNotionChange } from "@/lib/notion-article-breed-placement";
import { isArticlePublishIntegrityError } from "@/lib/article-content-qa";
import {
  writeBackPublishedArticleToNotion,
  writeBackArticleBreedCategoryToNotion,
  writeBackDraftArticleContentToNotion,
  writeBackArticleSeoToNotion,
  type NotionSyncBindings,
} from "@/lib/notion-article-sync";

export const dynamic = "force-dynamic";

type NotionArticleStep = "publication" | "placement" | "seo" | "draft";
type ArticleFollowupReceipt = {
  status: "synced" | "skipped" | "partial" | "failed" | "deferred";
  code?: string;
  fields?: string[];
};
type NotionArticleResult = {
  linked?: boolean; updated: boolean; reason?: string;
  failedFields?: Array<{ field: string; code: string }>;
};
function notionStepReceipt(result: NotionArticleResult): ArticleFollowupReceipt {
  if (result.reason === "partial") {
    return { status: "partial", code: "NOTION_ARTICLE_SEO_PARTIAL",
      fields: result.failedFields?.map((item) => item.field) };
  }
  if (result.updated || result.linked && (!result.reason || result.reason === "unchanged")) {
    return { status: "synced" };
  }
  return { status: "skipped", code: result.reason ?? "not-linked" };
}
function notionStepFailure(error: unknown): ArticleFollowupReceipt {
  const raw = error instanceof Error ? error.message : "";
  return { status: "failed", code: /^(?:NOTION_|ADMIN_|UNSUPPORTED_|MISSING_NOTION_PROPERTY_)[A-Z0-9_]+$/.test(raw)
    ? raw : "REMOTE_WRITEBACK_FAILED" };
}
function articleSaveReceipt(article: { updatedAt: string }, notion: Partial<Record<NotionArticleStep, ArticleFollowupReceipt>>,
  lifecycle: ArticleFollowupReceipt, media: ArticleFollowupReceipt) {
  return { d1: { status: "saved" as const, updatedAt: article.updatedAt }, assignments: { status: "synced" as const }, notion, lifecycle, media };
}


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
  const status = error instanceof ArticleRescheduleConflictError || error instanceof ArticleUpdateConflictError || isArticleSlugConflict(error) ? 409 : 400;
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
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID článku." }, { status: 400 });

  try {
    const before = await getManagedArticleById(id);
    if (!before) return Response.json({ error: "Článok sa nenašiel." }, { status: 404 });
    const payload = (await request.json()) as ManagedArticleInput & { expectedUpdatedAt?: unknown };
    // Reject a stale editor tab rather than silently overwriting a newer Notion import.
    if (typeof payload.expectedUpdatedAt !== "string" || !payload.expectedUpdatedAt ||
        payload.expectedUpdatedAt !== before.updatedAt) {
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
    let article;
    try {
      // article-store commits the canonical row before updating related topics
      // and breeds. Never treat a later relation failure as proof of rollback.
      article = await updateManagedArticle(id, updatePayload, user.email, before, {
        updatedAt: payload.expectedUpdatedAt,
      });
    } catch (writeError) {
      const current = await getManagedArticleById(id).catch(() => null);
      if (current && current.updatedAt !== before.updatedAt) {
        return Response.json({
          error: "Verzia článku v D1 sa zmenila, ale uloženie priradení tém a plemien sa nepodarilo potvrdiť. Pred ďalším zápisom obnov editor a skontroluj aktuálne údaje.",
          outcome: "D1_CHANGED_RELATIONS_UNVERIFIED",
          storedVersion: current.updatedAt,
        }, { status: 409, headers: { "cache-control": "no-store" } });
      }
      throw writeError;
    }
    if (!article) return Response.json({ error: "Článok sa nenašiel." }, { status: 404 });

    // Notion-imported hero and OG images often share one R2 object.
    // Delete only keys that neither the resulting hero, OG nor any block uses.
    const removedKeys = orphanedArticleMediaKeys(
      [before.imageKey, before.ogImageKey, ...articleBlockImageKeys(before.blocks ?? [])],
      [article.imageKey, article.ogImageKey, ...articleBlockImageKeys(article.blocks ?? [])],
    );
    const bucket = (env as unknown as ArticleRouteBindings).BUCKET;
    let mediaReceipt: ArticleFollowupReceipt = { status: "skipped" };
    if (bucket && removedKeys.length) {
      const removed = await Promise.allSettled(removedKeys.map((key) => bucket.delete(key)));
      mediaReceipt = removed.some((result) => result.status === "rejected")
        ? { status: "failed", code: "R2_MEDIA_CLEANUP_FAILED" } : { status: "synced" };
    }
    const notionSteps: Partial<Record<NotionArticleStep, ArticleFollowupReceipt>> = {};
    const bindings = env as unknown as ArticleRouteBindings;
    if (!bindings.DB) {
      if (before.status !== "published" && article.status === "published") {
        notionSteps.publication = { status: "skipped", code: "NOTION_BINDING_MISSING" };
      }
      if (isBreedArticleNotionChange(before, article)) {
        notionSteps.placement = { status: "skipped", code: "NOTION_BINDING_MISSING" };
      }
      if (articleSeoChangedFields(before, article).length > 0) {
        notionSteps.seo = { status: "skipped", code: "NOTION_BINDING_MISSING" };
      }
      if (before.status === "draft" && article.status === "draft") {
        notionSteps.draft = { status: "skipped", code: "NOTION_BINDING_MISSING" };
      }
    }

    // Canonical D1 publication already committed. Notion writeback is best-effort:
    // a remote API error must never turn a successful publish into a failed response.
    if (before.status !== "published" && article.status === "published") {
      try {
        const bindings = env as unknown as ArticleRouteBindings;
        if (bindings.DB) {
          const publishedResult = await writeBackPublishedArticleToNotion({
            database: bindings.DB,
            bindings,
            article,
          });
          notionSteps.publication = notionStepReceipt(publishedResult);
        }
      } catch (error) {
        notionSteps.publication = notionStepFailure(error);
        // Do not log transport messages: they may contain sensitive data.
        console.error("notion_article_publish_writeback_failed", {
          articleId: article.id, code: notionSteps.publication.code,
        });
      }
    }

    // Local save is canonical even if an independently patched SEO field
    // cannot be echoed by Notion. Report the remote result rather than
    // silently claiming both systems are synchronized.
    let notionEditorialWriteback: { status: string; code?: string; fields?: string[] } | undefined;
    if (bindings.DB) {
      const report = (step: NotionArticleStep, result: NotionArticleResult) => {
        notionSteps[step] = notionStepReceipt(result);
        if (notionEditorialWriteback?.status === "blocked" ||
            notionEditorialWriteback?.status === "partial") return;
        if (result.reason === "partial") {
          notionEditorialWriteback = {
            status: "partial", code: "NOTION_ARTICLE_SEO_PARTIAL",
            fields: result.failedFields?.map(failure => failure.field),
          };
          return;
        }
        notionEditorialWriteback = {
          status: result.updated || notionEditorialWriteback?.status === "synced"
            ? "synced" : (result.reason ?? "unchanged"),
        };
      };
      const reportError = (step: NotionArticleStep, error: unknown, event: string) => {
        notionSteps[step] = notionStepFailure(error);
        const raw = error instanceof Error ? error.message : "";
        const code = /^(?:NOTION_|ADMIN_|UNSUPPORTED_|MISSING_NOTION_PROPERTY_)[A-Z0-9_]+$/.test(raw)
          ? raw : "REMOTE_WRITEBACK_FAILED";
        notionEditorialWriteback = { status: "blocked", code };
        console.error(event, { articleId: article.id, code });
      };
      // Category/section moves to/from Plemená must be mirrored before the SEO
      // and draft editorial writers use the acknowledged Notion receipt.
      if (isBreedArticleNotionChange(before, article)) {
        try {
          report("placement", await writeBackArticleBreedCategoryToNotion({
            database: bindings.DB, bindings, before, article,
          }));
        } catch (error) {
          reportError("placement", error, "notion_article_breed_category_writeback_failed");
        }
      }
      // Only changed SEO properties are sent, for BOTH drafts and published
      // articles. They run before draft body writeback so its Notion hash
      // baseline reflects already-acknowledged SEO changes.
      if (notionEditorialWriteback?.status !== "blocked" &&
          articleSeoChangedFields(before, article).length > 0) {
        try {
          report("seo", await writeBackArticleSeoToNotion({
            database: bindings.DB, bindings, before, article,
          }));
        } catch (error) {
          reportError("seo", error, "notion_article_seo_writeback_failed");
        }
      }
      if (before.status === "draft" && article.status === "draft" &&
          notionEditorialWriteback?.status !== "partial" &&
          notionEditorialWriteback?.status !== "blocked") {
        try {
          report("draft", await writeBackDraftArticleContentToNotion({
            database: bindings.DB, bindings, article,
          }));
        } catch (error) {
          reportError("draft", error, "notion_article_editorial_writeback_failed");
        }
      }
    }

    // Following writers are separate from the already committed canonical D1 save.
    // A failed receipt must not turn the success into a 400 that prompts blind resubmission.
    let lifecycleReceipt: ArticleFollowupReceipt = { status: "skipped" };
    try {
      await acknowledgeAdminPublication((env as unknown as {DB?:D1Database}).DB,"articles",id,article.status);
      lifecycleReceipt = { status: "synced" };
    } catch {
      lifecycleReceipt = { status: "failed", code: "ADMIN_PUBLICATION_ACK_FAILED" };
      console.error("article_publication_ack_failed", { articleId: article.id });
    }
    if (notionSteps.placement?.status === "failed" || notionSteps.placement?.status === "partial") {
      if (!notionSteps.seo && articleSeoChangedFields(before, article).length > 0) {
        notionSteps.seo = { status: "deferred", code: "WAITING_FOR_PLACEMENT" };
      }
      if (!notionSteps.draft && before.status === "draft" && article.status === "draft") {
        notionSteps.draft = { status: "deferred", code: "WAITING_FOR_PLACEMENT" };
      }
    }
    if (notionSteps.seo?.status === "failed" || notionSteps.seo?.status === "partial") {
      if (!notionSteps.draft && before.status === "draft" && article.status === "draft") {
        notionSteps.draft = { status: "deferred", code: "WAITING_FOR_SEO" };
      }
    }
    return Response.json({ article, ...(notionEditorialWriteback ? { notionEditorialWriteback } : {}),
      saveReceipt: articleSaveReceipt(article, notionSteps, lifecycleReceipt, mediaReceipt) });
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
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await parsedId(params);
  if (!id) return Response.json({ error: "Neplatné ID článku." }, { status: 400 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Neplatná požiadavka." }, { status: 400 });
    }
    if ((body as Record<string, unknown>).action === "retry-article-followup") {
      const values = body as Record<string, unknown>;
      const step = values.step;
      if (!["publication", "placement", "seo", "draft", "lifecycle"].includes(String(step)) ||
          typeof values.expectedUpdatedAt !== "string" || !values.expectedUpdatedAt) {
        return Response.json({ error: "Neplatný nadväzujúci krok alebo verzia článku." }, { status: 400 });
      }
      const article = await getManagedArticleById(id);
      if (!article) return Response.json({ error: "Článok sa nenašiel." }, { status: 404 });
      if (article.updatedAt !== values.expectedUpdatedAt) {
        return Response.json({ error: "Článok sa medzičasom zmenil. Načítaj najnovšiu verziu; následný krok sa nespustil." },
          { status: 409 });
      }
      const before = values.before as ManagedArticleInput & {
        id?: number; slug?: string; updatedAt?: string;
      } | undefined;
      if ((step === "placement" || step === "seo") &&
          (!before || before.id !== article.id || before.slug !== article.slug ||
            typeof before.updatedAt !== "string" || before.updatedAt === article.updatedAt)) {
        return Response.json({ error: "Chýba pôvodná verzia článku pre bezpečné zopakovanie kroku." },
          { status: 409 });
      }
      const bindings = env as unknown as ArticleRouteBindings;
      let receipt: ArticleFollowupReceipt;
      if (step === "lifecycle") {
        try {
          await acknowledgeAdminPublication(bindings.DB, "articles", id, article.status);
          receipt = { status: "synced" };
        } catch {
          receipt = { status: "failed", code: "ADMIN_PUBLICATION_ACK_FAILED" };
        }
      } else if (!bindings.DB) {
        receipt = { status: "skipped", code: "D1_NOTION_BINDING_MISSING" };
      } else {
        try {
          if (step === "publication") {
            if (article.status !== "published") {
              return Response.json({ error: "Článok nie je publikovaný." }, { status: 409 });
            }
            receipt = notionStepReceipt(await writeBackPublishedArticleToNotion({
              database: bindings.DB, bindings, article,
            }));
          } else if (step === "placement") {
            if (!isBreedArticleNotionChange(before! as typeof article, article)) {
              return Response.json({ error: "Priradenie sa v tejto verzii nezmenilo." }, { status: 409 });
            }
            receipt = notionStepReceipt(await writeBackArticleBreedCategoryToNotion({
              database: bindings.DB, bindings, before: before! as typeof article, article,
            }));
          } else if (step === "seo") {
            if (!articleSeoChangedFields(before! as typeof article, article).length) {
              return Response.json({ error: "SEO sa v tejto verzii nezmenilo." }, { status: 409 });
            }
            receipt = notionStepReceipt(await writeBackArticleSeoToNotion({
              database: bindings.DB, bindings, before: before! as typeof article, article,
            }));
          } else {
            if (article.status !== "draft") {
              return Response.json({ error: "Obsah Notion je možné zopakovať iba pre koncept." }, { status: 409 });
            }
            receipt = notionStepReceipt(await writeBackDraftArticleContentToNotion({
              database: bindings.DB, bindings, article,
            }));
          }
        } catch (error) {
          receipt = notionStepFailure(error);
          console.error("notion_article_followup_retry_failed", { articleId: id, step, code: receipt.code });
        }
      }
      return Response.json({
        article,
        saveReceipt: {
          d1: { status: "saved", updatedAt: article.updatedAt },
          notion: step === "lifecycle" ? {} : { [String(step)]: receipt },
          ...(step === "lifecycle" ? { lifecycle: receipt } : {}),
        },
      }, { headers: { "cache-control": "no-store" } });
    }
    if ((body as Record<string, unknown>).action === "set-inline-excerpt") {
      const values = body as Record<string, unknown>;
      if (Object.keys(values).length !== 3 ||
          typeof values.excerpt !== "string" ||
          typeof values.expectedUpdatedAt !== "string" || !values.expectedUpdatedAt.trim() ||
          values.excerpt.trim().length > 700) {
        return Response.json({ error: "Možno meniť iba krátky popis a vyžaduje sa verzia záznamu." }, { status: 400 });
      }
      const before = await getManagedArticleById(id);
      if (!before) return Response.json({ error: "Článok neexistuje." }, { status: 404 });
      const article = await updateManagedArticleInlineExcerpt(
        id, values.excerpt, values.expectedUpdatedAt, auth.user.email,
      );
      if (!article) return Response.json({ error: "Článok neexistuje." }, { status: 404 });
      let notionEditorialWriteback: { status: string; code?: string } | undefined;
      if (before.status === "draft" && article.status === "draft") {
        try {
          const bindings = env as unknown as ArticleRouteBindings;
          if (bindings.DB) {
            const result = await writeBackDraftArticleContentToNotion({
              database: bindings.DB, bindings, article,
            });
            notionEditorialWriteback = { status: result.updated ? "synced" : (result.reason ?? "unchanged") };
          }
        } catch (error) {
          const raw = error instanceof Error ? error.message : "";
          const code = /^(?:NOTION_|ADMIN_|UNSUPPORTED_|MISSING_NOTION_PROPERTY_)[A-Z0-9_]+$/.test(raw)
            ? raw : "REMOTE_WRITEBACK_FAILED";
          notionEditorialWriteback = { status: "blocked", code };
          console.error("notion_article_inline_writeback_failed", { articleId: id, code });
        }
      }
      return Response.json({ article, ...(notionEditorialWriteback ? { notionEditorialWriteback } : {}) },
        { headers: { "cache-control": "no-store" } });
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

/** Legacy DELETE must not bypass verified Notion trash + D1 tombstones. */
export async function DELETE(request:Request) {
  const auth=await requireAdminMutation(request, { strictProvenance: true });
  if(auth.response)return auth.response;
  return Response.json({error:"Použi Natrvalo odstrániť v editore: /api/admin/record-lifecycle."},{status:409});
}
