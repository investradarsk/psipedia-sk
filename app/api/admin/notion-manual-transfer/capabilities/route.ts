import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { NOTION_AUTHORITY_GROUPS } from "@/lib/notion-field-authority";
import { manualTransferCatalog } from "@/lib/notion-manual-transfer-contract";
import { manualTransferSchemaReady } from "@/lib/notion-manual-transfer-queue";

export const dynamic="force-dynamic";

/** Only configuration and non-sensitive field labels, no provider content. */
export async function GET(){
  if(!(await getAdminApiUser()))return unauthorizedAdminResponse();
  const bindings=env as unknown as {DB?:D1Database;NOTION_MANUAL_TRANSFER_ENABLED?:string};
  const migrated=bindings.DB?await manualTransferSchemaReady(bindings.DB).catch(()=>false):false;
  const active=bindings.NOTION_MANUAL_TRANSFER_ENABLED==="true"&&migrated;
  const areas=manualTransferCatalog(NOTION_AUTHORITY_GROUPS).map(area=>({
    ...area,executable:active,
    scopes:area.scopes.map(scope=>({
      ...scope,fields:NOTION_AUTHORITY_GROUPS.find(g=>g.scope===scope.id)?.fields.map(f=>({
        id:f.id,label:f.label,locked:!!f.locked,
      }))??[],
    })),
  }));
  return Response.json({
    version:3,stage:active?"AVAILABLE":"NOT_ACTIVATED",executable:active,
    migrationReady:migrated,areas,
    excluded:["articles","facebook-images","service-catalog"],
    note:active?"Najprv prebehne kontrola rozdielov. Prenos sa spustí až po potvrdení.":
      "Funkcia ešte nie je aktivovaná. Najprv sa musí schváliť databázová migrácia a produkčný prepínač.",
  },{headers:{"Cache-Control":"no-store"}});
}
