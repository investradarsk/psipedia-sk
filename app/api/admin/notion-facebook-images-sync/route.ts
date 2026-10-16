import {env} from "cloudflare:workers";
import {requireAdminMutation} from "@/lib/admin-auth";
import {runNotionFacebookImagesSync,type FacebookImagesSyncBindings} from "@/lib/notion-facebook-images-sync";

export const dynamic="force-dynamic";
type RuntimeBindings=FacebookImagesSyncBindings & {DB?:D1Database};

/** Manual admin-only sweep; respects the same disabled-by-default feature gate as cron. */
export async function POST(request:Request) {
  const auth=await requireAdminMutation(request);
  if(auth.response)return auth.response;
  const bindings=env as unknown as RuntimeBindings;
  if(!bindings.DB)return Response.json({error:"Databáza Psipedia nie je dostupná."},{status:503});
  try {
    const summary=await runNotionFacebookImagesSync({database:bindings.DB,bindings});
    return Response.json({summary},{headers:{"cache-control":"no-store"}});
  }catch {
    // No raw Notion provider errors or signed file URLs in client responses.
    return Response.json({error:"Synchronizácia Facebook obrázkov neprešla. Skontroluj konfiguráciu a logy."},{status:500});
  }
}
