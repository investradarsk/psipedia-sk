"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./admin-partner-canonical-draft.module.css";

export function AdminPartnerCanonicalDraftActions({
  id,canonicalId,canonicalUpdatedAt,
}:{id:string;canonicalId:number;canonicalUpdatedAt:string}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [note,setNote]=useState("");
  const [returnForm,setReturnForm]=useState(false);
  const decide=async(action:"APPROVE"|"RETURN"|"REJECT")=>{
    if(busy)return;
    if(action==="APPROVE"&&!window.confirm("Schváliť a okamžite zverejniť tento profil? Partner získa správu profilu a Notion sa uzamkne."))return;
    if(action==="REJECT"&&!window.confirm("Zamietnuť nový partnerský profil? Záznam zostane neverejný."))return;
    if(action==="RETURN"&&!note.trim()){setError("Napíš dôvod vrátenia.");return;}
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/admin/partners/canonical-drafts/"+encodeURIComponent(id),{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,note:action==="RETURN"?note.trim():undefined,
          expectedCanonicalUpdatedAt:canonicalUpdatedAt||undefined}),
      });
      const json=await response.json() as {error?:string};
      if(!response.ok)throw new Error(json.error||"Rozhodnutie nebolo uložené.");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Rozhodnutie nebolo uložené.");}
    finally{setBusy(false);}
  };
  return <div className={styles.actions} data-partner-submission-id={id} data-canonical-id={canonicalId}>
    <button type="button" disabled={busy} onClick={()=>decide("APPROVE")}>Schváliť a zverejniť</button>
    <button type="button" disabled={busy} onClick={()=>setReturnForm(!returnForm)}>Vrátiť na doplnenie</button>
    <button type="button" disabled={busy} className={styles.danger} onClick={()=>decide("REJECT")}>Zamietnuť</button>
    {returnForm&&<div className={styles.note}>
      <label htmlFor={"partner-return-"+id}>Čo má partner doplniť alebo opraviť?</label>
      <textarea id={"partner-return-"+id} maxLength={2000} value={note}
        onChange={e=>setNote(e.target.value)} rows={3} />
      <button type="button" disabled={busy||!note.trim()} onClick={()=>decide("RETURN")}>Odoslať na doplnenie</button>
    </div>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
  </div>;
}
