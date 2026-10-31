"use client";
import { useEffect, useState } from "react";
import styles from "./admin-notion-field-settings.module.css";
type Direction="NOTION_TO_ADMIN"|"ADMIN_TO_NOTION";
type Receipt={scope:string;direction:Direction;recordCount:number;createdAt:string};
type Diagnostic={
  scope:string;enabled:boolean;configured:boolean;sourceConfigured:boolean;
  test:"NOT_TESTED"|"PASSED"|"FAILED"|"NOT_CONFIGURED";
  propertyCount:number|null;missingFields:string[];
  history:Receipt[];historyReady:boolean;
  previousMappingAt:string|null;previousMappingCount:number|null;
  previousMappingStatus:string;sharedMappingScope:boolean;
  testedAt:string|null;notes:string;
};
const formatDate=(value:string|null)=>{
  if(!value)return "Nie je evidovaný";
  const date=new Date(value);
  return Number.isFinite(date.getTime())?
    new Intl.DateTimeFormat("sk-SK",{dateStyle:"short",timeStyle:"medium",timeZone:"Europe/Bratislava"}).format(date):
    "Neznámy čas";
};
async function load(scope:string,live:boolean):Promise<Diagnostic>{
  const params=new URLSearchParams({scope});
  if(live)params.set("test","1");
  const result=await fetch("/api/admin/notion-connection-diagnostics?"+params.toString(),{
    credentials:"same-origin",cache:"no-store",
  });
  const payload=await result.json() as Diagnostic & {error?:string};
  if(!result.ok)throw Error(payload.error??"Kontrola nie je dostupná.");
  return payload;
}
export function AdminNotionConnectionDiagnostic({scope}:{scope:string}){
  const [data,setData]=useState<Diagnostic|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let active=true;
    void load(scope,false).then(next=>{if(active)setData(next)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Diagnostika nie je dostupná.")});
    return ()=>{active=false};
  },[scope]);
  async function test(){
    setBusy(true);setError("");
    try{setData(await load(scope,true))}
    catch(e){setError(e instanceof Error?e.message:"Test zlyhal.")}
    finally{setBusy(false)}
  }
  return <section className={styles.connection} aria-label="Diagnostika prepojenia Notion">
    <div className={styles.connectionTop}>
      <div>
        <h3>Stav prepojenia a posledné prenosy</h3>
        <p>Test iba načíta schému databázy v Notione. Nemení žiadne údaje ani nespúšťa synchronizáciu.</p>
      </div>
      <button type="button" onClick={()=>void test()} disabled={busy||!data}>
        {busy?"Testujem…":"Otestovať prepojenie"}
      </button>
    </div>
    {error?<p className={styles.error} role="alert">{error}</p>:null}
    {!data?<p>Načítavam prevádzkové údaje…</p>:<>
      <div className={styles.connectionSummary}>
        <div><small>Konfigurácia</small><strong>{!data.enabled?"Vypnutá":data.configured?"Pripravená":"Neúplná"}</strong></div>
        <div><small>Test Notion API</small><strong>{
          data.test==="PASSED"?"Úspešný":
          data.test==="FAILED"?"Neúspešný":
          data.test==="NOT_CONFIGURED"?"Nie je nakonfigurované":"Zatiaľ nespustený"
        }</strong></div>
        <div><small>Posledné evidované zosúladenie</small>
          <strong>{formatDate(data.previousMappingAt)}</strong></div>
        <div><small>Prepojené záznamy</small>
          <strong>{data.previousMappingCount??"Neznámy počet"}</strong></div>
      </div>
      {data.sharedMappingScope?<p className={styles.monitorNote}>
        Počet a starší čas pochádzajú zo spoločného adresára všetkých kategórií, nie len z tejto kategórie.
      </p>:null}
      {data.testedAt?<p className={styles.monitorNote}>Test vykonaný: {formatDate(data.testedAt)}
        {data.propertyCount!==null?" · "+data.propertyCount+" polí dostupných v Notione":""}</p>:null}
      {data.test==="PASSED"&&data.missingFields.length>0?
        <p className={styles.monitorWarning}>Pozor: tieto mapované názvy nie sú v aktuálnej schéme Notion:
          {" "+data.missingFields.join(", ")}. Skontroluj mapovanie, nejde o dôkaz zlyhaného prenosu.</p>:null}
      <h4>Posledné potvrdené prenosy</h4>
      {!data.historyReady?<p className={styles.monitorNote}>
        Denník smerov zatiaľ nie je aktivovaný (produkčná migrácia 0148). Historický smer neodhadujeme.
      </p>:data.history.length===0?<p className={styles.monitorNote}>
        Zatiaľ bez potvrdeného prenosu tejto kategórie od aktivácie denníka.
      </p>:<div className={styles.transferTableWrap}><table className={styles.transferTable}>
        <thead><tr><th>Čas</th><th>Smer</th><th>Počet záznamov</th></tr></thead>
        <tbody>{data.history.map((entry,index)=><tr key={entry.createdAt+":"+index}>
          <td>{formatDate(entry.createdAt)}</td>
          <td>{entry.direction==="NOTION_TO_ADMIN"?"Notion → Admin":"Admin → Notion"}</td>
          <td>{entry.recordCount}</td>
        </tr>)}</tbody>
      </table></div>}
      <p className={styles.monitorNote}>Smer sa zaznamenáva iba pri skutočne dokončenom prenose.
        Čas starších prepojení nepreukazuje smer ani zhodu jednotlivých polí.</p>
    </>}
  </section>;
}
