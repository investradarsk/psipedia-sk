import { env } from "cloudflare:workers";
import { downloadRemoteImage, safeRemoteImageUrl } from "@/lib/notion-sync-shared";

export const dynamic = "force-dynamic";

// Only existing published events can request an origin fallback; callers cannot
// supply an arbitrary destination URL (avoids turning this into an open proxy).
type PublicImageBindings = { DB?: D1Database };
type Params = { params: Promise<{ id: string }> };
const NOT_FOUND = () => new Response("Not found", {
  status: 404,
  headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
});

/** Serve an external event poster through Psipedia only when direct browser loading failed.
 *  There is no mutation of the original event, the R2 bucket or Notion.
 */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  if (!/^[1-9]\d{0,12}$/.test(id)) return NOT_FOUND();
  const eventId = Number(id);
  if (!Number.isSafeInteger(eventId)) return NOT_FOUND();
  const db = (env as unknown as PublicImageBindings).DB;
  if (!db) return NOT_FOUND();

  try {
    const row = await db.prepare(
      "SELECT image_url FROM managed_events WHERE id = ? AND status = 'published' LIMIT 1",
    ).bind(eventId).first<{ image_url: string | null }>();
    if (!row?.image_url) return NOT_FOUND();

    // Reject local /media URLs, unsafe destinations and a recursive self-proxy.
    const source = safeRemoteImageUrl(row.image_url);
    if (source.hostname === "psipedia.sk" || source.hostname === "www.psipedia.sk") return NOT_FOUND();

    // Existing importer validates redirects, type and a strict 8 MB size cap.
    const photo = await downloadRemoteImage(source.toString());
    return new Response(new Uint8Array(photo.bytes).buffer, {
      status: 200,
      headers: {
        "content-type": photo.contentType,
        "cache-control": "public, max-age=3600, s-maxage=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    // If the original server is unavailable even server-to-server, the client
    // still has its existing event-category artwork as the final fallback.
    return NOT_FOUND();
  }
}
