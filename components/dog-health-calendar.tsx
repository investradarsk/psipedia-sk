"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { PublicActionButton } from "@/components/public-visual-system";
import { PublicTextInput, PublicSelect, PublicTextarea, PublicChoiceInput } from "@/components/public-visual-system/public-form-controls";
import { DOG_HEALTH_STORAGE_KEY, DOG_HEALTH_TYPES, MAX_DOGS, MAX_ENTRIES, parseHealthData, localHealthDate, validHealthDate, healthEntryTitle, healthMonthDays, moveHealthMonth, removeHealthDog, type HealthData, type HealthEntry, type HealthType } from "@/lib/dog-health-calendar";
import { buildDateCalendar } from "@/lib/date-calendar-export";
import styles from "./dog-health-calendar.module.css";

const EVENT = "psipedia-dog-health-change";
function subscribe(notify:()=>void) {
  const storage = (event:StorageEvent) => { if(event.key===DOG_HEALTH_STORAGE_KEY || event.key===null) notify(); };
  window.addEventListener("storage",storage); window.addEventListener(EVENT,notify);
  return ()=>{window.removeEventListener("storage",storage);window.removeEventListener(EVENT,notify);};
}
function snapshot():string|null { try{return localStorage.getItem(DOG_HEALTH_STORAGE_KEY)??"{}";}catch{return null;} }
const serverSnapshot=()=>undefined;
const noopSubscribe=()=>()=>{};
const clientReady=()=>true, serverReady=()=>false;
const weekdays=["Po","Ut","St","Št","Pi","So","Ne"];
const formatDate=(date:string)=>new Intl.DateTimeFormat("sk-SK",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"));
const formatMonth=(month:string)=>new Intl.DateTimeFormat("sk-SK",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(month+"-01T00:00:00Z"));
type Draft = {id?:string;dogId:string;type:HealthType;date:string;title:string;notes:string;done:boolean;weight:string};
function newDraft(dogId:string,date:string):Draft { return {dogId,date,type:"vaccination",title:"",notes:"",done:false,weight:""}; }

export function DogHealthCalendar(){
  const ready=useSyncExternalStore(noopSubscribe,clientReady,serverReady);
  const raw=useSyncExternalStore<string|null|undefined>(subscribe,snapshot,serverSnapshot);
  const [session,setSession]=useState<HealthData|null>(null);
  const data=session??parseHealthData(raw);
  const today=ready?localHealthDate():"2026-01-01";
  const [month,setMonth]=useState("");
  const currentMonth=month||today.slice(0,7);
  const [selected,setSelected]=useState("all");
  const filter=selected==="all"||data.dogs.some(d=>d.id===selected)?selected:"all";
  const [name,setName]=useState("");
  const [renaming,setRenaming]=useState<string|null>(null);
  const [draft,setDraft]=useState<Draft|null>(null);
  const [confirmation,setConfirmation]=useState<{kind:"dog"|"entry";id:string}|null>(null);
  const [error,setError]=useState("");
  const [entryError,setEntryError]=useState("");
  const [notice,setNotice]=useState("");
  const [reminder,setReminder]=useState(false);
  const [history,setHistory]=useState(false);
  const [day,setDay]=useState("");
  const editorRef=useRef<HTMLElement>(null);
  const confirmationRef=useRef<HTMLDivElement>(null);
  const draftOpen=Boolean(draft), confirmationOpen=Boolean(confirmation);
  useEffect(()=>{if(draftOpen)editorRef.current?.focus();},[draftOpen]);
  useEffect(()=>{if(confirmationOpen)confirmationRef.current?.focus();},[confirmationOpen]);
  const filtered=data.entries.filter(e=>filter==="all"||e.dogId===filter);
  const sorted=[...filtered].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  const pending=sorted.filter(e=>!e.done&&e.type!=="weight");
  const overdue=pending.filter(e=>e.date<today);
  const upcoming=pending.filter(e=>e.date>=today);
  const monthEntries=sorted.filter(e=>e.date.startsWith(currentMonth+"-"));
  const dogsById=new Map(data.dogs.map(d=>[d.id,d.name]));
  const latest=()=>session??parseHealthData(snapshot());
  function save(next:HealthData){
    try{localStorage.setItem(DOG_HEALTH_STORAGE_KEY,JSON.stringify(next));setSession(null);window.dispatchEvent(new Event(EVENT));}
    catch{setSession(next);}
  }
  function addDog(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError("");setNotice("");
    const value=name.trim();if(!value){setError("Zadaj meno psa.");return;}
    const current=latest();
    if(renaming){
      if(!current.dogs.some(d=>d.id===renaming)){setError("Profil už nie je dostupný.");return;}
      save({...current,dogs:current.dogs.map(d=>d.id===renaming?{...d,name:value}:d)});setRenaming(null);
    }else{
      if(current.dogs.length>=MAX_DOGS){setError("Dosiahol si limit 30 psov.");return;}
      const id=crypto.randomUUID();save({...current,dogs:[...current.dogs,{id,name:value}]});setSelected(id);
    }
    setName("");setNotice("Profil psa uložený.");
  }
  function openDraft(date=today){
    setEntryError("");setNotice("");setDraft(newDraft(filter==="all"?data.dogs[0]?.id??"":filter,date));
  }
  function saveEntry(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setEntryError("");setNotice("");if(!draft)return;
    const current=latest();
    if(!current.dogs.some(d=>d.id===draft.dogId)||!validHealthDate(draft.date)){setEntryError("Vyber psa a platný dátum.");return;}
    const weight=Number(draft.weight.replace(",","."));
    if(draft.type==="weight"&&(!Number.isFinite(weight)||weight<=0||weight>200||draft.date>today)){setEntryError("Zadaj nameranú hmotnosť (viac ako 0, najviac 200 kg) a dnešný alebo minulý dátum.");return;}
    if(draft.type!=="weight"&&draft.done&&draft.date>today){setEntryError("Budúci termín nemôže byť označený ako vykonaný.");return;}
    if(draft.id&&!current.entries.some(e=>e.id===draft.id)){setEntryError("Záznam už nie je dostupný.");return;}
    if(!draft.id&&current.entries.length>=MAX_ENTRIES){setEntryError("Dosiahol si limit 2 000 záznamov.");return;}
    const record:HealthEntry={id:draft.id??crypto.randomUUID(),dogId:draft.dogId,type:draft.type,date:draft.date,title:draft.title.trim(),notes:draft.notes.trim(),done:draft.type==="weight"||draft.done,...(draft.type==="weight"?{weight}:{})};
    save({...current,entries:[...current.entries.filter(e=>e.id!==record.id),record]});
    if(filter!=="all")setSelected(record.dogId);
    setMonth(record.date.slice(0,7));setDay("");setDraft(null);setNotice("Záznam uložený.");
  }
  function edit(entry:HealthEntry){setEntryError("");setNotice("");setDraft({...entry,weight:entry.weight===undefined?"":String(entry.weight)});}
  function finish(entry:HealthEntry){
    const current=latest();if(entry.date>today||entry.type==="weight")return;
    save({...current,entries:current.entries.map(e=>e.id===entry.id?{...e,done:!e.done}:e)});
  }
  function remove(){
    if(!confirmation)return;
    const current=latest();
    if(confirmation.kind==="dog"){
      save(removeHealthDog(current,confirmation.id));
      if(draft?.dogId===confirmation.id)setDraft(null);
      if(renaming===confirmation.id){setRenaming(null);setName("");}
      if(selected===confirmation.id)setSelected("all");
    }else{
      save({...current,entries:current.entries.filter(e=>e.id!==confirmation.id)});
      if(draft?.id===confirmation.id)setDraft(null);
    }
    setConfirmation(null);setNotice("Záznam odstránený.");
  }
  function exportCalendar(){
    const current=latest();const names=new Map(current.dogs.map(d=>[d.id,d.name]));
    const events=current.entries.filter(e=>(filter==="all"||e.dogId===filter)&&!e.done&&e.type!=="weight"&&e.date>=today).map(e=>({uid:e.id,date:e.date,summary:healthEntryTitle(e)+" – "+names.get(e.dogId),reminder}));
    if(!events.length){setNotice("Žiadne budúce termíny na export.");return;}
    const url=URL.createObjectURL(new Blob([buildDateCalendar(events)],{type:"text/calendar;charset=utf-8"}));
    const link=document.createElement("a");link.href=url;link.download="psipedia-zdravotny-kalendar.ics";document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setNotice("Súbor .ics je pripravený na import do osobného kalendára.");
  }
  const renderEntry=(e:HealthEntry)=><li key={e.id} className={styles.entry}>
    <div><strong>{healthEntryTitle(e)}{e.type==="weight"?" · "+e.weight?.toLocaleString("sk-SK")+" kg":""}</strong><small>{dogsById.get(e.dogId)} · {formatDate(e.date)} · {e.done?"Vykonané":e.date<today?"Po termíne":"Naplánované"}</small>{e.notes&&<p>{e.notes}</p>}</div>
    <div className={styles.actions}><PublicActionButton variant="secondary" onClick={()=>edit(e)}>Upraviť</PublicActionButton>{e.type!=="weight"&&e.date<=today&&<PublicActionButton variant="secondary" onClick={()=>finish(e)}>{e.done?"Označiť ako plánované":"Označiť ako vykonané"}</PublicActionButton>}<button type="button" className={styles.textButton} onClick={()=>setConfirmation({kind:"entry",id:e.id})}>Odstrániť</button></div>
  </li>;
  return <section className={styles.tool} data-dog-health-calendar aria-label="Osobný zdravotný kalendár">
    <div className={styles.panel}>
      <h2>Moje psy</h2>
      <p className={styles.note}>{ready&&(session!==null||raw===null)?"Ukladanie nie je dostupné. Zmeny zostanú iba počas tejto návštevy.":"Údaje sa ukladajú iba v tomto prehliadači. Nie sú zálohované ani synchronizované medzi zariadeniami."} Nepoužívaj citlivé osobné údaje; vymazanie údajov prehliadača odstráni evidenciu.</p>
      <form className={styles.inlineForm} onSubmit={addDog}><label>Meno psa<PublicTextInput value={name} maxLength={60} required disabled={!ready} onChange={e=>setName(e.target.value)}/></label><PublicActionButton type="submit" disabled={!ready}>{renaming?"Uložiť meno":"Pridať psa"}</PublicActionButton>{renaming&&<PublicActionButton variant="secondary" onClick={()=>{setRenaming(null);setName("");}}>Zrušiť</PublicActionButton>}</form>
      {data.dogs.length>0&&<><label className={styles.field}>Zobraziť psa<PublicSelect value={filter} onChange={e=>{setSelected(e.target.value);setDay("");}}><option value="all">Všetky psy</option>{data.dogs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</PublicSelect></label>
        <div className={styles.dogs}>{data.dogs.filter(d=>filter==="all"||filter===d.id).map(d=><div key={d.id}><strong>{d.name}</strong><button type="button" className={styles.textButton} onClick={()=>{setRenaming(d.id);setName(d.name);}}>Premenovať</button><button type="button" className={styles.textButton} onClick={()=>setConfirmation({kind:"dog",id:d.id})}>Odstrániť psa</button></div>)}</div></>}
      {!data.dogs.length&&<p>Pridaj prvého psa a vytvor si vlastný prehľad.</p>}
      {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.note}>{notice}</p>}
      {confirmation&&<div ref={confirmationRef} tabIndex={-1} role="group" aria-label="Potvrdenie odstránenia" className={styles.confirm}><p>{confirmation.kind==="dog"?"Odstrániť psa aj všetky jeho zdravotné záznamy?":"Odstrániť tento záznam?"}</p><PublicActionButton variant="secondary" onClick={remove}>Áno, odstrániť</PublicActionButton><PublicActionButton variant="secondary" onClick={()=>setConfirmation(null)}>Zrušiť</PublicActionButton></div>}
    </div>
    <noscript><p>Na evidenciu a export potrebuješ JavaScript.</p></noscript>
    {ready&&data.dogs.length>0&&<>
      <div className={styles.panel}>
        <div className={styles.heading}><h2>Termíny</h2><PublicActionButton onClick={()=>openDraft()}>Pridať záznam</PublicActionButton></div>
        <div className={styles.stats}><div><strong>{overdue.length}</strong><span>Po termíne</span></div><div><strong>{upcoming.length}</strong><span>Naplánované</span></div><div><strong>{sorted.filter(e=>e.done).length}</strong><span>Vykonané</span></div></div>
        <div className={styles.heading}><PublicActionButton variant="secondary" aria-label="Predchádzajúci mesiac" onClick={()=>{setMonth(moveHealthMonth(currentMonth,-1));setDay("");}}>←</PublicActionButton><h3>{formatMonth(currentMonth)}</h3><PublicActionButton variant="secondary" aria-label="Nasledujúci mesiac" onClick={()=>{setMonth(moveHealthMonth(currentMonth,1));setDay("");}}>→</PublicActionButton></div>
        <div className={styles.month} aria-label={"Kalendár "+formatMonth(currentMonth)}>{weekdays.map(d=><span key={d} className={styles.weekday}>{d}</span>)}{healthMonthDays(currentMonth).map((date,i)=>date?<button key={date} type="button" className={styles.day} data-today={date===today} aria-pressed={day===date} aria-label={formatDate(date)+", záznamy: "+monthEntries.filter(e=>e.date===date).length} onClick={()=>setDay(day===date?"":date)}>{Number(date.slice(-2))}{monthEntries.some(e=>e.date===date)&&<span className={styles.dot}/>}</button>:<span key={"empty"+i}/>)}</div>
        {day&&<div className={styles.heading}><h3>{formatDate(day)}</h3><PublicActionButton variant="secondary" onClick={()=>openDraft(day)}>Pridať na tento deň</PublicActionButton></div>}
        <ul className={styles.list}>{monthEntries.filter(e=>!day||e.date===day).map(renderEntry)}</ul>
        {!monthEntries.some(e=>!day||e.date===day)&&<p className={styles.note}>Žiadne záznamy v tomto období.</p>}
      </div>
      {draft&&<section ref={editorRef} tabIndex={-1} className={styles.panel} aria-label="Úprava zdravotného záznamu">
        <h2>{draft.id?"Upraviť záznam":"Nový záznam"}</h2>
        <form className={styles.form} onSubmit={saveEntry}>
          <label>Pes<PublicSelect value={draft.dogId} onChange={e=>setDraft({...draft,dogId:e.target.value})}>{data.dogs.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</PublicSelect></label>
          <label>Druh záznamu<PublicSelect value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value as HealthType,done:false})}>{Object.entries(DOG_HEALTH_TYPES).map(([key,label])=><option key={key} value={key}>{label}</option>)}</PublicSelect></label>
          <label>Dátum<PublicTextInput type="date" required min="1900-01-01" max={draft.type==="weight"?today:"2099-12-31"} value={draft.date} onChange={e=>setDraft({...draft,date:e.target.value})}/></label>
          {draft.type==="weight"&&<label>Hmotnosť (kg)<PublicTextInput type="text" inputMode="decimal" required value={draft.weight} onChange={e=>setDraft({...draft,weight:e.target.value})}/></label>}
          <label>Názov (nepovinný)<PublicTextInput maxLength={100} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
          <label className={styles.wide}>Poznámka (nepovinná)<PublicTextarea rows={3} maxLength={500} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label>
          {draft.type!=="weight"&&<label className={styles.choice}><PublicChoiceInput checked={draft.done} onChange={e=>setDraft({...draft,done:e.target.checked})}/> Už vykonané</label>}
          {entryError&&<p role="alert" className={styles.error}>{entryError}</p>}
          <div className={styles.actions}><PublicActionButton type="submit">Uložiť záznam</PublicActionButton><PublicActionButton variant="secondary" onClick={()=>{setDraft(null);setEntryError("");}}>Zrušiť</PublicActionButton></div>
        </form>
      </section>}
      <section className={styles.panel}><h2>Najbližšie a zmeškané termíny</h2><ul className={styles.list}>{[...overdue,...upcoming].slice(0,20).map(renderEntry)}</ul>{!pending.length&&<p className={styles.note}>Nemáš žiadne otvorené termíny.</p>}{pending.length>20&&<p className={styles.note}>Zobrazených prvých 20 termínov. Ďalšie nájdeš v príslušnom mesiaci.</p>}
        <label className={styles.choice}><PublicChoiceInput checked={reminder} onChange={e=>setReminder(e.target.checked)}/> Do exportu pridať upozornenie 1 deň vopred</label>
        <PublicActionButton variant="secondary" disabled={!upcoming.length} onClick={exportCalendar}>Export budúcich termínov (.ics)</PublicActionButton>
        <p className={styles.note}>Súbor importuj do Google Kalendára, Apple Kalendára alebo Outlooku. Nejde o živý odber; upozornenia závisia od aplikácie. Poznámky sa neexportujú. Pri zmene termínu uprav aj svoj osobný kalendár.</p>
      </section>
      <section className={styles.panel}><h2>História a hmotnosť</h2>
        <div className={styles.dogs}>{data.dogs.filter(d=>filter==="all"||d.id===filter).map(d=>{const weights=sorted.filter(e=>e.dogId===d.id&&e.type==="weight");const last=weights.at(-1);return <div key={d.id}><strong>{d.name}</strong><span>{last?last.weight?.toLocaleString("sk-SK")+" kg · "+formatDate(last.date):"Bez záznamu hmotnosti"}</span></div>;})}</div>
        <PublicActionButton variant="secondary" onClick={()=>setHistory(!history)} aria-expanded={history}>{history?"Skryť históriu":"Zobraziť históriu"}</PublicActionButton>
        {history&&<ul className={styles.list}>{sorted.filter(e=>e.done).reverse().map(renderEntry)}</ul>}
      </section>
    </>}
  </section>;
}
