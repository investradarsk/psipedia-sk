"use client";

import {useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {AdminActionButton} from "@/components/admin-interaction-system";
import {EditorActionBar,EditorWorkspace} from "@/components/admin-editor-workspace";
import type {CatalogEditorItem} from "@/lib/service-catalog-admin-editor-view";
import styles from "./admin-service-catalog.module.css";

type Category={id:string;label:string};
type Draft={name:string;categories:string[];kind:"service"|"attribute";group:string;meaning:string};
const empty=():Draft=>({name:"",categories:[],kind:"service",group:"",meaning:""});
type ErrorResponse={error?:string;option?:{id:string;version:number}};
export function AdminServiceCatalogWorkspace({items,categories,writeEnabled,loadError}:{
  items:readonly CatalogEditorItem[];categories:readonly Category[];writeEnabled:boolean;
  mirrorEnabled?:boolean;pageCreationEnabled?:boolean;loadError:string|null;
}){
  const router=useRouter();
  const [query,setQuery]=useState("");
  const [kind,setKind]=useState("all");
  const [category,setCategory]=useState("all");
  const [filtersOpen,setFiltersOpen]=useState(false);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [creating,setCreating]=useState(false);
  const [editing,setEditing]=useState<CatalogEditorItem|null>(null);
  const [draft,setDraft]=useState<Draft>(empty);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [messageIsError,setMessageIsError]=useState(false);
  const visible=useMemo(()=>items.filter(item=>{
    const q=query.trim().toLocaleLowerCase("sk");
    return (!q||[item.label,item.group,item.meaning].some(s=>s.toLocaleLowerCase("sk").includes(q)))
      &&(kind==="all"||item.kind===kind)
      &&(category==="all"||item.categories.includes(category))
      &&item.status!=="RETIRED";
  }),[items,query,kind,category]);
  const selected=visible.find(item=>item.id===selectedId)??visible[0]??null;
  const activeFilterCount=Number(kind!=="all")+Number(category!=="all");
  const dirty=editing?
    draft.name!==editing.label||draft.group!==editing.group||draft.meaning!==editing.meaning||
      JSON.stringify([...draft.categories].sort())!==JSON.stringify([...editing.categories].sort()):
    draft.name.length>0||draft.categories.length>0||draft.group.length>0||draft.meaning.length>0||draft.kind!=="service";
  const draftValid=writeEnabled&&!loadError&&draft.name.trim().length>=3&&draft.categories.length>0;
  const mayEdit=(item:CatalogEditorItem)=>writeEnabled&&!loadError&&item.source==="admin"&&item.status!=="RETIRED";
  const close=()=>{setEditing(null);setCreating(false);setDraft(empty());};
  async function persist(){
    if(busy||!draftValid||!dirty&&editing)return;
    setBusy(true);setMessage("");setMessageIsError(false);
    try{
      const isEdit=Boolean(editing);
      const body={
        name:draft.name,kind:draft.kind,categories:draft.categories,
        group:draft.group||undefined,meaning:draft.meaning||undefined,
        ...(isEdit?{action:"edit",expectedVersion:editing!.version}:{}),
      };
      const res=await fetch(isEdit?
        "/api/admin/service-catalog/options/"+encodeURIComponent(editing!.id):
        "/api/admin/service-catalog/options",{
          method:isEdit?"PATCH":"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify(body),cache:"no-store",
        });
      const data=await res.json() as ErrorResponse;
      if(!res.ok||!data.option?.id)throw new Error(data.error??"Uloženie služby nebolo potvrdené.");
      setSelectedId(data.option.id);
      close();
      setMessage("Služba je uložená a dostupná v príslušných kategóriách. Notion sa synchronizuje automaticky.");
      router.refresh();
    }catch(e){
      setMessageIsError(true);
      setMessage(e instanceof Error?e.message:"Uloženie sa nepodarilo.");
    }finally{setBusy(false);}
  }
  function beginEdit(item:CatalogEditorItem){
    if(!mayEdit(item)||busy)return;
    setMessage("");setMessageIsError(false);
    setDraft({name:item.label,categories:[...item.categories],kind:item.kind,group:item.group,meaning:item.meaning});
    setEditing(item);
  }
  async function archive(item:CatalogEditorItem){
    if(!mayEdit(item)||busy||!window.confirm("Archivovať túto službu? Existujúce profily sa nezmažú."))return;
    setBusy(true);setMessage("");setMessageIsError(false);
    try{
      const res=await fetch("/api/admin/service-catalog/options/"+encodeURIComponent(item.id),{
        method:"PATCH",headers:{"content-type":"application/json"},cache:"no-store",
        body:JSON.stringify({action:"retire",expectedVersion:item.version}),
      });
      const data=await res.json() as ErrorResponse;
      if(!res.ok||!data.option?.id)throw new Error(data.error??"Archivácia sa nepodarila.");
      setSelectedId(null);setMessage("Služba bola archivovaná.");router.refresh();
    }catch(e){setMessageIsError(true);setMessage(e instanceof Error?e.message:"Chyba archivácie.");}
    finally{setBusy(false);}
  }
  const openEditor=creating||Boolean(editing);
  return <section className={styles.stack} aria-label="Katalóg služieb a vlastností">
    {loadError&&<p role="alert" className={styles.error}>{loadError}</p>}
    <div className={styles.filterBar}>
      <label className={styles.searchField}>Vyhľadávanie
        <input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Hľadať službu"/>
      </label>
      <button type="button" className={styles.filterToggle} aria-expanded={filtersOpen} aria-controls="services-v3-simple-filters"
        onClick={()=>setFiltersOpen(old=>!old)}>Filtre {activeFilterCount?("("+activeFilterCount+")"):""} <span aria-hidden="true">{filtersOpen?"−":"+"}</span></button>
      <div id="services-v3-simple-filters" className={styles.advancedFilters} data-expanded={filtersOpen}>
        <label>Typ<select value={kind} onChange={e=>setKind(e.target.value)}>
          <option value="all">Služby a vlastnosti</option><option value="service">Služby</option><option value="attribute">Vlastnosti</option>
        </select></label>
        <label>Kategória<select value={category} onChange={e=>setCategory(e.target.value)}>
          <option value="all">Všetky kategórie</option>{categories.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}
        </select></label>
      </div>
      <AdminActionButton variant="primary" disabled={!writeEnabled||Boolean(loadError)}
        onClick={()=>{setDraft(empty());setEditing(null);setCreating(true);setMessage("");}}>+ Nová služba</AdminActionButton>
    </div>
    <p role="status" className={styles.count}>Nájdených možností: {visible.length}</p>
    <div className={styles.layout}>
      <div className={styles.list} aria-label="Možnosti katalógu">
        {visible.slice(0,200).map(item=><button type="button" key={item.id} className={styles.listItem}
          aria-pressed={selected?.id===item.id} onClick={()=>setSelectedId(item.id)}>
          <strong>{item.label}</strong><small>{item.kind==="service"?"Služba":"Vlastnosť"} · {item.group}</small>
        </button>)}
        {visible.length>200&&<p className={styles.count}>Zobrazujeme prvých 200 položiek. Spresni vyhľadávanie.</p>}
        {!visible.length&&<p className={styles.count}>Žiadna služba nevyhovuje filtrom.</p>}
      </div>
      <div className={styles.detail} aria-label="Detail vybranej možnosti">
        {selected?<><h2>{selected.label}</h2>
          <dl className={styles.detailGrid}>
            <dt>Kategórie</dt><dd>{selected.categories.map(id=>categories.find(c=>c.id===id)?.label??id).join(", ")}</dd>
            <dt>Skupina</dt><dd>{selected.group}</dd>
            <dt>Popis</dt><dd>{selected.meaning}</dd>
          </dl>
          <div className={styles.actions}>
            {selected.source==="admin"&&<>
              <AdminActionButton disabled={!mayEdit(selected)||busy} onClick={()=>beginEdit(selected)}>Upraviť</AdminActionButton>
              <AdminActionButton variant="destructive" disabled={!mayEdit(selected)||busy}
                onClick={()=>archive(selected)}>Archivovať</AdminActionButton>
            </>}
            {selected.source==="built_in"&&<p className={styles.muted}>Súčasť existujúceho katalógu.</p>}
          </div>
        </>:<p>Vyber službu zo zoznamu.</p>}
      </div>
    </div>
    {message&&<p role={messageIsError?"alert":"status"} className={messageIsError?styles.error:styles.notice}>{message}</p>}
    <details className={styles.statusDetails}>
      <summary>Technické informácie o synchronizácii</summary>
      <p>Služby sa ukladajú v Psipedii. Prenos do Notionu sa vykonáva automaticky na pozadí.</p>
    </details>
    {openEditor&&<EditorWorkspace mode="modal" open
      title={editing?"Upraviť službu":"Nová služba"}
      description="Zadaj názov a vyber jednu alebo viac kategórií."
      sections={[{id:"service-option-main",label:"Základné údaje"}]}
      dirty={dirty} onClose={close}
      actions={<EditorActionBar
        secondary={<AdminActionButton disabled={busy} onClick={()=>{if(!dirty||window.confirm("Zahodiť neuložené zmeny?"))close();}}>Zrušiť</AdminActionButton>}
        primary={<AdminActionButton variant="primary" disabled={busy||!draftValid||Boolean(editing&&!dirty)}
          onClick={persist}>{busy?"Ukladám…":"Uložiť"}</AdminActionButton>}/>}>
      <section id="service-option-main" data-admin-editor-section tabIndex={-1} className={styles.formGrid}>
        <label>Názov služby<input value={draft.name} maxLength={100}
          onChange={e=>setDraft(old=>({...old,name:e.target.value}))}/></label>
        <fieldset><legend>Kategórie</legend>
          {categories.map(c=><label key={c.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0"}}>
            <input type="checkbox" checked={draft.categories.includes(c.id)}
              onChange={e=>setDraft(old=>({...old,categories:e.target.checked?
                [...old.categories,c.id]:old.categories.filter(x=>x!==c.id)}))}/>{c.label}
          </label>)}
        </fieldset>
        <details><summary>Voliteľné podrobnosti</summary>
          <label>Typ<select value={draft.kind} disabled={Boolean(editing)}
            onChange={e=>setDraft(old=>({...old,kind:e.target.value as Draft["kind"]}))}>
            <option value="service">Služba</option><option value="attribute">Vlastnosť</option>
          </select></label>
          <label>Skupina<input maxLength={80} value={draft.group}
            onChange={e=>setDraft(old=>({...old,group:e.target.value}))}/></label>
          <label>Popis<textarea maxLength={500} value={draft.meaning}
            onChange={e=>setDraft(old=>({...old,meaning:e.target.value}))}/></label>
        </details>
      </section>
    </EditorWorkspace>}
  </section>;
}
