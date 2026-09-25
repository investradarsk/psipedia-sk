"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
const reasons=[["INCORRECT_INFORMATION","Údaje sa nepodarilo potvrdiť"],["DUPLICATE","Duplicitné podujatie"],["POLICY_CONFLICT","Konflikt s pravidlami"],["OTHER","Iný dôvod"]] as const;
export function AdminPartnerEventActions({id,operation,candidateId,hasImage=false}:{id:string;operation:"CREATE"|"UPDATE";candidateId?:number|null;hasImage?:boolean}){
 const router=useRouter();const [reasonCode,setReasonCode]=useState("INCORRECT_INFORMATION");const [canonicalId,setCanonicalId]=useState(candidateId?String(candidateId):"");const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [applyImage,setApplyImage]=useState(false);
 async function run(action:"CREATE_EVENT"|"LINK_EXISTING"|"APPROVE"|"REJECT"){
  if(busy)return;const label=action==="CREATE_EVENT"?"vytvoriť canonical podujatie ako DRAFT":action==="LINK_EXISTING"?"prepojiť návrh s existujúcim podujatím":action==="APPROVE"?"aplikovať presný Partner patch": "zamietnuť návrh";
  if(!window.confirm(`Naozaj chcete ${label}?`))return;setBusy(true);setMessage("");
  try{const response=await fetch(`/api/admin/partners/events/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action,canonicalId:action==="LINK_EXISTING"?Number(canonicalId):undefined,applyImage:action==="LINK_EXISTING"?applyImage:undefined,reasonCode:action==="REJECT"?reasonCode:undefined})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||"Rozhodnutie sa nepodarilo uložiť.");setMessage("Rozhodnutie bolo uložené.");router.refresh();}
  catch(error){setMessage(error instanceof Error?error.message:"Rozhodnutie sa nepodarilo uložiť.");}finally{setBusy(false);}
 }
 return <section className="admin-form-card"><h2>Rozhodnutie</h2><div className="admin-commercial-actions">
  {operation==="CREATE"?<><button type="button" disabled={busy} onClick={()=>run("CREATE_EVENT")}>CREATE EVENT (DRAFT)</button><label>Existujúce event ID<input type="number" min="1" value={canonicalId} onChange={e=>setCanonicalId(e.target.value)} disabled={busy}/></label>{hasImage?<label className="admin-partner-checkbox"><input type="checkbox" checked={applyImage} onChange={e=>setApplyImage(e.target.checked)} disabled={busy}/><span>Použiť nahraný obrázok aj pre existujúce podujatie</span></label>:null}<button type="button" disabled={busy||!canonicalId} onClick={()=>run("LINK_EXISTING")}>LINK EXISTING</button></>:<button type="button" disabled={busy} onClick={()=>run("APPROVE")}>Schváliť zmeny</button>}
  <label>Dôvod pri zamietnutí<select value={reasonCode} onChange={e=>setReasonCode(e.target.value)} disabled={busy}>{reasons.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
  <button type="button" className="is-danger" disabled={busy} onClick={()=>run("REJECT")}>Zamietnuť</button>
  {message?<p role="status" className="admin-partner-message">{message}</p>:null}
 </div></section>;
}
