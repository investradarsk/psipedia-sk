"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

/**
 * Canonical CREATE proposals can be returned for editing. Legacy proposals
 * continue using their original moderation workflow; this never creates a
 * second profile or exposes the private moderation note via email.
 */
export function AdminPartnerCanonicalReturn({submissionId}:{submissionId:string}){
  const router=useRouter();
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [complete,setComplete]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const note=reason.trim();
    if(busy||complete||note.length<5||note.length>2000)return;
    if(!window.confirm("Vrátiť podanie Partnerovi na doplnenie? Po vrátení ho môže upraviť a znovu odoslať."))return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/admin/partners/canonical-drafts/"+encodeURIComponent(submissionId),{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"RETURN",note}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error??"Podanie sa nepodarilo vrátiť.");
      setComplete(true);
      setMessage("Podanie bolo vrátené Partnerovi na doplnenie.");
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Vrátenie podania zlyhalo.");}
    finally{setBusy(false);}
  }
  return <section className="admin-form-card" data-admin-partner-canonical-return>
    <details>
      <summary>Vrátiť na doplnenie</summary>
      <form onSubmit={event=>void submit(event)}>
        <label className="partner-field">
          <span>Čo má Partner doplniť alebo opraviť?</span>
          <textarea rows={3} maxLength={2000} required value={reason} disabled={busy||complete}
            onChange={event=>setReason(event.target.value)}
            placeholder="Uveďte konkrétne polia alebo nejasnosti."/>
        </label>
        <p>Partner dostane všeobecné upozornenie bez obsahu poznámky; presný dôvod uvidí po prihlásení v editore konceptu.</p>
        <button type="submit" disabled={busy||complete||reason.trim().length<5}>
          {busy?"Vraciam podanie…":"Vrátiť Partnerovi na doplnenie"}
        </button>
        {message&&<p role={complete?"status":"alert"}>{message}</p>}
      </form>
    </details>
  </section>;
}
