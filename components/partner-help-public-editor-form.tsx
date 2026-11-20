"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { HelpEditorField, HelpEditorType, HelpEditorValue } from "@/lib/partner-help-editor-fields";
import { PartnerMediaField } from "@/components/partner-media-field";
import { usePartnerUnsavedGuard } from "@/lib/use-partner-unsaved-guard";
import { PartnerGalleryField } from "@/components/partner-gallery-field";
import { partnerFieldOptionLabel } from "@/lib/partner-field-option-labels";

type Props = {
  resourceId: string;
  entityType: HelpEditorType;
  fields: readonly HelpEditorField[];
  originalValues: Record<string, HelpEditorValue>;
  initialRevision: string;
  imageUrl: string | null;
  gallery: string[];
};
function asInputValue(field: HelpEditorField, value: HelpEditorValue) {
  if(field.kind==="checkbox")return value===true;
  if(field.kind==="nullableBoolean")return value===null?"UNKNOWN":value===true?"YES":"NO";
  if(field.kind==="number")return typeof value==="number"?String(value):"";
  return typeof value==="string"?value:"";
}
function asApiValue(field:HelpEditorField,value:string|boolean){
  if(field.kind==="checkbox")return value === true;
  if(field.kind==="nullableBoolean")return value==="UNKNOWN"?null:value==="YES";
  if(field.kind==="number")return String(value).trim() === ""?null:Number(value);
  return String(value);
}
export function PartnerHelpPublicEditorForm({resourceId,entityType,fields,originalValues,initialRevision,imageUrl,gallery}:Props) {
  const initial = () => Object.fromEntries(fields.map(field=>[field.key,asInputValue(field,originalValues[field.key])])) as Record<string,string|boolean>;
  const [values,setValues] = useState<Record<string,string|boolean>>(initial);
  const [baseline,setBaseline] = useState<Record<string,string|boolean>>(initial);
  const [revision,setRevision] = useState(initialRevision);
  const [state,setState] = useState<"idle"|"sending"|"success"|"error">("idle");
  const [message,setMessage] = useState("");
  const [mediaAssetId,setMediaAssetId] = useState<string|null>(null);
  const [galleryUrls,setGalleryUrls] = useState<string[]>(gallery);
  const [galleryMediaIds,setGalleryMediaIds] = useState<string[]>([]);

  const dirty=JSON.stringify(values)!==JSON.stringify(baseline)
    ||Boolean(mediaAssetId)||galleryMediaIds.length>0||JSON.stringify(galleryUrls)!==JSON.stringify(gallery);
  usePartnerUnsavedGuard(dirty,state!=="success");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if(state==="sending")return;
    const patch:Record<string,string|number|boolean|null> = {};
    for(const field of fields) {
      const before=asApiValue(field,baseline[field.key]);
      const after=asApiValue(field,values[field.key]);
      if(JSON.stringify(before)!==JSON.stringify(after))patch[field.key]=after;
    }
    const galleryEdited = JSON.stringify(galleryUrls)!==JSON.stringify(gallery) || galleryMediaIds.length>0;
    if(!Object.keys(patch).length && !mediaAssetId && !galleryEdited) {setState("error");setMessage("Nezmenili ste žiadny údaj.");return;}
    setState("sending");setMessage("");
    try{
      const response=await fetch(`/api/partner/help-records/${encodeURIComponent(resourceId)}`,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({baseRevision:revision,patch,mediaAssetId,
          ...(galleryEdited?{galleryUrls,galleryMediaIds}:{}),
        }),
      });
      const data=await response.json() as {error?:string;result?:{baseRevision:string}};
      if(!response.ok||!data.result)throw new Error(data.error??"Uloženie sa nepodarilo.");
      setRevision(data.result.baseRevision);
      setBaseline({...values});
      setState("success");
      setMessage("Zmeny sú uložené. Pred ďalšou úpravou obnovte editor, aby ste pracovali s aktuálnou verziou.");
    }catch(error){setState("error");setMessage(error instanceof Error?error.message:"Uloženie zlyhalo.");}
  }
  return <form className="partner-profile-edit-form" onSubmit={submit}>
    <div className="partner-profile-edit-grid">
      {fields.map(field=><label className={`partner-field ${field.kind==="textarea"?"partner-field--wide":""}`} key={field.key}>
        <span>{field.label}{field.required?" *":""}</span>
        {field.kind==="checkbox"?<span className="partner-profile-check"><input type="checkbox" checked={values[field.key]===true}
          onChange={e=>{setValues(v=>({...v,[field.key]:e.target.checked}));if(state!=="success")setState("idle");}}/>{field.label}</span>:
        field.kind==="nullableBoolean"?<select value={String(values[field.key]??"UNKNOWN")}
          onChange={e=>{setValues(v=>({...v,[field.key]:e.target.value}));if(state!=="success")setState("idle");}}>
          <option value="UNKNOWN">Neviem</option><option value="YES">Áno</option><option value="NO">Nie</option>
        </select>:
        field.kind==="select"?<select value={String(values[field.key]??"")} required={field.required}
          onChange={e=>{setValues(v=>({...v,[field.key]:e.target.value}));setState("idle");}}>
          {(field.options??[]).map(option=><option key={option} value={option}>{partnerFieldOptionLabel(option)}</option>)}
        </select>:
        field.kind==="textarea"?<textarea rows={5} maxLength={field.max} required={field.required}
          value={String(values[field.key]??"")} onChange={e=>{setValues(v=>({...v,[field.key]:e.target.value}));setState("idle");}}/>:
        <input type={field.kind==="date"?"date":field.kind==="number"?"number":"text"}
          step={field.kind==="number"?"any":undefined} min={field.minimum} max={field.maximum}
          maxLength={field.max} required={field.required} value={String(values[field.key]??"")}
          onChange={e=>{setValues(v=>({...v,[field.key]:e.target.value}));setState("idle");}}/>}
      </label>)}
    </div>
    <PartnerMediaField label="Hlavná fotografia" intent="PARTNER_HELP_UPDATE"
      directPublish currentImageUrl={imageUrl} onChange={setMediaAssetId}
      disabled={state==="sending"||state==="success"}/>
    {entityType !== "HELP_CASE" ? <PartnerGalleryField
      initialUrls={gallery}
      onChangeUrls={setGalleryUrls}
      onChangeMediaIds={setGalleryMediaIds}
      mediaIntent="PARTNER_HELP_UPDATE" directPublish
      disabled={state==="sending"||state==="success"}/> : null}
    <div className="partner-profile-edit-submit"><div><strong>Uložiť úpravy záznamu</strong>
      <p>Zmenené údaje sa po uložení zobrazia na stránke vášho záznamu.</p></div>
      <button type="submit" className="button button--dark" disabled={state==="sending"||state==="success"}>{state==="sending"?"Ukladám…":"Uložiť zmeny"}</button>
    </div>
    {message?<p role="status" className={`partner-form-message ${state==="success"?"is-success":"is-error"}`}>{message}
      {state==="success"?<> <Link href="/partner/profily">Späť na profily →</Link></>:null}</p>:null}
  </form>;
}
