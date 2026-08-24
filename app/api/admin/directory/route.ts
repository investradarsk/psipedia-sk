import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createManagedDirectoryProfile, isDirectoryProfileConflict, listManagedDirectoryProfileSummaries, type ManagedDirectoryProfileInput } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const conflict = isDirectoryProfileConflict(error);
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  return Response.json({ error: conflict ? "V tejto kategórii už rovnaká adresa existuje." : message }, { status: conflict ? 409 : 400 });
}

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const url = new URL(request.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.max(1, Math.min(100, Number.parseInt(url.searchParams.get("limit") ?? "50", 10) || 50));
    return Response.json(await listManagedDirectoryProfileSummaries({ page, pageSize }));
  }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Profily sa nepodarilo načítať." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const profile = await createManagedDirectoryProfile(await request.json() as ManagedDirectoryProfileInput, user.email);
    return Response.json({ profile }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
