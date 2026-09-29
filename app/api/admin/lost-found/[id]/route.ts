import { requireAdminMutation } from "@/lib/admin-auth";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { assertAdminDogReportTypeChangeKeepsDuplicateInvariant } from "@/lib/lost-found-duplicate-invariant";
import { getAdminDogReport, updateAdminDogReport, type ManagedDogReportInput } from "@/lib/lost-found-dog-store";
import {
  finalizeLostFoundPublicMedia,
  publishLostFoundPublicMedia,
} from "@/lib/lost-found-public-media";
import { syncLostFoundModerationBeforeAdminStatus } from "@/lib/lost-found-public-moderation";
import { LOST_FOUND_PUBLIC_SOURCE } from "@/lib/lost-found-public-submission";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    return Response.json({ error: "Neplatné ID hlásenia." }, { status: 400 });
  }

  try {
    let input = await request.json() as ManagedDogReportInput;
    const existing = await getAdminDogReport(numericId);
    if (!existing) return Response.json({ error: "Hlásenie neexistuje." }, { status: 404 });

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
    );

    if (isPublicSubmission && nextStatus !== existing.status) {
      if (nextStatus === "ACTIVE") {
        await finalizeLostFoundPublicMedia(numericId, "APPROVED", publishedMedia?.imageKey ?? null);
      } else if (nextStatus === "REJECTED") {
        await finalizeLostFoundPublicMedia(numericId, "REJECTED", null);
      }
    }

    return Response.json({ report }, { headers: { "Cache-Control": "private, no-store" } });
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
