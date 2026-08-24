import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createManagedHelpCase, isHelpCaseConflict, listManagedHelpCaseSummaries, type ManagedHelpCaseInput } from "@/lib/help-store";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const conflict = isHelpCaseConflict(error);
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  return Response.json({ error: conflict ? "V tejto kategórii už rovnaká adresa existuje." : message }, { status: conflict ? 409 : 400 });
}

export async function GET() {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  try { return Response.json({ items: await listManagedHelpCaseSummaries() }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Prípady sa nepodarilo načítať." }, { status: 500 }); }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  try { return Response.json({ item: await createManagedHelpCase(await request.json() as ManagedHelpCaseInput, user.email) }, { status: 201 }); }
  catch (error) { return errorResponse(error); }
}
