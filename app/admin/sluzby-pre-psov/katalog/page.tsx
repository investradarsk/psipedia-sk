import {env} from "cloudflare:workers";
import Link from "next/link";
import {AdminShell} from "@/components/admin-shell";
import {AdminServiceCatalogWorkspace} from "@/components/admin-service-catalog-workspace";
import {requireAdminPageUser} from "@/lib/admin-auth";
import {listAdminCatalogOptions} from "@/lib/service-catalog-admin-store";
import {catalogEditorItems} from "@/lib/service-catalog-admin-editor-view";
import {directoryCategories} from "@/lib/directory";

export const dynamic="force-dynamic";
export default async function ServiceCatalogAdminPage(){
  const user=await requireAdminPageUser("/admin/sluzby-pre-psov/katalog");
  const cfg=env as unknown as {DB?:D1Database;SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;SERVICE_CATALOG_NOTION_MIRROR_READY?:string};
  const writeEnabled=cfg.SERVICE_CATALOG_ADMIN_WRITES_ENABLED==="true" && cfg.SERVICE_CATALOG_NOTION_MIRROR_READY==="true";
  let records:Awaited<ReturnType<typeof listAdminCatalogOptions>>=[];
  let error:string|null=null;
  if(!cfg.DB)error="Databáza D1 nie je dostupná. Dynamické možnosti neboli načítané.";
  else {
    try{records=await listAdminCatalogOptions(cfg.DB);}
    catch{error="Dynamické možnosti sa nepodarilo načítať. Katalóg je neúplný.";}
  }
  return <AdminShell user={user} eyebrow="Services V3 · Katalóg" title="Katalóg služieb a vlastností"
    description="Globálne možnosti sú oddelené od ich hodnôt na jednotlivých profiloch."
    actions={<Link href="/admin/sluzby-pre-psov">← Služby pre psov</Link>}>
    <AdminServiceCatalogWorkspace items={catalogEditorItems(records)}
      categories={directoryCategories.map(c=>({id:c.slug,label:c.label}))}
      writeEnabled={writeEnabled && !error} loadError={error}/>
  </AdminShell>;
}
