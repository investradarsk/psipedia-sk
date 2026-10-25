"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";

const reasons = [
  ["INCORRECT_INFORMATION", "Údaje sa nepodarilo potvrdiť"],
  ["INSUFFICIENT_EVIDENCE", "Chýbajú dostatočné podklady"],
  ["POLICY_CONFLICT", "Konflikt s pravidlami profilu"],
  ["OTHER", "Iný dôvod"],
] as const;

type ResolutionAction = "CREATE_NEW" | "LINK_EXISTING" | "REJECT";
type PendingResolution = {
  action: ResolutionAction;
  canonicalId?: number;
  applyImage?: boolean;
  reasonCode?: string;
};

export function AdminPartnerNewProfileActions({ id, candidateIds, hasImage=false }: { id: string; candidateIds: number[]; hasImage?:boolean }) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [reasonCode,setReasonCode]=useState("INCORRECT_INFORMATION");
  const [canonicalId,setCanonicalId]=useState(candidateIds[0] ? String(candidateIds[0]) : "");
  const [applyImage,setApplyImage]=useState(false);
  const [pendingDecision,setPendingDecision]=useState<PendingResolution | null>(null);

  function requestDecision(action: ResolutionAction) {
    if (busy) return;
    const linkId = Number(canonicalId);
    if (action === "LINK_EXISTING" && (!Number.isSafeInteger(linkId) || linkId <= 0)) {
      setMessage("Zadajte platné canonical ID.");
      return;
    }
    // Snapshot the reviewed fields so the confirmed PATCH matches the previewed decision.
    setPendingDecision({
      action,
      ...(action === "LINK_EXISTING" ? { canonicalId: linkId, applyImage } : {}),
      ...(action === "REJECT" ? { reasonCode } : {}),
    });
  }

  async function run() {
    const decision = pendingDecision;
    if (busy || !decision) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/partners/submissions/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: decision.action,
          ...(decision.action === "LINK_EXISTING" ? { canonicalId: decision.canonicalId, applyImage: decision.applyImage } : {}),
          ...(decision.action === "REJECT" ? { reasonCode: decision.reasonCode } : {}),
        }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Rozhodnutie sa nepodarilo uložiť.");
      setMessage(decision.action === "CREATE_NEW"
        ? "Nový profil bol vytvorený ako koncept."
        : decision.action === "LINK_EXISTING"
          ? "Návrh bol prepojený s existujúcim profilom."
          : "Návrh bol zamietnutý.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rozhodnutie sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
      setPendingDecision(null);
    }
  }

  return <>
    <section className="admin-form-card">
    <h2>Moderation resolution</h2>
    <p className="admin-partner-hint">Create New vytvorí iba DRAFT. Link Existing nevytvorí nový canonical záznam. Verification zostáva samostatná.</p>
    <div className="admin-partner-button-row">
      <button type="button" disabled={busy} onClick={()=>requestDecision("CREATE_NEW")}>Vytvoriť nový profil</button>
    </div>
    <div className="admin-commercial-actions">
      <label>Canonical ID existujúceho profilu<input inputMode="numeric" value={canonicalId} onChange={(e)=>setCanonicalId(e.target.value)}/></label>
{hasImage?<label className="admin-partner-checkbox"><input type="checkbox" checked={applyImage} onChange={e=>setApplyImage(e.target.checked)} disabled={busy}/><span>Použiť nahraný obrázok aj pre existujúci profil</span></label>:null}
      <button type="button" disabled={busy} onClick={()=>requestDecision("LINK_EXISTING")}>Prepojiť s existujúcim profilom</button>
    </div>
    <div className="admin-commercial-actions">
      <label>Dôvod zamietnutia<select value={reasonCode} onChange={(e)=>setReasonCode(e.target.value)}>{reasons.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <button type="button" className="is-danger" disabled={busy} onClick={()=>requestDecision("REJECT")}>Zamietnuť</button>
    </div>
    {message?<p role="status" className="admin-partner-message">{message}</p>:null}
    </section>
    <AdminDestructiveConfirmDialog
      open={pendingDecision !== null}
      title={pendingDecision?.action === "CREATE_NEW"
        ? "Vytvoriť nový profil?"
        : pendingDecision?.action === "LINK_EXISTING"
          ? "Prepojiť existujúci profil?"
          : "Zamietnuť návrh?"}
      description={pendingDecision?.action === "CREATE_NEW"
        ? "Vytvoriť nový canonical profil ako DRAFT?"
        : pendingDecision?.action === "LINK_EXISTING"
          ? "Prepojiť návrh s existujúcim profilom bez vytvorenia duplikátu?"
          : "Zamietnuť návrh bez vytvorenia profilu?"}
      affectedCount={1}
      affectedLabel="návrh"
      confirmLabel={pendingDecision?.action === "CREATE_NEW"
        ? "Vytvoriť koncept"
        : pendingDecision?.action === "LINK_EXISTING"
          ? "Prepojiť profil"
          : "Zamietnuť"}
      confirmVariant={pendingDecision?.action === "REJECT" ? "destructive" : "primary"}
      pending={busy}
      onCancel={() => { if (!busy) setPendingDecision(null); }}
      onConfirm={() => void run()}
    />
  </>;
}

export function AdminPartnerNewProfileCandidateLinkButton({ id, canonicalId }: { id:string; canonicalId:number }) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [confirmOpen,setConfirmOpen]=useState(false);
  async function link(){
    if(busy||!confirmOpen)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/admin/partners/submissions/${encodeURIComponent(id)}`,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({action:"LINK_EXISTING",canonicalId}),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Prepojenie zlyhalo.");
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Prepojenie zlyhalo.");}
    finally{setBusy(false);setConfirmOpen(false);}
  }
  return <>
    <span className="admin-inline-action">
      <button type="button" disabled={busy} onClick={() => setConfirmOpen(true)}>{busy ? "Prepájam…" : "Prepojiť tento profil"}</button>
      {message ? <small role="status">{message}</small> : null}
    </span>
    <AdminDestructiveConfirmDialog
      open={confirmOpen}
      title="Prepojiť tento profil?"
      description="Prepojiť návrh s týmto existujúcim profilom? Nový profil sa nevytvorí."
      affectedCount={1}
      affectedLabel="návrh"
      confirmLabel="Prepojiť profil"
      confirmVariant="primary"
      pending={busy}
      onCancel={() => { if (!busy) setConfirmOpen(false); }}
      onConfirm={() => void link()}
    />
  </>;
}
