"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
export function AdminPartnerAgreementCreate({interestId}:{interestId:string}){
  const router=useRouter(),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setMessage("");
    const data=new FormData(event.currentTarget);
    const price=Number(data.get("priceEuros")??0);
    const body={
      interestId,priceCents:Number.isFinite(price)?Math.round(price*100):NaN,currency:"EUR",
      paymentMethod:String(data.get("paymentMethod")??"BANK_TRANSFER"),
      startAt:String(data.get("startAt")??""),endAt:String(data.get("endAt")??""),
      partnerNote:String(data.get("partnerNote")??""),paymentInstruction:String(data.get("paymentInstruction")??""),
      adminNote:String(data.get("adminNote")??""),
    };
    try{
      const response=await fetch("/api/admin/partners/commercial/agreements",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const payload=await response.json() as {error?:string;agreement?:{id?:string}};
      if(!response.ok)throw new Error(payload.error||"Dohodu sa nepodarilo vytvoriť.");
      setMessage("Ponuka bola vytvorená.");router.push(`/admin/partners/commercial/agreements/${payload.agreement?.id}`);
    }catch(error){setMessage(error instanceof Error?error.message:"Dohodu sa nepodarilo vytvoriť.");}
    finally{setBusy(false);}
  }
  return <section className="admin-form-card"><h2>Vytvoriť ponuku / dohodu</h2>
    <p>Lead zostane v histórii. Cena je uložená v integer centoch; platobný stav a aktivácia sú samostatné kroky.</p>
    <form className="admin-commercial-actions" onSubmit={submit}>
      <label>Cena v EUR<input name="priceEuros" type="number" min="0" step="0.01" required /></label>
      <label>Spôsob platby<select name="paymentMethod" defaultValue="BANK_TRANSFER"><option value="BANK_TRANSFER">Bankový prevod</option><option value="BY_AGREEMENT">Podľa dohody</option></select></label>
      <label>Začiatok<input name="startAt" type="datetime-local" required /></label>
      <label>Koniec<input name="endAt" type="datetime-local" required /></label>
      <label>Poznámka pre Partnera<textarea name="partnerNote" rows={4} maxLength={2000} /></label>
      <label>Platobné pokyny pre Partnera<textarea name="paymentInstruction" rows={3} maxLength={2000} placeholder="Platobné údaje vám zašleme po dohode." /></label>
      <label>Interná admin poznámka<textarea name="adminNote" rows={4} maxLength={3000} /></label>
      <button disabled={busy}>{busy?"Vytváram…":"Vytvoriť ponuku / dohodu"}</button>{message&&<p role="status">{message}</p>}
    </form>
  </section>;
}
