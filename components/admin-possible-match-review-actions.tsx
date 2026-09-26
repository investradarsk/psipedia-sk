"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AutomationMatchReviewDecision } from "@/lib/data-automation-match-review";

export function AdminPossibleMatchReviewActions({observationId,candidateClusterId,evidenceFingerprint,currentDecisionId,semanticCompatible}:{
  observationId:number;candidateClusterId:number;evidenceFingerprint:string;currentDecisionId:number|null;semanticCompatible:boolean;
}){
  const router=useRouter(); const [busy,setBusy]=useState(false); const [note,setNote]=useState(""); const [message,setMessage]=useState("");
  async function decide(decision:AutomationMatchReviewDecision){
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/admin/automation-match-reviews/${observationId}/${candidateClusterId}`,{
        method:"PUT",headers:{"content-type":"application/json"},
        body:JSON.stringify({decision,note,expectedDecisionId:currentDecisionId,expectedEvidenceFingerprint:evidenceFingerprint}),
      });
      const payload=await response.json() as {error?:string};
      if(!response.ok) throw new Error(payload.error||"Rozhodnutie sa nepodarilo uložiť.");
      setMessage("Rozhodnutie bolo uložené.");router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Rozhodnutie sa nepodarilo uložiť.");}
    finally{setBusy(false);}
  }
  return <section className="admin-panel">
    <h2>Rozhodnutie</h2>
    <label className="admin-field"><span>Interná poznámka</span><textarea rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} /></label>
    {message&&<p className="admin-flash" role="status">{message}</p>}
    <div className="admin-form-actions">
      <button className="is-primary" disabled={busy||!semanticCompatible} onClick={()=>void decide("SAME_ENTITY")}>Same entity</button>
      <button disabled={busy} onClick={()=>void decide("DIFFERENT_ENTITY")}>Different entity</button>
      <button disabled={busy} onClick={()=>void decide("RELATIONSHIP_ONLY")}>Relationship only</button>
      <button disabled={busy} onClick={()=>void decide("DEFER")}>Defer</button>
    </div>
    {!semanticCompatible&&<p><strong>SAME_ENTITY je blokované:</strong> semantic kinds nie sú identity-kompatibilné.</p>}
  </section>;
}
