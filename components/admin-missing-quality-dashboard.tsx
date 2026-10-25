"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminActionButton, AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import type { MissingQualityDashboard, MissingQualityProposal, QualityArea, ManualQualityResponse, ManualQualityCursor, ManualQualityGroup } from "@/lib/data-quality-missing-hourly";
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
  RATE_LIMITED: "Priveľa požiadaviek Tavily",
  CREDITS_EXHAUSTED: "Vyčerpané kredity alebo limit Tavily",
  INVALID_REQUEST: "Nesprávne parametre vyhľadávania",
  TIMEOUT: "Vypršal časový limit",
  PROVIDER_ERROR: "Chyba externej služby",
  NETWORK_ERROR: "Chyba spojenia medzi Cloudflare a Tavily",
  INVALID_RESPONSE: "Neplatná odpoveď",
  CONFIG_MISSING: "Chýbajúca konfigurácia",
  INTERNAL_ERROR: "Chyba pri spracovaní",
};

function qualityErrorLabel(code: string | null): string {
  if (code && /^HTTP_5\d{2}$/.test(code)) return `Tavily HTTP ${code.slice(5)} – chyba servera`;
  return ERROR_LABELS[code ?? ""] ?? "Neznáma chyba";
}


function adminProfileHref(p:Pick<MissingQualityProposal,"entity_type"|"entity_id">):string {
  // Each target is an existing authenticated canonical editor, not a public profile.
  const routes:Record<MissingQualityProposal["entity_type"],string>={
    DIRECTORY:"adresar",EVENT:"podujatia",ORGANIZATION:"organizacie",
    ADOPTION:"adopcie",FOSTER:"pomoc",HELP_ITEM:"pomoc",LOST_FOUND:"stratene-najdene",
  };
  return "/admin/"+routes[p.entity_type]+"/"+p.entity_id;
}

function QualityCandidateImage({url,label,onPreview}:{url:string;label:string;onPreview:(url:string)=>void}) {
  const [broken,setBroken]=useState(false);
  if(broken) return <div className={styles.brokenImage}>Obrázok sa nedá načítať.
    <a href={url} target="_blank" rel="noopener noreferrer">Skontrolovať odkaz ↗</a>
  </div>;
  return <button type="button" className={styles.imageButton}
    onClick={()=>onPreview(url)} aria-label={"Zväčšiť obrázok pre "+label}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} className={styles.preview} alt={"Navrhnutý obrázok pre "+label}
      loading="lazy" onError={()=>setBroken(true)} />
  </button>;
}

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
  const [noticeError,setNoticeError]=useState(false);
  const [pendingRejectIds,setPendingRejectIds]=useState<number[]|null>(null);
  const [manualMode,setManualMode]=useState<"profiles"|"free">("profiles");
  const [manualGroup,setManualGroup]=useState<ManualQualityGroup>("image");
  const [manualQuery,setManualQuery]=useState("");
  const [manualLimit,setManualLimit]=useState(5);
  const [manualBusy,setManualBusy]=useState(false);
  const [manualProgress,setManualProgress]=useState("");
  const [manualResults,setManualResults]=useState<ManualQualityResponse|null>(null);
  const [profileFilter,setProfileFilter]=useState("");
  const [preview,setPreview]=useState<string|null>(null);
  const stopManual=useRef(false);

  const total=Math.max(0,data.total-data.pending.filter(p=>removed.has(p.id)).length);
  const countArea=(id:QualityArea)=>items.filter(x=>x.area===id).length;
  const areaItems=items.filter(x=>x.area===area);
  const countGroup=(g:string)=>areaItems.filter(x=>g==="all"||x.field_group===g).length;
  const shown=areaItems.filter(x=>(group==="all"||x.field_group===group)&&
    x.profile_label.toLocaleLowerCase("sk").includes(profileFilter.trim().toLocaleLowerCase("sk")));
  async function manualRequest(payload:Record<string,unknown>):Promise<ManualQualityResponse> {
    const response=await fetch("/api/admin/data-quality/missing/manual",{
      method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),
    });
    const result=await response.json() as ManualQualityResponse & {error?:string};
    if(!response.ok) throw new Error(result.error??"Ručné vyhľadávanie sa nepodarilo.");
    return result;
  }
  async function runManualSearch(){
    if(manualBusy||busy!==null||bulkBusy||!data.manualReady)return;
    stopManual.current=false;setManualBusy(true);setManualResults(null);setManualProgress("");
    let used=0,found=0,inspected=0;
    let cursor:ManualQualityCursor|null=null;
    try {
      if(manualMode==="free") {
        const result=await manualRequest({area,group:manualGroup,mode:"free",query:manualQuery.trim()});
        setManualResults(result);
        setManualProgress("Voľné vyhľadávanie dokončené. Výsledky sa nepriraďujú automaticky k profilom.");
      } else {
        for(let i=0;i<manualLimit&&!stopManual.current;i++){
          const result=await manualRequest({area,group:manualGroup,mode:"profiles",cursor});
          if(result.finished)break;
          inspected+=result.inspected;found+=result.found;used+=result.estimatedCredits;
          cursor=result.cursor;
          setManualProgress("Skontrolované: "+inspected+" / "+manualLimit+
            " · Nové návrhy: "+found+" · Odhad kreditov: "+used);
          if(!cursor)break;
        }
        setManualProgress("Dokončené · Skontrolované: "+inspected+
          " · Nájdené návrhy: "+found+" · Odhad: "+used+" kreditov.");
      }
      router.refresh();
    } catch(error) {
      setManualProgress(error instanceof Error?error.message:"Vyhľadávanie zlyhalo.");
      router.refresh();
    } finally {setManualBusy(false);}
  }
  async function findOtherImage(p:MissingQualityProposal){
    if(manualBusy||busy!==null||bulkBusy||!data.manualReady)return;
    setManualBusy(true);setManualProgress("");
    try{
      const result=await manualRequest({area:p.area,group:"image",mode:"alternative",
        entityType:p.entity_type,entityId:p.entity_id});
      setManualProgress(result.found?
        "Pridaný nový návrh obrázka na schválenie pre "+p.profile_label+".":
        "Pre "+p.profile_label+" sa ďalší použiteľný obrázok nenašiel.");
      router.refresh();
    } catch(error){setManualProgress(error instanceof Error?error.message:"Hľadanie zlyhalo.");}
    finally{setManualBusy(false);}
  }
  async function decide(item:MissingQualityProposal,action:"accept"|"reject") {
    if(busy!==null||bulkBusy||manualBusy)return;
    setBusy(item.id);setNotice("");setNoticeError(false);
    try{
      const response=await fetch(`/api/admin/data-quality/missing/${item.id}`,{
        method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action}),
      });
      const body=await response.json() as {error?:string};
      if(!response.ok)throw new Error(body.error??"Údaj sa nepodarilo spracovať.");
      setRemovedIds(prev=>[...prev,item.id]);
      setNotice(action==="accept"?"Údaj bol doplnený do profilu.":"Návrh bol zamietnutý.");
      router.refresh();
    }catch(error){setNoticeError(true);setNotice(error instanceof Error?error.message:"Návrh sa nepodarilo spracovať.");}
    finally{setBusy(null)}
  }
  async function rejectVisible(ids:number[]) {
    if(!ids.length||busy!==null||bulkBusy||manualBusy)return;
    setBulkBusy(true);setNotice("");setNoticeError(false);
    try{
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
      setPendingRejectIds(null);
      router.refresh();
    }catch(error){setNoticeError(true);setNotice(error instanceof Error?error.message:"Zamietnutie zlyhalo.");}
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
                Posledná chyba: {qualityErrorLabel(recent.errorCode)}
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

    <section className={styles.manualPanel} aria-label="Ručné vyhľadávanie">
      <div className={styles.heading}>
        <h2>Ručné vyhľadávanie · {AREAS.find(a=>a.id===area)?.label}</h2>
        <span>Automatické hodinové kontroly sa nemenia</span>
      </div>
      <div className={styles.manualControls}>
        <label>Režim
          <select value={manualMode} disabled={manualBusy} onChange={e=>setManualMode(e.target.value as "profiles"|"free")}>
            <option value="profiles">Existujúce profily s chýbajúcimi údajmi</option>
            <option value="free">Voľné vyhľadávanie (bez priradenia)</option>
          </select>
        </label>
        <label>Čo hľadať
          <select value={manualGroup} disabled={manualBusy} onChange={e=>setManualGroup(e.target.value as ManualQualityGroup)}>
            <option value="address">Adresy a miesta</option>
            <option value="image">Obrázky</option>
            <option value="web">Weby a odkazy</option>
            <option value="phone">Telefóny</option>
            <option value="email">E-maily</option>
            <option value="social">Sociálne siete</option>
            <option value="registration">Registrácie</option>
            <option value="date">Dátumy a časy</option>
            <option value="other">Ostatné</option>
            <option value="all">Všetky chýbajúce údaje</option>
          </select>
        </label>
        {manualMode==="profiles"?<label>Koľko profilov
          <select value={manualLimit} disabled={manualBusy} onChange={e=>setManualLimit(Number(e.target.value))}>
            <option value={5}>5</option><option value={10}>10</option><option value={20}>20</option>
          </select>
        </label>:<label>Hľadaný výraz
          <input value={manualQuery} disabled={manualBusy} maxLength={250} placeholder="Napr. fotografie psích podujatí"
            onChange={e=>setManualQuery(e.target.value)} />
        </label>}
      </div>
      <p className={styles.subtle}>Jedna kontrola = najviac jedno volanie Tavily. Odhad: najviac {manualMode==="free"?1:manualLimit} základných vyhľadávaní; skutočnú spotrebu určuje Tavily. Vyžaduje tvoje schválenie.</p>
      <div className={styles.manualActions}>
        <button type="button" className={styles.accept} onClick={()=>void runManualSearch()}
          disabled={!data.manualReady||manualBusy||busy!==null||bulkBusy||(manualMode==="free"&&manualQuery.trim().length<3)}>
          {manualBusy?"Vyhľadávam…":"Spustiť vyhľadávanie"}
        </button>
        {manualBusy?<button type="button" className={styles.reject} onClick={()=>{stopManual.current=true;}}>
          Zastaviť po aktuálnej kontrole
        </button>:null}
      </div>
      {!data.manualReady?<p className={styles.lastError}>Ručné vyhľadávanie zatiaľ nie je dostupné – treba spustiť migráciu D1 0143. Hodinová automatika funguje ďalej.</p>:null}
      {manualProgress?<div className={styles.notice} role="status">{manualProgress}</div>:null}
      {manualResults?<div className={styles.manualResults}>
        <strong>Výsledky voľného vyhľadávania (bez priradenia k profilu)</strong>
        {manualResults.images?.map((url,i)=><div key={url} className={styles.manualResult}>
          <QualityCandidateImage url={url} label={"Vyhľadávanie "+(i+1)} onPreview={setPreview} />
          <a href={url} target="_blank" rel="noopener noreferrer">Otvoriť obrázok ↗</a>
        </div>)}
        {manualResults.results?.map(r=><p key={r.url} className={styles.manualResult}>
          <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title} ↗</a>
          {r.snippet?<span>{r.snippet.slice(0,220)}</span>:null}
        </p>)}
        <p className={styles.subtle}>Po kontrole môžeš zdroj použiť v príslušnom editore. Systém ho automaticky neuloží.</p>
      </div>:null}
      {data.manualHistory.length>0?<details className={styles.history}><summary>Posledných {data.manualHistory.length} manuálnych kontrol</summary>
        <div className={styles.historyItems}>{data.manualHistory.map(run=><div key={run.id}>
          <span>{run.created_at.slice(0,16).replace("T"," ")} UTC · {AREAS.find(a=>a.id===run.area)?.label} · {run.profile_label??"Voľné vyhľadávanie"}</span>
          <strong>{run.status==="SUCCESS"?"Úspešné":run.status==="FAILED"?"Chyba":"Prebieha"} · {run.found} návrhov</strong>
        </div>)}</div>
      </details>:null}
    </section>
    <section className={styles.results}>
      <div className={styles.heading}>
        <h2>{AREAS.find(a=>a.id===area)?.label}</h2>
        <span>{areaItems.length} {plural(areaItems.length)} na schválenie</span>
      </div>
      <div className={styles.profileSearch}><label htmlFor="quality-profile-filter">Vyhľadať profil</label>
        <input id="quality-profile-filter" value={profileFilter} onChange={e=>setProfileFilter(e.target.value)} placeholder="Názov profilu" />
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
      <AdminFormFeedback error={noticeError?notice:undefined} message={!noticeError?notice:undefined} className={styles.notice}/>
      {data.truncated?<p className={styles.subtle}>Zobrazuje sa prvých 1 000 návrhov. Po ich spracovaní sa načítajú ďalšie.</p>:null}
      {shown.length===0?<div className={styles.empty}>V tejto kategórii zatiaľ nie sú žiadne nájdené údaje na schválenie.</div>:(
        <>
          <div className={styles.list}>
            {shown.map(p=><article className={styles.item} key={p.id}>
              <div className={styles.itemContent}>
                <div className={styles.profile}>{p.profile_label} <a className={styles.profileLink} href={adminProfileHref(p)} target="_blank" rel="noopener noreferrer">Otvoriť profil ↗</a></div>
                <div className={styles.field}>{p.field_label}</div>
                {p.field_group==="image"?
                  <QualityCandidateImage url={p.value} label={p.profile_label} onPreview={setPreview} />:
                  ["web","social","registration"].includes(p.field_group)?
                    <a href={p.value} target="_blank" rel="noopener noreferrer" className={styles.value}>{p.value} ↗</a>:
                    <div className={styles.value}>{p.value}</div>
                }
                {p.source_url&&p.source_url!==p.value?<a className={styles.source} href={p.source_url} rel="noopener noreferrer" target="_blank">Otvoriť zdroj ↗</a>:null}
              </div>
              <div className={styles.actions}>
                {p.field_group==="image"?<button type="button" className={styles.reject} disabled={manualBusy||!data.manualReady||busy!==null||bulkBusy}
                  onClick={()=>void findOtherImage(p)}>Hľadať iný obrázok</button>:null}
                <AdminActionButton variant="destructive" className={styles.reject} disabled={busy!==null||bulkBusy||manualBusy} onClick={()=>void decide(p,"reject")}>Zamietnuť</AdminActionButton>
                <AdminActionButton variant="primary" className={styles.accept} disabled={busy!==null||bulkBusy} onClick={()=>void decide(p,"accept")}>{busy===p.id?"Ukladám…":"Schváliť"}</AdminActionButton>
              </div>
            </article>)}
          </div>
          <div className={styles.footer}>
            <AdminActionButton variant="destructive" className={styles.rejectAll} onClick={()=>setPendingRejectIds(shown.map(p=>p.id))} disabled={bulkBusy||busy!==null||manualBusy}>
              {bulkBusy?"Zamietam…":`Zamietnuť všetky zobrazené (${shown.length})`}
            </AdminActionButton>
          </div>
        </>
      )}
    </section>
    {preview?<div className={styles.previewOverlay} role="dialog" aria-modal="true" aria-label="Náhľad obrázka">
      <div className={styles.previewDialog}>
        <button type="button" className={styles.reject} onClick={()=>setPreview(null)}>Zavrieť náhľad</button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={preview} alt="Zväčšený kandidát obrázka" onError={()=>setPreview(null)}/>
        <a href={preview} target="_blank" rel="noopener noreferrer">Otvoriť pôvodný obrázok ↗</a>
      </div>
    </div>:null}
    <AdminDestructiveConfirmDialog
      open={pendingRejectIds!==null} title="Zamietnuť všetky zobrazené návrhy"
      description="Návrhy sa odstránia zo zoznamu."
      affectedCount={pendingRejectIds?.length??0} affectedLabel="návrhov"
      confirmLabel="Zamietnuť všetky zobrazené" pending={bulkBusy}
      onCancel={()=>{if(!bulkBusy)setPendingRejectIds(null);}}
      onConfirm={()=>{if(pendingRejectIds)void rejectVisible(pendingRejectIds);}}
    />
  </div>;
}
