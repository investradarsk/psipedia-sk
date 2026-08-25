"use client";

import Link from "next/link";
import { useState, type ChangeEvent } from "react";
import type { ManagedBreed } from "@/lib/breed-store";
import type { BreedImage, BreedSource } from "@/lib/content";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { AdminSeoFields } from "@/components/admin-seo-fields";
import { breedSeoFallback } from "@/lib/content-seo";

function slugify(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,90);}
function lines(value:string){return value.split("\n").map((item)=>item.replace(/^[-•]\s*/,"").trim()).filter(Boolean);}
const emptySource:BreedSource={label:"",url:""};

export function AdminBreedEditor({ breed }: { breed?: ManagedBreed }) {
  const [form,setForm]=useState({
    name:breed?.name??"",slug:breed?.slug??"",status:breed?.status??"draft",image:breed?.image??"",imageKey:breed?.imageKey??"",
    gallery:breed?.gallery??[],fciGroup:breed?.fciGroup??1,fciSection:breed?.fciSection??"",origin:breed?.origin??"",group:breed?.group??"",
    size:breed?.size??"",weight:breed?.weight??"",height:breed?.height??"",lifespan:breed?.lifespan??"",coat:breed?.coat??"",
    energy:breed?.energy??3,trainability:breed?.trainability??3,children:breed?.children??breed?.family??3,otherDogs:breed?.otherDogs??3,
    apartment:breed?.apartment??3,grooming:breed?.grooming??3,shedding:breed?.shedding??3,preyDrive:breed?.preyDrive??3,
    intro:breed?.intro??"",character:breed?.character??"",needs:breed?.needs??"",history:breed?.history??"",exercise:breed?.exercise??"",
    training:breed?.training??"",health:breed?.health??"",healthRisks:breed?.healthRisks?.join("\n")??"",goodFor:breed?.goodFor.join("\n")??"",
    consider:breed?.consider.join("\n")??"",sources:breed?.sources?.length?breed.sources:[{...emptySource}],accent:breed?.accent??"forest",seo:breed?.seo??{},
  });
  const [slugEdited,setSlugEdited]=useState(Boolean(breed));
  const [saving,setSaving]=useState(false);const [uploading,setUploading]=useState(false);const [message,setMessage]=useState("");const [error,setError]=useState("");
  const change=(key:keyof typeof form,value:(typeof form)[keyof typeof form])=>setForm((current)=>({...current,[key]:value}));
  function changeName(value:string){change("name",value);if(!slugEdited)change("slug",slugify(value));}

  async function uploadCover(event:ChangeEvent<HTMLInputElement>){const file=event.target.files?.[0];if(!file)return;setUploading(true);setError("");try{const result=await uploadAdminImage(file,"breeds");setForm((current)=>({...current,image:result.imageUrl,imageKey:result.imageKey}));setMessage(adminImageUploadMessage(result,"Ulož plemeno, aby sa titulná fotografia priradila."));}catch(e){setError(e instanceof Error?e.message:"Obrázok sa nepodarilo nahrať.");}finally{setUploading(false);event.target.value="";}}
  async function uploadGallery(event:ChangeEvent<HTMLInputElement>){const files=Array.from(event.target.files??[]);if(!files.length)return;setUploading(true);setError("");try{const uploaded:BreedImage[]=[];for(const file of files){const result=await uploadAdminImage(file,"breeds");uploaded.push({imageUrl:result.imageUrl,imageKey:result.imageKey,alt:form.name?`${form.name} – ďalšia fotografia`:"Fotografia plemena",caption:"",credit:""});}setForm((current)=>({...current,gallery:[...current.gallery,...uploaded]}));setMessage(`${uploaded.length} fotografií bolo nahraných. Ulož plemeno, aby sa priradili.`);}catch(e){setError(e instanceof Error?e.message:"Fotografie sa nepodarilo nahrať.");}finally{setUploading(false);event.target.value="";}}
  function updateGallery(index:number,patch:Partial<BreedImage>){setForm((current)=>({...current,gallery:current.gallery.map((item,i)=>i===index?{...item,...patch}:item)}));}
  function moveGallery(index:number,direction:-1|1){setForm((current)=>{const gallery=[...current.gallery];const target=index+direction;if(target<0||target>=gallery.length)return current;[gallery[index],gallery[target]]=[gallery[target],gallery[index]];return {...current,gallery};});}
  function updateSource(index:number,patch:Partial<BreedSource>){setForm((current)=>({...current,sources:current.sources.map((item,i)=>i===index?{...item,...patch}:item)}));}
  async function save(status:"draft"|"published"){setSaving(true);setError("");setMessage("");try{const response=await fetch(breed?`/api/admin/breeds/${breed.id}`:"/api/admin/breeds",{method:breed?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...form,status,family:form.children,healthRisks:lines(form.healthRisks),goodFor:lines(form.goodFor),consider:lines(form.consider),sources:form.sources.filter((item)=>item.label.trim()&&item.url.trim())})});const data=await response.json() as {breed?:ManagedBreed;error?:string};if(!response.ok||!data.breed)throw new Error(data.error||"Plemeno sa nepodarilo uložiť.");setMessage(status==="published"?"Plemeno je publikované v atlase.":"Koncept je uložený.");if(!breed)window.location.assign(`/admin/plemena/${data.breed.id}`);}catch(e){setError(e instanceof Error?e.message:"Plemeno sa nepodarilo uložiť.");}finally{setSaving(false);}}

  const scoreFields=[
    ["energy","Úroveň energie"],["trainability","Cvičiteľnosť"],["children","Vzťah k deťom"],["otherDogs","Vzťah k iným psom"],
    ["apartment","Vhodnosť do bytu"],["grooming","Náročnosť starostlivosti"],["shedding","Pĺznutie"],["preyDrive","Lovecký inštinkt"],
  ] as const;
  const textSections=[
    ["character","Povaha"],["history","História"],["exercise","Potreba pohybu"],["training","Výcvik"],["health","Zdravie"],
  ] as const;

  return <form className="admin-breed-editor" onSubmit={(event)=>{event.preventDefault();void save("draft");}}>
    <section className="admin-form-card"><h2>Identita plemena</h2><div className="admin-field-grid"><label className="admin-field"><span>Názov plemena</span><input required value={form.name} onChange={(e)=>changeName(e.target.value)}/></label><label className="admin-field"><span>URL adresa</span><input required value={form.slug} onChange={(e)=>{setSlugEdited(true);change("slug",e.target.value)}}/></label></div><label className="admin-field"><span>Krátky úvod</span><textarea required rows={4} value={form.intro} onChange={(e)=>change("intro",e.target.value)}/></label></section>

    <section className="admin-form-card"><h2>Základné údaje</h2><div className="admin-field-grid">
      <label className="admin-field"><span>FCI skupina</span><input type="number" min="1" max="10" value={form.fciGroup} onChange={(e)=>change("fciGroup",Number(e.target.value))}/></label>
      <label className="admin-field"><span>FCI sekcia</span><input value={form.fciSection} onChange={(e)=>change("fciSection",e.target.value)}/></label>
      <label className="admin-field"><span>Krajina pôvodu</span><input value={form.origin} onChange={(e)=>change("origin",e.target.value)}/></label>
      <label className="admin-field"><span>Skupina / pôvodné využitie</span><input value={form.group} onChange={(e)=>change("group",e.target.value)}/></label>
      <label className="admin-field"><span>Veľkosť</span><input value={form.size} onChange={(e)=>change("size",e.target.value)}/></label>
      <label className="admin-field"><span>Hmotnosť</span><input value={form.weight} onChange={(e)=>change("weight",e.target.value)}/></label>
      <label className="admin-field"><span>Výška v kohútiku</span><input value={form.height} onChange={(e)=>change("height",e.target.value)}/></label>
      <label className="admin-field"><span>Dĺžka života</span><input value={form.lifespan} onChange={(e)=>change("lifespan",e.target.value)}/></label>
      <label className="admin-field"><span>Srsť</span><input value={form.coat} onChange={(e)=>change("coat",e.target.value)}/></label>
    </div></section>

    <section className="admin-form-card"><h2>Vlastnosti (1–5)</h2><p className="admin-field-help">1 znamená nízku mieru vlastnosti, 5 vysokú.</p><div className="admin-breed-score-grid">{scoreFields.map(([key,label])=><label className="admin-field" key={key}><span>{label}</span><input type="number" min="1" max="5" value={form[key]} onChange={(e)=>change(key,Number(e.target.value))}/></label>)}</div></section>

    <section className="admin-form-card"><h2>Obsah profilu</h2>{textSections.map(([key,label])=><label className="admin-field" key={key}><span>{label}</span><textarea rows={6} value={form[key]} onChange={(e)=>change(key,e.target.value)}/></label>)}<label className="admin-field"><span>Každodenné potreby</span><textarea rows={5} value={form.needs} onChange={(e)=>change("needs",e.target.value)}/></label><label className="admin-field"><span>Typické zdravotné riziká — jedna položka na riadok</span><textarea value={form.healthRisks} onChange={(e)=>change("healthRisks",e.target.value)}/></label><div className="admin-field-grid"><label className="admin-field"><span>Pre koho je vhodný — jedna položka na riadok</span><textarea value={form.goodFor} onChange={(e)=>change("goodFor",e.target.value)}/></label><label className="admin-field"><span>Pre koho nemusí byť vhodný — jedna položka na riadok</span><textarea value={form.consider} onChange={(e)=>change("consider",e.target.value)}/></label></div></section>

    <section className="admin-form-card"><h2>Fotografie</h2><label className="admin-field"><span>Titulná fotografia (JPG, PNG, WebP alebo AVIF do 8 MB)</span><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e)=>void uploadCover(e)} disabled={uploading}/><small>{uploading?"Nahrávam…":form.image||"Zatiaľ bez fotografie"}</small></label>{form.image&&<img className="admin-breed-preview" src={form.image} alt={`Náhľad: ${form.name||"plemeno"}`}/>}<label className="admin-field"><span>Ďalšie fotografie</span><input type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e)=>void uploadGallery(e)} disabled={uploading}/></label><div className="admin-breed-gallery-editor">{form.gallery.map((item,index)=><article key={`${item.imageUrl}-${index}`} className="admin-breed-gallery-row"><img src={item.imageUrl} alt={item.alt||"Náhľad"}/><div><label className="admin-field"><span>Alt text</span><input value={item.alt} onChange={(e)=>updateGallery(index,{alt:e.target.value})}/></label><label className="admin-field"><span>Popis pod fotografiou</span><input value={item.caption} onChange={(e)=>updateGallery(index,{caption:e.target.value})}/></label><label className="admin-field"><span>Kredit / zdroj</span><input value={item.credit} onChange={(e)=>updateGallery(index,{credit:e.target.value})}/></label></div><div className="admin-breed-row-actions"><button type="button" onClick={()=>moveGallery(index,-1)} disabled={index===0} aria-label="Posunúť vyššie">↑</button><button type="button" onClick={()=>moveGallery(index,1)} disabled={index===form.gallery.length-1} aria-label="Posunúť nižšie">↓</button><button type="button" className="is-danger" onClick={()=>change("gallery",form.gallery.filter((_,i)=>i!==index))}>Odstrániť</button></div></article>)}</div></section>

    <section className="admin-form-card"><h2>Odborné zdroje</h2><div className="admin-breed-sources">{form.sources.map((source,index)=><div className="admin-source-row" key={index}><label className="admin-field"><span>Názov zdroja</span><input value={source.label} onChange={(e)=>updateSource(index,{label:e.target.value})}/></label><label className="admin-field"><span>URL zdroja</span><input type="url" value={source.url} onChange={(e)=>updateSource(index,{url:e.target.value})}/></label><button type="button" onClick={()=>change("sources",form.sources.filter((_,i)=>i!==index))}>Odstrániť</button></div>)}</div><button type="button" className="admin-secondary-button" onClick={()=>change("sources",[...form.sources,{...emptySource}])}>+ Pridať odborný zdroj</button><label className="admin-field"><span>Farebný motív</span><select value={form.accent} onChange={(e)=>change("accent",e.target.value)}><option value="forest">Zelený</option><option value="coral">Koralový</option><option value="gold">Zlatý</option><option value="blue">Modrý</option></select></label></section>

    <AdminSeoFields value={form.seo} onChange={(seo)=>change("seo",seo)} canonicalPath={`/plemena/${form.slug}`} fallbackTitle={breedSeoFallback(form.name||"Názov plemena").title} fallbackDescription={breedSeoFallback(form.name||"Názov plemena").description}/>
    {error&&<p className="admin-form-error" role="alert">{error}</p>}{message&&<p className="admin-flash" role="status">{message}</p>}
    <div className="admin-editor-actions"><Link href="/admin/plemena">Späť</Link><div><button type="submit" disabled={saving}>Uložiť koncept</button><button type="button" className="is-primary" disabled={saving} onClick={()=>void save("published")}>Publikovať</button></div></div>
  </form>;
}
