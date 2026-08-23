import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { listDirectoryInquiries } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try { return Response.json({ inquiries: await listDirectoryInquiries() }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Dopyty sa nepodarilo načítať." }, { status: 500 }); }
}
