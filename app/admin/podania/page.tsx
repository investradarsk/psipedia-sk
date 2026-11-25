import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin-shell";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { adminDetailHref } from "@/lib/admin-return-navigation";
import { listAdminInbox, normalizeInboxFilters, type InboxFilters, type InboxRow } from "@/lib/admin-submission-inbox";
import { partnerAdminResourceLabel, partnerAdminStatusLabel } from "@/lib/admin-partner-labels";
import styles from "./podania.module.css";

export const dynamic="force-dynamic";
type Search={kind?:string|string[];state?:string|string[];q?:string|string[];page?:string|string[]};
const single=(value:string|string[]|undefined)=>typeof value==="string"?value:"";
const labels={PARTNER:"Partnerské podanie",PUBLIC:"Verejné hlásenie",CLAIM:"Prevzatie profilu",INQUIRY:"Dopyt na službu"} as const;
function statusLabel(item:Pick<InboxRow,"kind"|"status">){
  if(item.kind==="INQUIRY")return ({new:"Nový",read:"Prečítaný",resolved:"Vybavený"} as Record<string,string>)[item.status]??item.status;
  if(item.status==="RETURNED")return "Vrátené Partnerovi";
  return partnerAdminStatusLabel(item.status);
}
function dateLabel(value:string){
  const time=new Date(value);
  return Number.isFinite(time.getTime())
    ?new Intl.DateTimeFormat("sk-SK",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Bratislava"}).format(time)
    :"—";
}

async function InboxContent({filters}:{filters:InboxFilters}){
  const {result,error}=await listAdminInbox(filters).then(
    result=>({result,error:false}),
    e=>{
      console.error("Admin unified intake unavailable",e instanceof Error?e.name:"unknown");
      return {result:null,error:true};
    },
  );
  const urlFor=(page:number)=>{
    const search=new URLSearchParams({kind:filters.kind,state:filters.state});
    if(filters.q)search.set("q",filters.q);
    if(page>1)search.set("page",String(page));
    return "/admin/podania?"+search.toString();
  };
  const returnHref = urlFor(result?.page ?? filters.page);
  return <>
      {error?<div className={styles.error} role="alert">
        Spoločný prehľad momentálne nie je dostupný. Podania možno naďalej vybaviť v pôvodných sekciách nižšie.
      </div>:result&&<>
        <div className={styles.summary} role="status" data-admin-list-results>
          <strong>{result.total}</strong> záznamov vo výbere
          <span>· Na vybavenie: <strong>{result.pending}</strong></span>
          <span>· Strana {result.page}/{result.totalPages}</span>
        </div>
        <div className={styles.tableScroll} role="region" aria-label="Zoznam podaní a dopytov" tabIndex={0}>
          <table className={styles.table}>
            <thead><tr><th>Podanie</th><th>Typ</th><th>Stav</th><th>Prijaté</th><th>Akcie</th></tr></thead>
            <tbody>
              {result.items.map(item=><tr key={item.key}>
                <td>
                  <strong className={styles.title}>{item.title}</strong>
                  <small>{item.kind==="INQUIRY"?"Dopyt":partnerAdminResourceLabel(item.resourceType)} · {item.operation==="UPDATE"?"Úprava":item.operation==="CREATE"?"Nový záznam":item.operation==="CLAIM"?"Žiadosť o správu":"Správa"}</small>
                </td>
                <td>{labels[item.kind]}</td>
                <td><span className={item.pending?styles.pending:styles.closed}>{statusLabel(item)}</span></td>
                <td className={styles.date}>{dateLabel(item.createdAt)}</td>
                <td><div className={styles.actions}>
                  <Link href={item.reviewHref}>{item.pending?"Otvoriť podanie":"Detail"}</Link>
                  {item.editorHref&&item.editorHref!==item.reviewHref?<Link href={item.editorHref}>Profil</Link>:null}
                  {item.partnerHref?<Link href={adminDetailHref(item.partnerHref, returnHref)}>Partner</Link>:null}
                  {item.chatHref?<Link href={adminDetailHref(item.chatHref, returnHref)}>Správy</Link>:null}
                </div></td>
              </tr>)}
              {result.items.length===0&&<tr><td colSpan={5} className={styles.empty}>Pre zadané filtre sa nenašli podania ani dopyty.</td></tr>}
            </tbody>
          </table>
        </div>
        <nav className={styles.pagination} aria-label="Stránkovanie podaní" data-admin-list-pagination>
          {result.page>1?<Link href={urlFor(result.page-1)}>← Predchádzajúca</Link>:<span/>}
          <span>Strana {result.page} z {result.totalPages}</span>
          {result.page<result.totalPages?<Link href={urlFor(result.page+1)}>Ďalšia →</Link>:<span/>}
        </nav>
      </>}
  </>;
}

export default async function Page({searchParams}:{searchParams:Promise<Search>}){
  const user=await requireAdminPageUser("/admin/podania");
  const raw=await searchParams;
  const filters=normalizeInboxFilters({kind:single(raw.kind),state:single(raw.state),q:single(raw.q),page:single(raw.page)});
  return <AdminShell user={user} eyebrow="Prijaté podania" title="Podania a dopyty"
    description="Spoločný pracovný prehľad. Schvaľovanie, súkromné kontakty a história zostávajú v pôvodných sekciách.">
    <section className={styles.workspace} data-admin-submission-inbox>
      <form className={styles.filters} method="get" role="search" aria-label="Filtrovať podania" data-admin-list-filters>
        <label>Hľadať
          <input name="q" maxLength={100} defaultValue={filters.q} placeholder="Profil, podanie alebo ID Partnera"/>
        </label>
        <label>Typ
          <select name="kind" defaultValue={filters.kind}>
            <option value="all">Všetky typy</option>
            <option value="PARTNER">Partnerské podania</option>
            <option value="PUBLIC">Staršie verejné hlásenia</option>
            <option value="CLAIM">Prevzatia profilov</option>
            <option value="INQUIRY">Dopyty na služby</option>
          </select>
        </label>
        <label>Stav
          <select name="state" defaultValue={filters.state}>
            <option value="pending">Na vybavenie</option>
            <option value="history">História / ukončené</option>
            <option value="all">Všetky</option>
          </select>
        </label>
        <button type="submit">Filtrovať</button>
        <Link href="/admin/podania" className={styles.reset}>Vymazať filtre</Link>
      </form>
      <Suspense fallback={<p role="status">Načítavam podania a dopyty…</p>}>
        <InboxContent filters={filters}/>
      </Suspense>
      <div className={styles.origins}>
        <span>Pôvodné pracoviská:</span>
        <Link href="/admin/partners/submissions?status=active">Nové profily</Link>
        <Link href="/admin/partners/events?status=active">Podujatia</Link>
        <Link href="/admin/partners/help-submissions?status=active">Pomoc psom</Link>
        <Link href="/admin/partners/claims?status=PENDING">Prevzatia</Link>
        <Link href="/admin/dopyty">Dopyty</Link>
        <Link href="/admin/stratene-najdene">Stratené a nájdené</Link>
      </div>
    </section>
  </AdminShell>;
}
