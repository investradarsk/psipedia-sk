import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { inspectHelpLegacyCleanup,removeNextReviewedLegacyHelp } from "@/lib/help-legacy-cleanup";
import { HELP_LEGACY_CLEANUP_CONFIRMATION } from "@/lib/help-legacy-cleanup-plan.mjs";
import type { LifecycleBindings } from "@/lib/admin-record-lifecycle";

export const dynamic="force-dynamic";
type Bindings=LifecycleBindings & {DB?:D1Database};
function noCache(payload:unknown,status=200) {
  return Response.json(payload,{status,headers:{"cache-control":"no-store"}});
}
export async function GET() {
  const user=await getAdminApiUser();
  if(!user)return unauthorizedAdminResponse();
  const db=(env as unknown as Bindings).DB;
  if(!db)return noCache({error:"D1 nedostupná"},503);
  try {return noCache(await inspectHelpLegacyCleanup(db))}
  catch {return noCache({error:"Preflight historických záznamov zlyhal."},503)}
}
export async function POST(request:Request) {
  const auth=await requireAdminMutation(request,{strictProvenance:true});
  if(auth.response || !auth.user)return auth.response??unauthorizedAdminResponse();
  if(request.headers.get("origin")!==new URL(request.url).origin ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return noCache({error:"Neplatná požiadavka."},403);
  const payload=await request.json().catch(()=>null) as {confirmation?:unknown}|null;
  if(payload?.confirmation!==HELP_LEGACY_CLEANUP_CONFIRMATION)
    return noCache({error:"Vyžaduje sa presné potvrdenie 140 historických kópií."},400);
  const bindings=env as unknown as Bindings;
  if(!bindings.DB)return noCache({error:"D1 nedostupná"},503);
  try {
    const result=await removeNextReviewedLegacyHelp(bindings.DB,bindings,auth.user.email);
    return noCache(result,result.state==="BLOCKED"?409:200);
  } catch(error) {
    console.error("HELP_LEGACY_LIFECYCLE_CLEANUP_FAILED",error instanceof Error?error.message:"UNKNOWN");
    return noCache({error:"Čistenie sa zastavilo. Obnov kontrolu a oprav blokátor; žiadne ďalšie záznamy sa nespracujú."},409);
  }
}
