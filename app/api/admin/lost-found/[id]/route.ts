import { getAdminEntityReview } from "@/lib/admin-entity-review-store";
import { acknowledgeAdminPublication } from "@/lib/admin-record-lifecycle";
import { env } from "cloudflare:workers";
import { captureHelpNotionSnapshot, syncSavedNotionRecord, type TargetedNotionSaveBindings } from "@/lib/notion-targeted-admin-save";
import { requireAdminMutation } from "@/lib/admin-auth";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { assertAdminDogReportTypeChangeKeepsDuplicateInvariant } from "@/lib/lost-found-duplicate-invariant";
import { getAdminDogReport, updateAdminDogReport, updateAdminDogReportInlineName, type ManagedDogReportInput } from "@/lib/lost-found-dog-store";
import {
  finalizeLostFoundPublicMedia,
  publishLostFoundPublicMedia,
} from "@/lib/lost-found-public-media";
import { syncLostFoundModerationBeforeAdminStatus } from "@/lib/lost-found-public-moderation";
import { LOST_FOUND_PUBLIC_SOURCE } from "@/lib/lost-found-public-submission";

export const dynamic = "force-dynamic";

function unifiedLostFoundEnabled(){return (env as unknown as TargetedNotionSaveBindings).NOTION_UNIFIED_FIELD_SYNC_ENABLED==="true";}
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response!;
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return Response.json({ error: "Neplatné ID hlásenia." }, { status: 400 });
  }
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  }
  let input: { action?: unknown; dogName?: unknown; expectedUpdatedAt?: unknown };
  try { input = await request.json() as typeof input; }
  catch { return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 }); }
  if (!input || Object.keys(input).length !== 3 || input.action !== "set-inline-dog-name" ||
      typeof input.expectedUpdatedAt !== "string" || !input.expectedUpdatedAt.trim() ||
      (typeof input.dogName !== "string" && input.dogName !== null)) {
    return Response.json({ error: "Rýchla úprava umožňuje iba meno psa a vyžaduje verziu záznamu." }, { status: 400 });
  }
  if (typeof input.dogName === "string" && input.dogName.trim().length > 120) {
    return Response.json({ error: "Meno psa môže mať najviac 120 znakov." }, { status: 400 });
  }
  try {
    const beforeHelpSnapshot = await captureHelpNotionSnapshot({ bindings: env as unknown as TargetedNotionSaveBindings, agenda: "lost-found", entityId: id });
    const updatedId = await updateAdminDogReportInlineName(
      id, input.dogName as string | null, input.expectedUpdatedAt,
      undefined, unifiedLostFoundEnabled()?auth.user.email:undefined,
    );
    if (!updatedId) return Response.json({ error: "Hlásenie neexistuje." }, { status: 404 });
    const notionFieldSync = await syncSavedNotionRecord({
      bindings: env as unknown as TargetedNotionSaveBindings,
      agenda: "lost-found", entityId: id, beforeHelpSnapshot,
    });
    return Response.json({ id: updatedId, notionFieldSync }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Rýchla úprava zlyhala.",
    }, { status: 409, headers: { "cache-control": "no-store" } });
  }
}

export async function PUT(request: Request, { params }: Context) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    return Response.json({ error: "Neplatné ID hlásenia." }, { status: 400 });
  }

  try {
    let input = await request.json() as ManagedDogReportInput & {expectedUpdatedAt?:unknown;reviewOnSave?:unknown};
    const authority=(env as unknown as TargetedNotionSaveBindings).NOTION_PROFILE_AUTHORITY_MODE==="validated-text";
    const reviewOnSave=authority&&input.reviewOnSave===true;
    if(reviewOnSave&&!unifiedLostFoundEnabled())return Response.json({error:"Kontrola vyžaduje zapnutú synchronizáciu V2."},{status:409});
    const existing = await getAdminDogReport(numericId);
    if (!existing) return Response.json({ error: "Hlásenie neexistuje." }, { status: 404 });
    if (unifiedLostFoundEnabled() && (typeof input.expectedUpdatedAt !== "string" || input.expectedUpdatedAt !== existing.updatedAt)) {
      return Response.json({error:"Hlásenie sa medzičasom zmenilo. Obnov stránku."},{status:409,headers:{"Cache-Control":"private, no-store"}});
    }
    const beforeHelpSnapshot = await captureHelpNotionSnapshot({ bindings: env as unknown as TargetedNotionSaveBindings, agenda: "lost-found", entityId: numericId });

    if (input.type !== undefined && input.type !== existing.type) {
      await assertAdminDogReportTypeChangeKeepsDuplicateInvariant(numericId, input.type);
    }

    const nextStatus = input.status ?? existing.status;
    const isPublicSubmission = existing.source === LOST_FOUND_PUBLIC_SOURCE;
    if (isPublicSubmission && nextStatus !== existing.status) {
      await syncLostFoundModerationBeforeAdminStatus({
        reportId: numericId,
        nextStatus,
        actorRef: await adminAuditActorRef(auth.user.email),
        requestId: request.headers.get("cf-ray"),
      });
    }

    let publishedMedia: { imageKey: string; imageUrl: string } | null = null;
    const requestedImageKey = input.mainImageKey === undefined ? existing.mainImageKey : input.mainImageKey;
    if (
      isPublicSubmission
      && nextStatus === "ACTIVE"
      && typeof requestedImageKey === "string"
      && requestedImageKey.startsWith("safe/LOST_FOUND_PUBLIC/")
    ) {
      publishedMedia = await publishLostFoundPublicMedia(numericId);
      if (publishedMedia) {
        input = {
          ...input,
          mainImage: publishedMedia.imageUrl,
          mainImageKey: publishedMedia.imageKey,
        };
      }
    }

    const report = await updateAdminDogReport(
      numericId,
      input.gallery === undefined ? { ...input, gallery: existing.gallery } : input,
      auth.user.email,
      unifiedLostFoundEnabled()?existing.updatedAt:undefined,
      reviewOnSave,
    );

    if (isPublicSubmission && nextStatus !== existing.status) {
      if (nextStatus === "ACTIVE") {
        await finalizeLostFoundPublicMedia(numericId, "APPROVED", publishedMedia?.imageKey ?? null);
      } else if (nextStatus === "REJECTED") {
        await finalizeLostFoundPublicMedia(numericId, "REJECTED", null);
      }
    }

    const notionFieldSync = await syncSavedNotionRecord({ bindings: env as unknown as TargetedNotionSaveBindings, agenda: "lost-found", entityId: numericId, beforeHelpSnapshot });
    await acknowledgeAdminPublication((env as unknown as {DB?:D1Database}).DB,"lost-found",numericId,report.status);
    return Response.json({ report, notionFieldSync, ...(authority?{review:await getAdminEntityReview("LOST_FOUND",numericId).catch(()=>null)}:{}) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hlásenie sa nepodarilo uložiť.";
    return Response.json(
      { error: message },
      {
        status: message === "Hlásenie neexistuje." ? 404 : 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
