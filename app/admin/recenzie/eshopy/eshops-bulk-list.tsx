"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminEshopListInline } from "@/components/admin-eshop-list-inline";
import { AdminBulkStatusActions } from "@/components/admin-bulk-status-actions";
import { AdminRecordBulkDelete } from "@/components/admin-record-bulk-delete";
import { AdminBulkActionToolbar } from "@/components/admin-interaction-system";
import { BulkSelectionCheckbox } from "@/components/admin-bulk-selection";
import { useAdminProfilePageSelection } from "@/components/admin-profile-page-selection";
import { ESHOP_RATING_FIELDS } from "@/lib/eshop-rating-domain";
import type { ManagedEshop } from "@/lib/eshop-ratings";
import styles from "./eshops-admin.module.css";
function format(value:number){return new Intl.NumberFormat("sk-SK",{minimumFractionDigits:1,maximumFractionDigits:1}).format(value);}
export function AdminEshopBulkList({shops,enabled}:{shops:ManagedEshop[];enabled:boolean}){
 const router=useRouter();
 const [selected,setSelected]=useAdminProfilePageSelection(JSON.stringify(shops.map(shop=>shop.id)),shops.map(shop=>shop.id));
 const items=shops.filter(shop=>selected.has(shop.id)).map(({id,status,updatedAt})=>({id,status,updatedAt}));
 const finish=(ids:number[])=>{setSelected(current=>new Set([...current].filter(id=>!ids.includes(id))));router.refresh();};
 return <>
 {enabled&&shops.length>0&&<BulkSelectionCheckbox checked={selected.size===shops.length} indeterminate={selected.size>0&&selected.size<shops.length} label="Označiť zobrazené e-shopy" onChange={checked=>setSelected(new Set(checked?shops.map(shop=>shop.id):[]))}/>}
 {enabled&&selected.size>0&&<AdminBulkActionToolbar selectedCount={selected.size} onClear={()=>setSelected(new Set())}
 primaryAction={<AdminBulkStatusActions agenda="eshops" items={items} onFinished={finish}/>}
 destructiveAction={<AdminRecordBulkDelete kind="eshops" selectedIds={[...selected]} onFinished={finish}/>}/>}
      <div className={styles.list}>
        {shops.map((shop) => (
          <article className={styles.card} key={shop.id}>
            <div className={styles.logo}>{shop.logoUrl ? <img src={shop.logoUrl} alt="" /> : <span>LOGO</span>}</div>
            <div className={styles.main}>
              <div className={styles.topline}>
                <span data-status={shop.status}>{shop.status === "published" ? "Publikovaný" : shop.status === "archived" ? "Archivovaný" : "Koncept"}</span>
                <small>ID {shop.id}</small>
                {enabled&&<BulkSelectionCheckbox checked={selected.has(shop.id)} label={"Označiť #"+shop.id} onChange={checked=>setSelected(current=>{const next=new Set(current);if(checked)next.add(shop.id);else next.delete(shop.id);return next;})}/>}
                
              </div>
              <AdminEshopListInline shop={shop} />
              <p>{shop.description}</p>
              {shop.focusTags.length ? <div className={styles.tags}>{shop.focusTags.map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
              <div className={styles.links}>
                <a href={shop.websiteUrl} target="_blank" rel="noreferrer">Web e-shopu ↗</a>
                <a href={shop.sourceUrl} target="_blank" rel="noreferrer">Zdroj profilu ↗</a>
                {shop.status === "published" ? <Link href={`/recenzie/eshopy/${shop.slug}`} target="_blank">Profil Psipedia ↗</Link> : null}
                <Link className={styles.editLink} href={`/admin/recenzie/eshopy/${shop.id}`}>Upraviť profil</Link>
              </div>
            </div>
            <div className={styles.rating}>
              {shop.averages ? (
                <>
                  <strong>{format(shop.averages.overall)} ★</strong>
                  <span>{shop.ratingCount} hodnotení</span>
                  <dl>
                    {ESHOP_RATING_FIELDS.slice(0,4).map((field) => <div key={field.key}><dt>{field.label}</dt><dd>{format(shop.averages?.[field.key] ?? 0)}</dd></div>)}
                  </dl>
                </>
              ) : (
                <><strong>—</strong><span>Zatiaľ bez hodnotení</span></>
              )}
            </div>
          </article>
        ))}
        {!shops.length ? <div className={styles.empty}>E-shopy sa momentálne nepodarilo načítať.</div> : null}
      </div>
 </>;
}
