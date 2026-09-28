"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
export function PartnerEventWithdrawButton({id}:{id:string}){
 const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");
 async function run(){if(busy||!window.confirm("Naozaj chcete návrh podujatia zrušiť?"))return;setBusy(true);setMessage("");
 try{const response=await fetch(`/api/partner/events/${encodeURIComponent(id)}/withdraw`,{method:"POST",headers:{"content-type":"application/json"},body:"{}"});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||"Návrh sa nepodarilo zrušiť.");router.refresh();}
 catch(error){setMessage(error instanceof Error?error.message:"Návrh sa nepodarilo zrušiť.");}finally{setBusy(false);}}
 return <div className="partner-request-action"><button type="button" disabled={busy} onClick={run}>{busy?"Ruším…":"Zrušiť návrh"}</button>{message?<span role="status">{message}</span>:null}</div>;
}
