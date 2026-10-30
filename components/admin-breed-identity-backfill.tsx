"use client";

import { useState } from "react";
import type { BreedIdentityBackfillSummary } from "@/lib/notion-breed-identity-backfill";

export function AdminBreedIdentityBackfill(){
  const [summary,setSummary]=useState<BreedIdentityBackfillSummary|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [runs,setRuns]=useState(0);
  const [totals,setTotals]=useState({linked:0,fciNotionFilled:0,fciD1Filled:0,mappingsCreated:0});
  async function request(mode:"preview"|"apply"){
    const response=await fetch("/api/admin/notion-breeds-identity-backfill",{
      method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
      body:JSON.stringify({mode}),
    });
    const body=await response.json() as {summary?:BreedIdentityBackfillSummary;error?:string};
    if(!response.ok || !body.summary)throw new Error(body.error??"Kontrola sa nepodarila.");
    return body.summary;
  }
  async function preview(){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const next=await request("preview");
      setSummary(next);
      setMessage("Náhľad je len na čítanie. Nič sa nezmenilo.");
    }catch(error){setMessage(error instanceof Error?error.message:"Kontrola zlyhala.");}
    finally{setBusy(false);}
  }
  async function apply(){
    if(busy || !summary)return;
    setBusy(true);setMessage("");
    setRuns(0);setTotals({linked:0,fciNotionFilled:0,fciD1Filled:0,mappingsCreated:0});
    let linked=0,fciNotionFilled=0,fciD1Filled=0,mappingsCreated=0;
    try{
      // Bounded request count; one click starts at most 30 individually
      // authenticated batches. User can safely rerun: all writes are idempotent.
      for(let i=0;i<30;i++){
        const current=await request("apply");
        setSummary(current);
        linked+=current.linked;
        fciNotionFilled+=current.fciNotionFilled;
        fciD1Filled+=current.fciD1Filled;
        mappingsCreated+=current.mappingsCreated;
        setRuns(i+1);
        setTotals({linked,fciNotionFilled,fciD1Filled,mappingsCreated});
        if(!current.canContinue){
          setMessage(current.failed || current.conflicts || current.unmatched || current.unapproved
            ? "Bezpečné záznamy boli spracované. Nejednoznačné alebo neschválené prepojenia zostali nedotknuté."
            : "Doplnenie identít prebehlo. Úpravy obsahu prevedie existujúca synchronizácia.");
          return;
        }
      }
      setMessage("Dosiahnutý limit dávok. Pokračovanie možno bezpečne spustiť znovu.");
    }catch(error){
      setMessage(error instanceof Error?error.message:"Doplnenie sa prerušilo. Spracované ID zostali zachované.");
    }finally{setBusy(false);}
  }
  return <section aria-label="Prepojenie plemien s Notionom" style={{border:"1px solid var(--border, #ddd)",borderRadius:12,padding:16,marginBottom:20}}>
    <h2 style={{fontSize:"1rem",fontWeight:700,marginBottom:8}}>Prepojenie plemien s Notionom</h2>
    <p style={{fontSize:".875rem",marginBottom:12}}>Doplniť chýbajúce Psipedia ID podľa živej D1. FCI dopĺňať len pri bezpečne potvrdenej zhode. Bez zmeny fotiek, obsahu a publikovania.</p>
    <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
      <button type="button" disabled={busy} onClick={preview}>Skontrolovať prepojenia</button>
      <button type="button" disabled={busy||!summary} onClick={apply}>Doplniť potvrdené ID a FCI</button>
    </div>
    {summary&&<p role="status" style={{marginTop:12,fontSize:".875rem"}}>
      Skontrolovaných: {summary.scanned}. Jednoznačne spárovaných: {summary.matched}. Chýba prepojenie alebo hodnota: {summary.remaining}.
      Konflikty: {summary.conflicts}. Nenájdené: {summary.unmatched}. Neschválené: {summary.unapproved}. Chyby: {summary.failed}.
      {runs>0&&<> Spracované dávky: {runs}. Doplnené ID: {totals.linked}. Nové väzby: {totals.mappingsCreated}. FCI v D1: {totals.fciD1Filled}. FCI v Notione: {totals.fciNotionFilled}.</>}
    </p>}
    {summary&&summary.review.length>0&&<details style={{fontSize:".875rem",marginTop:8}}>
      <summary>Nejednoznačné záznamy ({summary.review.length} v náhľade)</summary>
      <ul>{summary.review.map((item,i)=><li key={i}>{item.slug}: {item.reason}</li>)}</ul>
    </details>}
    {message&&<p role="status" style={{fontSize:".875rem",marginTop:8}}>{message}</p>}
  </section>;
}
