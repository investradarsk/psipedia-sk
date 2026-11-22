import {
  createDirectoryInquiry,
  DirectoryRateLimitError,
  DirectorySubmissionKeyConflictError,
  type DirectoryInquiryInput,
} from "@/lib/directory-inquiry-store";
import { processDirectoryInquiryNotification } from "@/lib/directory-inquiry-notifications";

export const dynamic = "force-dynamic";

type PublicInquiryPayload = DirectoryInquiryInput & { company?: string };

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Neplatný formát dopytu." }, { status: 415 });
  }
  try {
    const payload = await request.json() as PublicInquiryPayload;
    if (payload.company?.trim()) return Response.json({ success: true }, { status: 201 });

    const saved = await createDirectoryInquiry(payload);
    try {
      await processDirectoryInquiryNotification(saved.inquiry, "new", { mirrorAdminPush: saved.created });
    } catch {
      console.error(JSON.stringify({
        event: "directory_inquiry_notification",
        inquiryId: saved.inquiry.id,
        notificationType: "new",
        result: "failed",
        error: "outbox_processing_failed",
      }));
    }

    return Response.json({ success: true }, { status: saved.created ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dopyt sa nepodarilo odoslať.";
    const status = error instanceof DirectoryRateLimitError ? 429
      : error instanceof DirectorySubmissionKeyConflictError ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
