import { createDirectoryProfileChangeRequest, DirectoryRateLimitError, type DirectoryProfileChangeRequestInput } from "@/lib/directory-store";
import { notifyDirectoryProfileChangeRequest } from "@/lib/editorial-email";

export const dynamic = "force-dynamic";
type PublicPayload = DirectoryProfileChangeRequestInput & { company?: string };

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "Neplatný formát návrhu." }, { status: 415 });
  try {
    const payload = await request.json() as PublicPayload;
    if (payload.company?.trim()) return Response.json({ success: true }, { status: 201 });
    const saved = await createDirectoryProfileChangeRequest(payload);
    await notifyDirectoryProfileChangeRequest(saved);
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Návrh sa nepodarilo odoslať." }, { status: error instanceof DirectoryRateLimitError ? 429 : 400 });
  }
}
