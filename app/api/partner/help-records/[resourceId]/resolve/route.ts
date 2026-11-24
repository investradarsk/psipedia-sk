import { env } from "cloudflare:workers";
import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
import { PartnerAuthorizationError } from "@/lib/partner-platform";
import {
  resolvePartnerLostFoundReport, PartnerLostFoundResolutionError,
} from "@/lib/partner-lost-found-resolution";
import type { TargetedNotionSaveBindings } from "@/lib/notion-targeted-admin-save";

export const dynamic = "force-dynamic";

/** Only an authenticated, approved OWNER can resolve an ACTIVE dog report. */
export async function PATCH(request: Request, { params }: { params: Promise<{resourceId:string}> }) {
  try {
    assertPartnerJsonMutation(request);
    const identity=await requirePartnerAccount({cookieHeader:request.headers.get("cookie")});
    if(!identity.onboardingComplete)throw new PartnerLostFoundResolutionError("Najprv dokončite registráciu.",403);
    const {resourceId}=await params;
    const body:unknown=await request.json();
    if(!body||typeof body!=="object"||Array.isArray(body))
      throw new PartnerLostFoundResolutionError("Neplatná požiadavka.");
    const values=body as Record<string,unknown>;
    if(Object.keys(values).some(key=>key!=="baseRevision"))
      throw new PartnerLostFoundResolutionError("Nepovolený údaj v požiadavke.");
    const result=await resolvePartnerLostFoundReport({
      accountId:identity.accountId,resourceId,baseRevision:values.baseRevision,
      publicOrigin:new URL(request.url).origin,
      notionBindings:env as unknown as TargetedNotionSaveBindings,
    });
    return Response.json({success:true,result},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const status=error instanceof PartnerLostFoundResolutionError ||
      error instanceof PartnerSecurityError || error instanceof PartnerAuthorizationError ? error.status
      :typeof (error as {status?:unknown})?.status==="number" ? (error as {status:number}).status : 503;
    if(status>=500)console.error("Partner lost-found resolution failed",error);
    return Response.json({error:status>=500?"Hlásenie sa nepodarilo bezpečne uzavrieť.":
      error instanceof Error?error.message:"Požiadavka zlyhala."},
      {status,headers:{"Cache-Control":"private, no-store"}});
  }
}
