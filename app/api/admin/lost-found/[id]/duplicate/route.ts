import { requireAdminMutation } from "@/lib/admin-auth";
import { adminAuditActorRef } from "@/lib/audit-identity";
import {
  getAdminDogReport,
  markAdminDogReportDuplicate,
  type MarkDogReportDuplicateInput,
} from "@/lib/lost-found-dog-store";
import { syncLostFoundModerationBeforeAdminStatus } from "@/lib/lost-found-public-moderation";
import { LOST_FOUND_PUBLIC_SOURCE } from "@/lib/lost-found-public-submission";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const auth = await requireAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await params;
  const numericId = Number.parseInt(id, 10);
  if (!Number.isSafeInteger(numericId) || numericId < 1) {
    return Response.json({ error: "Neplatné ID hlásenia." }, { status: 400 });
  }

  try {
    const input = await request.json() as MarkDogReportDuplicateInput;
    const existing = await getAdminDogReport(numericId);
    if (!existing) return Response.json({ error: "Hlásenie neexistuje." }, { status: 404 });

    if (existing.source === LOST_FOUND_PUBLIC_SOURCE) {
      await syncLostFoundModerationBeforeAdminStatus({
        reportId: numericId,
        nextStatus: "ARCHIVED",
        actorRef: await adminAuditActorRef(auth.user.email),
        requestId: request.headers.get("cf-ray"),
      });
    }

    const report = await markAdminDogReportDuplicate(numericId, input, auth.user.email);
    return Response.json({ report }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Hlásenie sa nepodarilo označiť ako duplicitu.";
    return Response.json(
      { error: message },
      {
        status: message === "Hlásenie neexistuje." ? 404 : 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
