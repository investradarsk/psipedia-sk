import {AdminActionButton} from "@/components/admin-interaction-system";
import {AdminShell} from "@/components/admin-shell";
import {AdminFacebookImages} from "@/components/admin-facebook-images";
import {requireAdminPageUser} from "@/lib/admin-auth";
import {listFacebookImagePosts} from "@/lib/facebook-image-store";
import {facebookWallTime} from "@/lib/facebook-image-post";
export const dynamic="force-dynamic";
export default async function FacebookImagesPage(){
  const user=await requireAdminPageUser("/admin/facebook-obrazky");
  const month=facebookWallTime(new Date().toISOString()).date.slice(0,7);
  let data=null,error="";
  try{data=await listFacebookImagePosts(month,"all");}catch(e){error=e instanceof Error?e.message:"Databáza nie je dostupná.";}
  return <AdminShell user={user} eyebrow="Admin · Automatizácie" title="Facebook obrázky" description="Prehľad príspevkov, kalendár a synchronizácia s Notionom a Facebookom.">
    {data?<AdminFacebookImages initial={data} initialMonth={month}/>:<section className="admin-form-card"><p role="alert" className="admin-message admin-message--error">{error}</p><AdminActionButton disabled>Vytvoriť príspevok</AdminActionButton></section>}
  </AdminShell>;
}
