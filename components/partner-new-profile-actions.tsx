"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PartnerNewProfileWithdrawButton({ id }: { id: string }) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function withdraw(){
    if(busy||!window.confirm("Naozaj chcete návrh nového profilu zrušiť?"))return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/partner/new-profile/${encodeURIComponent(id)}/withdraw`,{
        method:"POST",headers:{"content-type":"application/json"},body:"{}",
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Návrh sa nepodarilo zrušiť.");
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Návrh sa nepodarilo zrušiť.");}
    finally{setBusy(false);}
  }
  return <div className="partner-request-action">
    <button type="button" onClick={withdraw} disabled={busy}>{busy?"Ruším…":"Zrušiť návrh"}</button>
    {message?<span role="status">{message}</span>:null}
  </div>;
}
