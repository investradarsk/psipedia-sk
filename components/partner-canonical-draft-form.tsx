"use client";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { flushSync } from "react-dom";
import { useMemo,useState } from "react";
import { PartnerMediaField } from "@/components/partner-media-field";
import { PartnerGalleryField } from "@/components/partner-gallery-field";
import { usePartnerUnsavedGuard } from "@/lib/use-partner-unsaved-guard";
import type { PartnerCanonicalType,PartnerDraftStatus } from "@/lib/partner-canonical-workflow";
import type { CanonicalFormField } from "@/lib/partner-canonical-form-fields";
import { partnerFieldOptionLabel } from "@/lib/partner-field-option-labels";
import { getPartnerLostFoundSubmitIssue, partnerLostFoundTimeForInput, partnerLostFoundTimeForSave } from "@/lib/partner-lost-found-intake";

const types:ReadonlyArray<[PartnerCanonicalType,string]>=[
  ["DIRECTORY_PROFILE","Služba pre psov"],["HELP_ORGANIZATION","Organizácia"],
  ["MANAGED_EVENT","Podujatie"],["ADOPTION_DOG","Adopcia"],
  ["LOST_FOUND_DOG","Stratený / nájdený pes"],["HELP_CASE","Pomoc psom"],
];
const labels:Record<string,string>={
  DRAFT:"Rozpracovaný súkromný koncept",RETURNED:"Vrátené na doplnenie",
  SUBMITTED:"Čaká na prvé schválenie",PENDING_REVIEW:"Kontroluje sa",
  QUARANTINED:"Vyžaduje ďalšiu kontrolu",APPROVED:"Schválené",REJECTED:"Zamietnuté",
};
type Draft={
  id:string;resourceType:PartnerCanonicalType;status:PartnerDraftStatus;
  values:Record<string,unknown>;baseUpdatedAt:string;returnReason?:string|null;
  media?:{coverId:string|null;galleryIds:string[]};
};
type Props={
  categories:ReadonlyArray<{slug:string;label:string}>;
  definitions:Record<PartnerCanonicalType,CanonicalFormField[]>;
  initial?:Draft;initialType?:PartnerCanonicalType;initialReportType?:"LOST"|"FOUND";
};
function initialValues(type:PartnerCanonicalType,definitions:Props["definitions"],from:Record<string,unknown>={}){
  const values:Record<string,string|boolean>={};
  for(const field of definitions[type]){
    const value=from[field.key];
    if(field.key==="galleryUrls"||field.key==="additionalCategories")continue;
    if(field.kind==="checkbox")values[field.key]=value===true||value===1;
    else if(field.kind==="nullableBoolean")
      values[field.key]=value===null||value===""||value===undefined?"UNKNOWN":value===true||value===1?"YES":"NO";
    else if(field.kind==="list")
      values[field.key]=Array.isArray(value)?value.map(String).join("\n"):typeof value==="string"?value:"";
    else if(field.kind==="datetime-local")values[field.key]=partnerLostFoundTimeForInput(String(value??""));
    else if(value!==null&&value!==undefined)values[field.key]=String(value);
    else if(field.key==="countryCode")values[field.key]="SK";
    else if(field.key==="public_location_precision")values[field.key]="MUNICIPALITY";
    else if(field.kind==="select"&&field.options?.includes("UNKNOWN"))values[field.key]="UNKNOWN";
    else if(field.required&&field.options?.length&&field.key!=="category")values[field.key]=field.options[0];
    else values[field.key]="";
  }
  return values;
}
function jsonSnapshot(values:Record<string,string|boolean>,coverId:string|null,galleryIds:string[],
  galleryUrls:string[],additionalCategories:string[]){
  return JSON.stringify({values,coverId,galleryIds,galleryUrls,additionalCategories});
}
function display(value:string|boolean|undefined){return typeof value==="string"?value:"";}
function isGallery(type:PartnerCanonicalType){
  return ["DIRECTORY_PROFILE","HELP_ORGANIZATION","ADOPTION_DOG","LOST_FOUND_DOG"].includes(type);
}
function mediaIntent(type:PartnerCanonicalType){
  return type==="MANAGED_EVENT"?"PARTNER_EVENT_CREATE" as const:
    type==="DIRECTORY_PROFILE"||type==="HELP_ORGANIZATION"?"PARTNER_PROFILE_CREATE" as const:
    "PARTNER_HELP_UPDATE" as const;
}
export function PartnerCanonicalDraftForm({categories,definitions,initial,initialType="DIRECTORY_PROFILE",initialReportType}:Props){
  const router=useRouter();
  const [type,setType]=useState<PartnerCanonicalType>(initial?.resourceType??initialType);
  const [values,setValues]=useState<Record<string,string|boolean>>(
    ()=>initialValues(initial?.resourceType??initialType,definitions,
      initial?.values??(initialType==="LOST_FOUND_DOG"&&initialReportType?{type:initialReportType}:{})));
  const [id,setId]=useState<string|null>(initial?.id??null);
  const [revision,setRevision]=useState(initial?.baseUpdatedAt??"");
  const [status,setStatus]=useState<PartnerDraftStatus>(initial?.status??"DRAFT");
  const [coverId,setCoverId]=useState<string|null>(initial?.media?.coverId??null);
  const [galleryIds,setGalleryIds]=useState<string[]>(initial?.media?.galleryIds??[]);
  const [galleryUrls,setGalleryUrls]=useState<string[]>(
    Array.isArray(initial?.values.galleryUrls)?initial.values.galleryUrls.filter((v):v is string=>typeof v==="string"):[]);
  const [additionalCategories,setAdditionalCategories]=useState<string[]>(
    Array.isArray(initial?.values.additionalCategories)
      ?initial.values.additionalCategories.filter((v):v is string=>typeof v==="string"):[]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [duplicateReview,setDuplicateReview]=useState(false);
  const [success,setSuccess]=useState("");
  const [showPreview,setShowPreview]=useState(false);
  const [baseline,setBaseline]=useState(()=>jsonSnapshot(values,coverId,galleryIds,galleryUrls,additionalCategories));
  const dirty=useMemo(()=>jsonSnapshot(values,coverId,galleryIds,galleryUrls,additionalCategories)!==baseline,
    [values,coverId,galleryIds,galleryUrls,additionalCategories,baseline]);
  usePartnerUnsavedGuard(dirty);
  const editable=["DRAFT","RETURNED"].includes(status);
  const submitted=!["DRAFT","RETURNED"].includes(status);
  function setField(key:string,value:string|boolean){
    setValues(previous=>({...previous,[key]:value,...(key==="type"&&value==="FOUND"?{last_seen_date_time:""}:{})}));
    setSuccess("");setDuplicateReview(false);
  }
  function switchType(next:PartnerCanonicalType){
    if(dirty&&!window.confirm("Máte neuložené zmeny. Zmeniť druh záznamu a zahodiť ich?"))return;
    setType(next);
    const blank=initialValues(next,definitions);
    setValues(blank);setCoverId(null);setGalleryIds([]);setGalleryUrls([]);setAdditionalCategories([]);
    setBaseline(jsonSnapshot(blank,null,[],[],[]));
    setError("");setSuccess("");setDuplicateReview(false);
  }
  function payload(){
    const data:Record<string,unknown>={};
    for(const field of definitions[type]){
      if(field.categoryScope&&field.categoryScope!==values.category)continue;
      if(field.key==="galleryUrls"){data.galleryUrls=galleryUrls;continue;}
      if(field.key==="additionalCategories"){data.additionalCategories=additionalCategories;continue;}
      const raw=values[field.key];
      if(field.kind==="list")data[field.key]=display(raw).split("\n").map(x=>x.trim()).filter(Boolean);
      else if(field.kind==="number")data[field.key]=display(raw).trim()===""?null:Number(raw);
      else if(field.kind==="datetime-local")data[field.key]=partnerLostFoundTimeForSave(display(raw));
      else if(field.kind==="nullableBoolean")data[field.key]=raw==="UNKNOWN"?null:raw==="YES";
      else if(field.kind==="checkbox")data[field.key]=raw===true;
      else data[field.key]=display(raw);
    }
    if(type==="DIRECTORY_PROFILE")data.category=display(values.category);
    if(type==="LOST_FOUND_DOG"&&values.type==="FOUND")data.last_seen_date_time="";
    if(isGallery(type))data.galleryUrls=galleryUrls;
    return data;
  }
  function validate(){
    const technical=type==="DIRECTORY_PROFILE"?"category":
      type==="HELP_ORGANIZATION"||type==="LOST_FOUND_DOG"?"type":
      type==="HELP_CASE"?"category":null;
    if(technical&&!display(values[technical]).trim())throw new Error("Vyberte kategóriu alebo typ záznamu.");
    if(galleryUrls.length+galleryIds.length>6)throw new Error("Galéria môže mať najviac 6 fotografií.");
  }
  type Saved={id:string;baseUpdatedAt:string;status:PartnerDraftStatus;media?:{coverId:string|null;galleryIds:string[]}};
  async function send(url:string,body:Record<string,unknown>,method="PATCH"){
    const response=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
    const result=await response.json() as {error?:string;code?:string;draft?:Saved};
    if(!response.ok){
      const failure=new Error(result.error??"Zápis sa nepodarilo uložiť.") as Error&{code?:string};
      failure.code=result.code;
      throw failure;
    }
    return result;
  }
  async function save(){
    validate();
    if(!id){
      const result=await send("/api/partner/canonical-drafts",{resourceType:type,data:payload()},"POST");
      if(!result.draft?.id)throw new Error("Koncept sa nepodarilo vytvoriť. Skúste to znova.");
      setId(result.draft.id);setRevision(result.draft.baseUpdatedAt);
      setStatus(result.draft.status);
      setBaseline(jsonSnapshot(values,coverId,galleryIds,galleryUrls,additionalCategories));
      return result.draft.id;
    }
    if(dirty){
      const result=await send("/api/partner/canonical-drafts/"+encodeURIComponent(id),{
        action:"SAVE",data:payload(),baseUpdatedAt:revision,
        media:{coverId,galleryIds},
      });
      if(!result.draft)throw new Error("Koncept sa nepodarilo uložiť. Skúste to znova.");
      setRevision(result.draft.baseUpdatedAt);
      setStatus(result.draft.status);
      setBaseline(jsonSnapshot(values,coverId,galleryIds,galleryUrls,additionalCategories));
    }
    return id;
  }
  async function perform(action:"SAVE"|"SUBMIT",confirmDuplicate=false){
    if(busy||!editable)return;
    setBusy(true);setError("");setSuccess("");
    try{
      if(action==="SUBMIT"&&type==="LOST_FOUND_DOG"){
        const issue=getPartnerLostFoundSubmitIssue(payload());
        if(issue)throw new Error(issue.message);
      }
      const draftId=await save();
      if(action==="SUBMIT"){
        if(submitted)throw new Error("Tento koncept už bol odoslaný.");
        await send("/api/partner/canonical-drafts/"+encodeURIComponent(draftId),{action:"SUBMIT",confirmDuplicate});
        flushSync(() => {
          setBaseline(jsonSnapshot(values, coverId, galleryIds, galleryUrls, additionalCategories));
          setStatus("SUBMITTED");
        });
        // Load the request list from the server after the submission is committed.
        window.location.assign("/partner/ziadosti");
        return;
      }
      setSuccess("Všetky zadané polia aj fotografie boli uložené do súkromného konceptu.");
      if(!initial){
        // Do not refresh the creating route while replace is still pending:
        // that loses the successful transition despite HTTP 201 from D1.
        router.replace("/partner/koncepty/"+encodeURIComponent(draftId));
        return;
      }
      router.refresh();
    }catch(err){
      if(err instanceof Error&&"code" in err&&err.code==="DUPLICATE_CONFIRMATION_REQUIRED"){
        setDuplicateReview(true);setError("");
      }else setError(err instanceof Error?err.message:"Uloženie zlyhalo.");
    }
    finally{setBusy(false);}
  }
  const first=display(values.name)||display(values.title)||display(values.dog_name)||display(values.dogName)||"Zatiaľ bez názvu";
  const subtitle=display(values.excerpt)||display(values.short_description)||display(values.shortDescription)||display(values.description);
  const place=[display(values.city),display(values.region)].filter(Boolean).join(", ");
  const category=type==="DIRECTORY_PROFILE"?
    categories.find(c=>c.slug===values.category)?.label??"":partnerFieldOptionLabel(display(values.category)||display(values.type));
  return <div className="partner-canonical-workspace">
    <div className="partner-canonical-intro">
      <p>Vyplňte údaje, ktoré poznáte. Koncept zostane súkromný a na stránke sa zobrazí až po schválení.</p>
      {!editable&&["SUBMITTED","PENDING_REVIEW","QUARANTINED"].includes(status)&&<p role="status">Podanie čaká na redakčné rozhodnutie. Úpravy budú dostupné až po vrátení na doplnenie.</p>}
      <span className="partner-canonical-status" role="status">{labels[status]??"Stav návrhu"}</span>
      {initial?.returnReason&&status==="RETURNED"&&
        <p role="alert" className="partner-field-error">Na doplnenie: {initial.returnReason}</p>}
    </div>
    {type==="LOST_FOUND_DOG"&&<div className="partner-canonical-intro" role="note">
      <p><strong>Súkromný kontakt:</strong> redakcia vás kontaktuje cez overený Partner účet a jeho súkromné správy. Údaje z účtu sa do verejných kontaktov neprenášajú.</p>
      <p>Verejný telefón alebo e-mail vyplňte iba vtedy, ak ich chcete zobraziť návštevníkom. Na odoslanie potrebujeme dátum, kraj, obec a opis udalosti; pri stratenom psovi aj čas posledného videnia.</p>
      <p><Link href="/partner/nastavenia">Skontrolovať moje súkromné kontaktné údaje</Link></p>
    </div>}
    <form onSubmit={event=>{event.preventDefault();void perform("SAVE");}} className="partner-profile-edit-form partner-canonical-form">
      <label className="partner-field"><span>Druh záznamu</span>
        <select value={type} disabled={Boolean(id)||busy} onChange={event=>switchType(event.target.value as PartnerCanonicalType)}>
          {types.map(([value,label])=><option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <div className="partner-profile-edit-grid">
        {definitions[type].filter(field=>(field.categoryScope===undefined||field.categoryScope===values.category)
          &&!(type==="LOST_FOUND_DOG"&&field.key==="last_seen_date_time"&&values.type==="FOUND"))
          .map(field=>{
          if(field.key==="galleryUrls")return null;
          if(field.key==="additionalCategories"){
            if(type!=="DIRECTORY_PROFILE")return null;
            return <fieldset key={field.key} className="partner-field partner-field--wide partner-canonical-categories" disabled={!editable||busy}>
              <legend>Ďalšie kategórie profilu</legend>
              <div className="partner-canonical-categories-grid">
                {categories.filter(item=>item.slug!==values.category).map(item=><label key={item.slug}>
                  <input type="checkbox" checked={additionalCategories.includes(item.slug)}
                    onChange={e=>setAdditionalCategories(old=>e.target.checked?[...old,item.slug]:old.filter(x=>x!==item.slug))}/>
                  <span>{item.label}</span>
                </label>)}
              </div>
            </fieldset>;
          }
          const value=values[field.key]??"";
          const disabled=!editable||busy;
          const options=field.key==="category"&&type==="DIRECTORY_PROFILE"?
            categories.map(x=>[x.slug,x.label] as [string,string]):
            field.options?.map(x=>[x,partnerFieldOptionLabel(x)] as [string,string])??[];
          const className="partner-field"+(["textarea","list"].includes(field.kind)?" partner-field--wide":"");
          return <label key={field.key} className={className}>
            <span>{field.label}{field.required?" *":""}</span>
            {field.kind==="checkbox"?
              <span className="partner-profile-check"><input type="checkbox" checked={value===true}
                disabled={disabled} onChange={event=>setField(field.key,event.target.checked)}/><span>Áno</span></span>:
            field.kind==="nullableBoolean"?
              <select value={display(value)} disabled={disabled} onChange={e=>setField(field.key,e.target.value)}>
                <option value="UNKNOWN">Neviem</option><option value="YES">Áno</option><option value="NO">Nie</option>
              </select>:
            field.kind==="select"?
              <select value={display(value)} required={field.required} disabled={disabled} onChange={e=>setField(field.key,e.target.value)}>
                <option value="">Vyberte…</option>
                {options.map(([opt,label])=><option key={opt} value={opt}>{label}</option>)}
              </select>:
            field.kind==="textarea"||field.kind==="list"?
              <textarea rows={field.kind==="list"?4:field.key==="description"?7:4}
                maxLength={field.max??20000} value={display(value)} disabled={disabled}
                onChange={e=>setField(field.key,e.target.value)}/>:
              <input value={display(value)} disabled={disabled} type={field.kind==="date"?"date":field.kind==="time"?"time":
                  field.kind==="datetime-local"?"datetime-local":field.kind==="number"?"number":"text"}
                min={field.minimum} max={field.maximum} step={field.kind==="number"?"any":undefined}
                maxLength={field.max??20000} onChange={e=>setField(field.key,e.target.value)}/>}
            {field.kind==="list"&&<small>Každú položku zadajte na samostatný riadok.</small>}
          </label>;
        })}
      </div>
      <div className="partner-canonical-media">
        {id?<><PartnerMediaField key={type} label="Hlavná fotografia" intent={mediaIntent(type)}
          privateDraft currentImageUrl={coverId?"/api/partner/media/"+encodeURIComponent(coverId):null}
          onChange={setCoverId} disabled={!editable||busy}/>
          {coverId&&<button className="button button--ghost" type="button" disabled={!editable||busy}
            onClick={()=>setCoverId(null)}>Odstrániť hlavnú fotografiu z konceptu</button>}
          {isGallery(type)&&<PartnerGalleryField key={id} initialUrls={galleryUrls}
            initialUploads={initial?.media?.galleryIds.map(mediaId=>({
              id:mediaId,previewUrl:"/api/partner/media/"+encodeURIComponent(mediaId),
              originalMime:"image/webp",sizeBytes:0,persisted:true,
            }))??[]}
            mediaIntent={mediaIntent(type)}
            onChangeUrls={setGalleryUrls} onChangeMediaIds={setGalleryIds}
            disabled={!editable||busy}/>}
        </>:<p className="partner-canonical-media-help">Fotografie a galériu môžete nahrať po prvom uložení konceptu. Najprv kliknite na „Uložiť koncept“.</p>}
      </div>
      <div className="partner-canonical-preview-toggle">
        <button type="button" className="button button--ghost" onClick={()=>setShowPreview(x=>!x)}>
          {showPreview?"Skryť súkromný náhľad":"Zobraziť súkromný náhľad"}
        </button>
      </div>
      {showPreview&&<section className="partner-canonical-preview" aria-label="Súkromný náhľad záznamu">
        <small>Súkromný náhľad – nikto na verejnom webe ho nevidí</small>
        {coverId&&<img src={"/api/partner/media/"+encodeURIComponent(coverId)} alt="Hlavná fotografia návrhu"/>}
        <h2>{first}</h2>{category&&<p>{category}</p>}{place&&<p>{place}</p>}
        {subtitle&&<p>{subtitle.slice(0,1200)}</p>}
        <small>{galleryUrls.length+galleryIds.length} fotografií v galérii</small>
      </section>}
      <div className="partner-profile-edit-submit partner-canonical-actions">
        <div><strong>{dirty?"Máte neuložené zmeny.":"Všetky uložené údaje zostávajú súkromné."}</strong>
          {editable && <p>Po odoslaní môžete návrh upraviť, ak ho redakcia vráti na doplnenie.</p>}</div>
        <div className="partner-canonical-buttons">
          <button type="submit" className="button" disabled={!editable||busy}>{busy?"Ukladám…":"Uložiť koncept"}</button>
          {!submitted&&<button type="button" className="button button--dark" disabled={!editable||busy}
            onClick={()=>void perform("SUBMIT")}>Odoslať na schválenie</button>}
        </div>
      </div>
      {duplicateReview&&!submitted&&<div role="alert" className="partner-form-message is-error">
        <p>Našli sme podobný záznam. Pred odoslaním skontrolujte, či už neexistuje.
          {(type==="DIRECTORY_PROFILE"||type==="HELP_ORGANIZATION")&&<Link href="/partner/prevziat"> Požiadať o správu existujúceho profilu</Link>}
          {" "}Potvrdenie znamená len odoslanie na redakčnú kontrolu, nie zverejnenie.</p>
        <button type="button" className="button button--dark" disabled={busy}
          onClick={()=>void perform("SUBMIT",true)}>Skontroloval som to – napriek tomu odoslať</button>
      </div>}
      {error&&<p role="alert" className="partner-form-message is-error">{error}</p>}
      {success&&<p role="status" className="partner-form-message is-success">{success}</p>}
    </form>
  </div>;
}
