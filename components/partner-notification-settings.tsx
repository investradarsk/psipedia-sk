"use client";
import { useState } from "react";
export function PartnerNotificationSettings({initial}:{
  initial:{emailEnabled:boolean;inAppEnabled:boolean};
}){
  const [email,setEmail]=useState(initial.emailEnabled);
  const [inApp,setInApp]=useState(initial.inAppEnabled);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  async function save(){
    if(busy)return;setBusy(true);setError("");setSuccess("");
    try{
      const response=await fetch("/api/partner/notification-preferences",{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({emailEnabled:email,inAppEnabled:inApp}),
      });
      const body=await response.json() as {error?:string};
      if(!response.ok)throw new Error(body.error||"Nastavenia sa nepodarilo uložiť.");
      setSuccess("Nastavenia upozornení boli uložené.");
    }catch(error){setError(error instanceof Error?error.message:"Nastavenia sa nepodarilo uložiť.");}
    finally{setBusy(false);}
  }
  return <section className="partner-settings-card partner-notification-settings" aria-label="Upozornenia">
    <h2>Upozornenia</h2>
    <p>Nastavte si dva samostatné kanály. Predvolene sú zapnuté oba. Zmeny v žiadostiach a správy si môžete prezrieť v účte aj po ich vypnutí.</p>
    <label className="partner-notification-channel">
      <input type="checkbox" checked={email} disabled={busy} onChange={event=>setEmail(event.target.checked)}/>
      <span><strong>E-mailové upozornenia</strong><small>Nové súkromné správy a rozhodnutia o žiadostiach. Prihlasovacie a bezpečnostné e-maily zostávajú povolené.</small></span>
    </label>
    <label className="partner-notification-channel">
      <input type="checkbox" checked={inApp} disabled={busy} onChange={event=>setInApp(event.target.checked)}/>
      <span><strong>Upozornenia v Partner účte</strong><small>Čísla neprečítaných správ a upozornenia na novú aktivitu.</small></span>
    </label>
    <button type="button" className="button button--dark" disabled={busy} onClick={()=>void save()}>
      {busy?"Ukladám…":"Uložiť upozornenia"}
    </button>
    {error&&<p role="alert" className="partner-field-error">{error}</p>}
    {success&&<p role="status">{success}</p>}
  </section>;
}
