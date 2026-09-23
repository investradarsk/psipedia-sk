import { env } from "cloudflare:workers";
import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { approvePartnerProfileChangeAdmin, rejectPartnerProfileChangeAdmin } from "@/lib/partner-profile-changes-admin";
import { PartnerProfileChangeError } from "@/lib/partner-profile-changes";
import { invalidateVersionedPublicHtmlCacheUrl } from "@/lib/public-html-cache";

export const dynamic = "force-dynamic";

type CacheBindings = { CF_VERSION_METADATA?: { id?: string } };

async function invalidateAfterApproval(publicHref: string | null, requestUrl: string) {
  if (!publicHref) return;
  const version = (env as unknown as CacheBindings).CF_VERSION_METADATA?.id;
  const targets = [publicHref];
  const parts = publicHref.split("/").filter(Boolean);
  if (parts[0] === "adresar" && parts[1]) targets.push(`/adresar/${parts[1]}`);
  if (parts[0] === "organizacie") targets.push("/organizacie");
  for (const href of [...new Set(targets)]) {
    try {
      await invalidateVersionedPublicHtmlCacheUrl(new URL(href, requestUrl), version);
    } catch (error) {
      console.error(JSON.stringify({
        event: "partner_profile_change_public_cache_invalidation_failed",
        href,
        error: error instanceof Error ? error.name : "unknown_error",
      }));
    }
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartnerAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "APPROVE") {
      const change = await approvePartnerProfileChangeAdmin({
        id,
        adminEmail: auth.user.email,
        requestId: request.headers.get("cf-ray"),
      });
      await invalidateAfterApproval(change?.publicHref ?? null, request.url);
      return Response.json({ change }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (body.action === "REJECT") {
      const change = await rejectPartnerProfileChangeAdmin({
        id,
        reasonCode: body.reasonCode,
        adminEmail: auth.user.email,
        requestId: request.headers.get("cf-ray"),
      });
      return Response.json({ change }, { headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ error: "Neplatná akcia." }, { status: 400 });
  } catch (error) {
    const status = error instanceof PartnerProfileChangeError
      ? error.status
      : error instanceof Error && error.name === "ModerationStateConflictError" ? 409 : 400;
    return Response.json({ error: error instanceof Error ? error.message : "Zmena zlyhala." }, { status });
  }
}
