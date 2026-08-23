import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { deleteManagedEvent, getManagedEventById, isEventSlugConflict, updateManagedEvent, type ManagedEventInput } from "@/lib/event-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type UploadBindings = { BUCKET?: R2Bucket };

async function numericId(params: Props["params"]) {
  const value = Number.parseInt((await params).id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  const conflict = isEventSlugConflict(error);
  return Response.json({ error: conflict ? "Túto adresu už používa iné podujatie." : message }, { status: conflict ? 409 : 400 });
}

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID podujatia." }, { status: 400 });
  const event = await getManagedEventById(id);
  return event ? Response.json({ event }) : Response.json({ error: "Podujatie sa nenašlo." }, { status: 404 });
}

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID podujatia." }, { status: 400 });
  try {
    const before = await getManagedEventById(id);
    if (!before) return Response.json({ error: "Podujatie sa nenašlo." }, { status: 404 });
    const event = await updateManagedEvent(id, await request.json() as ManagedEventInput, user.email);
    if (!event) return Response.json({ error: "Podujatie sa nenašlo." }, { status: 404 });
    if (before.imageKey && before.imageKey !== event.imageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(before.imageKey).catch(() => undefined);
    }
    return Response.json({ event });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID podujatia." }, { status: 400 });
  try {
    const event = await deleteManagedEvent(id);
    if (!event) return Response.json({ error: "Podujatie sa nenašlo." }, { status: 404 });
    if (event.imageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(event.imageKey).catch(() => undefined);
    }
    return Response.json({ deleted: true, id });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Podujatie sa nepodarilo odstrániť." }, { status: 500 }); }
}
