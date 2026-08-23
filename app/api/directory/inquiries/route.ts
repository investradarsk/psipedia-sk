import { createDirectoryInquiry, DirectoryRateLimitError, type DirectoryInquiryInput } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

type PublicInquiryPayload = DirectoryInquiryInput & { company?: string };

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return Response.json({ error: "Neplatný formát dopytu." }, { status: 415 });
  }
  try {
    const payload = await request.json() as PublicInquiryPayload;
    if (payload.company?.trim()) return Response.json({ success: true }, { status: 201 });
    await createDirectoryInquiry(payload);
    return Response.json({ success: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Dopyt sa nepodarilo odoslať.";
    return Response.json({ error: message }, { status: error instanceof DirectoryRateLimitError ? 429 : 400 });
  }
}
