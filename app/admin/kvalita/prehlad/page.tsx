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
  const result=await loadMissingDataOverview(getQualityMissingDatabase(),filters);
  const categories=overviewCategoryOptions(filters.area);
  const categoryLabel=new Map(categories.map(x=>[x.value,x.label]));
  const fieldLabel=new Map<string,string>(overviewFields.map(x=>[x.id,x.label]));
  const from=result.visibleCount?(result.page-1)*50+1:0;
  const to=Math.min(result.visibleCount,result.page*50);
  return <AdminShell user={user} eyebrow="Admin · Kvalita údajov" title="Prehľad chýbajúcich údajov"
    description="Skutočný stav existujúcich profilov v databáze. Filtrovanie a prezeranie bez vyhľadávania Tavily."
    actions={<Link className="admin-secondary-action" href="/admin/kvalita">Späť na schvaľovanie nálezov</Link>}>
    <div className={styles.root}>
      <section className={styles.panel} aria-label="Filtre chýbajúcich údajov">
        <form action="/admin/kvalita/prehlad" method="get" className={styles.form}>
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
        <div><span>{filters.field==="all"?"Zobrazené neúplné profily":"Chýba: "+fieldLabel.get(filters.field)}</span>
          <strong>{result.visibleCount.toLocaleString("sk-SK")}</strong>
        </div>
      </section>

      <section className={styles.panel} aria-label="Typy chýbajúcich údajov">
        <div className={styles.heading}>
          <h2>Čo profilom chýba</h2>
          <p>Počty sú vypočítané zo skutočne nevyplnených polí, nie z výsledkov Tavily.</p>
        </div>
        <div className={styles.chips}>
          <Link className={filters.field==="all"?styles.active:""} href={overviewHref(filters,{field:"all",page:1})}>Všetko <strong>{result.summary.incompleteProfiles}</strong></Link>
          {overviewFields.map(group=><Link key={group.id}
            className={filters.field===group.id?styles.active:""}
            href={overviewHref(filters,{field:group.id as OverviewField,page:1})}>
            {group.label} <strong>{result.summary.byField[group.id]}</strong>
          </Link>)}
        </div>
      </section>

      <section className={styles.panel} aria-label="Zoznam profilov">
        <div className={styles.heading}>
          <h2>Profily s chýbajúcimi údajmi</h2>
          <p>{result.visibleCount.toLocaleString("sk-SK")} profilov · zobrazené {from}–{to}</p>
        </div>
        {result.items.length===0?<p className={styles.empty}>Pre tieto filtre sa nenašli žiadne profily s chýbajúcimi údajmi.</p>:
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead><tr><th>Profil</th><th>Kategória / miesto</th><th>Chýbajúce údaje</th><th>Stav</th><th>Akcia</th></tr></thead>
              <tbody>{result.items.map(item=><tr key={item.kind+"-"+item.id}>
                <td className={styles.name}>{item.name}</td>
                <td>{categoryLabel.get(item.category)??item.category}{item.city?<small>{item.city}</small>:null}</td>
                <td><div className={styles.missing}>
                  {item.missing.map(key=><span key={key}>{fieldLabel.get(key)}</span>)}
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
        <p className={styles.footnote}>Jeden profil sa môže započítať vo viacerých druhoch chýbajúcich údajov. Preto ich jednotlivé počty nemusia dávať spolu počet neúplných profilov. Prehľad nič nemení a nespotrebúva kredity Tavily.</p>
      </section>
    </div>
  </AdminShell>;
}
