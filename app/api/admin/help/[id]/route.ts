import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { deleteManagedHelpCase, getManagedHelpCaseById, isHelpCaseConflict, updateManagedHelpCase, type ManagedHelpCaseInput } from "@/lib/help-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type UploadBindings = { BUCKET?: R2Bucket };

async function numericId(params: Props["params"]) { const value = Number.parseInt((await params).id, 10); return Number.isSafeInteger(value) && value > 0 ? value : null; }
function errorResponse(error: unknown) { const conflict = isHelpCaseConflict(error); const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba."; return Response.json({ error: conflict ? "V tejto kategórii už rovnaká adresa existuje." : message }, { status: conflict ? 409 : 400 }); }

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID prípadu." }, { status: 400 });
  const item = await getManagedHelpCaseById(id); return item ? Response.json({ item }) : Response.json({ error: "Prípad sa nenašiel." }, { status: 404 });
}

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID prípadu." }, { status: 400 });
  try {
    const before = await getManagedHelpCaseById(id); if (!before) return Response.json({ error: "Prípad sa nenašiel." }, { status: 404 });
    const item = await updateManagedHelpCase(id, await request.json() as ManagedHelpCaseInput, user.email, before); if (!item) return Response.json({ error: "Prípad sa nenašiel." }, { status: 404 });
    if (before.imageKey && before.imageKey !== item.imageKey) { const bucket = (env as unknown as UploadBindings).BUCKET; if (bucket) await bucket.delete(before.imageKey).catch(() => undefined); }
    return Response.json({ item });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID prípadu." }, { status: 400 });
  try { const item = await deleteManagedHelpCase(id); if (!item) return Response.json({ error: "Prípad sa nenašiel." }, { status: 404 }); if (item.imageKey) { const bucket = (env as unknown as UploadBindings).BUCKET; if (bucket) await bucket.delete(item.imageKey).catch(() => undefined); } return Response.json({ deleted: true, id }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Prípad sa nepodarilo odstrániť." }, { status: 500 }); }
}
