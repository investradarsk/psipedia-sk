import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { previewAddressResearchDataset } from "@/lib/directory-address-research-import";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const contentLength = Number(request.headers.get("content-length") || "0");
    if (contentLength > 20 * 1024 * 1024) {
      return Response.json({ error: "JSON je väčší ako povolených 20 MB." }, { status: 413, headers: { "Cache-Control": "private, no-store" } });
    }
    const body = await request.json();
    const result = await previewAddressResearchDataset(body);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Preview zlyhalo." },
      { status: 400, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
