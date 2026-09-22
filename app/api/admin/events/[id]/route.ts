import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { deleteManagedEvent, getManagedEventById, isEventSlugConflict, quickEditManagedEvent, updateManagedEvent, type ManagedEventInput, type ManagedEventQuickEditInput } from "@/lib/event-store";
import { writeBackPublishedEventToNotion, type NotionEventSyncBindings } from "@/lib/notion-event-sync";
import { syncGeoPointAfterSourceChange } from "@/lib/geo-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type UploadBindings = NotionEventSyncBindings & { BUCKET?: R2Bucket; DB?: D1Database };

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
    const event = await updateManagedEvent(id, await request.json() as ManagedEventInput, user.email, before);
    if (!event) return Response.json({ error: "Podujatie sa nenašlo." }, { status: 404 });
    if (before.imageKey && before.imageKey !== event.imageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(before.imageKey).catch(() => undefined);
    }
    await syncGeoPointAfterSourceChange("MANAGED_EVENT", id).catch((error) => {
      console.warn("Event geo stale sync failed", { id, error: error instanceof Error ? error.message : String(error) });
    });
    if (before.status !== "published" && event.status === "published") {
      const bindings = env as unknown as UploadBindings;
      if (bindings.DB) {
        await writeBackPublishedEventToNotion({
          database: bindings.DB,
          bindings,
          event,
        }).catch((error) => {
          console.error(JSON.stringify({
            event: "notion_event_publish_writeback_failed",
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
          }));
        });
      }
    }
    return Response.json({ event });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID podujatia." }, { status: 400 });
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  }
  try {
    const event = await quickEditManagedEvent(id, await request.json() as ManagedEventQuickEditInput, user.email);
    return Response.json({ event });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Rýchla úprava zlyhala." }, { status: 409 });
  }
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
