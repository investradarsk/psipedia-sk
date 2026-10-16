"use client";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {calendarMonthDays,calendarMonthLabel,calendarWeekdays,moveCalendarMonth} from "@/lib/event-calendar-view";
import {facebookWallTime,facebookPostsForDay,type FacebookImagePost} from "@/lib/facebook-image-post";
import {uploadAdminImage} from "@/lib/admin-image-upload";
import {AdminActionButton} from "@/components/admin-interaction-system";
import shared from "./admin-editorial-calendar.module.css";
import styles from "./admin-facebook-images.module.css";

type Data={items:FacebookImagePost[];calendar:FacebookImagePost[];page:number;pages:number;total:number;
  counts?:{draft:number;scheduled:number;published:number;sending:number;review:number;trash:number};
  trashAvailable?:boolean};
type Form={title:string;imageUrl:string;imageKey:string;caption:string;date:string;time:string;repeatedHour:string};
const blank=(date=""):Form=>({title:"Nový príspevok",imageUrl:"",imageKey:"",caption:"",date,time:date?"09:00":"",repeatedHour:""});
function formFor(post:FacebookImagePost):Form {
  const wall=post.scheduledAt?facebookWallTime(post.scheduledAt):{date:"",time:""};
  // Keep the stored occurrence when an unchanged autumn-hour schedule is saved.
  return {...blank(),title:post.title,imageUrl:post.imageUrl,imageKey:post.imageKey,caption:post.caption,...wall,repeatedHour:""};
}
const subscribe=()=>()=>{};
const labels={draft:"Koncept",scheduled:"Naplánovaný",published:"Publikovaný"};
const filters={all:"Všetky",draft:"Koncepty",scheduled:"Naplánované",sending:"Odosiela sa",
  published:"Publikované",review:"Na preverenie",trash:"Kôš"};
function visualStatus(post:FacebookImagePost){
  if(post.deletedAt)return {label:"V koši",kind:"trash"};
  if(post.publicationState==="SENDING")return {label:"Práve sa odosiela…",kind:"sending"};
  if(post.publicationState==="UNCERTAIN")return {label:"Na preverenie",kind:"review"};
  if(post.status==="published")return {label:"Publikovaný",kind:"published"};
  if(post.status==="scheduled")return {label:"Naplánovaný",kind:"scheduled"};
  return {label:"Koncept",kind:"draft"};
}
function facebookUrl(id:string|null|undefined){
  if(!id)return null;
  if(/^\\d+_\\d+$/.test(id)){const [page,post]=id.split("_");return `https://www.facebook.com/${page}/posts/${post}`;}
  return /^\\d+$/.test(id)?`https://www.facebook.com/photo.php?fbid=${id}`:null;
}
const shownAt=(stamp:string|null|undefined)=>stamp?new Intl.DateTimeFormat("sk-SK",{
  dateStyle:"short",timeStyle:"short",timeZone:"Europe/Bratislava",
}).format(new Date(stamp)):"—";
export function AdminFacebookImages({initial,initialMonth}:{initial:Data;initialMonth:string}){
  const ready=useSyncExternalStore(subscribe,()=>true,()=>false);
  const[data,setData]=useState(initial),[month,setMonth]=useState(initialMonth),[status,setStatus]=useState("all"),[source,setSource]=useState("all"),[page,setPage]=useState(1);
  const[opening,setOpening]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[day,setDay]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
  const[publisher,setPublisher]=useState<{enabled:boolean;connected:boolean;technicallyEnabled:boolean}|null>(null);
  const[publisherError,setPublisherError]=useState(""),[publisherBusy,setPublisherBusy]=useState(false);
  const[notionBusy,setNotionBusy]=useState(false);
  const[editor,setEditor]=useState<{post:FacebookImagePost|null}|null>(null),[form,setForm]=useState<Form>(blank()),[baseline,setBaseline]=useState(""),[editorError,setEditorError]=useState(""),[busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),origin=useRef<HTMLElement|null>(null),openRequest=useRef<AbortController|null>(null),lock=useRef(false);
  const queryKey=`${month}|${status}|${source}|${page}|${refresh}`;
  const[settledQuery,setSettledQuery]=useState(queryKey);
  const loading=opening||settledQuery!==queryKey;
  const dirty=!!editor && JSON.stringify(form)!==baseline;
  useEffect(()=>{const abort=new AbortController();
    fetch(`/api/admin/facebook-images?month=${month}&status=${status}&source=${source}&page=${page}`,{signal:abort.signal,cache:"no-store"}).then(async r=>{const body=await r.json() as Data & {error?:string};if(!r.ok)throw new Error(body.error||"Načítanie zlyhalo.");setData(body);setError("");}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setSettledQuery(queryKey);});
    return()=>abort.abort();
  },[month,status,source,page,refresh,queryKey]);
  useEffect(()=>{const controller=new AbortController();
    fetch("/api/admin/facebook-images/publisher",{cache:"no-store",signal:controller.signal})
      .then(async response=>{const data=await response.json() as {enabled:boolean;connected:boolean;technicallyEnabled:boolean;error?:string};
        if(!response.ok)throw new Error(data.error||"Publikovanie nie je dostupné.");setPublisher(data);setPublisherError("");})
      .catch(error=>{if(!controller.signal.aborted)setPublisherError(error instanceof Error?error.message:"Nastavenie nie je dostupné.");});
    return()=>controller.abort();
  },[refresh]);
  // Live status is read from D1; never infer Meta success from elapsed time.
  // Do not modify a form with unsaved changes while refresh is running.
  useEffect(()=>{
    if(!ready)return;
    let cancelled=false;
    const timer=window.setInterval(()=>{
      if(document.visibilityState!=="visible"||busy||notionBusy||opening)return;
      setRefresh(value=>value+1);
      const postId=editor?.post?.id;
      if(!postId||dirty)return;
      void fetch(`/api/admin/facebook-images/${postId}`,{cache:"no-store"})
        .then(async response=>response.ok?(await response.json() as {post:FacebookImagePost}).post:null)
        .then(updated=>{
          if(!cancelled&&updated)setEditor(previous=>previous?.post?.id===updated.id?
            {post:updated}:previous);
        }).catch(()=>undefined);
    },12000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[ready,busy,notionBusy,opening,editor?.post?.id,dirty]);
  async function setAutomatic(enabled:boolean){
    if(publisherBusy||!publisher)return;setPublisherBusy(true);setPublisherError("");
    try{const response=await fetch("/api/admin/facebook-images/publisher",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({enabled})});
      const body=await response.json() as {enabled:boolean;connected:boolean;technicallyEnabled:boolean;error?:string};
      if(!response.ok)throw new Error(body.error||"Nastavenie sa neuložilo.");
      setPublisher(body);setNotice(enabled?"Automatické publikovanie povolené.":"Automatické publikovanie vypnuté. Jednotlivo schválené príspevky zostávajú povolené.");
    }catch(error){setPublisherError(error instanceof Error?error.message:"Nastavenie sa neuložilo.");}finally{setPublisherBusy(false);}
  }
  async function syncNotion() {
    if(notionBusy)return;
    setNotionBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/admin/notion-facebook-images-sync",{method:"POST"});
      const body=await response.json() as {summary?:{enabled:boolean;scanned:number;created:number;updated:number;writtenBack:number;failed:number;conflicts:number;invalid:number};error?:string};
      if(!response.ok||!body.summary)throw new Error(body.error||"Synchronizácia Notion zlyhala.");
      const result=body.summary;
      setNotice(!result.enabled?"Prepojenie Notion Facebook obrázky ešte nie je technicky povolené.":
        `Notion: spracované ${result.scanned}, nové ${result.created}, aktualizované ${result.updated}, spätný zápis ${result.writtenBack}, konflikty ${result.conflicts}, neúplné ${result.invalid}, chyby ${result.failed}.`);
      setRefresh(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:"Synchronizácia Notion zlyhala.");}
    finally{setNotionBusy(false);}
  }
  async function moveToTrash(post:FacebookImagePost) {
    if(busy||notionBusy)return;
    const restore=Boolean(post.deletedAt);
    const prompt=restore?"Obnoviť príspevok do konceptov? Schválenie sa zruší.":
      post.status==="published"?
        "Presunúť publikovaný príspevok do koša? Na Facebooku ZOSTANE zverejnený.":
        "Presunúť príspevok do koša? Z kalendára zmizne a neodošle sa.";
    if(!window.confirm(prompt))return;
    setBusy(true);setEditorError("");setError("");
    try {
      const response=await fetch(`/api/admin/facebook-images/${post.id}/trash`,{
        method:"PUT",headers:{"content-type":"application/json"},
        body:JSON.stringify({action:restore?"restore":"trash",expectedVersion:post.version}),
      });
      const data=await response.json() as {post?:FacebookImagePost;error?:string};
      if(!response.ok||!data.post)throw new Error(data.error||"Operácia s košom zlyhala.");
      if(editor?.post?.id===post.id){dialog.current?.close();setEditor(null);}
      setNotice(restore?"Príspevok obnovený ako koncept, bez automatického odoslania.":
        "Príspevok presunutý do koša. Na Facebooku sa nič neodstránilo.");
      setRefresh(value=>value+1);
    }catch(e){
      const message=e instanceof Error?e.message:"Operácia s košom zlyhala.";
      if(editor?.post?.id===post.id)setEditorError(message);
      else setError(message);
    }finally{setBusy(false);}
  }
  async function setApproval(approved:boolean) {
    if(busy||lock.current||!editor?.post||dirty)return;setBusy(true);setEditorError("");
    try{const response=await fetch(`/api/admin/facebook-images/${editor.post.id}/approval`,{
      method:"PUT",headers:{"content-type":"application/json"},
      body:JSON.stringify({approved,expectedVersion:editor.post.version})});
      const body=await response.json() as {post:FacebookImagePost;error?:string};
      if(!response.ok||!body.post)throw new Error(body.error||"Schválenie zlyhalo.");
      setEditor({post:body.post});setNotice(approved?"Príspevok individuálne schválený.":"Individuálne schválenie zrušené.");setRefresh(v=>v+1);
    }catch(error){setEditorError(error instanceof Error?error.message:"Schválenie zlyhalo.");}finally{setBusy(false);}
  }
  useEffect(()=>{if(editor&&!dialog.current?.open)dialog.current?.showModal();},[editor]);
  useEffect(()=>{if(!dirty)return;const prevent=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue="";};window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);},[dirty]);
  useEffect(()=>()=>openRequest.current?.abort(),[]);
  function close(){if(lock.current||busy)return;if(dirty&&!window.confirm("Zahodiť neuložené zmeny?"))return;dialog.current?.close();setEditor(null);origin.current?.focus();}
  function edit(post:FacebookImagePost|null,date=""){
    origin.current=document.activeElement as HTMLElement;setEditorError("");setNotice("");openRequest.current?.abort();
    if(!post){const next=blank(date);setForm(next);setBaseline(JSON.stringify(next));setEditor({post:null});return;}
    const abort=new AbortController();openRequest.current=abort;setOpening(true);
    fetch(`/api/admin/facebook-images/${post.id}`,{signal:abort.signal,cache:"no-store"}).then(async r=>{const body=await r.json() as {post:FacebookImagePost;error?:string};if(!r.ok)throw new Error(body.error||"Načítanie zlyhalo.");if(abort.signal.aborted)return;const next=formFor(body.post);setForm(next);setBaseline(JSON.stringify(next));setEditor({post:body.post});}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setOpening(false);});
  }
  async function upload(file:File){if(lock.current)return;lock.current=true;setBusy(true);setEditorError("");
    try{if(!["image/jpeg","image/png","image/webp"].includes(file.type))throw new Error("Použi JPG, PNG alebo WebP.");const image=await uploadAdminImage(file,"facebook-images");setForm(old=>({...old,imageUrl:image.imageUrl,imageKey:image.imageKey}));}
    catch(e){setEditorError(e instanceof Error?e.message:"Upload zlyhal.");}finally{lock.current=false;setBusy(false);}
  }
  async function save(target:"draft"|"scheduled",cancel=false){if(lock.current||!editor)return;lock.current=true;setBusy(true);setEditorError("");
    try{
      let payload={...form,status:target,expectedVersion:editor.post?.version,...(cancel?{date:"",time:""}:{})};
      // An unchanged repeated local time is the already saved UTC occurrence, not a new choice.
      if(editor.post?.scheduledAt && !payload.repeatedHour && !cancel){const prior=facebookWallTime(editor.post.scheduledAt);if(prior.date===payload.date&&prior.time===payload.time){
        const {facebookScheduleInstant}=await import("@/lib/facebook-image-post");payload={...payload,repeatedHour:Date.parse(facebookScheduleInstant(payload.date,payload.time,"earlier"))===Date.parse(editor.post.scheduledAt)?"earlier":"later"};
      }}
      const r=await fetch(`/api/admin/facebook-images${editor.post?`/${editor.post.id}`:""}`,{method:editor.post?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const body=await r.json() as {error?:string};if(!r.ok)throw new Error(body.error||"Uloženie zlyhalo.");
      dialog.current?.close();setEditor(null);setRefresh(v=>v+1);setNotice(cancel?"Naplánovanie zrušené.":"Príspevok uložený. Nič sa neodoslalo na Facebook.");origin.current?.focus();
    }catch(e){setEditorError(e instanceof Error?e.message:"Uloženie zlyhalo.");}finally{lock.current=false;setBusy(false);}
  }
  const entry=(post:FacebookImagePost)=>{
    const appearance=visualStatus(post);
    return <AdminActionButton type="button" key={post.id} className={`${shared.entry} ${styles.entry}`} disabled={loading||!ready} onClick={()=>edit(post)}>
      <span className={`${styles.statusPill} ${styles[appearance.kind]}`}>{appearance.label}</span>
      <span className={shared.entryTitle}>{post.title}</span>
      {post.scheduledAt&&<time dateTime={post.scheduledAt}>{facebookWallTime(post.scheduledAt).time}</time>}
    </AdminActionButton>;
  };
  const published=editor?.post?.status==="published";
  const attempted=editor?.post?.publicationState && editor.post.publicationState!=="PENDING";
  const locked=Boolean(published||attempted||editor?.post?.deletedAt);
  const link=facebookUrl(editor?.post?.facebookPostId);
  return <div className={styles.root} data-interactive={ready?"true":"false"}>
    <p>Plánovanie v Europe/Bratislava. Príspevky sa posielajú po termíne, iba ak je Facebook pripojený a príslušný príspevok povolený.</p>
    <section className="admin-form-card" aria-label="Nastavenie automatického publikovania">
      <h2>Automatické publikovanie na Facebook</h2>
      <label><input type="checkbox" checked={publisher?.enabled??false} disabled={!publisher||publisherBusy} onChange={e=>void setAutomatic(e.target.checked)}/>
        Povolené – automaticky publikovať všetky naplánované obrázky</label>
      <p>Ak je vypnuté, v termíne sa publikujú iba jednotlivo schválené príspevky. Bez limitov na počet, hodiny alebo rozostupy.</p>
      {publisher&&!publisher.technicallyEnabled&&<p role="status">Facebook zatiaľ nie je technicky pripojený. Doplň Page ID, Page token a povolenie publikovania v bezpečných nastaveniach Cloudflare.</p>}
      {publisherError&&<p role="alert" className="admin-message admin-message--error">{publisherError}</p>}
    </section>
    <section className="admin-form-card" aria-label="Notion Facebook obrázky"><h2>Notion – Facebook obrázky</h2>
      <p>Importuje iba novú samostatnú databázu. Publikovanie z Notion vyžaduje stav Schválené, zaškrtnuté Povoliť publikovanie, obrázok a budúci termín.</p>
      <AdminActionButton type="button" variant="secondary" disabled={!ready||notionBusy||loading} onClick={()=>void syncNotion()}>{notionBusy?"Synchronizujem…":"Synchronizovať Notion"}</AdminActionButton>
    </section>
    <div className={styles.stats} aria-label="Počty príspevkov">
      {(["draft","scheduled","sending","published","review","trash"] as const).map(kind=>
        <button key={kind} type="button" className={`${styles.statCard} ${status===kind?styles.activeStat:""}`}
          aria-pressed={status===kind} onClick={()=>{setStatus(kind);setPage(1);}}>
          <span className={`${styles.statusPill} ${styles[kind]}`}>{filters[kind]}</span>
          <strong>{data.counts?.[kind]??0}</strong>
        </button>)}
    </div>
    <p className={styles.liveNote} aria-live="polite">Stavy sa automaticky obnovujú približne každých 12 sekúnd, keď je stránka otvorená.</p>
    {data.trashAvailable===false&&<p role="status">Funkcia Kôš čaká na schválenú D1 migráciu 0131.</p>}
    {error&&<p role="alert" className="admin-message admin-message--error">{error}</p>}{notice&&<p role="status" className="admin-message">{notice}</p>}
    <div className={shared.toolbar}><div className={shared.monthNav}><AdminActionButton type="button" variant="secondary" disabled={loading||!ready} onClick={()=>{setMonth(moveCalendarMonth(month,-1));setDay(null);}}>Predošlý mesiac</AdminActionButton><h2>{calendarMonthLabel(month)}</h2><AdminActionButton type="button" variant="secondary" disabled={loading||!ready} onClick={()=>{setMonth(moveCalendarMonth(month,1));setDay(null);}}>Ďalší mesiac</AdminActionButton></div>
      <AdminActionButton type="button" variant="primary" disabled={loading||!!error||!ready} onClick={()=>edit(null)}>Vytvoriť príspevok</AdminActionButton>
      <div className={styles.filters}>
        <label>Stav <select disabled={loading||!ready} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>
          {Object.entries(filters).map(([key,label])=><option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Zdroj <select disabled={loading||!ready} value={source} onChange={e=>{setSource(e.target.value);setPage(1);}}>
          <option value="all">Všetky zdroje</option><option value="notion">Notion</option><option value="manual">Ručne</option>
        </select></label>
      </div>
    </div>
    <section aria-label="Kalendár Facebook obrázkov" aria-busy={loading}>
      <p className={shared.caption}>Klikni na deň pre nový príspevok. Termíny sa môžu prekrývať. Koncept bez dátumu je iba v prehľade. Na mobile možno kalendár posúvať do strán.</p>
      <div className={styles.scroll} tabIndex={0} aria-label="Posúvateľný mesačný kalendár"><div className={shared.grid}>
        {calendarWeekdays.map(d=><div key={d} className={shared.weekday}>{d}</div>)}
        {calendarMonthDays(month).map(cell=>{const posts=facebookPostsForDay(data.calendar,cell.date).filter(p=>!p.deletedAt);return <div key={cell.date} className={`${shared.day} ${styles.cell} ${!cell.inMonth?shared.blank:""}`}>
          <AdminActionButton type="button" className={shared.dayButton} aria-label={`Vytvoriť príspevok ${cell.date}`} disabled={loading||!!error||!ready} onClick={()=>edit(null,cell.date)}><time dateTime={cell.date}>{cell.day}</time><span className={shared.count}>{posts.length}</span></AdminActionButton>
          {posts.slice(0,3).map(entry)}{posts.length>3&&<AdminActionButton type="button" className={shared.more} onClick={()=>setDay(cell.date)}>Zobraziť všetky ({posts.length})</AdminActionButton>}
        </div>;})}
      </div></div>
      {day&&<div className={shared.detail}><h3>Príspevky {day}</h3>{facebookPostsForDay(data.calendar,day).map(entry)}</div>}
    </section>
    <section className="admin-form-card" aria-labelledby="facebook-posts-heading"><h2 id="facebook-posts-heading">Prehľad príspevkov ({data.total})</h2>
      {!data.items.length&&<p>Zatiaľ tu nie sú žiadne príspevky.</p>}
      <div className={styles.list}>{data.items.map(post=><article key={post.id} className={`${styles.listItem} ${styles[visualStatus(post).kind+"Card"]??""}`}>
        {post.imageUrl&&<img src={post.imageUrl} alt="" width={100} height={100}/>}
        <div>{entry(post)}
          <p>{post.source==="notion"?"Notion":"Ručne"} · {post.scheduledAt?`${facebookWallTime(post.scheduledAt).date} ${facebookWallTime(post.scheduledAt).time} · Bratislava`:"Bez dátumu"}
          {post.approvalStatus==="APPROVED"?" · Individuálne schválený":""}
          {post.publicationState==="UNCERTAIN"?" · Neopakovať bez preverenia":""}</p>
          <div className={styles.itemActions}>
            {facebookUrl(post.facebookPostId)&&<a href={facebookUrl(post.facebookPostId)??"#"} target="_blank" rel="noopener noreferrer">Otvoriť na Facebooku ↗</a>}
            {data.trashAvailable&&post.publicationState!=="SENDING"&&
              <button type="button" disabled={busy} onClick={()=>void moveToTrash(post)}>
                {post.deletedAt?"Obnoviť z koša":"Presunúť do koša"}</button>}
          </div>
        </div>
      </article>)}</div>
      <div className="admin-actions"><AdminActionButton type="button" variant="secondary" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}>Predošlá strana</AdminActionButton><span>Strana {data.page} / {data.pages}</span><AdminActionButton type="button" variant="secondary" disabled={page>=data.pages||loading} onClick={()=>setPage(p=>p+1)}>Ďalšia strana</AdminActionButton></div>
    </section>
    <dialog ref={dialog} className={styles.dialog} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget){const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)close();}}} aria-labelledby="facebook-editor-heading">
      {editor&&<><header className={styles.dialogHeader}><h2 id="facebook-editor-heading">{editor.post?"Upraviť príspevok":"Nový Facebook obrázok"}</h2><AdminActionButton type="button" variant="secondary" disabled={busy} onClick={close}>Zavrieť</AdminActionButton></header>
        <p>ID: {editor.post?.id??"Vytvorí sa pri uložení"}{editor.post?` · verzia ${editor.post.version}`:""}</p>
        {editorError&&<p role="alert" className="admin-message admin-message--error">{editorError}</p>}
        {editor.post&&<div className={styles.editorStatus} aria-live="polite">
          <span className={`${styles.statusPill} ${styles[visualStatus(editor.post).kind]}`}>{visualStatus(editor.post).label}</span>
          <span>Zdroj: {editor.post.source==="notion"?"Notion":"Ručne"}</span>
          {link&&<a href={link} target="_blank" rel="noopener noreferrer">Otvoriť na Facebooku ↗</a>}
        </div>}
        <form onSubmit={e=>{e.preventDefault();void save("draft");}}><fieldset disabled={busy||locked} className={styles.fields}>
          <label>Názov<input autoFocus required maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
          <label>Obrázok (JPG, PNG, WebP, max. 8 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value="";}}/></label>
          {form.imageUrl&&<img className={styles.preview} src={form.imageUrl} alt="Náhľad Facebook obrázka"/>}
          <label htmlFor="facebook-caption">Popis na Facebook</label><textarea id="facebook-caption" rows={6} maxLength={15000} value={form.caption} onChange={e=>setForm({...form,caption:e.target.value})}/>
          <div className={styles.dateFields}><label>Dátum<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value,time:e.target.value?(form.time||"09:00"):"",repeatedHour:""})}/></label><label>Čas (Bratislava)<input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value,repeatedHour:""})}/></label></div>
          <label>Ak sa hodina pri zmene zimného času opakuje<select value={form.repeatedHour} onChange={e=>setForm({...form,repeatedHour:e.target.value})}><option value="">Vybrať pri opakovanej hodine</option><option value="earlier">Prvý výskyt (letný čas)</option><option value="later">Druhý výskyt (zimný čas)</option></select></label>
          <p>Stav: {editor.post?labels[editor.post.status]:"Koncept"}. Uloženie naplánovania samo o sebe okamžite nepublikuje obrázok.</p>
          <div className={styles.actions}><AdminActionButton type="submit" variant="secondary">Uložiť koncept</AdminActionButton><AdminActionButton type="button" variant="primary" onClick={()=>void save("scheduled")}>Uložiť naplánovanie</AdminActionButton>{editor.post?.status==="scheduled"&&<AdminActionButton type="button" variant="secondary" onClick={()=>void save("draft",true)}>Zrušiť naplánovanie</AdminActionButton>}</div>
        </fieldset></form>
        {editor.post?.status==="scheduled"&&!locked&&<div className={styles.actions}>
          <p>Individuálne schválenie: <strong>{editor.post.approvalStatus==="APPROVED"?"Áno":"Nie"}</strong>. Zmenou obsahu alebo termínu sa schválenie zruší.</p>
          <AdminActionButton type="button" variant="secondary" disabled={busy||dirty||!publisher} onClick={()=>void setApproval(editor.post?.approvalStatus!=="APPROVED")}>
            {editor.post.approvalStatus==="APPROVED"?"Zrušiť individuálne schválenie":"Schváliť na automatické zverejnenie"}
          </AdminActionButton>
          {dirty&&<p>Najprv ulož zmeny príspevku.</p>}
        </div>}
        {editor.post?.publicationState==="UNCERTAIN"&&<p role="alert">Výsledok odoslania je neistý ({editor.post.publicationError??"neznáma chyba"}). Príspevok sa automaticky neodošle znova. Najskôr skontroluj Facebook stránku.</p>}
        {editor.post?.publicationState==="SENDING"&&<p role="status">Odoslanie sa začalo. Pri prerušení je potrebné manuálne preverenie, aby nevznikla duplicita.</p>}
        {editor.post&&<section className={styles.timeline} aria-label="História príspevku">
          <h3>História príspevku</h3>
          <ol>
            <li>Vytvorený: {shownAt(editor.post.createdAt)}</li>
            <li>Posledná úprava: {shownAt(editor.post.updatedAt)}</li>
            {editor.post.approvedAt&&<li>Schválený: {shownAt(editor.post.approvedAt)} · {editor.post.approvedBy}</li>}
            {editor.post.attemptStartedAt&&<li>Začiatok odosielania: {shownAt(editor.post.attemptStartedAt)}</li>}
            {editor.post.attemptCompletedAt&&<li>Výsledok odosielania: {shownAt(editor.post.attemptCompletedAt)} · {visualStatus(editor.post).label}</li>}
            {editor.post.publishedAt&&<li>Publikovaný: {shownAt(editor.post.publishedAt)}</li>}
            {editor.post.deletedAt&&<li>Presunutý do koša: {shownAt(editor.post.deletedAt)} · {editor.post.deletedBy}</li>}
          </ol>
          {editor.post.facebookPostId&&<p>Facebook Post ID: {editor.post.facebookPostId}</p>}
        </section>}
        {editor.post&&data.trashAvailable&&editor.post.publicationState!=="SENDING"&&
          <div className={styles.actions}><AdminActionButton type="button" variant="secondary" disabled={busy}
            onClick={()=>void moveToTrash(editor.post!)}>{editor.post.deletedAt?"Obnoviť z koša":"Presunúť do koša"}</AdminActionButton></div>}
        {busy&&<p role="status">Prebieha ukladanie alebo upload…</p>}
        {locked&&<p>Príspevok sa odosiela, bol odoslaný alebo vyžaduje preverenie; úpravy sú blokované.</p>}
      </>}
    </dialog>
  </div>;
}
