import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
import { PartnerAuthorizationError } from "@/lib/partner-platform";
import { updatePartnerHelpPublic, PartnerHelpEditorError } from "@/lib/partner-help-editor";
import { HelpEditorValidationError } from "@/lib/partner-help-editor-fields";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ resourceId: string }> }) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    if (!identity.onboardingComplete) throw new PartnerHelpEditorError("Najprv dokončite registráciu.",403);
    const { resourceId } = await params;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new HelpEditorValidationError("Neplatné údaje.");
    const data = body as Record<string, unknown>;
    const allowed = new Set(["baseRevision","patch","mediaAssetId","galleryUrls","galleryMediaIds"]);
    if (Object.keys(data).some(key=>!allowed.has(key))) throw new HelpEditorValidationError("Nepovolený údaj v požiadavke.");
    const result = await updatePartnerHelpPublic({
      accountId: identity.accountId,resourceId,baseRevision:data.baseRevision,patch:data.patch,
      mediaAssetId:data.mediaAssetId,galleryUrls:data.galleryUrls,galleryMediaIds:data.galleryMediaIds,
      publicOrigin:new URL(request.url).origin,
    });
    return Response.json({ success: true, result }, { headers: { "Cache-Control":"private, no-store" } });
  } catch (error) {
    const status = error instanceof PartnerHelpEditorError || error instanceof HelpEditorValidationError ||
      error instanceof PartnerSecurityError || error instanceof PartnerAuthorizationError ? error.status
      : typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 503;
    if (status >= 500) console.error("Partner Help canonical edit failed",error);
    return Response.json({error:status>=500?"Zmeny sa nepodarilo bezpečne uložiť.":error instanceof Error?error.message:"Požiadavka zlyhala."},
      {status,headers:{"Cache-Control":"private, no-store"}});
  }
}
