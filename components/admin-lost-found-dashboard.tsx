import Link from "next/link";
import { dogReportStatusLabel, dogReportTypeShortLabel, type AdminDogReport } from "@/lib/lost-found-dogs";
import type { LostFoundStatus } from "@/lib/lost-found-lifecycle.js";
import styles from "./admin-lost-found.module.css";

type Counts = { total: number } & Record<LostFoundStatus, number>;
type Result = { items: AdminDogReport[]; total: number; page: number; pageSize: number; pages: number };
type Filters = { q: string; type: string; status: string; region: string; locality: string };
const tabs: Array<{ key: string; label: string; count: (counts: Counts) => number }> = [
  { key: "", label: "Všetky", count: (c) => c.total }, { key: "PENDING", label: "Čakajúce", count: (c) => c.PENDING },
  { key: "ACTIVE", label: "Aktívne", count: (c) => c.ACTIVE }, { key: "RESOLVED", label: "Vyriešené", count: (c) => c.RESOLVED },
  { key: "EXPIRED", label: "Expirované", count: (c) => c.EXPIRED }, { key: "REJECTED", label: "Zamietnuté", count: (c) => c.REJECTED },
  { key: "DRAFT", label: "Koncepty", count: (c) => c.DRAFT }, { key: "ARCHIVED", label: "Archív", count: (c) => c.ARCHIVED },
];
function href(filters: Filters, page = 1, status = filters.status) { const p = new URLSearchParams(); for (const [k,v] of Object.entries({ q:filters.q,type:filters.type,status,region:filters.region,locality:filters.locality })) if(v) p.set(k,v); if(page>1)p.set("page",String(page)); return `/admin/stratene-najdene${p.toString()?`?${p}`:""}`; }
export function AdminLostFoundDashboard({ result, counts, filters }: { result: Result; counts: Counts; filters: Filters }) {
  return <>
    <nav className={styles.tabs} aria-label="Stavy hlásení">{tabs.map((tab)=><Link key={tab.key||"all"} data-active={filters.status===tab.key} href={href(filters,1,tab.key)}>{tab.label} <strong>{tab.count(counts)}</strong></Link>)}</nav>
    <form className={styles.filters} method="get"><input name="q" defaultValue={filters.q} aria-label="Fulltext" placeholder="Meno, obec, farba, popis…"/><select name="type" defaultValue={filters.type} aria-label="Typ"><option value="">LOST + FOUND</option><option value="LOST">Stratené</option><option value="FOUND">Nájdené</option></select><input name="region" defaultValue={filters.region} aria-label="Kraj" placeholder="Kraj"/><input name="locality" defaultValue={filters.locality} aria-label="Okres alebo lokalita" placeholder="Okres / lokalita"/>{filters.status&&<input type="hidden" name="status" value={filters.status}/>}<button type="submit">Filtrovať</button></form>
    <div className={styles.tableWrap} role="region" aria-label="Zoznam hlásení" tabIndex={0}><table className={styles.table}><thead><tr><th scope="col">Hlásenie</th><th scope="col">Typ</th><th scope="col">Stav</th><th scope="col">Lokalita</th><th scope="col">Dátum</th><th scope="col">Aktualizované</th><th scope="col">Akcie</th></tr></thead><tbody>{result.items.map((report)=><tr key={report.id}><td><div className={styles.rowTitle}><strong>{report.dogName||report.breed||`Hlásenie #${report.id}`}</strong><small>#{report.id} · /{report.slug}</small>{report.duplicateOfId&&<small>Duplicita hlásenia #{report.duplicateOfId}</small>}</div></td><td><span className={styles.type}>{dogReportTypeShortLabel(report.type)}</span></td><td className={styles.status}>{dogReportStatusLabel[report.status]}</td><td>{report.city}{report.district?` · ${report.district}`:""}</td><td>{report.eventDate||"—"}</td><td>{new Date(report.updatedAt).toLocaleDateString("sk-SK")}</td><td><Link className={styles.edit} href={`/admin/stratene-najdene/${report.id}`}>Upraviť →</Link></td></tr>)}{!result.items.length&&<tr><td colSpan={7}>Žiadne hlásenia pre zvolené filtre.</td></tr>}</tbody></table></div>
    {result.pages>1&&<nav className={styles.pagination} aria-label="Stránkovanie">{result.page>1&&<Link href={href(filters,result.page-1)}>←</Link>}{Array.from({length:Math.min(result.pages,7)},(_,i)=>{const start=Math.max(1,Math.min(result.page-3,result.pages-6));const p=start+i;if(p>result.pages)return null;return p===result.page?<span key={p}>{p}</span>:<Link key={p} href={href(filters,p)}>{p}</Link>})}{result.page<result.pages&&<Link href={href(filters,result.page+1)}>→</Link>}</nav>}
  </>;
}
