"use client";

import { FormEvent, useState } from "react";

type Props={
  passwordSet:boolean;
  googleLinked:boolean;
  googleEnabled:boolean;
};

export function PartnerSecuritySettings({passwordSet:initialPasswordSet,googleLinked,googleEnabled}:Props){
  const [passwordSet,setPasswordSet]=useState(initialPasswordSet);
  const [currentPassword,setCurrentPassword]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<{type:"success"|"error";text:string}|null>(null);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    setBusy(true);setResult(null);
    try{
      const response=await fetch("/api/partner/auth/password/settings",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({currentPassword:passwordSet?currentPassword:undefined,newPassword,newPasswordConfirmation:confirmation}),
      });
      const data=await response.json() as {success?:boolean;passwordSet?:boolean;error?:string};
      if(!response.ok||!data.success)throw new Error(data.error||"Heslo sa nepodarilo uložiť.");
      setPasswordSet(true);setCurrentPassword("");setNewPassword("");setConfirmation("");
      setResult({type:"success",text:"Heslo bolo zmenené."});
    }catch(error){
      setResult({type:"error",text:error instanceof Error?error.message:"Heslo sa nepodarilo uložiť."});
    }finally{setBusy(false);}
  }

  return <section className="partner-settings-card partner-security-card">
    <h2>Prihlasovanie a bezpečnosť</h2>
    <div className="partner-auth-method-row">
      <div><strong>Heslo</strong><span>{passwordSet?"Nastavené":"Nenastavené"}</span></div>
    </div>
    <form className="partner-auth-form partner-password-settings-form" onSubmit={submit}>
      {passwordSet?<label className="partner-field">
        <span>Aktuálne heslo</span>
        <input type="password" autoComplete="current-password" value={currentPassword}
          onChange={event=>setCurrentPassword(event.target.value)} maxLength={1024} required />
      </label>:null}
      <label className="partner-field">
        <span>{passwordSet?"Nové heslo":"Nastaviť heslo"}</span>
        <input type="password" autoComplete="new-password" value={newPassword}
          onChange={event=>setNewPassword(event.target.value)} minLength={12} maxLength={1024} required />
      </label>
      <label className="partner-field">
        <span>Potvrdenie nového hesla</span>
        <input type="password" autoComplete="new-password" value={confirmation}
          onChange={event=>setConfirmation(event.target.value)} minLength={12} maxLength={1024} required />
      </label>
      {result&&<p className={"partner-form-message is-"+result.type} role="status" aria-live="polite">{result.text}</p>}
      <button className="button button--dark" type="submit" disabled={busy}>
        {busy?"Ukladám…":passwordSet?"Zmeniť heslo":"Nastaviť heslo"}
      </button>
      {passwordSet?<p className="partner-password-hint">Ak aktuálne heslo neviete, použite obnovenie hesla z prihlasovacej stránky.</p>:null}
    </form>

    <div className="partner-auth-method-row partner-google-setting">
      <div><strong>Google</strong><span>{googleLinked?"Prepojené":"Neprepojené"}</span></div>
      {!googleLinked&&googleEnabled?
        <button
          className="button button--dark"
          type="button"
          onClick={()=>window.location.assign("/api/partner/auth/google/start?intent=LINK&returnTo=%2Fpartner%2Fnastavenia")}
        >
          Prepojiť Google účet
        </button>
        :null}
    </div>
    {!googleEnabled&&!googleLinked?<p className="partner-password-hint">Prihlásenie cez Google zatiaľ nie je aktivované.</p>:null}
  </section>;
}
