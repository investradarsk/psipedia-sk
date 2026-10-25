"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MissingQualityDashboard, MissingQualityProposal, QualityArea } from "@/lib/data-quality-missing-hourly";
import styles from "./admin-missing-quality-dashboard.module.css";

const AREAS: Array<{id:QualityArea;label:string;symbol:string}> = [
  {id:"services",label:"Služby pre psov",symbol:"🐾"},
  {id:"events",label:"Podujatia",symbol:"📅"},
  {id:"help",label:"Pomoc psom",symbol:"❤️"},
];
const GROUPS = [
  {id:"address",label:"Adresy a miesta"},
  {id:"image",label:"Obrázky"},
  {id:"web",label:"Weby a odkazy"},
  {id:"phone",label:"Telefóny"},
  {id:"email",label:"E-maily"},
  {id:"social",label:"Sociálne siete"},
  {id:"registration",label:"Registrácie"},
  {id:"date",label:"Dátumy a časy"},
  {id:"other",label:"Ostatné"},
];
function plural(n:number) { return n===1?"nález":n>1&&n<5?"nálezy":"nálezov"; }
const ERROR_LABELS: Record<string, string> = {
  AUTH_FAILED: "Neplatné oprávnenie Tavily",
  RATE_LIMITED: "Limit Tavily (požiadavky alebo kredity)",
  TIMEOUT: "Vypršal časový limit",
  PROVIDER_ERROR: "Chyba externej služby",
  INVALID_RESPONSE: "Neplatná odpoveď",
  CONFIG_MISSING: "Chýbajúca konfigurácia",
  INTERNAL_ERROR: "Chyba pri spracovaní",
};

export function AdminMissingQualityDashboard({data}:{data:MissingQualityDashboard}) {
  const router=useRouter();
  const [removedIds,setRemovedIds]=useState<number[]>([]);
  const removed=new Set(removedIds);
  const items=data.pending.filter(p=>!removed.has(p.id));
  const [area,setArea]=useState<QualityArea>(()=>AREAS.find(a=>data.pending.some(x=>x.area===a.id))?.id??"services");
  const [group,setGroup]=useState("all");
  const [busy,setBusy]=useState<number|null>(null);
  const [bulkBusy,setBulkBusy]=useState(false);
  const [notice,setNotice]=useState("");

  const total=Math.max(0,data.total-data.pending.filter(p=>removed.has(p.id)).length);
  const countArea=(id:QualityArea)=>items.filter(x=>x.area===id).length;
  const areaItems=items.filter(x=>x.area===area);
  const countGroup=(g:string)=>areaItems.filter(x=>g==="all"||x.field_group===g).length;
  const shown=areaItems.filter(x=>group==="all"||x.field_group===group);
  async function decide(item:MissingQualityProposal,action:"accept"|"reject") {
    if(busy!==null||bulkBusy)return;
    setBusy(item.id);setNotice("");
    try{
      const response=await fetch(`/api/admin/data-quality/missing/${item.id}`,{
        method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action}),
      });
      const body=await response.json() as {error?:string};
      if(!response.ok)throw new Error(body.error??"Údaj sa nepodarilo spracovať.");
      setRemovedIds(prev=>[...prev,item.id]);
      setNotice(action==="accept"?"Údaj bol doplnený do profilu.":"Návrh bol zamietnutý.");
      router.refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Návrh sa nepodarilo spracovať.");}
    finally{setBusy(null)}
  }
  async function rejectVisible() {
    if(!shown.length||busy!==null||bulkBusy)return;
    if(!window.confirm(`Zamietnuť všetkých ${shown.length} zobrazených návrhov?\nNávrhy sa odstránia zo zoznamu.`))return;
    setBulkBusy(true);setNotice("");
    try{
      const ids=shown.map(x=>x.id);
      const rejected:number[]=[];
      let failed=0;
      for(let from=0;from<ids.length;from+=200){
        const response=await fetch("/api/admin/data-quality/missing/bulk",{
          method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ids:ids.slice(from,from+200)}),
        });
        const body=await response.json() as {dismissed?:number[];failures?:number[];error?:string};
        if(!response.ok)throw new Error(body.error??"Zamietnutie sa nepodarilo.");
        rejected.push(...(body.dismissed??[]));
        failed+=(body.failures??[]).length;
      }
      setRemovedIds(prev=>[...prev,...rejected]);
      setNotice(failed?`Zamietnuté: ${rejected.length}. Nepodarilo sa: ${failed}.`:`Zamietnutých ${rejected.length} návrhov.`);
      router.refresh();
    }catch(error){setNotice(error instanceof Error?error.message:"Zamietnutie zlyhalo.");}
    finally{setBulkBusy(false)}
  }
  if(!data.schemaReady)return (
    <div className={styles.state} role="status">
      Kvalita údajov čaká na databázovú migráciu 0142. Vyhľadávanie je do jej vykonania bezpečne pozastavené.
    </div>
  );
  return <div className={styles.root}>
    <section className={styles.top}>
      <div>
        <span className={styles.eyebrow}>Nájdené nové údaje na schválenie</span>
        <div className={styles.total} aria-live="polite">{Math.max(0,total)}</div>
        <p className={styles.subtle}>Po schválení alebo zamietnutí sa počet automaticky zníži.</p>
      </div>
      <div className={styles.month}>
        <h2>Tento mesiac – pokusy o kontrolu</h2>
        <div className={styles.monthGrid}>
          {AREAS.map(a=>{
            const stats=data.outcomes[a.id];
            const recent=data.last[a.id];
            return <div key={a.id}>
              <strong>{stats.total}</strong>
              <small>{a.label}</small>
              <span className={styles.outcome}>Úspešné: {stats.successful} · Zlyhané: {stats.failed}</span>
              {stats.unknown>0?<span className={styles.outcome}>Staršie/neznáme: {stats.unknown}</span>:null}
              {stats.running>0?<span className={styles.outcome}>Rozpracované: {stats.running}</span>:null}
              {recent?.status==="FAILED"?<span className={styles.lastError}>
                Posledná chyba: {ERROR_LABELS[recent.errorCode??""]??"Neznáma chyba"}
              </span>:null}
            </div>;
          })}
        </div>
      </div>
    </section>
    <section aria-label="Oblasti" className={styles.areas}>
      {AREAS.map(a=>{
        const n=countArea(a.id);
        return <button key={a.id} type="button" onClick={()=>{setArea(a.id);setGroup("all");setNotice("");}}
          className={`${styles.area} ${area===a.id?styles.selected:""} ${n>0?styles.hasFindings:""}`}
          aria-pressed={area===a.id}>
          <span className={styles.areaSymbol} aria-hidden="true">{a.symbol}</span>
          <span>{a.label}</span>
          <strong aria-label={`${n} nálezov`}>{n}</strong>
        </button>;
      })}
    </section>
    <section className={styles.results}>
      <div className={styles.heading}>
        <h2>{AREAS.find(a=>a.id===area)?.label}</h2>
        <span>{areaItems.length} {plural(areaItems.length)} na schválenie</span>
      </div>
      <div className={styles.filters} aria-label="Typy údajov">
        <button type="button" className={group==="all"?styles.current:""} onClick={()=>setGroup("all")}
          aria-pressed={group==="all"}>Všetko <b>{areaItems.length}</b></button>
        {GROUPS.map(g=>{
          const n=countGroup(g.id);
          return <button key={g.id} type="button" className={`${group===g.id?styles.current:""} ${n>0?styles.hasFindings:""}`}
            onClick={()=>setGroup(g.id)} aria-pressed={group===g.id}>
            {g.label} <b>{n}</b>
          </button>;
        })}
      </div>
      {notice?<div role="status" className={styles.notice}>{notice}</div>:null}
      {data.truncated?<p className={styles.subtle}>Zobrazuje sa prvých 1 000 návrhov. Po ich spracovaní sa načítajú ďalšie.</p>:null}
      {shown.length===0?<div className={styles.empty}>V tejto kategórii zatiaľ nie sú žiadne nájdené údaje na schválenie.</div>:(
        <>
          <div className={styles.list}>
            {shown.map(p=><article className={styles.item} key={p.id}>
              <div className={styles.itemContent}>
                <div className={styles.profile}>{p.profile_label}</div>
                <div className={styles.field}>{p.field_label}</div>
                {p.field_group==="image"?
                  <a href={p.value} target="_blank" rel="noopener noreferrer">
                    {/* Remote candidate preview, stored only after the administrator explicitly approves. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className={styles.preview} alt={`Navrhnutý obrázok pre ${p.profile_label}`} src={p.value} loading="lazy"/>
                  </a>:
                  ["web","social","registration"].includes(p.field_group)?
                    <a href={p.value} target="_blank" rel="noopener noreferrer" className={styles.value}>{p.value} ↗</a>:
                    <div className={styles.value}>{p.value}</div>
                }
                {p.source_url&&p.source_url!==p.value?<a className={styles.source} href={p.source_url} rel="noopener noreferrer" target="_blank">Otvoriť zdroj ↗</a>:null}
              </div>
              <div className={styles.actions}>
                <button type="button" className={styles.reject} disabled={busy!==null||bulkBusy} onClick={()=>void decide(p,"reject")}>Zamietnuť</button>
                <button type="button" className={styles.accept} disabled={busy!==null||bulkBusy} onClick={()=>void decide(p,"accept")}>{busy===p.id?"Ukladám…":"Schváliť"}</button>
              </div>
            </article>)}
          </div>
          <div className={styles.footer}>
            <button type="button" className={styles.rejectAll} onClick={()=>void rejectVisible()} disabled={bulkBusy||busy!==null}>
              {bulkBusy?"Zamietam…":`Zamietnuť všetky zobrazené (${shown.length})`}
            </button>
          </div>
        </>
      )}
    </section>
  </div>;
}
