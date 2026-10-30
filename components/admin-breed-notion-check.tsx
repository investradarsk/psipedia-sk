"use client";

import { useState } from "react";

type Receipt={
  linked:boolean;
  notionChildren:number|null;
  adminChildren:number|null;
  lastSyncedAt:string|null;
  receipt:string;
  queue:ReadonlyArray<{status:string;outcome:string|null;attempts:number;error:string|null;receivedAt:number}>;
};
type RetryResult={summary?:{updated:number;unchanged:number;failed:number};after?:Receipt;matched?:boolean;error?:string};

export function AdminBreedNotionCheck({breedId}:{breedId:number}){
  const [data,setData]=useState<Receipt|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const url="/api/admin/breeds/"+breedId+"/notion-check";
  async function inspect(){
    setBusy(true);setMessage("");
    try{
      const r=await fetch(url,{credentials:"same-origin",cache:"no-store"});
      const body=await r.json() as Receipt & {error?:string};
      if(!r.ok)throw new Error(body.error||"Kontrola zlyhala.");
      setData(body);
    }catch(e){setMessage(e instanceof Error?e.message:"Kontrola zlyhala.");}
    finally{setBusy(false);}
  }
  async function retryChildren(){
    if(busy)return;
    setBusy(true);setMessage("");
    try{
      const r=await fetch(url,{
        method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},
        body:JSON.stringify({field:"children"}),
      });
      const body=await r.json() as RetryResult;
      if(body.after)setData(body.after);
      if(!r.ok)throw new Error(body.error||"Zmena sa nepreniesla. Skontroluj stav webhooku.");
      setMessage(body.matched
        ?"Deti sú zhodné v Notione aj v admine. Obnov editor na zobrazenie uloženej hodnoty."
        :"Prenos skončil bez potvrdenia rovnakej hodnoty; pozri výsledok kontroly.");
    }catch(e){setMessage(e instanceof Error?e.message:"Prenos zlyhal.");}
    finally{setBusy(false);}
  }
  const mismatch=data?.linked&&data.notionChildren!==data.adminChildren;
  return <section aria-label="Synchronizácia plemena s Notionom"
    style={{padding:"12px 16px",border:"1px solid var(--border,#ddd)",
      borderRadius:12,margin:"12px 0",fontSize:14}}>
    <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <strong>Notion ↔ Admin</strong>
      <button type="button" disabled={busy} onClick={()=>void inspect()}>
        {busy?"Kontrolujem…":"Skontrolovať prenos"}
      </button>
      {mismatch&&<button type="button" disabled={busy} onClick={()=>void retryChildren()}>
        Preniesť Deti z Notionu
      </button>}
    </div>
    {data&&<div role="status" style={{marginTop:8}}>
      {!data.linked?"Toto plemeno nemá uložené prepojenie.":<>
        <span>Deti v Notione: <b>{data.notionChildren??"prázdne"}</b></span>
        {" · "}
        <span>Deti v admine: <b>{data.adminChildren??"prázdne"}</b></span>
        {" · "}
        <span>{mismatch?"Hodnoty sa líšia":"Hodnoty sú zhodné"}</span>
        {data.queue[0]?<div>
          Posledná webhook udalosť: {data.queue[0].status}
          {data.queue[0].outcome?" ("+data.queue[0].outcome+")":""},
          pokusov {data.queue[0].attempts}
          {data.queue[0].error?" · "+data.queue[0].error:""}
        </div>:<div>Pre toto plemeno nie je vo fronte zaznamenaná webhook udalosť.</div>}
        <div>Posledná potvrdená synchronizácia: {data.lastSyncedAt
          ?new Date(data.lastSyncedAt).toLocaleString("sk-SK"):"neuvedené"}.</div>
      </>}
    </div>}
    {message&&<p role="status" style={{marginTop:8}}>{message}</p>}
  </section>;
}
