"use client";

import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {AdminActionButton} from "@/components/admin-interaction-system";
import {EditorActionBar,EditorWorkspace,EditorStatus} from "@/components/admin-editor-workspace";
import type {CatalogEditorItem} from "@/lib/service-catalog-admin-editor-view";
import {manualCatalogMirrorAction,manualCatalogMirrorConfirmation,
  type CatalogMirrorManualAction} from "@/lib/service-catalog-admin-mirror-controls";
import styles from "./admin-service-catalog.module.css";

type Category={id:string;label:string};
type Draft={name:string;category:string;kind:"service"|"attribute";group:string;meaning:string};
type MirrorInventory={mode:"READ_ONLY";canonicalDynamicCount:number;notionPageCount:number;receiptCount:number;blocked:boolean;
  items:Array<{optionId:string;version:number;disposition:"NEEDS_PAGE"|"MAPPED_PENDING"|"SYNCED_VERIFIED"|"BLOCKED";reason?:string}>;
  unmappedNotionOptionIds:string[]};
const blank:Draft={name:"",category:"",kind:"service",group:"",meaning:""};
const statusTone=(status:string)=>status==="ACTIVE"||status==="SYNCED"?"success":status==="CONFLICT"||status==="RETIRED"?"danger":status==="DRAFT"||status==="PENDING"?"warning":"neutral";

export function AdminServiceCatalogWorkspace({items,categories,writeEnabled,mirrorEnabled=false,pageCreationEnabled=false,loadError}:{
  items:readonly CatalogEditorItem[];categories:readonly Category[];writeEnabled:boolean;
  mirrorEnabled?:boolean;pageCreationEnabled?:boolean;loadError:string|null;
}){
  const router=useRouter();
  const [query,setQuery]=useState("");
  const [kind,setKind]=useState("all");
  const [category,setCategory]=useState("all");
  const [state,setState]=useState("all");
  const [filtersOpen,setFiltersOpen]=useState(false);
  const activeFilterCount=Number(kind!=="all")+Number(category!=="all")+Number(state!=="all");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [creating,setCreating]=useState(false);
  const [editing,setEditing]=useState<CatalogEditorItem|null>(null);
  const [draft,setDraft]=useState<Draft>(blank);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [messageIsError,setMessageIsError]=useState(false);
  const [inventory,setInventory]=useState<MirrorInventory|null>(null);
  const [inventoryLoading,setInventoryLoading]=useState(false);
  const [inventoryError,setInventoryError]=useState("");
  const [mirrorOperation,setMirrorOperation]=useState<{action:CatalogMirrorManualAction;optionId:string;label:string}|null>(null);
  const [mirrorConfirmation,setMirrorConfirmation]=useState("");
  const visible=useMemo(()=>items.filter(item=>{
    const q=query.trim().toLocaleLowerCase("sk");
    return (!q||[item.label,item.group,item.id,item.meaning].some(x=>x.toLocaleLowerCase("sk").includes(q)))
      &&(kind==="all"||item.kind===kind)
      &&(category==="all"||item.categories.includes(category))
      &&(state==="all"||item.status===state||item.mirror===state);
  }),[items,query,kind,category,state]);
  const selected=visible.find(item=>item.id===selectedId)??visible[0]??null;
  const selectedMirrorAction=manualCatalogMirrorAction(selected,inventory,{mirrorEnabled,pageCreationEnabled});
  const dirty=editing
    ? draft.name!==editing.label||draft.group!==editing.group||draft.meaning!==editing.meaning||draft.category!==editing.categories[0]
    : Object.values(draft).some((value)=>value!==""&&value!=="service");
  const draftValid=writeEnabled&&!loadError&&draft.name.trim().length>=3&&draft.group.trim().length>=2&&draft.meaning.trim().length>=10&&Boolean(draft.category);
  const createReady=draftValid&&!editing;
  const editReady=draftValid&&Boolean(editing)&&dirty;
  const closeEditor=()=>{setCreating(false);setEditing(null);setDraft(blank);};
  const isDynamic=(item:CatalogEditorItem)=>item.source==="admin"&&item.version!==null;
  const mayEdit=(item:CatalogEditorItem)=>writeEnabled&&!loadError&&isDynamic(item)&&item.status==="DRAFT"&&item.mirror!=="CONFLICT";
  const mayApprove=(item:CatalogEditorItem)=>writeEnabled&&!loadError&&isDynamic(item)&&item.status==="DRAFT"&&item.mirror==="SYNCED";
  const mayRetire=(item:CatalogEditorItem)=>writeEnabled&&!loadError&&isDynamic(item)&&item.status!=="RETIRED";
  const mayRetry=(item:CatalogEditorItem)=>writeEnabled&&!loadError&&isDynamic(item)&&item.status!=="RETIRED"&&item.mirror==="CONFLICT";
  async function create(){
    if(!createReady||busy)return;
    setBusy(true);setMessage("");
    try{
      const res=await fetch("/api/admin/service-catalog/options",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(draft),cache:"no-store"});
      const data=await res.json() as {error?:string;option?:{id:string}};
      if(!res.ok||!data.option?.id)throw new Error(data.error??"Vytvorenie nebolo potvrdené.");
      closeEditor();setSelectedId(data.option.id);setMessageIsError(false);setInventory(null);
      setMessage("Koncept bol uložený. Na verejnom webe zatiaľ nie je aktívny.");
      router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Vytvorenie zlyhalo.");}
    finally{setBusy(false);}
  }
  async function inspectInventory(){
    if(inventoryLoading||busy)return;
    setInventoryLoading(true);setInventoryError("");
    try{
      const response=await fetch("/api/admin/service-catalog/notion-mirror",{method:"GET",cache:"no-store"});
      const result=await response.json() as {state?:string;value?:MirrorInventory;reason?:string;error?:string};
      if(!response.ok||result.state!=="INVENTORY"||result.value?.mode!=="READ_ONLY")
        throw new Error(result.error??result.reason??"Inventúru sa nepodarilo načítať.");
      setInventory(result.value);
    }catch(error){
      setInventory(null);
      setInventoryError(error instanceof Error?error.message:"Read-only inventúra zlyhala.");
    }finally{setInventoryLoading(false);}
  }
  function startEdit(item:CatalogEditorItem){
    if(!mayEdit(item)||busy)return;
    setMessage("");setMessageIsError(false);
    setDraft({name:item.label,category:item.categories[0]??"",group:item.group,meaning:item.meaning,kind:item.kind});
    setEditing(item);
  }
  async function patchOption(item:CatalogEditorItem,body:Record<string,unknown>,success:string){
    if(!isDynamic(item)||busy||!writeEnabled||loadError)return;
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/admin/service-catalog/options/"+encodeURIComponent(item.id),{
        method:"PATCH",headers:{"content-type":"application/json"},cache:"no-store",
        body:JSON.stringify({...body,expectedVersion:item.version}),
      });
      const data=await response.json() as {error?:string;option?:{version:number}};
      if(!response.ok||!data.option?.version)throw new Error(data.error??"Zmenu sa nepodarilo potvrdiť.");
      closeEditor();setInventory(null);setMessageIsError(false);setMessage(success);
      router.refresh();
    }catch(error){
      setMessageIsError(true);setInventory(null);
      setMessage(error instanceof Error?error.message:"Zápis zlyhal. Obnov katalóg.");
      // An unsuccessful CAS must never be blindly retried with a stale version.
      router.refresh();
    }finally{setBusy(false);}
  }
  async function saveEdit(){
    const item=editing;
    if(!item||!mayEdit(item)||!editReady)return;
    await patchOption(item,{action:"edit",name:draft.name,category:draft.category,group:draft.group,meaning:draft.meaning},
      "Zmeny konceptu boli uložené. Notion synchronizácia musí potvrdiť novú verziu.");
  }
  function changeLifecycle(action:"approve"|"retire"|"retryMirror",item:CatalogEditorItem){
    if(action==="approve"&&!mayApprove(item))return;
    if(action==="retire"&&!mayRetire(item))return;
    if(action==="retryMirror"&&!mayRetry(item))return;
    if(action==="retire"&&!window.confirm("Natrvalo vyradiť túto možnosť z katalógu? Vyradenie nemožno vrátiť."))return;
    if(action==="approve"&&!window.confirm("Schváliť túto možnosť? Schválenie vyžaduje overený Notion receipt aktuálnej verzie."))return;
    const success=action==="approve"?"Možnosť bola schválená.":action==="retire"?
      "Možnosť bola vyradená.":"Konflikt bol vrátený do stavu PENDING. Samotná synchronizácia sa tým nespustila.";
    void patchOption(item,{action},success);
  }
  function prepareMirror(item:CatalogEditorItem){
    const action=manualCatalogMirrorAction(item,inventory,{mirrorEnabled,pageCreationEnabled});
    if(!action||busy||inventoryLoading)return;
    setMessage("");setMessageIsError(false);setMirrorConfirmation("");
    setMirrorOperation({action,optionId:item.id,label:item.label});
  }
  async function executeMirror(){
    const operation=mirrorOperation;
    if(!operation||busy||!writeEnabled)return;
    const item=items.find(x=>x.id===operation.optionId)??null;
    if(manualCatalogMirrorAction(item,inventory,{mirrorEnabled,pageCreationEnabled})!==operation.action){
      setMirrorOperation(null);setInventory(null);
      setMessageIsError(true);setMessage("Stav katalógu sa zmenil. Obnov inventúru pred ďalším pokusom.");
      return;
    }
    const expected=manualCatalogMirrorConfirmation(operation.action,operation.optionId);
    if(mirrorConfirmation!==expected)return;
    setBusy(true);setMessage("");setMessageIsError(false);
    try{
      const response=await fetch("/api/admin/service-catalog/notion-mirror",{
        method:"POST",headers:{"content-type":"application/json"},cache:"no-store",
        body:JSON.stringify({action:operation.action,optionId:operation.optionId,confirmation:expected}),
      });
      const payload=await response.json() as {
        state?:string;result?:{state?:string;reason?:string};error?:string;reason?:string
      };
      const state=payload.result?.state;
      if(!response.ok||!["CREATED_NEEDS_MIRROR","EXISTS","VERIFIED"].includes(state??""))
        throw new Error(payload.result?.reason??payload.reason??payload.error??"Výsledok nie je potvrdený. Skontroluj inventúru; nepokračuj naslepo.");
      setMessage(state==="VERIFIED"
        ? "Notion bol nezávisle overený a zápis potvrdený v D1. Obnov inventúru pred schválením."
        : "Stránka v Notione bola nájdená alebo vytvorená. Obnov inventúru a potom spusti samostatné overenie synchronizácie.");
    }catch(error){
      setMessageIsError(true);
      setMessage((error instanceof Error?error.message:"Synchronizáciu sa nepodarilo potvrdiť.")+
        " Ak je výsledok neistý, akciu neopakuj; najprv skontroluj D1 a Notion.");
    }finally{
      setMirrorOperation(null);setMirrorConfirmation("");setInventory(null);
      setBusy(false);router.refresh();
    }
  }
  return <section className={styles.stack} aria-label="Katalóg služieb a vlastností">
    <div className={styles.statusPanel} data-write-enabled={writeEnabled ? "true" : "false"}>
      <div className={styles.statusIntro}>
        <span className={styles.statusIcon} aria-hidden="true">i</span>
        <div className={styles.statusCopy}>
          <h2>{!writeEnabled ? "Zápisy sú vypnuté" : loadError ? "Vytváranie konceptov je pozastavené" : "Vytváranie konceptov je dostupné"}</h2>
          <p>{!writeEnabled
            ? "Vytváranie a úpravy možností katalógu sú momentálne nedostupné."
            : loadError
              ? "Katalóg sa nepodarilo úplne načítať. Vytváranie konceptov je dočasne nedostupné."
              : "Koncepty možno vytvárať a upravovať. Schválenie vyžaduje SYNCED a overený Notion receipt; vyradenie je nezvratné."}</p>
        </div>
      </div>
      <details className={styles.statusDetails}>
        <summary>Podrobnosti o katalógu</summary>
        <ul className={styles.statusFacts}>
          <li>Kanonický register možností je v D1.</li>
          <li>Vstavané statické možnosti nie sú editovateľné.</li>
          <li>Nové možnosti začínajú ako DRAFT / PENDING.</li>
          <li>Vytvorenie konceptu neznamená automatické schválenie ani verejné publikovanie.</li>
          <li>Dostupnosť administračných operácií závisí od bezpečnostných a lifecycle podmienok.</li>
        </ul>
      </details>
    </div>
    {loadError&&<p role="alert" className={styles.error}>{loadError}</p>}
    <div className={styles.inventoryBar}>
      <AdminActionButton onClick={inspectInventory} disabled={inventoryLoading||busy}>
        {inventoryLoading?"Načítavam inventúru…":"Overiť D1 ↔ Notion (iba čítanie)"}
      </AdminActionButton>
      {inventory&&<p role="status">
        D1 dynamické možnosti: <strong>{inventory.canonicalDynamicCount}</strong> ·
        Notion stránky: <strong>{inventory.notionPageCount}</strong> ·
        Overené záznamy: <strong>{inventory.receiptCount}</strong> ·
        Blokované položky: <strong>{inventory.items.filter(item=>item.disposition==="BLOCKED").length+inventory.unmappedNotionOptionIds.length}</strong>
        {inventory.blocked?" · Vyžaduje kontrolu konfliktov.":" · Bez zisteného konfliktu vlastníctva."}
      </p>}
      {inventoryError&&<p role="alert" className={styles.error}>{inventoryError}</p>}
    </div>
    <div className={styles.filterBar}>
      <label className={styles.searchField}>Vyhľadávanie<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Služba, vlastnosť alebo ID"/></label>
      <button type="button" className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls="services-v3-catalog-advanced-filters"
        onClick={()=>setFiltersOpen(open=>!open)}>
        <span>Filtre {activeFilterCount>0? `(${activeFilterCount})` : ""}</span>
        <span aria-hidden="true">{filtersOpen?"−":"+"}</span>
      </button>
      <div id="services-v3-catalog-advanced-filters" className={styles.advancedFilters} data-expanded={filtersOpen}>
        <label>Typ<select value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Všetky typy</option><option value="service">Služby</option><option value="attribute">Vlastnosti</option></select></label>
        <label>Kategória<select value={category} onChange={e=>setCategory(e.target.value)}><option value="all">Všetky kategórie</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label>Stav<select value={state} onChange={e=>setState(e.target.value)}><option value="all">Všetky stavy</option>{["BUILT_IN","DRAFT","ACTIVE","RETIRED","PENDING","SYNCED","CONFLICT"].map(s=><option key={s}>{s}</option>)}</select></label>
      </div>
      <AdminActionButton variant="primary" onClick={()=>{setMessage("");setMessageIsError(false);setDraft(blank);setEditing(null);setCreating(true);}} disabled={!writeEnabled||Boolean(loadError)}>+ Nová možnosť</AdminActionButton>
    </div>
    <p role="status" className={styles.count}>Nájdených možností: {visible.length}</p>
    <div className={styles.layout}>
      <div className={styles.list} aria-label="Možnosti katalógu">
        {visible.slice(0,200).map(item=><button key={item.id} type="button" className={styles.listItem}
          aria-pressed={selected?.id===item.id} onClick={()=>setSelectedId(item.id)}>
          <strong>{item.label}</strong><small>{item.kind==="service"?"Služba":"Vlastnosť"} · {item.group}</small>
          <span className={styles.chips}><EditorStatus label={item.status==="BUILT_IN"?"Vstavaná":item.status} tone={statusTone(item.status)}/>{item.mirror!=="NOT_REQUIRED"&&<EditorStatus label={item.mirror} tone={statusTone(item.mirror)}/>}</span>
        </button>)}
        {visible.length>200&&<p className={styles.count}>Zobrazených prvých 200 výsledkov. Spresni vyhľadávanie.</p>}
        {visible.length===0&&<p className={styles.count}>Pre zadané filtre neboli nájdené možnosti.</p>}
      </div>
      <div className={styles.detail} aria-label="Detail vybranej možnosti">
        {selected?<><h2>{selected.label}</h2><p className={styles.muted}>{selected.id}</p>
          <div className={styles.chips}><EditorStatus label={selected.status==="BUILT_IN"?"Vstavaná":selected.status} tone={statusTone(selected.status)}/>{selected.mirror!=="NOT_REQUIRED"&&<EditorStatus label={selected.mirror} tone={statusTone(selected.mirror)}/>}</div>
          <dl className={styles.detailGrid}><dt>Typ</dt><dd>{selected.kind==="service"?"Služba":"Vlastnosť"}</dd><dt>Skupina</dt><dd>{selected.group}</dd><dt>Kategórie</dt><dd>{selected.categories.map(id=>categories.find(c=>c.id===id)?.label??id).join(", ")}</dd><dt>Význam</dt><dd>{selected.meaning}</dd><dt>Zdroj</dt><dd>{selected.source==="built_in"?"Schválený vstavaný katalóg":"Kanonická možnosť D1"}</dd><dt>Verzia</dt><dd>{selected.version??"—"}</dd></dl>
          <div className={styles.actions}>
            <AdminActionButton disabled={!mayEdit(selected)||busy} onClick={()=>startEdit(selected)}>Upraviť</AdminActionButton>
            <AdminActionButton disabled={!mayApprove(selected)||busy} onClick={()=>changeLifecycle("approve",selected)}>Schváliť</AdminActionButton>
            <AdminActionButton disabled={!mayRetry(selected)||busy} onClick={()=>changeLifecycle("retryMirror",selected)}>Opakovať po konflikte</AdminActionButton>
            <AdminActionButton disabled={!mayRetire(selected)||busy} onClick={()=>changeLifecycle("retire",selected)} variant="destructive">Archivovať</AdminActionButton>
          </div>
          {selected.source==="admin"&&selected.status==="DRAFT"&&selected.mirror==="PENDING"&&
            <div className={styles.mirrorPanel}>
              <p className={styles.muted}>D1 → Notion: {inventory
                ? inventory.blocked?"Inventúra obsahuje konflikt; zápisy sú blokované."
                  : inventory.items.find(x=>x.optionId===selected.id)?.disposition??"Možnosť nie je v overenej inventúre."
                : "Najprv vykonaj kontrolu D1 ↔ Notion (iba čítanie)."}</p>
              <AdminActionButton disabled={!selectedMirrorAction||busy||inventoryLoading}
                onClick={()=>prepareMirror(selected)}>
                {selectedMirrorAction==="PROVISION_ONE"?"Vytvoriť stránku v Notione"
                  :selectedMirrorAction==="MIRROR_ONE"?"Overiť a synchronizovať s Notionom"
                  :"Synchronizácia nie je pripravená"}
              </AdminActionButton>
              {!mirrorEnabled&&<p className={styles.muted}>Zápisy D1 → Notion sú vypnuté. Zapnutie vyžaduje samostatné produkčné schválenie.</p>}
            </div>}
          <p className={styles.muted}>Schválenie je možné až po overenom zrkadlení v Notione. Opakovanie po konflikte zmení stav v D1, nespustí Notion prenos.</p>
          {message&&<p role="status" className={messageIsError?styles.error:styles.notice}>{message}</p>}
        </>:<p>Vyber možnosť zo zoznamu.</p>}
      </div>
    </div>
    {(creating||editing)&&<EditorWorkspace mode="modal" open
      title={editing?"Upraviť koncept katalógu":"Nová možnosť katalógu"}
      description={editing?"Upravuješ kanonickú možnosť D1. Zmena vyžaduje novú Notion synchronizáciu.":"Nové kanonické ID prideľuje iba server Psipedia."}
      sections={[{id:"service-option-main",label:"Základné údaje"}]} dirty={dirty}
      onClose={()=>{closeEditor();setMessage("");}} actions={<EditorActionBar message={message}
        secondary={<AdminActionButton onClick={()=>{if(!dirty||window.confirm("Zahodiť neuložený koncept?")){closeEditor();setMessage("");}}} disabled={busy}>Zrušiť</AdminActionButton>}
        primary={<AdminActionButton variant="primary" disabled={busy||(editing?!editReady:!createReady)} onClick={editing?saveEdit:create}>{busy?"Ukladám…":editing?"Uložiť úpravy":"Uložiť koncept"}</AdminActionButton>}/>}>
      <section id="service-option-main" data-admin-editor-section tabIndex={-1} className={styles.formGrid}>
        <label>Názov<input value={draft.name} maxLength={100} onChange={e=>setDraft(p=>({...p,name:e.target.value}))}/></label>
        <label>Typ<select value={draft.kind} disabled={Boolean(editing)} onChange={e=>setDraft(p=>({...p,kind:e.target.value as Draft["kind"]}))}><option value="service">Služba</option><option value="attribute">Vlastnosť</option></select></label>
        <label>Kategória<select value={draft.category} onChange={e=>setDraft(p=>({...p,category:e.target.value}))}><option value="">Vyber kategóriu</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label>Skupina<input value={draft.group} maxLength={80} onChange={e=>setDraft(p=>({...p,group:e.target.value}))}/></label>
        <label>Presný význam<textarea rows={4} value={draft.meaning} maxLength={500} onChange={e=>setDraft(p=>({...p,meaning:e.target.value}))}/></label>
        <p className={styles.muted}>{editing?"Úprava ponechá stav DRAFT a vyžiada opätovné zrkadlenie.":"Koncept dostane stav DRAFT / PENDING. Samotné vytvorenie nie je schválenie ani publikovanie."}</p>
        {message&&<p role="alert" className={styles.error}>{message}</p>}
      </section>
    </EditorWorkspace>}
    {mirrorOperation&&<EditorWorkspace mode="modal" open
      title={mirrorOperation.action==="PROVISION_ONE"?"Vytvoriť stránku v Notione":"Overiť synchronizáciu s Notionom"}
      description="Len jedna kanonická možnosť. Bez automatického schválenia alebo publikovania."
      sections={[{id:"service-mirror-confirmation",label:"Potvrdenie"}]} dirty={false}
      onClose={()=>{if(!busy){setMirrorOperation(null);setMirrorConfirmation("");}}}
      actions={<EditorActionBar
        secondary={<AdminActionButton disabled={busy} onClick={()=>{setMirrorOperation(null);setMirrorConfirmation("");}}>Zrušiť</AdminActionButton>}
        primary={<AdminActionButton variant="primary" disabled={busy||
          mirrorConfirmation!==manualCatalogMirrorConfirmation(mirrorOperation.action,mirrorOperation.optionId)}
          onClick={executeMirror}>{busy?"Overujem…":"Potvrdiť jednu operáciu"}</AdminActionButton>}/>}>
      <section id="service-mirror-confirmation" data-admin-editor-section tabIndex={-1} className={styles.formGrid}>
        <p>Možnosť: <strong>{mirrorOperation.label}</strong></p>
        <p className={styles.muted}>ID: {mirrorOperation.optionId}</p>
        <p className={styles.muted}>Bezpečnostné potvrdenie musí presne zodpovedať nasledujúcemu textu:</p>
        <code className={styles.confirmationCode}>{manualCatalogMirrorConfirmation(mirrorOperation.action,mirrorOperation.optionId)}</code>
        <label>Napíš potvrdenie<input type="text" spellCheck={false} autoComplete="off"
          value={mirrorConfirmation} onChange={e=>setMirrorConfirmation(e.target.value)}/></label>
        <p className={styles.muted}>Neistý výsledok neznamená úspech. Pri chybe nebude automaticky opakovaný žiadny zápis do Notionu.</p>
      </section>
    </EditorWorkspace>}
  </section>;
}
