import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { deleteManagedDirectoryProfile, getManagedDirectoryProfileById, isDirectoryProfileConflict, updateManagedDirectoryProfile, type ManagedDirectoryProfileInput } from "@/lib/directory-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type UploadBindings = { BUCKET?: R2Bucket };

async function numericId(params: Props["params"]) {
  const value = Number.parseInt((await params).id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function errorResponse(error: unknown) {
  const conflict = isDirectoryProfileConflict(error);
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  return Response.json({ error: conflict ? "V tejto kategórii už rovnaká adresa existuje." : message }, { status: conflict ? 409 : 400 });
}

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  const profile = await getManagedDirectoryProfileById(id);
  return profile ? Response.json({ profile }) : Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
}

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  try {
    const before = await getManagedDirectoryProfileById(id);
    if (!before) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    const profile = await updateManagedDirectoryProfile(id, await request.json() as ManagedDirectoryProfileInput, user.email);
    if (!profile) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    if (before.imageKey && before.imageKey !== profile.imageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(before.imageKey).catch(() => undefined);
    }
    return Response.json({ profile });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await getAdminApiUser(); if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params); if (!id) return Response.json({ error: "Neplatné ID profilu." }, { status: 400 });
  try {
    const profile = await deleteManagedDirectoryProfile(id);
    if (!profile) return Response.json({ error: "Profil sa nenašiel." }, { status: 404 });
    if (profile.imageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(profile.imageKey).catch(() => undefined);
    }
    return Response.json({ deleted: true, id });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Profil sa nepodarilo odstrániť." }, { status: 500 }); }
}
