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
  const cfg=env as unknown as {
    DB?:D1Database;
    NOTION_API_TOKEN?:string;
    SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;
    SERVICE_CATALOG_NOTION_MIRROR_READY?:string;
    SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED?:string;
    SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED?:string;
  };
  const writeEnabled=cfg.SERVICE_CATALOG_ADMIN_WRITES_ENABLED==="true";
  // UI capability hints only. The Admin mutation route rechecks all gates,
  // origin/auth, real D1/Notion ownership and one-option confirmation.
  const mirrorEnabled=writeEnabled && cfg.SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED==="true"
    && Boolean(cfg.NOTION_API_TOKEN?.trim());
  const pageCreationEnabled=mirrorEnabled && cfg.SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED==="true";
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
      writeEnabled={writeEnabled && !error} mirrorEnabled={mirrorEnabled && !error}
      pageCreationEnabled={pageCreationEnabled && !error} loadError={error}/>
  </AdminShell>;
}
