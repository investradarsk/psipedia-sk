import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { listDirectoryProfileChangeRequests } from "@/lib/directory-store";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try { return Response.json({ requests: await listDirectoryProfileChangeRequests() }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Návrhy sa nepodarilo načítať." }, { status: 500 }); }
}
