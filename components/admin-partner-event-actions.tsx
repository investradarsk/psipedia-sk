"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminActionButton, AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";
import { AdminFormFeedback } from "@/components/admin-form-feedback";

const reasons = [["INCORRECT_INFORMATION","Údaje sa nepodarilo potvrdiť"],["DUPLICATE","Duplicitné podujatie"],["POLICY_CONFLICT","Konflikt s pravidlami"],["OTHER","Iný dôvod"]] as const;
type PartnerEventAction = "CREATE_EVENT" | "LINK_EXISTING" | "APPROVE" | "REJECT";

function actionDescription(action: PartnerEventAction) {
  if (action === "CREATE_EVENT") return "vytvoriť canonical podujatie ako DRAFT";
  if (action === "LINK_EXISTING") return "prepojiť návrh s existujúcim podujatím";
  if (action === "APPROVE") return "aplikovať presný Partner patch";
  return "zamietnuť návrh";
}

export function AdminPartnerEventActions({id,operation,candidateId,hasImage=false}:{id:string;operation:"CREATE"|"UPDATE";candidateId?:number|null;hasImage?:boolean}) {
  const router = useRouter();
  const [reasonCode,setReasonCode] = useState("INCORRECT_INFORMATION");
  const [canonicalId,setCanonicalId] = useState(candidateId ? String(candidateId) : "");
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState("");
  const [error,setError] = useState("");
  const [applyImage,setApplyImage] = useState(false);
  const [pendingAction,setPendingAction] = useState<PartnerEventAction|null>(null);

  async function run(action: PartnerEventAction) {
    if (busy) return;
    setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/partners/events/${encodeURIComponent(id)}`,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({
          action,
          canonicalId:action==="LINK_EXISTING"?Number(canonicalId):undefined,
          applyImage:action==="LINK_EXISTING"?applyImage:undefined,
          reasonCode:action==="REJECT"?reasonCode:undefined,
        }),
      });
      const data = await response.json() as {error?:string};
      if(!response.ok) throw new Error(data.error || "Rozhodnutie sa nepodarilo uložiť.");
      setPendingAction(null);
      setMessage("Rozhodnutie bolo uložené.");
      router.refresh();
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : "Rozhodnutie sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  }

  const request=(action:PartnerEventAction)=>{if(!busy)setPendingAction(action);};

  return <section className="admin-form-card">
    <h2>Rozhodnutie</h2>
    <div className="admin-commercial-actions">
      {operation==="CREATE" ? <>
        <AdminActionButton disabled={busy} onClick={()=>request("CREATE_EVENT")}>CREATE EVENT (DRAFT)</AdminActionButton>
        <label>Existujúce event ID<input type="number" min="1" value={canonicalId} onChange={e=>setCanonicalId(e.target.value)} disabled={busy}/></label>
        {hasImage ? <label className="admin-partner-checkbox"><input type="checkbox" checked={applyImage} onChange={e=>setApplyImage(e.target.checked)} disabled={busy}/><span>Použiť nahraný obrázok aj pre existujúce podujatie</span></label> : null}
        <AdminActionButton disabled={busy||!canonicalId} onClick={()=>request("LINK_EXISTING")}>LINK EXISTING</AdminActionButton>
      </> : <AdminActionButton disabled={busy} onClick={()=>request("APPROVE")}>Schváliť zmeny</AdminActionButton>}
      <label>Dôvod pri zamietnutí<select value={reasonCode} onChange={e=>setReasonCode(e.target.value)} disabled={busy}>{reasons.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
      <AdminActionButton variant="destructive" disabled={busy} onClick={()=>request("REJECT")}>Zamietnuť</AdminActionButton>
      <AdminFormFeedback message={message} error={error} className="admin-partner-message"/>
    </div>
    <AdminDestructiveConfirmDialog open={pendingAction!==null}
      title="Potvrdiť partnerské rozhodnutie"
      description={pendingAction ? `Naozaj chcete ${actionDescription(pendingAction)}?` : undefined}
      affectedCount={pendingAction ? 1 : 0} affectedLabel="partnerský návrh"
      confirmLabel={pendingAction==="REJECT" ? "Zamietnuť" : "Potvrdiť"}
      confirmVariant={pendingAction==="REJECT" ? "destructive" : "primary"}
      pending={busy}
      onCancel={()=>{if(!busy)setPendingAction(null);}}
      onConfirm={()=>{if(pendingAction)void run(pendingAction);}}/>
  </section>;
}
