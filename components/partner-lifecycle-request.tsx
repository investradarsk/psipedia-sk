"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Action="REQUEST_HIDE"|"REQUEST_ARCHIVE"|"REQUEST_RELEASE"|"REQUEST_DELETE_ACCOUNT";
const labels:Record<Action,string>={
  REQUEST_HIDE:"Požiadať o dočasné skrytie",
  REQUEST_ARCHIVE:"Požiadať o odstránenie profilu",
  REQUEST_RELEASE:"Vzdať sa správy profilu",
  REQUEST_DELETE_ACCOUNT:"Požiadať o zrušenie účtu",
};
export function PartnerLifecycleRequest({resourceId,account=false}:{
  resourceId?:string;account?:boolean;
}){
  const router=useRouter();
  const [action,setAction]=useState<Action>("REQUEST_HIDE");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [done,setDone]=useState("");
  const selected:Action=account?"REQUEST_DELETE_ACCOUNT":action;
  async function submit(){
    if(busy)return;
    if(!window.confirm(account
      ?"Odoslať žiadosť o zrušenie účtu? Profilom sa pri schválení nemení verejný obsah."
      :"Odoslať žiadosť? Profil ani oprávnenia sa nezmenia, kým administrátor nerozhodne."))return;
    setBusy(true);setError("");setDone("");
    try{
      const response=await fetch("/api/partner/lifecycle",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:selected,resourceId:account?undefined:resourceId,reason:reason.trim()}),
      });
      const payload=await response.json() as {error?:string};
      if(!response.ok)throw new Error(payload.error||"Žiadosť sa nepodarila uložiť.");
      setDone("Žiadosť bola odoslaná administrátorovi. Dovtedy sa nič nemení.");
      setReason("");
      router.refresh();
    }catch(error){setError(error instanceof Error?error.message:"Žiadosť sa nepodarila uložiť.");}
    finally{setBusy(false);}
  }
  return <section className="partner-lifecycle-actions" aria-label="Žiadosti o správu záznamu">
    <h3>{account?"Zrušenie partnerského účtu":"Správa a viditeľnosť profilu"}</h3>
    <p>{account
      ?"Účet sa nezruší automaticky. Po schválení prestanete spravovať profily, ktoré zostanú zverejnené."
      :"Skrytie, archiváciu alebo ukončenie správy musí vždy schváliť administrátor."}</p>
    {!account&&<label className="partner-field"><span>Čo potrebujete?</span>
      <select value={action} disabled={busy} onChange={event=>setAction(event.target.value as Action)}>
        {(["REQUEST_HIDE","REQUEST_ARCHIVE","REQUEST_RELEASE"] as Action[]).map(key=>
          <option key={key} value={key}>{labels[key]}</option>)}
      </select>
    </label>}
    <label className="partner-field"><span>Dôvod / poznámka (voliteľné)</span>
      <textarea rows={2} maxLength={2000} value={reason} disabled={busy}
        onChange={event=>setReason(event.target.value)} />
    </label>
    <button type="button" className="button" onClick={submit} disabled={busy||!account&&!resourceId}>
      {busy?"Odosielam…":labels[selected]}
    </button>
    {error&&<p role="alert" className="partner-field-error">{error}</p>}
    {done&&<p role="status">{done}</p>}
  </section>;
}
