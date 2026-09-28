"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { partnerEventFields, type PartnerEventPatch } from "@/lib/partner-event-fields";
import { PartnerMediaField } from "@/components/partner-media-field";

type DuplicateCandidate={id:number;title:string;startDate:string;city:string;confidence:string;reasons:string[]};
type Props={mode:"create"|"edit";resourceId?:string;baseRevision?:string;initial?:PartnerEventPatch;currentImageUrl?:string|null};

function initialDraft(values?:PartnerEventPatch){
  return Object.fromEntries(partnerEventFields.map(field=>[field.key,typeof values?.[field.key]==="string"?values[field.key]:""])) as Record<string,string>;
}
export function PartnerEventForm({mode,resourceId,baseRevision,initial,currentImageUrl}:Props){
  const original=useMemo(()=>initialDraft(initial),[initial]);
  const [draft,setDraft]=useState(original);
  const [cancelled,setCancelled]=useState(initial?.cancelled===true);
  const [state,setState]=useState<"idle"|"sending"|"success"|"error">("idle");
  const [message,setMessage]=useState("");
  const [duplicate,setDuplicate]=useState<DuplicateCandidate[]>([]);
  const [confirmDuplicate,setConfirmDuplicate]=useState(false);
  const [mediaAssetId,setMediaAssetId]=useState<string|null>(null);

  async function submit(event:React.FormEvent){
    event.preventDefault();if(state==="sending"||state==="success")return;
    setState("sending");setMessage("");
    try{
      if(mode==="create"){
        const response=await fetch("/api/partner/events",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({event:draft,confirmDuplicate,mediaAssetId})});
        const data=await response.json() as {error?:string;code?:string;details?:{scan?:{candidates?:DuplicateCandidate[]}}};
        if(!response.ok){
          if(data.code==="DUPLICATE_CONFIRMATION_REQUIRED"){
            setDuplicate(data.details?.scan?.candidates??[]);setConfirmDuplicate(true);setState("error");
            setMessage(data.error||"Podobné podujatie už môže existovať. Skontrolujte ho a potvrďte odoslanie.");
            return;
          }
          throw new Error(data.error||"Podujatie sa nepodarilo odoslať.");
        }
        setState("success");setMessage("Podujatie sme prijali a čaká na kontrolu.");
      }else{
        if(!resourceId||!baseRevision)throw new Error("Chýba Partner resource.");
        const patch:Record<string,unknown>={};
        for(const field of partnerEventFields){if(draft[field.key]!==original[field.key])patch[field.key]=draft[field.key];}
        if(cancelled!==(initial?.cancelled===true))patch.cancelled=cancelled;
        if(!Object.keys(patch).length&&!mediaAssetId)throw new Error("Nezmenili ste žiadny údaj.");
        const response=await fetch(`/api/partner/events/${encodeURIComponent(resourceId)}/changes`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({baseRevision,patch,mediaAssetId})});
        const data=await response.json() as {error?:string};
        if(!response.ok)throw new Error(data.error||"Návrh úprav sa nepodarilo odoslať.");
        setState("success");setMessage("Zmeny podujatia sme prijali a čakajú na kontrolu.");
      }
    }catch(error){setState("error");setMessage(error instanceof Error?error.message:"Požiadavka zlyhala.");}
  }

  return <form className="partner-profile-edit-form partner-event-form" onSubmit={submit}>
    <div className="partner-profile-edit-grid">
      {partnerEventFields.map(field=>{
        const value=draft[field.key]??"";
        const wide=field.kind==="textarea";
        if(field.kind==="select")return <label className={`partner-field ${wide?"partner-field--wide":""}`} key={field.key}><span>{field.label}</span>
          <select value={value} required={"required" in field ? field.required : false} onChange={e=>setDraft(v=>({...v,[field.key]:e.target.value}))} disabled={state==="success"}>
            <option value="">Vyberte…</option>{(field.options??[]).map(option=><option value={option} key={option}>{option}</option>)}
          </select></label>;
        if(field.kind==="textarea")return <label className="partner-field partner-field--wide" key={field.key}><span>{field.label}</span>
          <textarea rows={field.key==="description"?9:field.key==="excerpt"?4:6} value={value} required={"required" in field ? field.required : false} onChange={e=>setDraft(v=>({...v,[field.key]:e.target.value}))} disabled={state==="success"}/></label>;
        return <label className="partner-field" key={field.key}><span>{field.label}</span>
          <input type={field.kind==="url"?"url":field.kind==="date"?"date":field.kind==="time"?"time":"text"} value={value} required={"required" in field ? field.required : false} onChange={e=>setDraft(v=>({...v,[field.key]:e.target.value}))} disabled={state==="success"}/></label>;
      })}
      {mode==="edit"?<label className="partner-profile-check partner-field--wide"><input type="checkbox" checked={cancelled} onChange={e=>setCancelled(e.target.checked)} disabled={state==="success"}/><span>Podujatie je zrušené</span></label>:null}
    </div>
    <PartnerMediaField label={mode==="create"?"Hlavný obrázok podujatia":"Navrhnúť zmenu obrázka"} intent={mode==="create"?"PARTNER_EVENT_CREATE":"PARTNER_EVENT_UPDATE"} currentImageUrl={mode==="edit"?currentImageUrl:null} onChange={setMediaAssetId} disabled={state==="success"}/>
    {duplicate.length?<section className="partner-duplicate-panel is-high" role="alert"><div><span className="eyebrow">Kontrola duplicít</span><h2>Podobné podujatie už môže na Psipedii existovať.</h2><p>Ak ide o to isté podujatie, administrátor môže návrh prepojiť s existujúcim záznamom. Nevznikne automatický claim.</p></div><div className="partner-duplicate-list">{duplicate.slice(0,5).map(item=><article key={item.id}><div><strong>{item.title}</strong><span>{item.startDate} · {item.city}</span></div><p>{item.reasons.join(" · ")}</p></article>)}</div><strong>Ak ste údaje skontrolovali, odošlite formulár ešte raz.</strong></section>:null}
    <div className="partner-profile-edit-submit"><div><strong>Žiadna Partner zmena sa nezverejní okamžite.</strong><p>{mode==="create"?"Po schválení administrátorom vznikne podujatie ako koncept. Publikovanie je samostatný redakčný krok.":"Canonical podujatie sa zmení až po schválení administrátorom; jeho stav publikovania zostane zachovaný."}</p></div>
      <button className="button button--dark" type="submit" disabled={state==="sending"||state==="success"}>{state==="sending"?"Odosielam…":mode==="create"&&confirmDuplicate?"Potvrdiť a odoslať na kontrolu":mode==="create"?"Odoslať na kontrolu":"Odoslať zmeny na kontrolu"}</button>
    </div>
    {message?<p className={`partner-form-message ${state==="success"?"is-success":"is-error"}`} role="status">{message}{state==="success"?<> <Link href="/partner/ziadosti">Zobraziť žiadosti →</Link></>:null}</p>:null}
  </form>;
}
