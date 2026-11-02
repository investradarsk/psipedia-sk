import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { env } from "cloudflare:workers";
import { invalidateVersionedPublicHtmlCacheUrl } from "@/lib/public-html-cache";
import { isExplicitAnonymousHtmlRoute } from "@/lib/public-anonymous-html-cache";
import {
  getVisualDraft, publishVisualDraft, saveVisualDraft, validatedBannerKey,
  allowedVisualPublishTargets,
} from "@/lib/visual-library-edit-store";

export const dynamic = "force-dynamic";

/** Best-effort invalidation at the current POP. Other Cloudflare POPs retain
 * at most their existing short HTML TTL; never claim global purge succeeded. */
async function refreshVisualPublicationCache(publicUrl: string): Promise<string> {
  const url = new URL(publicUrl);
  // /pomoc-psom is deliberately not part of the anonymous shared HTML cache.
  if (!isExplicitAnonymousHtmlRoute(url.pathname)) return "Stránka nepoužíva zdieľanú verejnú HTML cache.";
  const workerVersion = (env as unknown as { CF_VERSION_METADATA?: { id?: string } }).CF_VERSION_METADATA?.id;
  try {
    const deleted = await invalidateVersionedPublicHtmlCacheUrl(url, workerVersion);
    return deleted
      ? "Lokálna HTML cache bola obnovená. V iných regiónoch sa zmena môže prejaviť až po uplynutí krátkej cache."
      : "Záznam v lokálnej cache sa nenašiel alebo vymazanie nie je dostupné. V iných regiónoch sa zmena môže prejaviť s krátkym oneskorením.";
  } catch (error) {
    console.warn("visual_library_cache_invalidation_failed", url.pathname, error);
    return "Zmena je uložená, ale cache sa teraz nepodarilo vymazať. Na ostatných uzloch sa obnoví po uplynutí jej platnosti.";
  }
}


function parseVariant(value: string | null): number {
  if (value === null || !/^[0-2]$/.test(value)) throw new Error("Neplatný variant banneru.");
  return Number(value);
}
function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Operácia sa nepodarila.";
  return Response.json({ error: message }, {
    status: message === "KONFLIKT_VERZIE" ? 409 :
      /Úložisko vizuálnych návrhov|Databáza nie je dostupná/i.test(message) ? 503 : 400,
  });
}

export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    const variantIndex = parseVariant(url.searchParams.get("variant"));
    validatedBannerKey(id, variantIndex);
    const draft = await getVisualDraft(id, variantIndex);
    return Response.json({
      draft,
      target: allowedVisualPublishTargets[id]?.variant === variantIndex
        ? allowedVisualPublishTargets[id].url : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = await saveVisualDraft({
      id: body.id as string, variantIndex: body.variantIndex as number,
      revision: body.revision as number, draft: body.draft,
      updatedBy: auth.user!.email,
    });
    return Response.json({ draft: input }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "publish" && body.action !== "revert") {
      throw new Error("Neplatná požiadavka.");
    }
    if (body.acknowledged !== true) {
      throw new Error("Pred publikovaním alebo vrátením zmien výslovne potvrď akciu.");
    }
    const input = await publishVisualDraft({
      id: body.id as string, variantIndex: body.variantIndex as number,
      revision: body.revision as number, confirmedUrl: body.confirmedUrl,
      publishedBy: auth.user!.email,
      action: body.action,
    });
    const publishTarget = allowedVisualPublishTargets[body.id as string];
    const cacheNotice = publishTarget
      ? await refreshVisualPublicationCache(publishTarget.url)
      : "Verejná cache sa nemení.";
    return Response.json({ draft: input, cacheNotice }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
