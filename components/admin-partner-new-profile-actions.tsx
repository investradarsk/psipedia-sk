"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const reasons = [
  ["INCORRECT_INFORMATION", "Údaje sa nepodarilo potvrdiť"],
  ["INSUFFICIENT_EVIDENCE", "Chýbajú dostatočné podklady"],
  ["POLICY_CONFLICT", "Konflikt s pravidlami profilu"],
  ["OTHER", "Iný dôvod"],
] as const;

export function AdminPartnerNewProfileActions({ id, candidateIds, hasImage=false }: { id: string; candidateIds: number[]; hasImage?:boolean }) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [reasonCode,setReasonCode]=useState("INCORRECT_INFORMATION");
  const [canonicalId,setCanonicalId]=useState(candidateIds[0] ? String(candidateIds[0]) : "");
  const [applyImage,setApplyImage]=useState(false);

  async function run(action:"CREATE_NEW"|"LINK_EXISTING"|"REJECT", explicitCanonicalId?:number){
    if(busy)return;
    const linkId=explicitCanonicalId??Number(canonicalId);
    if(action==="LINK_EXISTING"&&(!Number.isSafeInteger(linkId)||linkId<=0)){setMessage("Zadajte platné canonical ID.");return;}
    const prompt=action==="CREATE_NEW"
      ?"Vytvoriť nový canonical profil ako DRAFT?"
      :action==="LINK_EXISTING"?"Prepojiť návrh s existujúcim profilom bez vytvorenia duplikátu?"
      :"Zamietnuť návrh bez vytvorenia profilu?";
    if(!window.confirm(prompt))return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch(`/api/admin/partners/submissions/${encodeURIComponent(id)}`,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({
          action,
          ...(action==="LINK_EXISTING"?{canonicalId:linkId,applyImage}:{}),
          ...(action==="REJECT"?{reasonCode}:{}),
        }),
      });
      const data=await response.json() as {error?:string};
      if(!response.ok)throw new Error(data.error||"Rozhodnutie sa nepodarilo uložiť.");
      setMessage(action==="CREATE_NEW"?"Nový profil bol vytvorený ako koncept.":action==="LINK_EXISTING"?"Návrh bol prepojený s existujúcim profilom.":"Návrh bol zamietnutý.");
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"Rozhodnutie sa nepodarilo uložiť.");}
    finally{setBusy(false);}
  }

  return <section className="admin-form-card">
    <h2>Moderation resolution</h2>
    <p className="admin-partner-hint">Create New vytvorí iba DRAFT. Link Existing nevytvorí nový canonical záznam. Verification zostáva samostatná.</p>
    <div className="admin-partner-button-row">
      <button type="button" disabled={busy} onClick={()=>run("CREATE_NEW")}>Vytvoriť nový profil</button>
    </div>
    <div className="admin-commercial-actions">
      <label>Canonical ID existujúceho profilu<input inputMode="numeric" value={canonicalId} onChange={(e)=>setCanonicalId(e.target.value)}/></label>
{hasImage?<label className="admin-partner-checkbox"><input type="checkbox" checked={applyImage} onChange={e=>setApplyImage(e.target.checked)} disabled={busy}/><span>Použiť nahraný obrázok aj pre existujúci profil</span></label>:null}
      <button type="button" disabled={busy} onClick={()=>run("LINK_EXISTING")}>Prepojiť s existujúcim profilom</button>
    </div>
    <div className="admin-commercial-actions">
      <label>Dôvod zamietnutia<select value={reasonCode} onChange={(e)=>setReasonCode(e.target.value)}>{reasons.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <button type="button" className="is-danger" disabled={busy} onClick={()=>run("REJECT")}>Zamietnuť</button>
    </div>
    {message?<p role="status" className="admin-partner-message">{message}</p>:null}
  </section>;
}

export function AdminPartnerNewProfileCandidateLinkButton({ id, canonicalId }: { id:string; canonicalId:number }) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  async function link(){
    if(busy||!window.confirm("Prepojiť návrh s týmto existujúcim profilom?"))return;
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
    finally{setBusy(false);}
  }
  return <span className="admin-inline-action"><button type="button" disabled={busy} onClick={link}>{busy?"Prepájam…":"Prepojiť tento profil"}</button>{message?<small role="status">{message}</small>:null}</span>;
}
