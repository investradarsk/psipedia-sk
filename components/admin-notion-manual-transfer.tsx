"use client";
import { useCallback,useEffect,useMemo,useState } from "react";
import styles from "./admin-notion-manual-transfer.module.css";

type Field={id:string;label:string;locked:boolean};
type Scope={id:string;label:string;editable:number;locked:number;fields:Field[]};
type Area={area:string;label:string;scopes:Scope[]};
type Capabilities={executable:boolean;migrationReady:boolean;areas:Area[];note:string};
type FieldResult={field_key:string;status:string;reason_code:string|null};
type Item={id:number;scope:string;profile_id:number;status:string;attempts:number;
  changed_fields:number;failed_fields:number;last_error_code:string|null;fields:FieldResult[]};
type Run={id:string;area:string;scope:string|null;direction:string;selection:string;
  status:string;total_profiles:number;processed_profiles:number;
  changed_fields:number;failed_fields:number;created_at:string};
type Detail={run:Run;items:Item[];offset:number;hasMore:boolean};
type ServerError={error?:string;runId?:string;items?:number;status?:string};
const directionLabel=(value:string)=>value==="NOTION_TO_ADMIN"?"Notion → Admin":"Admin → Notion";
const statusText:Record<string,string>={
  PREVIEW:"Kontrolujem rozdiely – skontrolované profily možno preniesť",
  PREVIEW_READY:"Náhľad pripravený na potvrdenie",
  QUEUED:"Čaká na vykonanie",RUNNING:"Prenášam a overujem",
  COMPLETED:"Prenos ukončený",PARTIAL:"Ukončené s chybami",
  FAILED:"Nedokončené – chyby",CANCELLED:"Zrušené",
};
const reasonText:Record<string,string>={
  PROTECTED_FIELD:"Chránený údaj",SPECIAL_ADAPTER_REQUIRED:"Vyžaduje samostatný adaptér",
  FIELD_MISSING:"Pole chýba na jednej strane",MISSING_VALUE:"Chýbajúca hodnota",
  IDENTITY_MISMATCH:"Nesprávne prepojenie profilu",
  TRANSFER_PREVIEW_STALE:"Údaje sa zmenili od kontroly; vytvor nový náhľad",
  TRANSFER_FIELD_NOT_MATCHED:"Hodnoty sa po zápise nezhodujú",
  TRANSFER_FIELD_VERIFICATION_FAILED:"Niektoré polia sa po zápise nezhodujú",
  TRANSFER_ADAPTER_FAILED:"Prenos zlyhal v synchronizačnom adaptéri",
};
function errorLabel(code:string|null|undefined){
  if(!code)return "Bez uvedeného dôvodu";
  return reasonText[code]??code;
}
async function readJson<T>(response:Response):Promise<T>{
  const body=await response.json() as T & {error?:string};
  if(!response.ok)throw Error(body.error??"SERVER_ERROR");
  return body;
}
export function AdminNotionManualTransfer(){
  const [cap,setCap]=useState<Capabilities|null>(null);
  const [area,setArea]=useState("breeds");
  const [scope,setScope]=useState("");
  const [selection,setSelection]=useState<"ONE"|"ALL">("ONE");
  const [profileId,setProfileId]=useState("");
  const [direction,setDirection]=useState<"NOTION_TO_ADMIN"|"ADMIN_TO_NOTION">("NOTION_TO_ADMIN");
  const [runId,setRunId]=useState("");
  const [detail,setDetail]=useState<Detail|null>(null);
  const [lastPollAt,setLastPollAt]=useState<number|null>(null);
  const [history,setHistory]=useState<Run[]>([]);
  const [offset,setOffset]=useState(0);
  const [onlyErrors,setOnlyErrors]=useState(false);
  const [onlyDifferences,setOnlyDifferences]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");

  const selectedArea=cap?.areas.find(item=>item.area===area);
  const selectedScope=selectedArea?.scopes.find(item=>item.id===scope);
  const fieldLabels=useMemo(()=>{
    const labels:Record<string,string>={};
    for(const group of cap?.areas??[])for(const item of group.scopes)
      for(const f of item.fields)labels[item.id+":"+f.id]=f.label;
    return labels;
  },[cap]);
  const load=useCallback(async(id:string,off:number,errors:boolean,differences:boolean)=>{
    const query=new URLSearchParams({runId:id,offset:String(off),errors:errors?"1":"0",
      differences:differences?"1":"0"});
    const response=await fetch("/api/admin/notion-manual-transfer?"+query,{cache:"no-store",credentials:"same-origin"});
    const value=await readJson<Detail>(response);
    setDetail(value);
  },[]);
  useEffect(()=>{
    let live=true;
    void Promise.all([
      fetch("/api/admin/notion-manual-transfer/capabilities",{cache:"no-store",credentials:"same-origin"}).then(readJson<Capabilities>),
      fetch("/api/admin/notion-manual-transfer",{cache:"no-store",credentials:"same-origin"}).then(readJson<{runs:Run[]}>),
    ]).then(([abilities,list])=>{if(live){setCap(abilities);setHistory(list.runs??[]);}})
      .catch(e=>{if(live)setError(e instanceof Error?e.message:"Kontrola sa nenačítala.")});
    return ()=>{live=false};
  },[]);
  useEffect(()=>{
    if(!runId)return;
    let active=true;
    const refresh=async()=>{try{
      const query=new URLSearchParams({runId,offset:String(offset),errors:onlyErrors?"1":"0",
        differences:onlyDifferences?"1":"0"});
      const response=await fetch("/api/admin/notion-manual-transfer?"+query,
        {cache:"no-store",credentials:"same-origin"});
      const body=await readJson<Detail>(response);
      if(active){setDetail(body);setLastPollAt(Date.now());}
    }catch(e){if(active)setError(e instanceof Error?e.message:"Načítanie zlyhalo.")}};
    void refresh();
    const timer=window.setInterval(()=>{void refresh()},7000);
    return ()=>{active=false;window.clearInterval(timer)};
  },[runId,offset,onlyErrors,onlyDifferences]);
  const chooseRun=(id:string)=>{
    setRunId(id);setOffset(0);setOnlyErrors(false);setOnlyDifferences(true);
    setDetail(null);setLastPollAt(null);setError("");setMessage("");
  };
  async function post(payload:Record<string,unknown>){
    setBusy(true);setError("");setMessage("");
    try{
      const result=await readJson<ServerError>(await fetch("/api/admin/notion-manual-transfer",{
        method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload),
      }));
      if(result.runId && result.runId!==runId)chooseRun(result.runId);
      else if(result.runId && runId)await load(runId,offset,onlyErrors,onlyDifferences);
      setMessage(result.status==="PREVIEW"
        ?"Kontrola beží. Profily s rozdielmi sa zobrazujú priebežne a možno ich prenášať jednotlivo."
        :result.status==="QUEUED_ITEM"
          ?"Prenos vybraného profilu bol potvrdený. Kontrola ostatných pokračuje."
          :"Požiadavka prijatá. Výsledok sa zobrazí v priebehu.");
    }catch(e){setError(e instanceof Error?e.message:"Akcia zlyhala.");}
    finally{setBusy(false)}
  }
  const request={
    area,direction,selection,...(scope?{scope}:{}),
    ...(selection==="ONE"?{profileId:Number(profileId)}:{}),
  };
  const canStart=cap?.executable&&!busy&&
    (selection==="ALL"||(/^[1-9]\d*$/.test(profileId)&&Number.isSafeInteger(Number(profileId))))&&
    (selection==="ALL"||area!=="help"||!!scope);
  const canConfirm=detail?.run.status==="PREVIEW_READY"&&!busy;
  const canRetry=["PARTIAL","FAILED"].includes(detail?.run.status??"")&&!busy;
  const progress=detail?.run.total_profiles
    ?Math.round((detail.run.processed_profiles/detail.run.total_profiles)*100):0;
  const waitingForFirstProfile=Boolean(detail?.run.status==="PREVIEW"
    &&detail.run.processed_profiles===0
    &&Number.isFinite(Date.parse(detail.run.created_at))
    &&lastPollAt!==null&&lastPollAt-Date.parse(detail.run.created_at)>4*60*1000);

  return <section className={styles.root} aria-label="Jednorazový prenos údajov">
    <div className={styles.head}>
      <div><h2>Jednorazová synchronizácia</h2>
        <p>Najprv skontrolujeme aktuálne hodnoty. Prenos spustíš osobitným potvrdením.</p>
      </div><span className={styles.state}>{cap?.executable?"Pripravené":"Zatiaľ neaktivované"}</span>
    </div>
    {cap&&!cap.executable?<p className={styles.notice} role="status">{cap.note}</p>:null}
    <div className={styles.controls}>
      <label>Oblasť
        <select value={area} onChange={e=>{setArea(e.target.value);setScope("")}}>
          {(cap?.areas??[{area:"breeds",label:"Plemená",scopes:[]}]).map(item=>
            <option key={item.area} value={item.area}>{item.label}</option>)}
        </select>
      </label>
      <label>Podkategória
        <select value={scope} onChange={e=>setScope(e.target.value)}>
          <option value="">Všetky kategórie</option>
          {(selectedArea?.scopes??[]).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>
      <label>Rozsah
        <select value={selection} onChange={e=>setSelection(e.target.value as "ONE"|"ALL")}>
          <option value="ONE">Jeden profil</option><option value="ALL">Všetky profily</option>
        </select>
      </label>
      {selection==="ONE"?<label>Psipedia ID
        <input type="number" min="1" value={profileId}
          onChange={e=>setProfileId(e.target.value)} placeholder="napr. 3214"/>
      </label>:null}
      <label>Smer
        <select value={direction} onChange={e=>setDirection(e.target.value as "NOTION_TO_ADMIN"|"ADMIN_TO_NOTION")}>
          <option value="NOTION_TO_ADMIN">Notion → Admin</option>
          <option value="ADMIN_TO_NOTION">Admin → Notion</option>
        </select>
      </label>
    </div>
    {selectedScope?<p className={styles.hint}>Kategória {selectedScope.label}: {selectedScope.editable} nastaviteľných a {selectedScope.locked} chránených polí.</p>:null}
    {selection==="ONE"&&area==="help"&&!scope?<p className={styles.hint}>
      Pri jednom profile v Pomoc psom vyber aj podkategóriu, aby bolo ID jednoznačné.
    </p>:null}
    <button type="button" className={styles.primary} disabled={!canStart}
      onClick={()=>void post({action:"preview",...request})}>
      {busy?"Spracúvam…":"1. Skontrolovať rozdiely"}
    </button>
    {message?<p role="status" className={styles.success}>{message}</p>:null}
    {error?<p role="alert" className={styles.error}>{errorLabel(error)}</p>:null}
    {detail?<div className={styles.run}>
      <h3>Kontrola / prenos: {directionLabel(detail.run.direction)}</h3>
      <p><strong>{statusText[detail.run.status]??detail.run.status}</strong> ·
        {detail.run.processed_profiles} z {detail.run.total_profiles} profilov ·
        {progress}%</p>
      <progress max={detail.run.total_profiles||1} value={detail.run.processed_profiles}/>
      {detail.run.status==="PREVIEW"&&detail.run.selection==="ALL"
        ?<p className={styles.hint}>Hromadná kontrola beží po dávkach cez minútový cron (najviac 10 profilov za minútu).
          Profily s rozdielmi sa zobrazujú priebežne. Každý už skontrolovaný profil môžeš preniesť samostatne;
          ostatné sa budú ďalej kontrolovať. Nič sa neprenesie bez potvrdenia.</p>:null}
      {waitingForFirstProfile
        ?<p className={styles.notice} role="status">Zatiaľ sa nedokončil ani prvý profil. Môžu sa spracúvať staršie úlohy;
          ak sa priebeh ďalej nepohne, treba preveriť minútový cron alebo chyby jeho vykonávania.</p>:null}
      <div className={styles.stats}>
        <div><strong>{detail.run.total_profiles}</strong><span>Profilov</span></div>
        <div><strong>{detail.run.changed_fields}</strong><span>{["PREVIEW","PREVIEW_READY"].includes(detail.run.status)?"Rozdielov":"Prenesených polí"}</span></div>
        <div><strong>{detail.run.failed_fields}</strong><span>Chybných polí</span></div>
      </div>
      {canConfirm?<div className={styles.confirm}>
        <p><strong>Náhľad je kompletný.</strong> Profily prenesené jednotlivo už neprenášame znova.
          Môžeš potvrdiť prenos zostávajúcich skontrolovaných profilov.</p>
        <button className={styles.primary} type="button" disabled={busy}
          onClick={()=>{
            if(window.confirm("Spustiť prenos "+directionLabel(detail.run.direction)+
              " pre zostávajúce skontrolované profily? Už prenesené profily zostanú nedotknuté."))
              void post({action:"confirm",runId:detail.run.id,confirm:"CONFIRM_NOTION_MANUAL_TRANSFER"});
          }}>Preniesť zostávajúce profily</button>
      </div>:null}
      {canRetry?<button type="button" disabled={busy}
        onClick={()=>void post({action:"retry",runId:detail.run.id,confirm:"RETRY_ONLY_FAILED"})}>
        Znova skontrolovať len neúspešné profily
      </button>:null}
      <div className={styles.tableHead}>
        <h4>Výsledky po profiloch a poliach</h4>
        <div className={styles.filters}>
          <label><input type="checkbox" checked={onlyDifferences}
            onChange={e=>{setOnlyDifferences(e.target.checked);if(e.target.checked)setOnlyErrors(false);setOffset(0)}}/> Iba profily s rozdielmi</label>
          <label><input type="checkbox" checked={onlyErrors}
            onChange={e=>{setOnlyErrors(e.target.checked);if(e.target.checked)setOnlyDifferences(false);setOffset(0)}}/> Iba chybné profily</label>
        </div>
      </div>
      {detail.items.length===0?<p>Zatiaľ nie sú spracované položky alebo tomuto filtru nič nezodpovedá.</p>:null}
      {detail.items.map(item=><details key={item.id} className={styles.item}>
        <summary><strong>{item.scope} · ID {item.profile_id}</strong>
          <span>{item.status==="PENDING"
            ?(item.attempts>0?"Prenos čaká vo fronte":"Čaká na kontrolu")
            :item.status==="PREVIEWING"?"Kontroluje sa"
            :item.status==="PREVIEWED"?"Rozdiely skontrolované"
            :item.status==="DONE"?"Prenos overený":item.status} · {item.changed_fields} zmien · {item.failed_fields} chýb</span>
        </summary>
        {item.last_error_code?<p className={styles.error}>Dôvod: {errorLabel(item.last_error_code)}</p>:null}
        {["PREVIEW","PREVIEW_READY"].includes(detail.run.status) &&
          item.status==="PREVIEWED" && item.changed_fields>0
          ?<div className={styles.itemActions}>
            <span>Skontrolovaný profil: {item.changed_fields} rozdielov. Ostatné profily zostanú nedotknuté.</span>
            <button type="button" className={styles.primary} disabled={busy}
              onClick={()=>{
                if(window.confirm("Preniesť profil ID "+item.profile_id+" ("+
                    directionLabel(detail.run.direction)+")? Pred zápisom znovu overíme rozdiely."))
                  void post({action:"confirm_item",runId:detail.run.id,itemId:item.id,
                    confirm:"CONFIRM_ONE_NOTION_PROFILE"});
              }}>Preniesť tento profil</button>
          </div>:null}
        {item.fields.length?<table><thead><tr><th>Pole</th><th>Výsledok</th><th>Dôvod</th></tr></thead>
          <tbody>{item.fields.map(field=><tr key={field.field_key}>
            <td>{fieldLabels[item.scope+":"+field.field_key]??field.field_key}</td>
            <td>{field.status}</td><td>{field.reason_code?errorLabel(field.reason_code):"—"}</td>
          </tr>)}</tbody></table>:<p>Čaká na kontrolu.</p>}
      </details>)}
      <div className={styles.pager}>
        <button type="button" disabled={offset===0} onClick={()=>setOffset(Math.max(0,offset-100))}>Predchádzajúce</button>
        <span>{offset+1} – {offset+detail.items.length}</span>
        <button type="button" disabled={!detail.hasMore} onClick={()=>setOffset(offset+100)}>Ďalšie</button>
      </div>
    </div>:null}
    <details className={styles.history}>
      <summary>História posledných prenosov</summary>
      {history.length===0?<p>Zatiaľ bez spustených prenosov.</p>:null}
      {history.map(item=><button type="button" key={item.id} onClick={()=>chooseRun(item.id)}>
        {item.created_at?.slice(0,16)} · {item.area} · {directionLabel(item.direction)} · {statusText[item.status]??item.status}
      </button>)}
    </details>
    <p className={styles.footer}>Trvalé priority sa nemenia. Publikovanie, identita, Services V3 a potvrdené Google údaje zostávajú chránené. Niektoré médiá a vzťahy vyžadujú samostatný adaptér a zobrazia sa ako preskočené.</p>
  </section>;
}
