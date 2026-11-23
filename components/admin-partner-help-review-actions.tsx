"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { names, specs } from "@/lib/partner-help-create-form-fields";
import type { PartnerHelpCreateType } from "@/lib/partner-help-create";

type Props={id:string;resourceType:PartnerHelpCreateType;payload:Record<string,unknown>;
  isCanonicalDraft?:boolean;canonicalUpdatedAt?:string|null;};
type Action="CREATE_DRAFT"|"LINK_EXISTING"|"REJECT";
const reasons=[
  {value:"INCORRECT_INFORMATION",label:"Neoverené alebo nesprávne údaje"},
  {value:"DUPLICATE",label:"Duplicitný záznam"},
  {value:"INSUFFICIENT_EVIDENCE",label:"Nedostatočné podklady"},
  {value:"POLICY_CONFLICT",label:"Nesúlad s pravidlami"},
  {value:"OTHER",label:"Iný dôvod"},
] as const;

export function AdminPartnerHelpReviewActions({id,resourceType,payload,isCanonicalDraft=false,canonicalUpdatedAt=null}:Props){
  const router=useRouter();
  const initial=useMemo(()=>Object.fromEntries(
    specs[resourceType].map(field=>[field.key,payload[field.key]===null?"":String(payload[field.key]??"")])
  ) as Record<string,string>,[resourceType,payload]);
  const [values,setValues]=useState<Record<string,string>>(initial);
  const [linkedId,setLinkedId]=useState("");
  const [reason,setReason]=useState("INCORRECT_INFORMATION");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [complete,setComplete]=useState(false);
  const changed=specs[resourceType].filter(field=>values[field.key]!==initial[field.key]).map(field=>field.label);

  async function decide(action:Action,event?:FormEvent<HTMLFormElement>){
    event?.preventDefault();
    if(busy||complete)return;
    let body:Record<string,unknown>={action};
    if(action==="CREATE_DRAFT"){
      if(isCanonicalDraft){
        // A canonical draft already exists: never pass the legacy editedPayload
        // or recreate a second draft; approve exactly the version reviewed.
        body={action,expectedCanonicalUpdatedAt:canonicalUpdatedAt};
      }else{
        const editedPayload=Object.fromEntries(specs[resourceType].map(field=>[
          field.key,field.kind==="number"
            ? (values[field.key]?.trim()?Number(values[field.key]):null)
            : (values[field.key]??""),
        ]));
        body={action,editedPayload};
      }
    }else if(action==="LINK_EXISTING"){
      const idNumber=Number(linkedId);
      if(!Number.isSafeInteger(idNumber)||idNumber<1){setMessage("Zadajte platné ID existujúceho záznamu.");return;}
      if(!window.confirm("Prepojiť návrh s existujúcim záznamom? Navrhované údaje sa do existujúceho záznamu neprepíšu."))return;
      body={action,canonicalId:idNumber};
    }else if(!window.confirm("Zamietnuť tento partnerský návrh?"))return;
    if(action==="REJECT")body={action,reasonCode:reason};
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/admin/partners/help-submissions/${encodeURIComponent(id)}`,{
        method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body),
      });
      const result=await response.json() as {error?:string};
      if(!response.ok)throw new Error(result.error??"Rozhodnutie sa nepodarilo uložiť.");
      setComplete(true);
      setMessage(action==="CREATE_DRAFT"
        ?isCanonicalDraft?"Existujúci koncept bol schválený a publikovaný.":"Koncept vytvorený a správa pridelená. Zverejnenie zostáva samostatným redakčným krokom."
        :action==="LINK_EXISTING"?"Návrh je prepojený s existujúcim záznamom.":"Návrh bol zamietnutý.");
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Uloženie zlyhalo.");}
    finally{setBusy(false);}
  }

  return <div className="admin-partner-detail">
    {isCanonicalDraft?<section className="admin-form-card">
      <h2>Schváliť už vytvorený kanonický koncept</h2>
      <p>Schválenie zverejní existujúci záznam a pridelí správu Partnerovi. Nezakladá ďalší profil. Ak sa údaje od otvorenia stránky zmenili, rozhodnutie sa bezpečne odmietne.</p>
      <button type="button" className="button button--dark" disabled={busy||complete||!canonicalUpdatedAt}
        onClick={()=>void decide("CREATE_DRAFT")}>{busy?"Schvaľujem…":"Schváliť a publikovať"}</button>
    </section>:<section className="admin-form-card">
      <h2>Upraviť údaje pred schválením</h2>
      <p>Upravuje sa iba výsledný koncept. Pôvodný návrh a história moderácie zostanú zachované. SEO, slug a stav publikovania určujú výhradne serverové pravidlá.</p>
      <form className="partner-profile-edit-form" onSubmit={event=>void decide("CREATE_DRAFT",event)}>
        <div className="partner-profile-edit-grid">
          {specs[resourceType].map(field=><label className={`partner-field ${field.kind==="textarea"?"partner-field--wide":""}`} key={field.key}>
            <span>{field.label}{field.required?" *":""}</span>
            {field.kind==="select"?<select value={values[field.key]??""} required={field.required} disabled={busy||complete}
              onChange={event=>setValues(v=>({...v,[field.key]:event.target.value}))}>
              {field.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
            </select>:field.kind==="textarea"?<textarea rows={field.key==="description"?6:3} value={values[field.key]??""}
              required={field.required} disabled={busy||complete} onChange={event=>setValues(v=>({...v,[field.key]:event.target.value}))}/>:
              <input type={field.kind==="date"?"date":field.kind==="number"?"number":"text"}
                min={field.kind==="number"?0:undefined} max={field.kind==="number"?360:undefined}
                value={values[field.key]??""} required={field.required} disabled={busy||complete}
                onChange={event=>setValues(v=>({...v,[field.key]:event.target.value}))}/>}
          </label>)}
        </div>
        {changed.length?<p role="status">Zmenené polia: {changed.join(", ")}</p>:<p>Žiadne redakčné úpravy návrhu.</p>}
        <p>Schválením vznikne <strong>nezverejnený koncept</strong> v sekcii {names[resourceType]} a prístup k jeho správe získa žiadajúci partner.</p>
        <button className="button button--dark" type="submit" disabled={busy||complete}>{busy?"Ukladám…":"Upraviť a schváliť ako koncept"}</button>
      </form>
    </section>}
    {!isCanonicalDraft&&<section className="admin-form-card">
      <h2>Duplicitný záznam — prepojiť existujúci</h2>
      <p>Ak na Psipedii už záznam existuje, zadajte jeho kanonické číselné ID. Vytvorenie duplicity sa preskočí a žiadateľ dostane správu existujúceho záznamu. Žiadne jeho údaje sa tým neprepíšu.</p>
      <label className="partner-field"><span>ID existujúceho záznamu</span>
        <input type="number" min="1" step="1" value={linkedId} disabled={busy||complete}
          onChange={event=>setLinkedId(event.target.value)}/></label>
      <button type="button" disabled={busy||complete||!linkedId} onClick={()=>void decide("LINK_EXISTING")}>Prepojiť existujúci záznam</button>
    </section>}
    <section className="admin-form-card">
      <h2>Zamietnuť návrh</h2>
      <label className="partner-field"><span>Dôvod zamietnutia</span><select value={reason} disabled={busy||complete}
        onChange={event=>setReason(event.target.value)}>{reasons.map(item=><option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <button type="button" disabled={busy||complete} onClick={()=>void decide("REJECT")}>Zamietnuť návrh</button>
    </section>
    {message?<p role={complete?"status":"alert"} className="partner-form-message">{message}</p>:null}
  </div>;
}
