import Link from "next/link";
import { env } from "cloudflare:workers";
import { freshnessAgendas, loadFreshnessOverview } from "@/lib/admin-quality-freshness";
import { helpSourceSchemaReady, listHelpSourceChecks } from "@/lib/help-source-daily-check";
import { AdminHelpSourceReview } from "@/components/admin-help-source-review";

function href(agenda:string,page=1){return "/admin/kvalita?aktualnost=1&agenda="+encodeURIComponent(agenda)+(page>1?"&strana="+page:"")+"#aktualnost";}
function format(value:string|null){
 if(!value||!Number.isFinite(Date.parse(value)))return "Neznáme";
 return new Intl.DateTimeFormat("sk-SK",{dateStyle:"medium",timeZone:"Europe/Bratislava"}).format(new Date(value));
}
export async function AdminQualityFreshness({agenda,page}:{agenda:string;page:number}){
 const db=(env as unknown as {DB?:D1Database}).DB;
 const selected=freshnessAgendas.find(item=>item.id===agenda)??freshnessAgendas[0];
 const results=db?await loadFreshnessOverview(db,selected.id,page):null;
 const result=results?.find(item=>item.agenda===selected.id);
 const checks=db?await (async()=>{try{return await helpSourceSchemaReady(db)?await listHelpSourceChecks(db,60):null;}catch{return null;}})():null;
 return <section id="aktualnost" className="admin-panel" style={{padding:16}}>
  <h2>Kontrola aktuálnosti</h2>
  <p>Upozornenia na staré alebo chýbajúce doklady o kontrole. Neznamenajú, že údaj je nesprávny. Zmena dátumu úpravy nie je overenie zdroja. Automatická kontrola nemení stav záznamu.</p>
  <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Agenda</th><th>Po intervale</th><th>Bez dátumu</th><th>Interval</th></tr></thead><tbody>
   {freshnessAgendas.map(item=>{const count=results?.find(r=>r.agenda===item.id)?.counts;return <tr key={item.id}><td><Link href={href(item.id)} prefetch={false} aria-current={item.id===selected.id?"page":undefined}>{item.label}</Link></td><td>{count?count.due:"—"}</td><td>{count?count.unknown:"—"}</td><td>{item.days} dní</td></tr>;})}
  </tbody></table></div>
  <h3>{selected.label} – {selected.basis}</h3>
  {!result?.counts?<p role="status">Evidencia tejto agendy je nedostupná. Nejde o nulový počet.</p>:<>
   <p>Aktívne verejné záznamy: {result.counts.total}. Na kontrolu: {result.counts.due+result.counts.unknown}.</p>
   {result.items.length?<div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Záznam</th><th>Dátum</th><th>Dôvod</th></tr></thead><tbody>
    {result.items.map(item=><tr key={item.id}><td>{item.href?<Link href={item.href} prefetch={false}>{item.name||"#"+item.id}</Link>:item.name||"#"+item.id}</td><td>{format(item.checked_at)}</td><td>{item.reason==="unknown"?"Chýba platný dátum":"Uplynul interval kontroly"}</td></tr>)}
   </tbody></table></div>:<p>V tejto časti zoznamu nie sú záznamy na kontrolu.</p>}
   <p>{result.page>1&&<Link href={href(selected.id,result.page-1)} prefetch={false}>Predchádzajúca</Link>} {" · "} Strana {result.page} {" · "} {result.hasMore&&<Link href={href(selected.id,result.page+1)} prefetch={false}>Ďalšia</Link>}</p>
  </>}
  <p>Otvor záznam a over jeho zdroj. Označenie Odkontrolované mení aj autoritu synchronizácie; nepoužívaj ho iba na zrušenie upozornenia.</p>
  <details id="zdroje" open={selected.id==="adoptions"||selected.id==="lost-found"}><summary>Výsledky automatickej kontroly zdrojov adopcií a pátraní</summary>
   {checks===null?<p role="status">Evidencia kontroly zdrojov je nedostupná.</p>:<AdminHelpSourceReview items={checks}/>}
  </details>
  <p><Link href="/admin/kvalita" prefetch={false}>Skryť kontrolu aktuálnosti</Link></p>
 </section>;
}
