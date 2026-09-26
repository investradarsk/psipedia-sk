import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import { listAutomationPossibleMatchReviews } from "@/lib/data-automation-match-review";
export const dynamic="force-dynamic";
type SearchParams=Record<string,string|string[]|undefined>;
const first=(v:string|string[]|undefined)=>Array.isArray(v)?v[0]??"":v??"";
export default async function PossibleMatchesPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const user=await requireAdminPageUser("/admin/operations/possible-matches");
  const raw=await searchParams; const status=first(raw.status); const entity=first(raw.entity); const source=first(raw.source); const age=first(raw.age); const authority=first(raw.authority);
  const statusFilter=(["unresolved","deferred","resolved","all"] as const).includes(status as any)?status as "unresolved"|"deferred"|"resolved"|"all":"unresolved";
  const entityType=entity==="DIRECTORY"||entity==="ORGANIZATION"?entity:undefined;
  const sourceId=/^\d+$/.test(source)?Number(source):undefined; const maxAgeDays=/^\d+$/.test(age)?Number(age):undefined; const minAuthority=/^\d+$/.test(authority)?Number(authority):undefined;
  const items=await listAutomationPossibleMatchReviews({status:statusFilter,entityType,sourceId,maxAgeDays,minAuthority,limit:200});
  return <AdminShell user={user} eyebrow="Operácie" title="POSSIBLE identity matches"
    description="Ľudské rozhodnutia pre neisté DIRECTORY a ORGANIZATION identity matches. Canonical dáta sa tu nemenia."
    actions={<Link href="/admin/operations">← Operácie</Link>}>
    <section className={styles.section}>
      <form method="get" className="admin-form-actions">
        <label>Status <select name="status" defaultValue={statusFilter}><option value="unresolved">Nevyriešené</option><option value="deferred">Odložené</option><option value="resolved">Vyriešené</option><option value="all">Všetky</option></select></label>
        <label>Entita <select name="entity" defaultValue={entityType??""}><option value="">DIRECTORY + ORGANIZATION</option><option value="DIRECTORY">DIRECTORY</option><option value="ORGANIZATION">ORGANIZATION</option></select></label>
        <label>Source ID <input name="source" inputMode="numeric" defaultValue={source}/></label>
        <label>Vek max. dní <input name="age" inputMode="numeric" defaultValue={age}/></label>
        <label>Authority min. <input name="authority" inputMode="numeric" defaultValue={authority}/></label>
        <button type="submit">Filtrovať</button>
      </form>
      <p><small>Match quality je v tomto queue vždy POSSIBLE; authority filter slúži na priorizáciu podľa sily zdroja.</small></p>
      <div className={styles.quickActions}>
        <Link href="/admin/operations/possible-matches?status=unresolved">Nevyriešené</Link>
        <Link href="/admin/operations/possible-matches?status=deferred">Odložené</Link>
        <Link href="/admin/operations/possible-matches?status=resolved">Vyriešené</Link>
        <Link href="/admin/operations/possible-matches?status=all">Všetky</Link>
      </div>
      <div className={styles.itemList}>
        {items.map(item=><div className={styles.itemCard} key={item.observationId+":"+item.candidateClusterId}>
          <div className={styles.itemMain}>
            <div className={styles.itemTitle}><strong>{item.entityType} · {item.sourceSemanticKind} ↔ {item.targetSemanticKind}</strong><span className={styles.badge}>{item.status}</span></div>
            <p>{item.matchReason}</p><p>{item.sourceLabel} · authority {item.sourceAuthority} · observation #{item.observationId} → cluster #{item.candidateClusterId}</p>
          </div>
          <Link className={styles.itemAction} href={`/admin/operations/possible-matches/${item.observationId}/${item.candidateClusterId}`}>Skontrolovať</Link>
        </div>)}
        {!items.length&&<div className={styles.empty}>Žiadne POSSIBLE matches pre tento filter.</div>}
      </div>
    </section>
  </AdminShell>;
}
