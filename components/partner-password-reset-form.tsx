"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export function PartnerPasswordResetForm(){
  const [token,setToken]=useState("");
  const [password,setPassword]=useState("");
  const [confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<{type:"success"|"error";text:string}|null>(null);

  useEffect(()=>{
    const params=new URLSearchParams(window.location.hash.replace(/^#/,""));
    setToken(params.get("token")||"");
    window.history.replaceState(null,"","/partner/obnova-hesla");
  },[]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!token||busy)return;
    setBusy(true);setResult(null);
    try{
      const response=await fetch("/api/partner/auth/password/reset",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({token,password,passwordConfirmation:confirmation}),
      });
      const data=await response.json() as {success?:boolean;error?:string};
      if(!response.ok||!data.success)throw new Error(data.error||"Heslo sa nepodarilo obnoviť.");
      setToken("");
      setPassword("");
      setConfirmation("");
      setResult({type:"success",text:"Heslo bolo zmenené. Prihláste sa novým heslom."});
    }catch(error){
      setResult({type:"error",text:error instanceof Error?error.message:"Heslo sa nepodarilo obnoviť."});
    }finally{setBusy(false);}
  }

  if(!token&&!result){
    return <div className="partner-auth-form">
      <p className="partner-form-message is-error" role="alert">Odkaz na obnovenie hesla nie je platný alebo už expiroval.</p>
      <Link className="button button--dark partner-submit" href="/partner/zabudnute-heslo">Vyžiadať nový odkaz</Link>
    </div>;
  }

  return <form className="partner-auth-form" onSubmit={submit}>
    <label className="partner-field">
      <span>Nové heslo</span>
      <input type="password" autoComplete="new-password" value={password}
        onChange={event=>setPassword(event.target.value)} minLength={12} maxLength={1024} required disabled={!token}/>
    </label>
    <label className="partner-field">
      <span>Potvrdenie nového hesla</span>
      <input type="password" autoComplete="new-password" value={confirmation}
        onChange={event=>setConfirmation(event.target.value)} minLength={12} maxLength={1024} required disabled={!token}/>
    </label>
    {result&&<p className={"partner-form-message is-"+result.type} role="status" aria-live="polite">{result.text}</p>}
    {token?<button className="button button--coral partner-submit" type="submit" disabled={busy}>
      {busy?"Ukladám…":"Uložiť nové heslo"}
    </button>:<Link className="button button--dark partner-submit" href="/partner/prihlasenie">Prihlásiť sa</Link>}
  </form>;
}
