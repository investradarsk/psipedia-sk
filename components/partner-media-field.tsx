"use client";

import { useId, useRef, useState } from "react";
import type { PartnerMediaIntent } from "@/lib/partner-media";

type UploadedMedia={
  id:string;previewUrl:string;originalMime:string;sizeBytes:number;width:number;height:number;
};

export function PartnerMediaField({
  label,intent,currentImageUrl,onChange,disabled=false,
}:{
  label:string;intent:PartnerMediaIntent;currentImageUrl?:string|null;onChange:(mediaAssetId:string|null)=>void;disabled?:boolean;
}){
  const inputId=useId(),inputRef=useRef<HTMLInputElement>(null);
  const [media,setMedia]=useState<UploadedMedia|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function orphan(id:string){
    await fetch(`/api/partner/media/${encodeURIComponent(id)}`,{method:"DELETE"}).catch(()=>undefined);
  }
  async function select(file:File|null){
    if(!file||busy)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)){setMessage("Použite obrázok JPG, PNG alebo WebP.");return;}
    if(file.size>8*1024*1024){setMessage("Obrázok môže mať najviac 8 MB.");return;}
    setBusy(true);setMessage("Nahrávam a bezpečne spracúvam obrázok…");
    try{
      const response=await fetch("/api/partner/media",{method:"POST",headers:{"content-type":file.type,"x-media-intent":intent},body:file});
      const data=await response.json() as {error?:string;media?:UploadedMedia};
      if(!response.ok||!data.media)throw new Error(data.error||"Obrázok sa nepodarilo nahrať.");
      const previous=media;
      setMedia(data.media);onChange(data.media.id);setMessage("Obrázok je pripravený na odoslanie na kontrolu.");
      if(previous)void orphan(previous.id);
    }catch(error){setMessage(error instanceof Error?error.message:"Obrázok sa nepodarilo nahrať.");}
    finally{setBusy(false);if(inputRef.current)inputRef.current.value="";}
  }
  async function remove(){
    if(!media||busy)return;
    setBusy(true);setMessage("");
    try{await orphan(media.id);setMedia(null);onChange(null);setMessage("Navrhovaný obrázok bol odstránený.");}
    finally{setBusy(false);}
  }

  return <section className="partner-media-field partner-field--wide">
    <div className="partner-media-heading"><div><strong>{label}</strong><small>Obrázok bude zverejnený až po kontrole. JPG, PNG alebo WebP, max. 8 MB.</small></div></div>
    {currentImageUrl?<div className="partner-media-current"><span>Aktuálny verejný obrázok</span><img src={currentImageUrl} alt="Aktuálny verejný obrázok"/></div>:null}
    {media?<div className="partner-media-preview"><span>Navrhovaný obrázok</span><img src={media.previewUrl} alt="Náhľad navrhovaného obrázka"/><small>{media.width} × {media.height} px · {(media.sizeBytes/1024/1024).toFixed(1)} MB</small></div>:null}
    <div className="partner-media-actions">
      <label className="button" htmlFor={inputId}>{media?"Nahradiť obrázok":"Vybrať obrázok"}</label>
      <input ref={inputRef} id={inputId} className="partner-media-input" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled||busy} onChange={(event)=>void select(event.target.files?.[0]??null)}/>
      {media?<button type="button" className="button button--ghost" onClick={()=>void remove()} disabled={disabled||busy} aria-label="Odstrániť navrhovaný obrázok">Odstrániť</button>:null}
    </div>
    {message?<p role="status" aria-live="polite" className="partner-form-message">{message}</p>:null}
  </section>;
}
