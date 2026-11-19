"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { HelpEditorField, HelpEditorValue } from "@/lib/partner-help-editor-fields";

type Props = {
  resourceId: string;
  fields: readonly HelpEditorField[];
  originalValues: Record<string, HelpEditorValue>;
  initialRevision: string;
  imageUrl: string | null;
  gallery: string[];
};
function asInputValue(field: HelpEditorField, value: HelpEditorValue) {
  if(field.kind==="checkbox")return value===true;
  if(field.kind==="number")return typeof value==="number"?String(value):"";
  return typeof value==="string"?value:"";
}
function asApiValue(field:HelpEditorField,value:string|boolean){
  if(field.kind==="checkbox")return value === true;
  if(field.kind==="number")return String(value).trim() === ""?null:Number(value);
  return String(value);
}
export function PartnerHelpPublicEditorForm({resourceId,fields,originalValues,initialRevision,imageUrl,gallery}:Props) {
  const initial = () => Object.fromEntries(fields.map(field=>[field.key,asInputValue(field,originalValues[field.key])])) as Record<string,string|boolean>;
  const [values,setValues] = useState<Record<string,string|boolean>>(initial);
  const [baseline,setBaseline] = useState<Record<string,string|boolean>>(initial);
  const [revision,setRevision] = useState(initialRevision);
  const [state,setState] = useState<"idle"|"sending"|"success"|"error">("idle");
  const [message,setMessage] = useState("");

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(state==="sending")return;
    const patch:Record<string,string|number|boolean|null> = {};
    for(const field of fields) {
      const before=asApiValue(field,baseline[field.key]);
      const after=asApiValue(field,values[field.key]);
      if(JSON.stringify(before)!==JSON.stringify(after))patch[field.key]=after;
    }
    if(!Object.keys(patch).length) {setState("error");setMessage("Nezmenili ste žiadny údaj.");return;}
    setState("sending");setMessage("");
    try{
      const response=await fetch(`/api/partner/help-records/${encodeURIComponent(resourceId)}`,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({baseRevision:revision,patch}),
      });
      const data=await response.json() as {error?:string;result?:{baseRevision:string}};
      if(!response.ok||!data.result)throw new Error(data.error??"Uloženie sa nepodarilo.");
      setRevision(data.result.baseRevision);
      setBaseline({...values});
      setState("success");
      setMessage("Verejné údaje boli uložené. Ak sa na webe nezobrazia hneď, obnovte stránku.");
    }catch(error){setState("error");setMessage(error instanceof Error?error.message:"Uloženie zlyhalo.");}
  }
  return <form className="partner-profile-edit-form" onSubmit={submit}>
    <div className="partner-profile-edit-grid">
      {fields.map(field=><label className={`partner-field ${field.kind==="textarea"?"partner-field--wide":""}`} key={field.key}>
        <span>{field.label}{field.required?" *":""}</span>
        {field.kind==="checkbox"?<span className="partner-profile-check"><input type="checkbox" checked={values[field.key]===true}
          onChange={e=>{setValues(v=>({...v,[field.key]:e.target.checked}));setState("idle");}}/>{field.label}</span>:
        field.kind==="select"?<select value={String(values[field.key]??"")} required={field.required}
          onChange={e=>{setValues(v=>({...v,[field.key]:e.target.value}));setState("idle");}}>
          {(field.options??[]).map(option=><option key={option} value={option}>{option}</option>)}
        </select>:
        field.kind==="textarea"?<textarea rows={5} maxLength={field.max} required={field.required}
          value={String(values[field.key]??"")} onChange={e=>{setValues(v=>({...v,[field.key]:e.target.value}));setState("idle");}}/>:
        <input type={field.kind==="date"?"date":field.kind==="number"?"number":"text"}
          step={field.kind==="number"?"any":undefined} min={field.minimum} max={field.maximum}
          maxLength={field.max} required={field.required} value={String(values[field.key]??"")}
          onChange={e=>{setValues(v=>({...v,[field.key]:e.target.value}));setState("idle");}}/>}
      </label>)}
    </div>
    {imageUrl||gallery.length?<section className="partner-media-field"><strong>Aktuálne fotografie</strong>
      <p>Fotografie a galériu zatiaľ nemení tento formulár. Všetky existujúce fotografie zostanú zachované.</p>
      <div className="partner-resource-grid">{[imageUrl,...gallery].filter((url):url is string=>Boolean(url)).map((url,i)=><img key={i} src={url} alt={i===0?"Hlavná fotografia":"Fotografia galérie"} style={{maxWidth:160,maxHeight:150,objectFit:"cover"}}/>)}</div>
    </section>:null}
    <div className="partner-profile-edit-submit"><div><strong>Priame uloženie verejných údajov</strong>
      <p>Úpravy sa ukladajú do existujúceho záznamu. Interné a SEO polia zostávajú nedotknuté.</p></div>
      <button type="submit" className="button button--dark" disabled={state==="sending"}>{state==="sending"?"Ukladám…":"Uložiť zmeny"}</button>
    </div>
    {message?<p role="status" className={`partner-form-message ${state==="success"?"is-success":"is-error"}`}>{message}
      {state==="success"?<> <Link href="/partner/profily">Späť na profily →</Link></>:null}</p>:null}
  </form>;
}
