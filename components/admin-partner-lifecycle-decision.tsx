"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminPartnerLifecycleDecision({id,kind}:{
  id:string;kind:string;
}){
  const router=useRouter(),[busy,setBusy]=useState(false),
    [error,setError]=useState(""),[note,setNote]=useState("");
  async function decide(decision:"APPROVE"|"REJECT"){
    if(busy)return;
    const destructive=kind==="REQUEST_ARCHIVE"||kind==="REQUEST_DELETE_ACCOUNT";
    if(decision==="APPROVE"&&!window.confirm(destructive
      ?"Schváliť? Archivácia alebo deaktivácia odoberie partnerské práva; existujúce profily sa natrvalo nevymazávajú."
      :"Schváliť túto partnerskú žiadosť?"))return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/admin/partners/lifecycle/"+encodeURIComponent(id),{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({decision,note:note.trim()}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Rozhodnutie sa neuložilo.");
      router.refresh();
    }catch(error){setError(error instanceof Error?error.message:"Rozhodnutie sa neuložilo.");}
    finally{setBusy(false);}
  }
  return <div className="admin-partner-lifecycle-actions">
    <label className="admin-partner-lifecycle-note">Poznámka k rozhodnutiu
      <textarea rows={2} maxLength={2000} value={note} disabled={busy}
        onChange={event=>setNote(event.target.value)} />
    </label>
    <button type="button" disabled={busy} onClick={()=>decide("APPROVE")}>Schváliť</button>
    <button type="button" disabled={busy} onClick={()=>decide("REJECT")}>Zamietnuť</button>
    {error&&<p role="alert">{error}</p>}
  </div>;
}
