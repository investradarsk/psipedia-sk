"use client";
import {useState} from "react";import {useRouter} from "next/navigation";
type Props={id:string;type:string;status:string;paymentStatus:string;paymentMethod:string;entitlementStatus:string|null;campaignId:string|null};
export function AdminPartnerAgreementActions(props:Props){
  const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[campaignId,setCampaignId]=useState(props.campaignId??"");
  async function act(action:string,extra:Record<string,unknown>={}){
    setBusy(true);setMessage("");
    try{
      const r=await fetch(`/api/admin/partners/commercial/agreements/${props.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action,...extra})});
      const j=await r.json() as {error?:string};if(!r.ok)throw new Error(j.error||"Akcia zlyhala.");setMessage("Zmena bola uložená.");router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Akcia zlyhala.");}finally{setBusy(false);}
  }
  return <section className="admin-form-card"><h2>Lifecycle akcie</h2><div className="admin-commercial-actions">
    {props.status==="OFFERED"&&<button disabled={busy} onClick={()=>act("update",{status:"AGREED"})}>Označiť ako dohodnuté</button>}
    {props.status==="AGREED"&&props.paymentStatus!=="PAID"&&<button disabled={busy} onClick={()=>act("mark_paid")}>Označiť ako uhradené</button>}
    {props.status==="AGREED"&&props.paymentMethod==="BY_AGREEMENT"&&props.paymentStatus!=="WAIVED"&&<button disabled={busy} onClick={()=>act("waive_payment")}>Platba nie je potrebná / waived</button>}
    {props.status==="AGREED"&&<>{props.type==="AD_CAMPAIGN"&&<label>ID existujúcej kampane<input value={campaignId} onChange={e=>setCampaignId(e.target.value)} /></label>}<button disabled={busy} onClick={()=>act("activate",{campaignId})}>Aktivovať</button></>}
    {props.status==="ACTIVE"&&(props.entitlementStatus==="ACTIVE"||props.entitlementStatus==="SCHEDULED")&&<button disabled={busy} onClick={()=>act("pause")}>Pozastaviť benefit</button>}
    {!["CANCELLED","EXPIRED"].includes(props.status)&&<button disabled={busy} onClick={()=>act("cancel")}>Zrušiť dohodu</button>}
    {message&&<p role="status">{message}</p>}
  </div></section>;
}
