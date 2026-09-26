"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { CanonicalApplyPreview, CanonicalFieldApplyAction } from "@/lib/data-automation-canonical-apply";

function display(value:unknown){
  if(value===null||value===undefined||value==="") return "—";
  return typeof value==="object"?JSON.stringify(value):String(value);
}
function blockerLabel(value:string|null){
  if(!value) return "";
  const labels:Record<string,string>={
    LIFECYCLE_FIELD_NOT_SUPPORTED:"lifecycle/status sa v G5 v1 nemení",
    FACILITY_EVIDENCE_BLOCKED_ON_ORGANIZATION_ROOT:"facility evidence nesmie prepísať organization root",
    SERVICE_ADDRESS_NOT_CONFIRMED:"canonical service address nie je potvrdená",
    INVALID_ICO:"neplatné IČO",
    UNSUPPORTED_ORGANIZATION_TYPE:"nepodporovaný canonical typ",
    EMPTY_INCOMING_NOT_APPLYABLE:"prázdna incoming hodnota sa bez CLEAR neaplikuje",
    FIELD_NOT_SUPPORTED:"pole nie je v G5 v1 apply allowliste",
  };
  return labels[value]??value;
}

export function AdminCanonicalApplyReview({preview}:{preview:CanonicalApplyPreview}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [actions,setActions]=useState<Record<string,CanonicalFieldApplyAction>>(()=>Object.fromEntries(preview.fields.map(field=>[field.fieldName,"SKIP"])));
  const [confirmed,setConfirmed]=useState<Record<string,boolean>>({});
  const applicable=useMemo(()=>preview.fields.filter(field=>field.applyable),[preview.fields]);
  const applyCount=applicable.filter(field=>actions[field.fieldName]==="APPLY_INCOMING").length;

  async function apply(){
    if(!preview.eligible||!preview.canonicalEntityId||!preview.canonicalUpdatedAt||!preview.reviewDecisionId||!preview.reviewDecisionVersion||applyCount<1) return;
    const selections=preview.fields.map(field=>({
      fieldName:field.fieldName,
      action:actions[field.fieldName]??"SKIP",
      evidenceId:field.evidenceId,
      confirmConflict:Boolean(confirmed[field.fieldName]),
    }));
    if(!window.confirm(`Aplikovať ${applyCount} vybraných polí do canonical záznamu #${preview.canonicalEntityId}? Táto akcia nemení publish/status a nevytvára nový záznam.`)) return;
    setBusy(true);setMessage("");
    try{
      const applyResponse=await fetch(window.location.pathname.replace("/admin/operations/possible-matches/","/api/admin/automation-match-reviews/")+"/apply",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          expectedDecisionId:preview.reviewDecisionId,
          expectedDecisionVersion:preview.reviewDecisionVersion,
          expectedEvidenceFingerprint:preview.evidenceFingerprint,
          expectedCanonicalUpdatedAt:preview.canonicalUpdatedAt,
          selections,
        }),
      });
      const payload=await applyResponse.json() as {error?:string;result?:{idempotent?:boolean;operationId?:number}};
      if(!applyResponse.ok) throw new Error(payload.error||"Canonical apply sa nepodaril.");
      setMessage(payload.result?.idempotent?"Táto apply operácia už bola bezpečne vykonaná.":"Canonical údaje boli aplikované a auditované.");
      router.refresh();
    }catch(error){
      setMessage(error instanceof Error?error.message:"Canonical apply sa nepodaril.");
    }finally{setBusy(false);}
  }

  return <section className="admin-panel">
    <h2>Apply to canonical</h2>
    <p><strong>Samostatný krok po identity review.</strong> SAME_ENTITY nič neprepisuje automaticky. Vyber iba konkrétne polia, ktoré chceš zapísať.</p>
    {preview.blockers.length>0&&<p className="admin-flash"><strong>Apply blocked:</strong> {preview.blockers.join(", ")}</p>}
    <p>
      <strong>Canonical:</strong> {preview.entityType} #{preview.canonicalEntityId??"—"} ·
      <strong> version:</strong> {preview.canonicalUpdatedAt??"—"} ·
      <strong> decision:</strong> #{preview.reviewDecisionId??"—"} v{preview.reviewDecisionVersion??"—"}
    </p>
    <div className="admin-change-table" role="table">
      <div className="is-heading" role="row">
        <strong>Pole</strong><strong>Current canonical</strong><strong>Proposed / provenance</strong><strong>Akcia</strong>
      </div>
      {preview.fields.map(field=><div role="row" key={field.fieldName}>
        <strong>{field.fieldName}{field.highImpact?" ⚠":""}</strong>
        <span>{display(field.currentValue)}</span>
        <span>
          <strong>{display(field.proposedValue)}</strong><br/>
          <small>{field.sourceLabel} · {field.sourceRole} / {field.authorityScore} · evidence #{field.evidenceId}</small>
          {field.conflict&&<><br/><small>Conflict {field.conflict.impact} · selected evidence #{field.conflict.selectedEvidenceId??"—"}</small></>}
          {field.blocker&&<><br/><small><strong>Blocked:</strong> {blockerLabel(field.blocker)}</small></>}
        </span>
        <span>
          <select
            aria-label={`Akcia pre ${field.fieldName}`}
            disabled={busy||!preview.eligible}
            value={actions[field.fieldName]??"SKIP"}
            onChange={event=>setActions(current=>({...current,[field.fieldName]:event.target.value as CanonicalFieldApplyAction}))}
          >
            <option value="SKIP">Skip</option>
            <option value="KEEP_CANONICAL">Keep canonical</option>
            <option value="APPLY_INCOMING" disabled={!field.applyable}>Apply incoming</option>
          </select>
          {field.conflict&&actions[field.fieldName]==="APPLY_INCOMING"&&<label>
            <input type="checkbox" checked={Boolean(confirmed[field.fieldName])}
              onChange={event=>setConfirmed(current=>({...current,[field.fieldName]:event.target.checked}))}/>
            Potvrdzujem selected evidence
          </label>}
        </span>
      </div>)}
    </div>
    <p><small>⚠ = high-impact pole. Authority je kontext pre review, nie automatické povolenie overwrite.</small></p>
    {message&&<p className="admin-flash" role="status">{message}</p>}
    <div className="admin-form-actions">
      <button className="is-primary" disabled={busy||!preview.eligible||applyCount<1} onClick={()=>void apply()}>
        {busy?"Aplikujem…":`Apply selected (${applyCount})`}
      </button>
    </div>
  </section>;
}
