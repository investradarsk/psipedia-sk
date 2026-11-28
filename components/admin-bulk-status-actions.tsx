"use client";
import { useState } from "react";
import { AdminActionButton, AdminModalDialog } from "@/components/admin-interaction-system";
import { adoptionStatusLabels, adoptionStatuses } from "@/lib/adoption";
import { dogReportStatusLabel } from "@/lib/lost-found-dogs";
import { LOST_FOUND_STATUSES } from "@/lib/lost-found-lifecycle.js";
import type { RemainingBulkAgenda } from "@/lib/admin-bulk/remaining-status";

type Item={id:number;status:string;updatedAt:string};
type Result={updated:{id:number}[];skipped:{id:number;reason:string}[];failed:{id:number;reason:string}[];error?:string};
const labels:Record<RemainingBulkAgenda,Record<string,string>>={
 adoptions:adoptionStatusLabels,
 "lost-found":dogReportStatusLabel,
 eshops:{draft:"Koncept",published:"Publikovaný",archived:"Archivovaný"},
};
const statuses={adoptions:adoptionStatuses,"lost-found":LOST_FOUND_STATUSES,eshops:["draft","published","archived"]} as const;
export function AdminBulkStatusActions({agenda,items,disabled=false,onFinished}:{agenda:RemainingBulkAgenda;items:readonly Item[];disabled?:boolean;onFinished:(ids:number[])=>void}){
 const [target,setTarget]=useState("");
 const [review,setReview]=useState<{target:string;items:Item[]}|null>(null);
 const [busy,setBusy]=useState(false);
 const [result,setResult]=useState<Result|null>(null);
 const [error,setError]=useState("");
 const active=Boolean(review);
 const sameSelection=review&&review.items.length===items.length&&review.items.every(item=>items.some(current=>current.id===item.id&&current.status===item.status&&current.updatedAt===item.updatedAt));
 const close=()=>{if(busy)return;const ids=result?.updated.map(item=>item.id)??[];setReview(null);setResult(null);setError("");if(ids.length)onFinished(ids);};
 async function apply(){
  if(!review||!sameSelection||busy||disabled)return;
  setBusy(true);setError("");
  try{
   const response=await fetch("/api/admin/bulk/status",{method:"POST",credentials:"same-origin",cache:"no-store",headers:{"content-type":"application/json"},body:JSON.stringify({agenda,target:review.target,items:review.items,confirmedCount:review.items.length})});
   const body=await response.json() as Result;
   if(!response.ok)throw Error(body.error??"Server nepotvrdil zmenu.");
   if(!Array.isArray(body.updated)||!Array.isArray(body.failed)||!Array.isArray(body.skipped))throw Error("Výsledok zmeny nie je potvrdený.");
   setResult(body);
  }catch(e){setError(e instanceof Error?e.message:"Zmena nebola potvrdená. Obnov zoznam.");}
  finally{setBusy(false);}
 }
 if(!items.length&&!active)return null;
 return <>
  <label><span className="sr-only">Cieľový stav</span><select aria-label="Cieľový stav vybraných záznamov" value={target} disabled={disabled||active||busy} onChange={event=>setTarget(event.target.value)}>
   <option value="">Zmeniť stav…</option>
   {statuses[agenda].map(status=><option key={status} value={status}>{labels[agenda][status]??status}</option>)}
  </select></label>
  <AdminActionButton variant="neutral" type="button" disabled={disabled||active||!target||!items.length||items.length>50}
   onClick={()=>{setError("");setResult(null);setReview({target,items:items.map(item=>({...item}))});}}>Skontrolovať a potvrdiť</AdminActionButton>
  {items.length>50&&<small>Najviac 50 záznamov naraz.</small>}
  <AdminModalDialog open={active} title={result?"Výsledok hromadnej zmeny":"Potvrdiť hromadnú zmenu stavu"} description="Zmení sa iba stav a príslušné časové údaje. Server overí každé ID a uloženú verziu." onClose={close}
   footer={<><AdminActionButton variant="neutral" disabled={busy} onClick={close}>{result?"Zavrieť":"Zrušiť"}</AdminActionButton>
   {!result&&<AdminActionButton variant="primary" disabled={busy||disabled||!sameSelection} onClick={()=>void apply()}>{busy?"Spracúvam…":"Potvrdiť zmenu"}</AdminActionButton>}</>}>
   {review&&!result&&<p>Označené: <strong>{review.items.length}</strong>. Cieľ: <strong>{labels[agenda][review.target]}</strong>. Nepovolené a zmenené záznamy zostanú nezmenené.</p>}
   {!sameSelection&&!result&&<p role="alert">Výber alebo verzia sa zmenili. Zruš a zopakuj výber.</p>}
   {result&&<><p role="status">Zmenené: {result.updated.length}, preskočené: {result.skipped.length}, neúspešné: {result.failed.length}.</p>
   {[...result.skipped,...result.failed].length>0&&<ul>{[...result.skipped,...result.failed].map(item=><li key={item.id}>#{item.id}: {item.reason}</li>)}</ul>}</>}
   {error&&<p role="alert">{error}</p>}
  </AdminModalDialog>
 </>;
}
