"use client";
import { useEffect,useRef,useState } from "react";
import { HELP_LEGACY_CLEANUP_CONFIRMATION } from "@/lib/help-legacy-cleanup-plan.mjs";

type Preview={ready:boolean;blockers:string[];remaining:number;completed:number;total:number};
type Step={state:"BLOCKED"|"COMPLETE"|"PROGRESS";preflight:Preview;reason?:string};
const endpoint="/api/admin/help/legacy-cleanup";
export function AdminHelpLegacyCleanup() {
  const [preview,setPreview]=useState<Preview|null>(null);
  const [confirmation,setConfirmation]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const stop=useRef(false);
  async function refresh(){
    const response=await fetch(endpoint,{cache:"no-store"});
    const value=await response.json() as Preview & {error?:string};
    if(!response.ok)throw Error(value.error||"Kontrola zlyhala.");
    setPreview(value);
    return value;
  }
  useEffect(()=>{
    let active=true;
    void fetch(endpoint,{cache:"no-store"}).then(async r=>{
      if(!r.ok)throw Error("Kontrola D1 nie je dostupná.");
      const v=await r.json() as Preview;
      if(active)setPreview(v);
    }).catch(e=>{if(active)setError(String(e))});
    return ()=>{active=false;stop.current=true};
  },[]);
  async function run() {
    if(busy||!preview?.ready||preview.remaining===0||confirmation!==HELP_LEGACY_CLEANUP_CONFIRMATION)return;
    stop.current=false;setBusy(true);setError("");
    try{
      // One server request removes at most one ID. Closing this page stops the
      // client loop; durable tombstones let a later run safely resume.
      for(let i=0;i<140 && !stop.current;i++){
        const response=await fetch(endpoint,{
          method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({confirmation:HELP_LEGACY_CLEANUP_CONFIRMATION}),
        });
        const body=await response.json() as Step & {error?:string};
        if(!response.ok || body.state==="BLOCKED")
          throw Error(body.error||body.reason||"Operácia bola bezpečne zastavená.");
        setPreview(body.preflight);
        if(body.state==="COMPLETE")break;
      }
      if(!stop.current)await refresh();
    }catch(e){
      setError(e instanceof Error?e.message:"Čistenie sa prerušilo.");
      await refresh().catch(()=>undefined);
    }finally{setBusy(false)}
  }
  return <section style={{maxWidth:800,padding:"1rem 0"}}>
    <p>Táto jednorazová operácia odstráni iba 36 historických adopčných a 104 útulkových SQL kópií.
      Každú starú stránku v Notione najprv overí a presunie do koša. Aktuálne adopcie,
      organizácie, bežné prípady Pomoc psom a technické JSON zostanú zachované.</p>
    <p><strong>Pred spustením:</strong> skontroluj počet a otvor túto stránku v jednom okne.
      Pri prerušení sa proces dá bezpečne obnoviť.</p>
    {preview && <p>Odstránené: <strong>{preview.completed} / {preview.total}</strong>.
      Zostáva: <strong>{preview.remaining}</strong>.
      Stav: <strong>{preview.ready?"Pripravené":"Zablokované"}</strong>.</p>}
    {preview?.blockers?.length ? <p role="alert">Blokátory: {preview.blockers.join(", ")}. Nič sa neodstraňuje.</p>:null}
    <label htmlFor="help-legacy-confirm">Napíš presne: {HELP_LEGACY_CLEANUP_CONFIRMATION}</label>
    <input id="help-legacy-confirm" type="text" autoComplete="off"
      value={confirmation} onChange={e=>setConfirmation(e.target.value)}
      style={{display:"block",width:"100%",maxWidth:420,padding:10,margin:"10px 0"}} />
    <button type="button" disabled={busy||!preview?.ready||preview.remaining===0||
      confirmation!==HELP_LEGACY_CLEANUP_CONFIRMATION} onClick={()=>void run()}>
      {busy?"Odstraňujem historické kópie…":"Potvrdiť a odstrániť historické kópie"}
    </button>
    {busy && <button style={{marginLeft:12}} type="button" onClick={()=>{stop.current=true}}>
      Zastaviť po aktuálnom zázname
    </button>}
    {error&&<p role="alert">{error}</p>}
    {preview?.remaining===0&&preview.ready&&<p role="status">Historické SQL kópie sú odstránené.</p>}
  </section>;
}
