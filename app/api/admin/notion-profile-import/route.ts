import { env } from "cloudflare:workers";
import { requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getManagedDirectoryProfileById } from "@/lib/directory-store";
import { getManagedEventById } from "@/lib/event-store";
import { getManagedBreed } from "@/lib/breed-store";
import { runNotionDirectorySyncSweep, type NotionDirectorySyncBindings } from "@/lib/notion-directory-sync";
import { runNotionEventsHelpSyncSweep, type NotionEventsHelpSyncBindings } from "@/lib/notion-events-help-sync";
import { runNotionBreedWorkCopySyncSweep, type BreedWorkCopyBindings } from "@/lib/notion-breed-workcopy-sync";

export const dynamic = "force-dynamic";

type Bindings = NotionDirectorySyncBindings & NotionEventsHelpSyncBindings &
  BreedWorkCopyBindings & { DB?: D1Database };
type Scope = "directory" | "events" | "breeds";
function reply(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}

/** Only one owner-authenticated, pre-linked profile may be pulled on click.
 * No raw provider page ID, arbitrary URL, bulk import, new record or publication.
 */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  let parsed: unknown;
  try { parsed = await request.json(); }
  catch { return reply({ error: "Neplatné údaje požiadavky." }, 400); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return reply({ error: "Neplatné údaje požiadavky." }, 400);
  const args = parsed as Record<string, unknown>;
  if (Object.keys(args).some(key => !["scope", "id"].includes(key)))
    return reply({ error: "Požiadavka môže aktualizovať iba jeden profil." }, 400);
  const scope = args.scope as Scope;
  const id = args.id;
  if (!["directory", "events", "breeds"].includes(scope) ||
      typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)
    return reply({ error: "Neplatný typ alebo ID profilu." }, 400);
  const bindings = env as unknown as Bindings;
  const db = bindings.DB;
  if (!db) return reply({ error: "Databáza nie je dostupná." }, 503);

  try {
    if (scope === "directory") {
      const profile = await getManagedDirectoryProfileById(id, db);
      if (!profile || profile.status === "archived")
        return reply({ error: "Profil neexistuje alebo je archivovaný." }, 404);
      const mapping = await db.prepare(
        "SELECT notion_page_id FROM directory_notion_sync WHERE directory_profile_id=? LIMIT 1",
      ).bind(id).first<{ notion_page_id: string }>();
      if (!mapping?.notion_page_id)
        return reply({ error: "Profil nie je prepojený s Notionom." }, 404);
      const result = await runNotionDirectorySyncSweep({
        database: db, bindings, targetProfileId: id,
        manualDirection: "NOTION_TO_ADMIN",
      });
      if (!result.enabled || !result.schemaReady || result.failed ||
          !(result.pulledFromNotion || result.unchanged))
        return reply({ error: "Prenos profilu z Notionu sa nepodarilo potvrdiť." }, 409);
      return reply({ status: result.pulledFromNotion ? "updated" : "unchanged" });
    }

    if (scope === "events") {
      const event = await getManagedEventById(id);
      if (!event) return reply({ error: "Podujatie neexistuje." }, 404);
      const mapping = await db.prepare(
        "SELECT notion_page_id FROM event_notion_sync WHERE event_id=? LIMIT 1",
      ).bind(id).first<{ notion_page_id: string }>();
      if (!mapping?.notion_page_id)
        return reply({ error: "Podujatie nie je prepojené s Notionom." }, 404);
      const result = await runNotionEventsHelpSyncSweep({
        database: db, bindings, mode: "sync", agendas: ["events"],
        targetPageId: mapping.notion_page_id, webhookMappedOnly: true,
        manualDirection: "NOTION_TO_ADMIN",
      });
      const eventResult = result.agendas.find(item => item.agenda === "events");
      if (!result.enabled || !result.schemaReady || !eventResult ||
          eventResult.scanned !== 1 || eventResult.targetMissing ||
          result.totals.failed || result.totals.conflicts ||
          result.totals.reviewRequired ||
          !(eventResult.pulledFromNotion || eventResult.unchanged))
        return reply({ error: "Prenos podujatia z Notionu sa nepodarilo potvrdiť." }, 409);
      return reply({ status: eventResult.pulledFromNotion ? "updated" : "unchanged" });
    }

    const breed = await getManagedBreed(id);
    if (!breed) return reply({ error: "Plemeno neexistuje." }, 404);
    if (bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED !== "true" ||
        bindings.NOTION_BREED_SYNC_ENABLED === "true")
      return reply({ error: "Nová synchronizácia plemien ešte nie je aktívna." }, 409);
    const link = await db.prepare(
      "SELECT work_notion_page_id FROM breed_notion_workcopy_links " +
      "WHERE breed_id=? AND status='ACTIVE' AND work_sync_receipt IS NOT NULL LIMIT 1",
    ).bind(id).first<{ work_notion_page_id: string }>();
    if (!link?.work_notion_page_id)
      return reply({ error: "Plemeno nemá overené aktívne prepojenie s Notionom." }, 404);
    const result = await runNotionBreedWorkCopySyncSweep({
      database: db, bindings, targetPageId: link.work_notion_page_id,
      manualImport: true,
    });
    if (!result.enabled || result.scanned !== 1 || result.failed)
      return reply({ error: "Prenos plemena z Notionu sa nepodarilo potvrdiť." }, 409);
    return reply({ status: result.updated ? "updated" : "unchanged" });
  } catch (error) {
    console.error("NOTION_PROFILE_IMPORT_FAILED",scope,id,
      error instanceof Error ? error.message : "UNKNOWN");
    return reply({
      error: "Aktualizácia z Notionu zlyhala. Údaje v ostatných profiloch zostali nezmenené.",
    }, 409);
  }
}
