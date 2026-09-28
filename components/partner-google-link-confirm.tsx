"use client";

import { useState } from "react";

export function PartnerGoogleLinkConfirm(){
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function confirm(){
    if(busy)return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/partner/auth/google/confirm-link",{
        method:"POST",headers:{"content-type":"application/json"},body:"{}",
      });
      const data=await response.json() as {success?:boolean;location?:string;error?:string};
      if(!response.ok||!data.success)throw new Error(data.error||"Google účet sa nepodarilo prepojiť.");
      window.location.replace(data.location||"/partner/nastavenia");
    }catch(reason){
      setError(reason instanceof Error?reason.message:"Google účet sa nepodarilo prepojiť.");
      setBusy(false);
    }
  }

  return <div className="partner-auth-form">
    {error?<p className="partner-form-message is-error" role="alert">{error}</p>:null}
    <button className="button button--coral partner-submit" type="button" onClick={confirm} disabled={busy}>
      {busy?"Prepájam…":"Prepojiť Google účet"}
    </button>
  </div>;
}
