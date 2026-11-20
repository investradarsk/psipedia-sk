import { parsePartnerAuditChanges } from "@/lib/partner-audit-diff";

function show(value:unknown){
  if(value===null||value===undefined||value==="")return "—";
  if(typeof value==="string")return value;
  try{return JSON.stringify(value,null,2);}catch{return String(value);}
}
export function AdminPartnerAuditDiff({metadataJson}:{metadataJson:string}){
  const audit=parsePartnerAuditChanges(metadataJson);
  if(audit.changes.length===0&&(!audit.lifecycle&&!audit.note))return null;
  return <details className="admin-partner-v2-audit-diff">
    <summary>{audit.changes.length?"Zobraziť zmenené polia – pred / po":"Podrobnosti rozhodnutia"}</summary>
    {audit.lifecycle&&<p>Úkon: {audit.lifecycle.replaceAll("_"," ")}</p>}
    {audit.note&&<p>Poznámka: {audit.note}</p>}
    {audit.changes.map(item=><div key={item.field} className="admin-partner-v2-audit-field">
      <strong>{item.field}</strong>
      <div className="admin-partner-v2-audit-before-after">
        <div><small>Pred zmenou</small><pre>{show(item.old)}</pre></div>
        <div><small>Po zmene</small><pre>{show(item.next)}</pre></div>
      </div>
    </div>)}
  </details>;
}
