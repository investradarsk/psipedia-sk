import { requireAdminMutation } from "@/lib/admin-auth";
import { adminAuditActorRef } from "@/lib/audit-identity";
import {
  moderateProfileReviewAdmin,
  ProfileReviewAdminError,
  ProfileReviewModerationConflictError,
} from "@/lib/profile-review-admin";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: RouteProps) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  if (!auth.user) return Response.json({ error: "Na túto operáciu nemáš oprávnenie." }, { status: 401 });

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Očakáva sa JSON." }, { status: 415 });
  }

  const payload = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!payload) return Response.json({ error: "Neplatné údaje." }, { status: 400 });

  const { id } = await params;
  try {
    const review = await moderateProfileReviewAdmin({
      id,
      action: payload.action,
      expectedStatus: payload.expectedStatus,
      reasonCode: payload.reasonCode,
      moderatorNote: payload.moderatorNote,
      actorRef: await adminAuditActorRef(auth.user.email),
      requestId: request.headers.get("cf-ray") ?? request.headers.get("x-request-id"),
    });
    return Response.json({ review }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof ProfileReviewModerationConflictError) {
      return Response.json(
        { error: "Stav recenzie sa medzičasom zmenil. Obnov detail a skús akciu znova." },
        { status: 409 },
      );
    }
    if (error instanceof ProfileReviewAdminError) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Profile review moderation failed.", error instanceof Error ? error.message : "unknown_error");
    return Response.json({ error: "Moderáciu recenzie sa nepodarilo dokončiť." }, { status: 503 });
  }
}
