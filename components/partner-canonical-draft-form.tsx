"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PartnerCanonicalType, PartnerDraftStatus } from "@/lib/partner-canonical-workflow";

type Field={key:string;label:string;multiline?:boolean;options?:readonly [string,string][];list?:boolean};
const t=(key:string,label:string,multiline=false):Field=>({key,label,multiline});
const types:ReadonlyArray<[PartnerCanonicalType,string]>=[
  ["DIRECTORY_PROFILE","Služba pre psov"],["HELP_ORGANIZATION","Organizácia"],
  ["MANAGED_EVENT","Podujatie"],["ADOPTION_DOG","Adopcia"],
  ["LOST_FOUND_DOG","Stratený / nájdený pes"],["HELP_CASE","Pomoc psom"],
];
const commonContacts:Field[]=[t("publicPhone","Telefón"),t("publicEmail","E-mail"),
  t("websiteUrl","Web"),t("facebookUrl","Facebook"),t("instagramUrl","Instagram")];
const address:Field[]=[t("region","Kraj"),t("district","Okres"),t("city","Mesto/obec"),t("address","Adresa")];
const fields:Record<PartnerCanonicalType,Field[]>={
  DIRECTORY_PROFILE:[
    t("name","Názov"),{key:"category",label:"Kategória"},
    t("excerpt","Krátky popis",true),t("description","Opis",true),
    {key:"services",label:"Služby – po riadkoch",list:true,multiline:true},
    {key:"qualifications",label:"Kvalifikácie – po riadkoch",list:true,multiline:true},
    ...address,t("priceNote","Cena / poznámka k cene"),...commonContacts,
  ],
  HELP_ORGANIZATION:[
    t("name","Názov"),{key:"type",label:"Typ organizácie",
      options:[["SHELTER","Útulok"],["CIVIC_ASSOCIATION","Občianske združenie"],
        ["RESCUE_ORGANIZATION","Záchranná organizácia"],["MUNICIPAL_ORGANIZATION","Mestská organizácia"],
        ["NONPROFIT","Nezisková organizácia"],["OTHER","Iné"]]},
    t("legalName","Právny názov"),
    t("shortDescription","Krátky popis",true),t("description","Opis",true),
    ...address,t("countryCode","Kód krajiny"),...commonContacts,
  ],
  MANAGED_EVENT:[
    t("title","Názov"),t("excerpt","Krátky popis",true),t("eventType","Druh podujatia"),
    t("startDate","Dátum začiatku (RRRR-MM-DD)"),t("startTime","Začiatok (HH:MM)"),
    t("endDate","Dátum konca"),t("endTime","Koniec"),
    t("venue","Miesto"),t("city","Mesto"),t("region","Kraj"),t("address","Adresa"),
    t("organizer","Organizátor"),t("description","Opis",true),
    t("practicalInfo","Praktické informácie",true),t("websiteUrl","Web"),t("registrationUrl","Registrácia"),
  ],
  ADOPTION_DOG:[
    t("name","Meno psa"),{key:"sex",label:"Pohlavie",options:[["UNKNOWN","Neznáme"],["MALE","Pes"],["FEMALE","Sučka"]]},
    {key:"size",label:"Veľkosť",options:[["UNKNOWN","Neznáme"],["SMALL","Malý"],["MEDIUM","Stredný"],["LARGE","Veľký"],["GIANT","Obrovský"]]},
    t("approximateAgeMonths","Vek v mesiacoch"),t("breedName","Plemeno"),
    t("region","Kraj"),t("district","Okres"),t("city","Mesto"),
    t("organizationName","Organizácia"),t("shortDescription","Krátky popis",true),t("description","Opis",true),
  ],
  LOST_FOUND_DOG:[
    {key:"type",label:"Typ hlásenia",options:[["LOST","Stratený pes"],["FOUND","Nájdený pes"]]},
    t("dogName","Meno psa"),{key:"sex",label:"Pohlavie",options:[["UNKNOWN","Neznáme"],["MALE","Pes"],["FEMALE","Sučka"]]},
    t("breed","Plemeno"),t("color","Farba"),
    {key:"size",label:"Veľkosť",options:[["UNKNOWN","Neznáme"],["SMALL","Malý"],["MEDIUM","Stredný"],["LARGE","Veľký"],["GIANT","Obrovský"]]},
    t("eventDate","Dátum udalosti"),t("region","Kraj"),t("district","Okres"),t("city","Mesto"),
    t("locationDescription","Miesto",true),t("description","Opis",true),
  ],
  HELP_CASE:[
    t("title","Názov"),
    {key:"category",label:"Kategória",options:[["docasna-opatera","Dočasná opatera"],
      ["zbierky","Zbierka"],["dobrovolnictvo","Dobrovoľníctvo"],["urgentne-pripady","Urgentný prípad"]]},
    t("excerpt","Krátky popis",true),t("description","Opis",true),
    t("organization","Organizácia"),t("city","Mesto"),t("region","Kraj"),
    t("actionLabel","Text výzvy"),t("contactNote","Kontakt / poznámka",true),
  ],
};
const initialValues=(type:PartnerCanonicalType)=>{
  const val:Record<string,string>={};
  for(const field of fields[type])val[field.key]=
    field.key==="countryCode"?"SK":field.options?.[0]?.[0]??"";
  return val;
};
type Draft={id:string;resourceType:PartnerCanonicalType;status:PartnerDraftStatus;
  values:Record<string,unknown>;baseUpdatedAt:string;returnReason?:string|null};
function toDisplay(type:PartnerCanonicalType,values:Record<string,unknown>){
  const defaults=initialValues(type);
  for(const field of fields[type]){
    const v=values[field.key];
    if(field.list&&Array.isArray(v))defaults[field.key]=v.join("\n");
    else if(v!==undefined&&v!==null)defaults[field.key]=String(v);
  }
  return defaults;
}
export function PartnerCanonicalDraftForm({
  categories,initial,initialType="DIRECTORY_PROFILE",
}:{
  categories:ReadonlyArray<{slug:string;label:string}>;
  initial?:Draft;initialType?:PartnerCanonicalType;
}){
  const router=useRouter();
  const [type,setType]=useState<PartnerCanonicalType>(initial?.resourceType??initialType);
  const [values,setValues]=useState<Record<string,string>>(()=>toDisplay(
    initial?.resourceType??initialType,initial?.values??{}));
  const [id,setId]=useState(initial?.id??null);
  const [revision,setRevision]=useState(initial?.baseUpdatedAt??"");
  const [status,setStatus]=useState<PartnerDraftStatus>(initial?.status??"DRAFT");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const baseline=useRef(JSON.stringify(values));
  const dirty=useMemo(()=>JSON.stringify(values)!==baseline.current,[values]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue="";};
    window.addEventListener("beforeunload",warn);
    return ()=>window.removeEventListener("beforeunload",warn);
  },[dirty]);
  const editable=["DRAFT","RETURNED","SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(status);
  const body=()=>{
    const data:Record<string,unknown>={};
    for(const field of fields[type]){
      const value=values[field.key]??"";
      data[field.key]=field.list?value.split("\n").map(s=>s.trim()).filter(Boolean):
        field.key==="approximateAgeMonths"?(value.trim()?Number(value):null):value;
    }
    return data;
  };
  async function send(url:string,payload:Record<string,unknown>,method="PATCH"){
    const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const result=await response.json() as {error?:string;draft?:{id:string;baseUpdatedAt?:string;status:PartnerDraftStatus};success?:boolean};
    if(!response.ok)throw new Error(result.error??"Záznam sa nepodarilo uložiť.");
    return result;
  }
  async function save(){
    if(!editable)throw new Error("Tento koncept už nie je možné upravovať.");
    if(!id){
      const result=await send("/api/partner/canonical-drafts",{resourceType:type,data:body()},"POST");
      if(!result.draft)throw new Error("Server nevrátil ID konceptu.");
      setId(result.draft.id);
      setRevision(result.draft.baseUpdatedAt??"");
      setStatus(result.draft.status);
      baseline.current=JSON.stringify(values);
      return {id:result.draft.id,revision:result.draft.baseUpdatedAt??""};
    }
    if(dirty){
      const result=await send("/api/partner/canonical-drafts/"+encodeURIComponent(id),
        {action:"SAVE",data:body(),baseUpdatedAt:revision});
      if(!result.draft)throw new Error("Server nevrátil nový stav konceptu.");
      setRevision(result.draft.baseUpdatedAt??revision);
      baseline.current=JSON.stringify(values);
      return {id,revision:result.draft.baseUpdatedAt??revision};
    }
    return {id,revision};
  }
  async function perform(action:"SAVE"|"SUBMIT"){
    if(busy)return;
    setBusy(true);setError("");setSuccess("");
    try{
      const saved=await save();
      if(action==="SUBMIT"){
        if(!["DRAFT","RETURNED"].includes(status))throw new Error("Žiadosť už bola odoslaná na schválenie.");
        await send("/api/partner/canonical-drafts/"+encodeURIComponent(saved.id),{action:"SUBMIT"});
        setStatus("SUBMITTED");
        router.push("/partner/ziadosti");
        router.refresh();
      }else{
        setSuccess("Koncept je uložený v Psipedii.");
        if(!initial)router.replace("/partner/koncepty/"+encodeURIComponent(saved.id));
        router.refresh();
      }
    }catch(e){setError(e instanceof Error?e.message:"Zmeny nebolo možné uložiť.");}
    finally{setBusy(false);}
  }
  return <div className="partner-profile-edit-form">
    {initial?.returnReason&&status==="RETURNED"&&
      <p role="status" className="partner-field-error">Vrátené na doplnenie: {initial.returnReason}</p>}
    <p>Vyplňte len údaje, ktoré poznáte. Ostatné verejné polia môžete doplniť neskôr.
      Záznam zostane neverejný, kým ho administrátor neschváli.</p>
    <label className="partner-field"><span>Druh záznamu</span>
      <select value={type} disabled={Boolean(id)} onChange={event=>{
        const next=event.target.value as PartnerCanonicalType;
        setType(next);setValues(initialValues(next));baseline.current=JSON.stringify(initialValues(next));
      }}>
        {types.map(([value,label])=><option value={value} key={value}>{label}</option>)}
      </select>
    </label>
    <div className="partner-form-grid">
      {fields[type].map(field=>{
        const value=values[field.key]??"";
        const change=(next:string)=>setValues(previous=>({...previous,[field.key]:next}));
        const options=field.key==="category"&&type==="DIRECTORY_PROFILE"
          ?categories.map(c=>[c.slug,c.label] as [string,string]):field.options;
        const required=field.key==="category"||field.key==="type"&&
          (type==="HELP_ORGANIZATION"||type==="LOST_FOUND_DOG");
        return <label key={field.key} className="partner-field">
          <span>{field.label}{required?" *":""}</span>
          {options?<select value={value} disabled={!editable} onChange={e=>change(e.target.value)}>
            {required&&field.key==="category"&&<option value="">Vybrať kategóriu</option>}
            {options.map(([v,label])=><option value={v} key={v}>{label}</option>)}
          </select>:
          field.multiline?<textarea rows={field.key==="description"?6:3}
            disabled={!editable} value={value} onChange={e=>change(e.target.value)} />:
          <input value={value} disabled={!editable} maxLength={20000}
            onChange={e=>change(e.target.value)} />}
        </label>;
      })}
    </div>
    <div className="partner-form-actions">
      <button type="button" disabled={busy||!editable} onClick={()=>perform("SAVE")}>
        {busy?"Ukladám…":"Uložiť koncept"}
      </button>
      <button type="button" disabled={busy||!editable||Boolean(id&&status!=="DRAFT"&&status!=="RETURNED")}
        onClick={()=>perform("SUBMIT")}>
        Odoslať na schválenie
      </button>
    </div>
    {success&&<p role="status">{success}</p>}
    {error&&<p role="alert" className="partner-field-error">{error}</p>}
  </div>;
}
