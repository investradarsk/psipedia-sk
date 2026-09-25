import { createDirectoryProfileChangeRequest, DirectoryRateLimitError, type DirectoryProfileChangeRequestInput } from "@/lib/directory-store";
import { processEditorialNotification } from "@/lib/editorial-notifications";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "Neplatný formát návrhu." }, { status: 415 });
  try {
    const payload = await request.json() as DirectoryProfileChangeRequestInput;
    const saved = await createDirectoryProfileChangeRequest(payload);
    await processEditorialNotification("directory_profile_change_request", saved, { mirrorAdminPush: true }).catch(() => {
      console.error(JSON.stringify({ event: "editorial_notification", resourceType: "directory_profile_change_request", resourceId: saved.id, result: "failed", error: "outbox_processing_failed" }));
    });
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Návrh sa nepodarilo odoslať." }, { status: error instanceof DirectoryRateLimitError ? 429 : 400 });
  }
}
