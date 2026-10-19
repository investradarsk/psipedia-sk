"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {AdminActionButton} from "@/components/admin-interaction-system";
import {EditorUnsavedChangesGuard} from "@/components/admin-editor-workspace";
import type {CatalogEditorItem} from "@/lib/service-catalog-admin-editor-view";
import type {AdminServiceChoiceDto} from "@/lib/service-catalog-admin-api-contract";
import {selectionForEditor} from "@/lib/service-catalog-admin-api-contract";
import styles from "./admin-service-catalog.module.css";

type StoredChoice={optionId:string;choice:"yes"|"no";version:number};
type InputChoice="yes"|"no"|"unknown";
export function AdminServiceProfileValues({profileId,entries,initialChoices,writeEnabled,error}:{
  profileId:number;entries:readonly CatalogEditorItem[];initialChoices:readonly StoredChoice[];writeEnabled:boolean;error:string|null;
}){
  const [saved,setSaved]=useState<Record<string,StoredChoice>>(()=>Object.fromEntries(initialChoices.map(c=>[c.optionId,c])));
  const [draft,setDraft]=useState<Record<string,InputChoice>>({});
  const [query,setQuery]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{setSaved(Object.fromEntries(initialChoices.map(c=>[c.optionId,c])));setDraft({});},[initialChoices]);
  const services=useMemo(()=>entries.filter(x=>x.kind==="service"&&x.label.toLocaleLowerCase("sk").includes(query.toLocaleLowerCase("sk"))),[entries,query]);
  const attributes=entries.filter(x=>x.kind==="attribute");
  const changed=services.filter(x=>draft[x.id]!==undefined&&draft[x.id]!==selectionForEditor(saved[x.id]));
  async function save(){
    if(!writeEnabled||busy||changed.length===0)return;
    setBusy(true);setMessage("");
    let completed=0;
    try{
      for(const item of changed){
        const choice=draft[item.id];
        if(choice==="unknown")continue; // Reset-to-unknown is not an authorized API operation.
        const response=await fetch(`/api/admin/directory/${profileId}/service-options`,{
          method:"PATCH",headers:{"content-type":"application/json"},cache:"no-store",
          body:JSON.stringify({optionId:item.id,choice,expectedVersion:saved[item.id]?.version??0}),
        });
        const json=await response.json() as {error?:string;selection?:AdminServiceChoiceDto};
        if(!response.ok||!json.selection)throw new Error(json.error??"Uloženie služby nebolo potvrdené.");
        setSaved(old=>({...old,[item.id]:{optionId:item.id,choice:json.selection!.choice,version:json.selection!.version}}));
        setDraft(old=>{const next={...old};delete next[item.id];return next;});
        completed++;
      }
      setMessage(`Uložených: ${completed} možností.`);
    }catch(e){setMessage(`Uložených: ${completed}. ${e instanceof Error?e.message:"Chyba ukladania."} Obnov údaje pred ďalším pokusom pri konflikte.`);}
    finally{setBusy(false);}
  }
  return <section className={styles.profileCard} aria-label="Services V3 — služby a vlastnosti na profile">
    <div className={styles.profileHeading}><div><h2>Services V3 — hodnoty profilu</h2><p>Neznáme = bez potvrdenej hodnoty. Nikdy neznamená automaticky Nie.</p></div><Link href="/admin/sluzby-pre-psov/katalog">Správa katalógu →</Link></div>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {!writeEnabled&&<p className={styles.notice}>Kanonické zápisy sú vypnuté. Aktuálne hodnoty môžeš čítať, ale nie meniť.</p>}
    <label className={styles.profileSearch}>Hľadať službu<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Názov služby"/></label>
    <div className={styles.profileList}>{services.map(item=>{
      const savedValue=saved[item.id];
      const value=draft[item.id]??selectionForEditor(savedValue);
      return <label className={styles.profileRow} key={item.id}>
        <span><strong>{item.label}</strong><small>{item.group}</small></span>
        <select aria-label={`Hodnota: ${item.label}`} value={value} disabled={!writeEnabled||Boolean(error)||busy}
          onChange={e=>setDraft(old=>({...old,[item.id]:e.target.value as InputChoice}))}>
          <option value="unknown" disabled={Boolean(savedValue)}>Neznáme</option>
          <option value="yes">Áno</option><option value="no">Nie</option>
        </select>
      </label>;
    })}{services.length===0&&<p>Nenašli sa žiadne vhodné služby.</p>}</div>
    <div className={styles.actions}><AdminActionButton variant="primary" onClick={save} disabled={!writeEnabled||Boolean(error)||busy||changed.length===0}>{busy?"Ukladám…":`Uložiť hodnoty (${changed.length})`}</AdminActionButton><span role="status">{message}</span></div>
    <p className={styles.muted}>Zmena Áno/Nie využíva verziované API. Návrat uloženej hodnoty na Neznáme vyžaduje osobitnú bezpečnú operáciu a zatiaľ nie je povolený.</p>
    <h3>Vlastnosti ({attributes.length})</h3>
    <p className={styles.muted}>Vlastnosti majú samostatný dátový model. Ich úpravy zostávajú vypnuté do dokončenia API a synchronizácie Notionu.</p>
    {attributes.length>0&&<ul className={styles.attributeList}>{attributes.slice(0,30).map(a=><li key={a.id}>{a.label}</li>)}{attributes.length>30&&<li>Ďalšie vlastnosti sú dostupné v katalógu.</li>}</ul>}
    <EditorUnsavedChangesGuard active={changed.length>0} open={false} onStay={()=>{}} onDiscard={()=>setDraft({})}/>
  </section>;
}
