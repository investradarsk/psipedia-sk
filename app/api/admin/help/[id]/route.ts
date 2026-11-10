import { acknowledgeAdminPublication } from "@/lib/admin-record-lifecycle";
import { env } from "cloudflare:workers";
import { syncSavedNotionRecord, type TargetedNotionSaveBindings } from "@/lib/notion-targeted-admin-save";
import { getAdminApiUser, unauthorizedAdminResponse, requireAdminMutation } from "@/lib/admin-auth";
import { HELP_ADMIN_DOMAIN_SQL, isHelpAdminCreateCategory } from "@/lib/help-admin-query";
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
    const notionFieldSync = await syncSavedNotionRecord({ bindings: env as unknown as TargetedNotionSaveBindings, agenda: "help-cases", entityId: id });
    await acknowledgeAdminPublication((env as unknown as {DB?:D1Database}).DB,"help",id,item.status);
    return Response.json({ item, notionFieldSync });
  } catch (error) { return errorResponse(error); }
}

/** Row editing in the native Help categories; never accepts legacy
 * adoption, organization or lost-dog records, lifecycle or arbitrary columns. */
export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const id = await numericId(params);
  if (!id) return Response.json({ error: "Neplatné ID prípadu." }, { status: 400 });
  if (request.headers.get("origin") !== new URL(request.url).origin ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "Neplatný pôvod alebo formát požiadavky." }, { status: 403 });
  }
  let input: { action?: unknown; expectedUpdatedAt?: unknown; expectedCategory?: unknown; changes?: unknown };
  try {
    input = await request.json() as typeof input;
  } catch {
    return Response.json({ error: "Neplatné JSON dáta." }, { status: 400 });
  }
  if (input.action !== "set-inline-editorial" || typeof input.expectedCategory !== "string" ||
      !isHelpAdminCreateCategory(input.expectedCategory) ||
      typeof input.expectedUpdatedAt !== "string" || !input.expectedUpdatedAt.trim() ||
      !input.changes || typeof input.changes !== "object" || Array.isArray(input.changes)) {
    return Response.json({ error: "Rýchla úprava nie je v tejto kategórii povolená." }, { status: 400 });
  }
  const changes = input.changes as Record<string, unknown>;
  if (Object.keys(changes).length !== 2 || !Object.keys(changes).every(key => ["title", "excerpt"].includes(key)) ||
      typeof changes.title !== "string" || typeof changes.excerpt !== "string") {
    return Response.json({ error: "Meniť možno iba názov a krátky popis." }, { status: 400 });
  }
  const title = changes.title.trim();
  const excerpt = changes.excerpt.trim();
  if (!title || title.length > 180 || excerpt.length > 700) {
    return Response.json({ error: "Názov musí mať 1–180 znakov a popis najviac 700 znakov." }, { status: 400 });
  }
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return Response.json({ error: "Databáza nie je dostupná." }, { status: 503 });
  try {
    const row = await db.prepare(`UPDATE help_cases
      SET title=?1,excerpt=?2,updated_at=?3,updated_by=?4
      WHERE id=?5 AND updated_at=?6 AND category=?7 AND ${HELP_ADMIN_DOMAIN_SQL}
      RETURNING id`).bind(title, excerpt, new Date().toISOString(), auth.user.email,
        id, input.expectedUpdatedAt, input.expectedCategory).first<{ id: number }>();
    if (!row) return Response.json({ error: "Prípad sa zmenil alebo nepatrí do tejto kategórie. Obnov tabuľku." }, { status: 409 });
    const notionFieldSync = await syncSavedNotionRecord({ bindings: env as unknown as TargetedNotionSaveBindings, agenda: "help-cases", entityId: id });
    return Response.json({ item: await getManagedHelpCaseById(id), notionFieldSync },
      { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Native Help inline update failed", error);
    return Response.json({ error: "Úpravu sa nepodarilo uložiť." }, { status: 500 });
  }
}

/** Legacy DELETE must not bypass verified Notion trash + D1 tombstones. */
export async function DELETE(request:Request) {
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response)return auth.response;
  return Response.json({error:"Použi Natrvalo odstrániť v editore: /api/admin/record-lifecycle."},{status:409});
}
