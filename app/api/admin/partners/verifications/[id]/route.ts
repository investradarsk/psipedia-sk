import { env } from "cloudflare:workers";
import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { decidePartnerVerificationAdmin, PartnerClaimAdminError } from "@/lib/partner-claims-admin";
import { invalidateVersionedPublicHtmlCacheUrl } from "@/lib/public-html-cache";

export const dynamic = "force-dynamic";

type CacheBindings = {
  CF_VERSION_METADATA?: { id?: string };
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartnerAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "VERIFY" && body.action !== "REJECT") {
      return Response.json({ error: "Neplatná verification akcia." }, { status: 400 });
    }
    const verification = await decidePartnerVerificationAdmin({
      id,
      action: body.action,
      reviewNote: body.reviewNote,
      adminEmail: auth.user.email,
    });
    try {
      await invalidateVersionedPublicHtmlCacheUrl(
        new URL(verification.publicHref, request.url),
        (env as unknown as CacheBindings).CF_VERSION_METADATA?.id,
      );
    } catch (error) {
      console.error(JSON.stringify({
        event: "partner_verification_public_cache_invalidation_failed",
        verificationId: id,
        error: error instanceof Error ? error.name : "unknown_error",
      }));
    }
    return Response.json({ verification });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Zmena zlyhala." }, {
      status: error instanceof PartnerClaimAdminError ? error.status : 400,
    });
  }
}
