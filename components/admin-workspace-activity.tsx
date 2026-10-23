"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useState} from "react";
import type {WorkspaceEvent,WorkspaceFeed} from "@/lib/admin-workspace-feed";
import styles from "./admin-workspace-activity.module.css";

function formatTime(raw:string){
  const date=new Date(raw);
  return Number.isFinite(date.getTime())?date.toLocaleString("sk-SK",{dateStyle:"short",timeStyle:"short"}):"—";
}
function isAction(x:WorkspaceEvent){
  return /partner|review|proposal|submitted|actionable|_created$|quality_missing_found|facebook_image_imported/.test(x.eventType)
    || ["PROFILE_REVIEW_MODERATION","GEMINI_CREATED","PARTNER_CLAIM_REVIEW"].includes(x.sourceType);
}

export function AdminWorkspaceActivity({initial}:{initial:WorkspaceFeed}){
  const[data,setData]=useState(initial);
  const[filter,setFilter]=useState<"all"|"action"|"automation">("all");
  const[busy,setBusy]=useState<number|null>(null);
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState("");
  const refresh=useCallback(async()=>{
    try{
      const res=await fetch("/api/admin/workspace/feed",{cache:"no-store"});
      if(!res.ok)throw Error("Prehľad sa nepodarilo načítať.");
      const next=await res.json() as WorkspaceFeed;
      setData(next);setError("");
    }catch{setError("Aktualizácia prehľadu sa nepodarila.")}
  },[]);
  useEffect(()=>{
    const id=window.setInterval(()=>{void refresh();},60_000);
    return()=>window.clearInterval(id);
  },[refresh]);
  async function read(id:number){
    if(busy!==null)return;
    setBusy(id);
    try{
      const res=await fetch("/api/admin/workspace/feed",{method:"POST",
        headers:{"content-type":"application/json"},body:JSON.stringify({id})});
      if(!res.ok)throw Error("Uloženie zlyhalo.");
      setData(v=>({...v,items:v.items.map(x=>x.id===id?{...x,read:true}:x)}));
    }catch{setError("Nepodarilo sa označiť upozornenie ako prečítané.");}
    finally{setBusy(null);}
  }
  const shown=useMemo(()=>data.items.filter(x=>
    filter==="all" ||(filter==="action"?isAction(x):!isAction(x))),[data.items,filter]);
  const unread=data.items.filter(x=>!x.read).length;
  return <section className={styles.root} aria-label="Aktuálne udalosti Psipedie">
    <div className={styles.titleRow}>
      <div><small>Prehľad aktivít</small><h2>Čo sa deje na Psipedii</h2></div>
      <button type="button" className={styles.secondary} disabled={loading} onClick={()=>{
        setLoading(true);void refresh().finally(()=>setLoading(false));}}>Obnoviť</button>
    </div>
    {data.status==="UNAVAILABLE"&&<p role="status">Udalosti momentálne nie sú dostupné. Otvor príslušnú agendu alebo obnov prehľad.</p>}
    <div className={styles.highlight}>
      <div><small>Najbližšie plánované Gemini vyhľadávanie</small>
        {data.nextGemini
          ? <><strong>{data.nextGemini.label}</strong>
            <time dateTime={data.nextGemini.nextRunAt}>{formatTime(data.nextGemini.nextRunAt)}</time></>
          : <strong>Bez potvrdeného najbližšieho termínu</strong>}
      </div>
      <Link href="/admin/automatizacie-gemini">Otvoriť plánovač →</Link>
    </div>
    <div className={styles.metrics}>
      <Link href="/admin/operations">Čakajúce úlohy <strong>Otvoriť →</strong></Link>
      <Link href="/admin/kvalita">Nové údaje na schválenie <strong>{data.status==="OK"?data.qualityPending:"—"}</strong></Link>
      <div>Neprečítané udalosti <strong>{data.status==="OK"?unread:"—"}</strong></div>
    </div>
    <div className={styles.toolbar} aria-label="Filter pracovných udalostí">
      {([["all","Všetko"],["action","Na kontrolu"],["automation","Automatizácie a systém"]] as const).map(([key,label])=>
        <button key={key} type="button" aria-pressed={filter===key}
          className={filter===key?styles.active:styles.secondary} onClick={()=>setFilter(key)}>{label}</button>)}
    </div>
    <div className={styles.events}>
      {shown.map(x=><article className={styles.event} key={x.id} data-unread={!x.read}>
        <div className={styles.eventContent}>
          <Link href={x.href}><strong>{x.title}</strong></Link>
          <p>{x.body}</p>
          <small>{formatTime(x.createdAt)} · {x.read?"Prečítané":"Nové"}</small>
        </div>
        <div className={styles.actions}>
          <Link href={x.href}>Otvoriť</Link>
          {!x.read&&<button type="button" disabled={busy!==null} onClick={()=>void read(x.id)}>Prečítané</button>}
        </div>
      </article>)}
      {data.status==="OK"&&!shown.length&&<p className={styles.empty}>V tomto filtri nie sú žiadne udalosti.</p>}
    </div>
    {error&&<p role="status" className={styles.error}>{error}</p>}
    <p className={styles.note}>Označenie za prečítané nezmení stav hodnotenia, návrhu ani profilu.
      Udalosti sa obnovujú automaticky približne každú minútu.</p>
  </section>;
}
