"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { PartnerHelpCreateType } from "@/lib/partner-help-create";


import { specs, defaults, names } from "@/lib/partner-help-create-form-fields";

export function PartnerHelpCreateForm(){
  const [type,setType] = useState<PartnerHelpCreateType>("ADOPTION_DOG");
  const [data,setData] = useState<Record<string,string>>(defaults.ADOPTION_DOG);
  const [state,setState] = useState<"idle"|"sending"|"success"|"error">("idle");
  const [message,setMessage] = useState("");
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(state==="sending"||state==="success")return;
    setState("sending");setMessage("");
    try{
      const response=await fetch("/api/partner/help-submissions",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({resourceType:type,payload:Object.fromEntries(specs[type].map(field=>[field.key,data[field.key]??""]))}),
      });
      const result=await response.json() as {error?:string};
      if(!response.ok)throw new Error(result.error??"Návrh sa nepodarilo odoslať.");
      setState("success");setMessage("Návrh sme prijali. Administrátor ho pred vytvorením a zverejnením skontroluje.");
    }catch(error){setState("error");setMessage(error instanceof Error?error.message:"Požiadavka zlyhala.");}
  }
  return <form className="partner-profile-edit-form partner-event-form" onSubmit={submit}>
    <div className="partner-profile-edit-grid">
      <label className="partner-field partner-field--wide"><span>Čo chcete vytvoriť?</span>
        <select value={type} disabled={state==="sending"||state==="success"} onChange={event=>{
          const next=event.target.value as PartnerHelpCreateType;
          setType(next);setData(defaults[next]);setState("idle");setMessage("");
        }}>
          {(Object.keys(names) as PartnerHelpCreateType[]).map(key=><option key={key} value={key}>{names[key]}</option>)}
        </select>
      </label>
      {specs[type].map(field=><label key={type+field.key} className={`partner-field ${field.kind==="textarea"?"partner-field--wide":""}`}>
        <span>{field.label}{field.required?" *":""}</span>
        {field.kind==="select"?<select value={data[field.key]??""} required={field.required} disabled={state==="success"} onChange={event=>setData(prev=>({...prev,[field.key]:event.target.value}))}>
          {field.options?.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
        </select>:field.kind==="textarea"?<textarea rows={field.key==="description"?7:3} value={data[field.key]??""} required={field.required}
          disabled={state==="success"} onChange={event=>setData(prev=>({...prev,[field.key]:event.target.value}))}/>:<input
            type={field.kind==="number"?"number":field.kind==="date"?"date":"text"}
            min={field.kind==="number"?0:undefined} max={field.kind==="number"?360:undefined}
            value={data[field.key]??""} required={field.required} disabled={state==="success"}
            onChange={event=>setData(prev=>({...prev,[field.key]:event.target.value}))}/>}
      </label>)}
    </div>
    <div className="partner-profile-edit-submit">
      <div><strong>Návrh sa nezverejní automaticky.</strong>
        <p>Odoslaním vznikne iba žiadosť na kontrolu. Správu záznamu dostanete až po administrátorskom schválení.</p>
        {type==="LOST_FOUND_DOG"?<p>Do opisu nevkladajte súkromné telefónne čísla ani presnú domácu adresu. Kontaktné údaje sa riešia pri kontrole.</p>:null}
      </div>
      <button className="button button--dark" type="submit" disabled={state==="sending"||state==="success"}>
        {state==="sending"?"Odosielam…":"Odoslať na kontrolu"}
      </button>
    </div>
    {message?<p role="status" className={`partner-form-message ${state==="success"?"is-success":"is-error"}`}>{message}
      {state==="success"?<> <Link href="/partner/ziadosti">Moje žiadosti →</Link></>:null}
    </p>:null}
  </form>;
}

export function PartnerHelpWithdrawButton({id}:{id:string}) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function withdraw(){
    if(busy)return;
    setBusy(true);setError("");
    try{
      const response=await fetch(`/api/partner/help-submissions/${encodeURIComponent(id)}`,{
        method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"WITHDRAW"}),
      });
      const result=await response.json() as {error?:string};
      if(!response.ok)throw new Error(result.error??"Návrh sa nepodarilo stiahnuť.");
      router.refresh();
    }catch(error){setError(error instanceof Error?error.message:"Požiadavka zlyhala.");}
    finally{setBusy(false);}
  }
  return <><button type="button" disabled={busy} onClick={withdraw}>{busy?"Ruším…":"Stiahnuť návrh"}</button>
    {error?<span role="alert">{error}</span>:null}</>;
}
