import { acknowledgeAdminPublication } from "@/lib/admin-record-lifecycle";
import { env } from "cloudflare:workers";
import { syncSavedNotionRecord, type TargetedNotionSaveBindings } from "@/lib/notion-targeted-admin-save";
import { getAdminApiUser, unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { deleteManagedEvent, EventWriteConflictError, getManagedEventById, isEventSlugConflict, quickEditManagedEvent, updateManagedEvent, type ManagedEventInput, type ManagedEventQuickEditInput } from "@/lib/event-store";
import { writeBackPublishedEventToNotion, type NotionEventSyncBindings } from "@/lib/notion-event-sync";
import { eventChangedAdminFields, eventPreserveUneditedAdminFields, EVENT_NOTION_PATHS, type EventNotionField } from "@/lib/notion-event-field-contract";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };
type UploadBindings = NotionEventSyncBindings & { BUCKET?: R2Bucket; DB?: D1Database };

async function numericId(params: Props["params"]) {
  const value = Number.parseInt((await params).id, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Nastala neočakávaná chyba.";
  if (error instanceof EventWriteConflictError) {
    return Response.json({ error: error.message, code: "EVENT_VERSION_CONFLICT" }, { status: 409 });
  }
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
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID podujatia." }, { status: 400 });
  try {
    const before = await getManagedEventById(id);
    if (!before) return Response.json({ error: "Podujatie sa nenašlo." }, { status: 404 });
    const raw = await request.json() as ManagedEventInput & {
      expectedUpdatedAt?: unknown; eventEditorialChangedFields?: unknown;
    };
    // The version comes from the editor's initial D1 snapshot. A fresh read
    // alone is not sufficient: another writer can commit between SELECT/UPDATE.
    if (typeof raw?.expectedUpdatedAt !== "string" || !raw.expectedUpdatedAt.trim()) {
      return Response.json({
        error: "Chýba verzia podujatia. Obnov editor pred uložením.",
        code: "EVENT_VERSION_REQUIRED",
      }, { status: 428 });
    }
    if (raw.expectedUpdatedAt !== before.updatedAt) throw new EventWriteConflictError();
    const edited = Array.isArray(raw.eventEditorialChangedFields)
      ? raw.eventEditorialChangedFields.filter((path):path is EventNotionField =>
          typeof path==="string" && EVENT_NOTION_PATHS.includes(path as EventNotionField))
      : null;
    // Preserve fresh Notion edits to fields untouched by this Admin form.
    const safe=edited===null?raw:eventPreserveUneditedAdminFields(
      raw as Record<string,unknown>,before as unknown as Record<string,unknown>,edited,
    ) as ManagedEventInput;
    // Notes are private and absent from DogEvent. Never overwrite a newer Notion
    // note unless the Admin editor explicitly changed that field.
    if (edited !== null && !edited.includes("internalNotes")) delete safe.internalNotes;
    // Bad optional contacts cannot cancel unrelated edits. They are omitted
    // from publication and returned as warnings, never used as unsafe links.
    const fieldWarnings: string[] = [];
    const sanitizedFields = new Set<EventNotionField>();
    for (const key of ["websiteUrl", "registrationUrl"] as const) {
      const value = safe[key];
      if (typeof value !== "string" || !value.trim()) continue;
      let valid = false;
      try {
        const url = new URL(value);
        valid = url.protocol === "https:" || url.protocol === "http:";
      } catch { /* Isolate the optional invalid URL. */ }
      if (valid) continue;
      safe[key] = null;
      sanitizedFields.add(key);
      fieldWarnings.push("Neplatný nepovinný odkaz bol vynechaný: " + key);
    }
    if (safe.contactEmail &&
        (safe.contactEmail.length > 254 ||
         !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(safe.contactEmail))) {
      safe.contactEmail = null;
      sanitizedFields.add("contactEmail");
      fieldWarnings.push("Neplatný nepovinný e-mail bol vynechaný");
    }
    const unifiedEdit = (env as unknown as { NOTION_UNIFIED_FIELD_SYNC_ENABLED?: string })
      .NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true";
    const receiptFields = unifiedEdit ? (edited ?? []).filter(field => !sanitizedFields.has(field)) : undefined;
    const event = await updateManagedEvent(id, safe, user.email, before, receiptFields);
    if (!event) return Response.json({ error: "Podujatie sa nenašlo." }, { status: 404 });
    // The D1 write has committed. Remote Notion mirroring and auxiliary
    // acknowledgements are separate outcomes, never a failed Admin save.
    const notionWarnings: string[] = [];
    if (before.imageKey && before.imageKey !== event.imageKey) {
      const bucket = (env as unknown as UploadBindings).BUCKET;
      if (bucket) await bucket.delete(before.imageKey).catch((error) => {
        console.error("event_previous_image_cleanup_failed", id, error);
        fieldWarnings.push("Starý obrázok sa nepodarilo odstrániť z úložiska.");
      });
    }
    if (before.status !== "published" && event.status === "published") {
      const bindings = env as unknown as UploadBindings;
      if (bindings.DB) {
        await writeBackPublishedEventToNotion({
          database: bindings.DB,
          bindings,
          event,
        }).catch((error) => {
          notionWarnings.push("Publikovanie sa uložilo do D1, ale potvrdenie v Notione sa nepodarilo dokončiť.");
          console.error(JSON.stringify({
            event: "notion_event_publish_writeback_failed",
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
          }));
        });
      }
    }
    const notionFieldSync = await syncSavedNotionRecord({
      bindings: env as unknown as TargetedNotionSaveBindings, agenda: "events", entityId: event.id,
      changedEventFields:edited??eventChangedAdminFields(
        before as unknown as Record<string,unknown>,event as unknown as Record<string,unknown>),
    }).catch((error) => {
      console.error("event_notion_field_sync_failed", id, error);
      return "pending" as const;
    });
    if (["pending", "review", "setup"].includes(notionFieldSync)) {
      notionWarnings.push("Údaje podujatia sú uložené v D1, synchronizácia s Notionom zatiaľ nie je potvrdená.");
    }
    await acknowledgeAdminPublication((env as unknown as {DB?:D1Database}).DB,"events",id,event.status)
      .catch((error) => {
        console.error("event_publication_acknowledgement_failed", id, error);
        fieldWarnings.push("Interné potvrdenie stavu publikovania sa nepodarilo dokončiť.");
      });
    return Response.json({ event, savedToD1: true, notionFieldSync, notionWarnings, fieldWarnings });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID podujatia." }, { status: 400 });
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  }
  try {
    const before = await getManagedEventById(id);
    const unifiedEdit = (env as unknown as { NOTION_UNIFIED_FIELD_SYNC_ENABLED?: string })
      .NOTION_UNIFIED_FIELD_SYNC_ENABLED === "true";
    const event = await quickEditManagedEvent(id, await request.json() as ManagedEventQuickEditInput, user.email, unifiedEdit);
    const notionFieldSync = event ? await syncSavedNotionRecord({
      bindings: env as unknown as TargetedNotionSaveBindings, agenda: "events", entityId: event.id,
      changedEventFields:before?eventChangedAdminFields(
        before as unknown as Record<string,unknown>,event as unknown as Record<string,unknown>):[],
    }) : "unlinked";
    return Response.json({ event, notionFieldSync });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Rýchla úprava zlyhala." }, { status: 409 });
  }
}

/** Legacy DELETE must not bypass verified Notion trash + D1 tombstones. */
export async function DELETE(request:Request) {
  const auth=await requireAdminMutation(request, { strictProvenance: true });
  if(auth.response)return auth.response;
  return Response.json({error:"Použi Natrvalo odstrániť v editore: /api/admin/record-lifecycle."},{status:409});
}
