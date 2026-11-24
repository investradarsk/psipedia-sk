import { qualityWorkspace } from "@/lib/admin-quality-workspace";
import { AdminQualityWorkspaceTabs } from "@/components/admin-quality-workspace-tabs";
import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { getQualityMissingDatabase } from "@/lib/data-quality-missing-hourly";
import {
  parseOverviewFilters,loadMissingDataOverview,overviewCategoryOptions,overviewFields,
  overviewAreas,overviewHref,type OverviewField,
} from "@/lib/admin-quality-missing-overview";
import styles from "@/components/admin-quality-missing-overview.module.css";

export const dynamic="force-dynamic";
export const metadata={robots:{index:false,follow:false}};

type SearchParams=Record<string,string|string[]|undefined>;
export default async function AdminMissingOverviewPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const user=await requireAdminPageUser("/admin/kvalita/prehlad");
  const filters=parseOverviewFilters(await searchParams);
  const checkedAt = new Date();
  const result=await (async () => {
    try { return await loadMissingDataOverview(getQualityMissingDatabase(),filters); }
    catch (error) { console.error("Missing quality overview unavailable", error); return null; }
  })();
  if (!result) return <AdminShell user={user} {...qualityWorkspace("missing")}>
    <AdminQualityWorkspaceTabs active="missing" />
    <p role="alert" className="admin-panel">Údaje z databázy sú nedostupné. Počty nie sú vyhodnotené. <Link prefetch={false} href={overviewHref(filters)}>Zopakovať načítanie</Link></p>
  </AdminShell>;
  const categories=overviewCategoryOptions(filters.area);
  const categoryLabel=new Map(categories.map(x=>[x.value,x.label]));
  const fieldLabel=new Map<string,string>(overviewFields.map(x=>[x.id,x.label]));
  const exceptions = Boolean(filters.exceptions);
  const fieldCounts = exceptions ? result.summary.exceptionByField : result.summary.byField;
  const from=result.visibleCount?(result.page-1)*50+1:0;
  const to=Math.min(result.visibleCount,result.page*50);
  return <AdminShell user={user} {...qualityWorkspace("missing")}>
    <AdminQualityWorkspaceTabs active="missing" />
    <div className={styles.root}>
      <p className={styles.footnote}>Zdroj: kanonické údaje D1 · načítané {checkedAt.toLocaleString("sk-SK", {timeZone:"Europe/Bratislava"})}. Nejde o externé overenie.</p>
      <section className={styles.panel} aria-label="Filtre chýbajúcich údajov">
        <form action="/admin/kvalita/prehlad" method="get" className={styles.form} role="search" data-admin-list-filters>
          {exceptions && <input type="hidden" name="view" value="exceptions" />}
          <label>Oblasť
            <select name="area" defaultValue={filters.area}>
              {overviewAreas.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label>Kategória
            <select name="category" defaultValue={filters.category}>
              <option value="">Všetky kategórie</option>
              {categories.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </label>
          <label>Čo chýba
            <select name="field" defaultValue={filters.field}>
              <option value="all">Akýkoľvek chýbajúci údaj</option>
              {overviewFields.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
          </label>
          <label>Stav profilu
            <select name="state" defaultValue={filters.state}>
              <option value="current">Aktuálne a otvorené</option>
              <option value="all">Všetky vrátane ukončených</option>
            </select>
          </label>
          <label>Názov profilu
            <input name="q" type="search" maxLength={100} defaultValue={filters.q} placeholder="Napr. veterinárna ambulancia" />
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.primary}>Filtrovať</button>
            <Link href="/admin/kvalita/prehlad">Vymazať filtre</Link>
          </div>
        </form>
      </section>

      <section className={styles.totals} aria-label="Počty profilov">
        <div><span>Profily vo výbere</span><strong>{result.summary.totalProfiles.toLocaleString("sk-SK")}</strong></div>
        <div><span>Profily s chýbajúcimi údajmi</span><strong>{result.summary.incompleteProfiles.toLocaleString("sk-SK")}</strong></div>
        <div><span>{exceptions?"Záznamy s výnimkou":filters.field==="all"?"Zobrazené neúplné profily":"Chýba: "+fieldLabel.get(filters.field)}</span>
          <strong>{result.visibleCount.toLocaleString("sk-SK")}</strong>
        </div>
      </section>

      <section className={styles.panel} aria-label="Typy chýbajúcich údajov">
        <div className={styles.heading}>
          <h2>{exceptions?"Evidované výnimky":"Čo profilom chýba"}</h2>
          <p>Platné výnimky Adresára sa nezapočítavajú medzi chýbajúce údaje. Zamietnutie návrhu nie je výnimka.</p>
        </div>
        {filters.area==="services" && <div className={styles.chips} aria-label="Stav údajov">
          <Link className={!exceptions?styles.active:""} href={overviewHref(filters,{exceptions:false,page:1})}>Chýbajúce údaje <strong>{result.summary.incompleteProfiles}</strong></Link>
          <Link className={exceptions?styles.active:""} href={overviewHref(filters,{exceptions:true,page:1})}>Evidované výnimky <strong>{result.summary.exceptionProfiles}</strong></Link>
        </div>}
        <div className={styles.chips}>
          <Link className={filters.field==="all"?styles.active:""} href={overviewHref(filters,{field:"all",page:1})}>Všetko <strong>{exceptions?result.summary.exceptionProfiles:result.summary.incompleteProfiles}</strong></Link>
          {overviewFields.map(group=><Link key={group.id}
            className={filters.field===group.id?styles.active:""}
            href={overviewHref(filters,{field:group.id as OverviewField,page:1})}>
            {group.label} <strong>{fieldCounts[group.id]}</strong>
          </Link>)}
        </div>
      </section>

      <section className={styles.panel} aria-label="Zoznam profilov">
        <div className={styles.heading}>
          <h2>{exceptions?"Profily s evidovanými výnimkami":"Profily s chýbajúcimi údajmi"}</h2>
          <p>{result.visibleCount.toLocaleString("sk-SK")} profilov · zobrazené {from}–{to}</p>
        </div>
        {result.items.length===0?<p className={styles.empty}>Pre zvolené filtre nie sú žiadne výsledky.</p>:
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>Profil</th><th>Kategória / miesto</th><th>{exceptions?"Evidované výnimky":"Chýbajúce údaje"}</th><th>Stav</th><th>Akcia</th></tr></thead>
              <tbody>{result.items.map(item=><tr key={item.kind+"-"+item.id}>
                <td className={styles.name}>{item.name}</td>
                <td>{categoryLabel.get(item.category)??item.category}{item.city?<small>{item.city}</small>:null}</td>
                <td><div className={styles.missing}>
                  {(exceptions?item.exceptions:item.missing).map(key=><span key={key}>{fieldLabel.get(key)}</span>)}
                </div></td>
                <td>{item.status}</td>
                <td><a href={item.editorHref} target="_blank" rel="noopener noreferrer" className={styles.editor}>Otvoriť profil ↗</a></td>
              </tr>)}</tbody>
            </table>
          </div>}
        {result.pages>1?<nav className={styles.pagination} aria-label="Stránkovanie profilu">
          {result.page>1?<Link href={overviewHref(filters,{page:result.page-1})}>← Predchádzajúca</Link>:<span />}
          <span>Strana {result.page} z {result.pages}</span>
          {result.page<result.pages?<Link href={overviewHref(filters,{page:result.page+1})}>Nasledujúca →</Link>:<span />}
        </nav>:null}
        <p className={styles.footnote}>Jeden profil sa môže započítať vo viacerých druhoch chýbajúcich údajov. Preto ich jednotlivé počty nemusia dávať spolu počet neúplných profilov. Prehľad nič nemení a nespotrebúva kredity Tavily. Výnimka znamená platný evidovaný výsledok kontroly (aj „nenájdené“), nie vyplnený údaj. Pri iných agendách sa výnimky v tomto prehľade nevyhodnocujú.</p>
      </section>
    </div>
  </AdminShell>;
}
