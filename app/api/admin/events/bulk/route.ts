import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { bulkUpdateEventStatus, getManagedEventById } from "@/lib/event-store";
import { writeBackPublishedEventToNotion, type NotionEventSyncBindings } from "@/lib/notion-event-sync";

export const dynamic = "force-dynamic";

type RuntimeBindings = NotionEventSyncBindings & { DB?: D1Database };

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return Response.json({ error: "Neplatný pôvod požiadavky." }, { status: 403 });
  try {
    const result = await bulkUpdateEventStatus(await request.json(), user.email);
    if (result.field === "status" && result.value === "published") {
      const bindings = env as unknown as RuntimeBindings;
      if (bindings.DB) {
        for (const id of result.ids) {
          const event = await getManagedEventById(id);
          if (!event || event.status !== "published") continue;
          await writeBackPublishedEventToNotion({
            database: bindings.DB,
            bindings,
            event,
          }).catch((error) => {
            console.error(JSON.stringify({
              event: "notion_event_bulk_publish_writeback_failed",
              eventId: id,
              error: error instanceof Error ? error.message : String(error),
            }));
          });
        }
      }
    }
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Hromadná zmena zlyhala." }, { status: 409 });
  }
}
