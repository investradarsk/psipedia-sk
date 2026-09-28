import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createAdoptionFromAdmin, isAdoptionAdminConflict } from "@/lib/adoption-admin-write";
import type { ManagedAdoptionInput } from "@/lib/adoption";

export const dynamic = "force-dynamic";

type Body = { payload?: ManagedAdoptionInput };
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function errorResponse(error: unknown) {
  const conflict = isAdoptionAdminConflict(error);
  const message = error instanceof Error ? error.message : "Adopčný profil sa nepodarilo uložiť.";
  return Response.json({ error: message }, { status: conflict ? 409 : 400 });
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    const body = await request.json() as Body;
    if (!isRecord(body) || !isRecord(body.payload)) return Response.json({ error: "Neplatný payload adopčného profilu." }, { status: 400 });
    const item = await createAdoptionFromAdmin(body.payload as ManagedAdoptionInput, user.email);
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
