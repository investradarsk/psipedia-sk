"use client";

import { FormEvent, useCallback, useState } from "react";
import { PartnerTurnstile } from "@/components/partner-turnstile";

export function PartnerForgotPasswordForm({ siteKey }: { siteKey: string }) {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{type:"success"|"error";text:string}|null>(null);
  const onToken=useCallback((token:string)=>setTurnstileToken(token),[]);

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!turnstileToken||sending)return;
    setSending(true);setResult(null);
    try{
      const response=await fetch("/api/partner/auth/password/forgot",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({email,turnstileToken}),
      });
      const data=await response.json() as {message?:string;error?:string};
      if(!response.ok)throw new Error(data.error||"Odkaz sa nepodarilo odoslať.");
      setResult({type:"success",text:data.message||"Ak k tejto adrese existuje Partner účet, poslali sme vám ďalšie pokyny."});
    }catch(error){
      setResult({type:"error",text:error instanceof Error?error.message:"Odkaz sa nepodarilo odoslať."});
    }finally{setSending(false);}
  }

  return <form className="partner-auth-form" onSubmit={submit}>
    <label className="partner-field">
      <span>E-mail</span>
      <input type="email" autoComplete="email" inputMode="email" value={email}
        onChange={event=>setEmail(event.target.value)} maxLength={320} required />
    </label>
    <PartnerTurnstile siteKey={siteKey} action="partner_password_reset_request" onToken={onToken}/>
    {result&&<p className={"partner-form-message is-"+result.type} role="status" aria-live="polite">{result.text}</p>}
    <button className="button button--coral partner-submit" type="submit" disabled={sending||!turnstileToken||!siteKey}>
      {sending?"Odosielam…":"Poslať odkaz na obnovenie hesla"}
    </button>
  </form>;
}
