"use client";
import { useEffect,useMemo,useState } from "react";
import styles from "./admin-notion-field-settings.module.css";
import { AdminNotionConnectionDiagnostic } from "./admin-notion-connection-diagnostic";
type Mode="safe"|"notion"|"admin"|"latest";
type Field={id:string;label:string;notionLabel?:string;locked?:boolean;note?:string};
type Group={scope:string;title:string;family:string;active:boolean;fields:Field[]};
type Result={ready:boolean;groups:Group[];rules:Record<string,Mode>;note:string};
const labels:Record<Mode,string>={
  safe:"Bezpečné porovnanie (predvolené)",
  notion:"Notion má prednosť",
  admin:"Admin má prednosť",
  latest:"Najnovšia overená zmena",
};
type BreedDiagnostic={breedId:number;name:string;field:string;notionValue:unknown;adminValue:unknown;same:boolean;expectedNotionHash:string;lastSyncedAt:string;adminUpdatedAt:string;inbox:{status:string;attempts:number;outcome:string|null;last_error_code:string|null}|null};
function BreedTransferDiagnostic(){
  const [id,setId]=useState("");
  const [field,setField]=useState("intro");
  const [result,setResult]=useState<BreedDiagnostic|null>(null);
  const [status,setStatus]=useState("");
  const [busy,setBusy]=useState(false);
  async function inspect(){
    setBusy(true);setStatus("");setResult(null);
    try{
      const r=await fetch("/api/admin/notion-breed-transfer?id="+encodeURIComponent(id)+"&field="+encodeURIComponent(field),{cache:"no-store"});
      const data=await r.json() as BreedDiagnostic & {error?:string};
      if(!r.ok)throw Error(data.error??"Kontrola zlyhala.");
      setResult(data);
    }catch(e){setStatus(e instanceof Error?e.message:"Kontrola zlyhala.")}finally{setBusy(false)}
  }
  async function transfer(){
    if(!result||result.same||busy)return;
    setBusy(true);setStatus("");
    try{
      const r=await fetch("/api/admin/notion-breed-transfer",{method:"POST",credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({id:result.breedId,field:result.field,
          expectedNotionHash:result.expectedNotionHash,confirm:true})});
      const data=await r.json() as {ok?:boolean;error?:string};
      if(!r.ok||!data.ok)throw Error(data.error??"Prenos vyžaduje kontrolu.");
      setStatus("Pole prenesené. Obnovujem porovnanie…");
      await inspect();
    }catch(e){setStatus(e instanceof Error?e.message:"Prenos zlyhal.")}finally{setBusy(false)}
  }
  return <section className={styles.explainer}>
    <h2>Kontrola prenosu konkrétneho plemena</h2>
    <p>Diagnostika porovná aktuálne hodnoty priamo v D1 a Notione.
      Ručné prenesenie je obmedzené na potvrdené jedno pole a odmietne novšiu úpravu Adminu.</p>
    <div className={styles.diagnosticControls}>
      <label>Psipedia ID <input type="number" min="1" value={id}
        onChange={e=>{setId(e.target.value);setResult(null)}} placeholder="napr. 3129"/></label>
      <label>Pole <select value={field} onChange={e=>{setField(e.target.value);setResult(null)}}>
        <option value="intro">Úvod</option><option value="children">Deti</option>
        <option value="character">Charakter</option><option value="health">Zdravie</option>
        <option value="training">Výcvik</option><option value="needs">Potreby</option>
      </select></label>
      <button type="button" disabled={busy||!id} onClick={()=>void inspect()}>
        Skontrolovať prenos
      </button>
    </div>
    {status?<p role="status">{status}</p>:null}
    {result?<div className={styles.diagnosticResult}>
      <p><strong>{result.name}</strong> · {result.same?"Hodnoty sa zhodujú":"Hodnoty sa líšia"} ·
        posledný potvrdený sync {result.lastSyncedAt||"nie je evidovaný"}</p>
      <p>Posledná udalosť: {result.inbox?.status??"Neoverená"} ·
        pokusy {result.inbox?.attempts??"?"} · {result.inbox?.last_error_code??""}</p>
      <div className={styles.values}><div><strong>Notion</strong>
        <p>{JSON.stringify(result.notionValue)?.slice(0,1200)}</p></div>
        <div><strong>Admin</strong><p>{JSON.stringify(result.adminValue)?.slice(0,1200)}</p></div></div>
      {!result.same?<button type="button" disabled={busy} onClick={()=>void transfer()}>
        Preniesť len toto pole z Notionu do Adminu
      </button>:null}
    </div>:null}
  </section>;
}

export function AdminNotionFieldSettings(){
  const [result,setResult]=useState<Result|null>(null);
  const [scope,setScope]=useState("directory:veterinari");
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [busy,setBusy]=useState("");
  useEffect(()=>{
    let active=true;
    void fetch("/api/admin/notion-field-authority",{cache:"no-store",credentials:"same-origin"})
      .then(async r=>{
        if(!r.ok)throw Error("Nedá sa načítať konfigurácia Notion.");
        return r.json() as Promise<Result>;
      })
      .then(data=>{if(active)setResult(data)})
      .catch(e=>{if(active)setError(String(e))});
    return ()=>{active=false};
  },[]);
  const group=useMemo(()=>result?.groups.find(g=>g.scope===scope)??result?.groups[0],[result,scope]);
  async function save(field:string,mode:Mode){
    if(!group||!result?.ready||busy)return;
    const key=group.scope+":"+field;
    const before=result.rules[key]??"safe";
    setResult({...result,rules:{...result.rules,[key]:mode}});
    setBusy(key);setError("");setMessage("");
    try{
      const r=await fetch("/api/admin/notion-field-authority",{
        method:"PUT",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({scope:group.scope,field,mode}),
      });
      if(!r.ok){const payload=await r.json() as {error?:string};throw Error(payload.error??"Uloženie zlyhalo.")}
      setMessage("Pravidlo pre pole „"+group.fields.find(f=>f.id===field)?.label+"“ bolo uložené.");
    }catch(e){
      setResult(value=>value?{...value,rules:{...value.rules,[key]:before}}:value);
      setError(e instanceof Error?e.message:"Uloženie sa nepodarilo.");
    }finally{setBusy("")}
  }
  const families=[...new Set(result?.groups.map(g=>g.family)??[])];
  return <section className={styles.root}>
    <div className={styles.explainer}>
      <strong>Priorita údajov podľa kategórie a poľa</strong>
      <p>Predvolené bezpečné porovnanie prenáša samostatné úpravy. „Admin“ chráni jeho hodnotu;
      „Notion“ uprednostní redakčnú úpravu aj pri preukázanom konflikte.
      „Najnovšia overená zmena“ nevyberá víťaza podľa času celej stránky: keď nevieme overiť
      čas konkrétneho poľa, konflikt zostane na kontrolu.</p>
      <p>Pravidlá sa uplatnia na nasledujúce synchronizácie. Nespúšťajú hromadný prepis existujúcich záznamov.</p>
    </div>
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    {message?<p role="status" className={styles.success}>{message}</p>:null}
    {!result?<p>Načítavam…</p>:null}
    {result&&!result.ready?<p role="alert" className={styles.error}>{result.note}</p>:null}
    {result?<div className={styles.columns}>
      <nav className={styles.navigation} aria-label="Agendy Notion">
        {families.map(family=><div key={family} className={styles.group}>
          <h3>{family}</h3>
          {result.groups.filter(g=>g.family===family).map(item=>
            <button type="button" key={item.scope} aria-current={item.scope===group?.scope?"page":undefined}
              className={item.scope===group?.scope?styles.selected:styles.navButton}
              onClick={()=>{setScope(item.scope);setError("");setMessage("")}}>{item.title}</button>)}
        </div>)}
      </nav>
      {group?<div className={styles.details}>
        <header><h2>{group.title}</h2><p>{group.active?"Nastaviteľné polia existujúcej synchronizácie.":"Prehľad pevne určených pravidiel (zatiaľ bez editácie)."}</p></header>
        <AdminNotionConnectionDiagnostic key={group.scope} scope={group.scope}/>
        <div className={styles.tableWrap}><table className={styles.table}>
          <thead><tr><th>Pole v Admine</th><th>Prepojenie v Notione</th><th>Priorita</th></tr></thead>
          <tbody>{group.fields.map(field=><tr key={field.id}>
            <td><strong>{field.label}</strong>{field.note?<small>{field.note}</small>:null}</td>
            <td>{field.notionLabel??(field.locked?'Pevné systémové pravidlo':field.label)}</td>
            <td>{field.locked||!group.active?
              <span className={styles.fixed}>{group.active?"Chránené / pevné pravidlo":"Existujúce pravidlo agendy"}</span>:
              <select aria-label={"Priorita: "+field.label}
                disabled={!result.ready||Boolean(busy)}
                value={result.rules[group.scope+":"+field.id]??"safe"}
                onChange={event=>void save(field.id,event.target.value as Mode)}>
                {(Object.entries(labels) as [Mode,string][]).map(([value,label])=>
                  <option key={value} value={value}>{label}</option>)}
              </select>}</td>
          </tr>)}</tbody>
        </table></div>
        {group.scope==="breeds"?<BreedTransferDiagnostic/>:null}
      </div>:null}
    </div>:null}
  </section>;
}
