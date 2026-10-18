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
  published:"Publikované",review:"Na preverenie"};
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
      setPublisher(body);setNotice(enabled?"Hlavný STOP vypnutý. Automaticky sa odošlú iba individuálne schválené príspevky.":"Hlavný STOP zapnutý. Nezačne sa žiadne ďalšie automatické odosielanie na Facebook.");
    }catch(error){setPublisherError(error instanceof Error?error.message:"Nastavenie sa neuložilo.");}finally{setPublisherBusy(false);}
  }
  async function syncNotion() {
    if(notionBusy)return;
    setNotionBusy(true);setError("");setNotice("");
    try {
      const response=await fetch("/api/admin/notion-facebook-images-sync",{method:"POST"});
      const body=await response.json() as {summary?:{enabled:boolean;scanned:number;created:number;updated:number;writtenBack:number;failed:number;conflicts:number;invalid:number;adminExport?:{enabled:boolean;created:number;updated:number;trashed:number;restored:number;failed:number}};error?:string};
      if(!response.ok||!body.summary)throw new Error(body.error||"Synchronizácia Notion zlyhala.");
      const result=body.summary;
      setNotice(!result.enabled?"Prepojenie Notion Facebook obrázky ešte nie je technicky povolené.":
        `Notion: spracované ${result.scanned}, nové ${result.created}, aktualizované ${result.updated}, spätný zápis ${result.writtenBack}, konflikty ${result.conflicts}, neúplné ${result.invalid}, chyby ${result.failed}. Admin → Notion: ${result.adminExport?.enabled?"zapnuté":"vypnuté"}; nové ${result.adminExport?.created??0}, úpravy ${result.adminExport?.updated??0}, archivované v Notione ${result.adminExport?.trashed??0}, obnovené ${result.adminExport?.restored??0}, chyby ${result.adminExport?.failed??0}.`);
      setRefresh(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:"Synchronizácia Notion zlyhala.");}
    finally{setNotionBusy(false);}
  }
  async function permanentlyRemove(post:FacebookImagePost) {
    if(busy||notionBusy||post.publicationState==="SENDING")return;
    const prompt=post.status==="published"?
      "NATRVALO odstrániť z administrácie? Príspevok NA FACEBOOKU ZOSTANE zverejnený. Obnovenie v administrácii nebude možné.":
      "NATRVALO odstrániť príspevok? Zmizne z prehľadu, kalendára a fronty, nebude možné ho obnoviť. Notion stránka sa archivuje pri synchronizácii.";
    if(!window.confirm(prompt))return;
    setBusy(true);setEditorError("");setError("");
    try {
      const response=await fetch(`/api/admin/facebook-images/${post.id}/trash`,{
        method:"DELETE",headers:{"content-type":"application/json"},
        body:JSON.stringify({confirm:true,expectedVersion:post.version}),
      });
      const result=await response.json() as {deleted?:boolean;error?:string};
      if(!response.ok||!result.deleted)throw new Error(result.error||"Trvalé odstránenie zlyhalo.");
      if(editor?.post?.id===post.id){dialog.current?.close();setEditor(null);}
      setNotice("Príspevok odstránený z administrácie. Na Facebooku sa nič neodstránilo. Synchronizácia s Notionom môže dobehnúť neskôr.");
      setRefresh(value=>value+1);
    }catch(e){
      const message=e instanceof Error?e.message:"Trvalé odstránenie zlyhalo.";
      if(editor?.post?.id===post.id)setEditorError(message);
      else setError(message);
    }finally{setBusy(false);}
  }
  async function setApproval(approved:boolean,mode:"scheduled"|"direct"="scheduled") {
    if(busy||lock.current||!editor?.post||dirty)return;setBusy(true);setEditorError("");
    try{const response=await fetch(`/api/admin/facebook-images/${editor.post.id}/approval`,{
      method:"PUT",headers:{"content-type":"application/json"},
      body:JSON.stringify({approved,expectedVersion:editor.post.version,mode})});
      const body=await response.json() as {post:FacebookImagePost;error?:string};
      if(!response.ok||!body.post)throw new Error(body.error||"Schválenie zlyhalo.");
      setEditor({post:body.post});setNotice(mode==="direct"?(approved?"Súhlas majiteľa zaznamenaný. Priame publikovanie z ChatGPT zatiaľ vyžaduje samostatné bezpečné prepojenie.":"Súhlas majiteľa odvolaný."):
  (approved?"Naplánované publikovanie individuálne povolené.":"Povolenie naplánovaného publikovania odvolané."));setRefresh(v=>v+1);
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
  const scheduledInMonth=data.calendar.filter(post=>post.status==="scheduled"&&!post.deletedAt&&post.scheduledAt)
    .sort((a,b)=>(a.scheduledAt??"").localeCompare(b.scheduledAt??"")).slice(0,4);
  const publisherReady=Boolean(publisher?.connected&&publisher.technicallyEnabled);
  return <div className={styles.root} data-interactive={ready?"true":"false"}>
    <div className={styles.dashboard}>
      <header className={styles.heading}>
        <div>
          <h2>Prehľad publikovania</h2>
          <p>Príspevky z Notionu a administrácie · časové pásmo Bratislava</p>
        </div>
        <AdminActionButton type="button" variant="primary" disabled={loading||!!error||!ready} onClick={()=>edit(null)}>Vytvoriť príspevok</AdminActionButton>
      </header>
      <section className={styles.stats} aria-label="Počty príspevkov v zobrazenom mesiaci">
        {(["scheduled","draft","published","sending","review"] as const).map(kind=>
          <button key={kind} type="button" className={[styles.statCard,status===kind?styles.activeStat:""].join(" ")}
            aria-pressed={status===kind} onClick={()=>{setStatus(kind);setPage(1);}}>
            <span className={[styles.statusPill,styles[kind]].join(" ")}>{filters[kind]}</span>
            <strong>{data.counts?.[kind]??0}</strong>
          </button>)}
      </section>
      <section className={styles.upcomingPanel} aria-label="Naplánované príspevky v mesiaci">
        <div className={styles.sectionHead}>
          <div><h2>Naplánované v mesiaci</h2><p>Najbližšie termíny zo zobrazeného mesiaca</p></div>
          <span className={styles.monthLabel}>{calendarMonthLabel(month)}</span>
        </div>
        {scheduledInMonth.length? <div className={styles.upcomingList}>{scheduledInMonth.map(post=>
          <AdminActionButton key={post.id} type="button" className={styles.upcomingRow} disabled={loading||!ready}
            onClick={()=>edit(post)}>
            {post.imageUrl?<img src={post.imageUrl} width={48} height={48} alt=""/>:
              <span className={styles.imageFallback} aria-hidden="true">FB</span>}
            <span className={styles.upcomingText}>
              <strong>{post.title}</strong>
              <small>{shownAt(post.scheduledAt)} · {post.approvalStatus==="APPROVED"?"Schválený":"Čaká na povolenie"}</small>
            </span>
            <span className={[styles.statusPill,styles.scheduled].join(" ")}>Naplánovaný</span>
          </AdminActionButton>)}</div>:
          <p className={styles.emptyNote}>V tomto mesiaci zatiaľ nie sú naplánované príspevky.</p>}
      </section>
      <aside className={styles.systemPanel} aria-label="Stav systému a synchronizácia">
        <div className={styles.sectionHead}><div><h2>Stav systému</h2><p>Pripojenia a nastavenia</p></div></div>
        <div className={styles.systemRow}><span>Facebook</span>
          <strong className={publisherReady?styles.systemReady:styles.systemUnknown}>{publisher===null?"Načítavam…":publisherReady?"Konfigurácia pripravená":"Nie je pripravený"}</strong>
        </div>
        <div className={styles.systemRow}><span>Notion</span><strong>Synchronizácia príspevkov</strong></div>
        <div className={styles.systemRow}><span>Publikovanie</span><strong>{publisher===null?"Načítavam…":publisher.enabled?"Automatika zapnutá (STOP vypnutý)":"STOP zapnutý — automatické odosielanie vypnuté"}</strong></div>
        <AdminActionButton type="button" variant="secondary" disabled={!ready||notionBusy||loading}
          onClick={()=>void syncNotion()}>{notionBusy?"Synchronizujem…":"Synchronizovať Notion"}</AdminActionButton>
        <details className={styles.settingsDetails}>
          <summary>Podrobné nastavenia</summary>
          <div className={styles.settingsInner}>
            <label className={styles.toggleLabel}><input type="checkbox" checked={publisher?.enabled??false}
              disabled={!publisher||publisherBusy} onChange={e=>void setAutomatic(e.target.checked)}/>
              Automatické publikovanie zapnuté (hlavný STOP)</label>
            <p>Vypnuté = žiadny nový automatický Meta POST. Zapnuté = iba osobitne schválené príspevky.
              Odoslanie, ktoré sa už začalo, nemusí byť možné zastaviť.</p>
            {publisher&&!publisher.technicallyEnabled&&<p role="status">Facebook nie je technicky pripravený. Over Page ID, token a povolenie publikovania.</p>}
            {publisherError&&<p role="alert" className="admin-message admin-message--error">{publisherError}</p>}
            <p>Import z Notionu používa samostatnú databázu Facebook obrázky.</p>
          </div>
        </details>
      </aside>
      <section className={styles.calendarPanel} aria-label="Kalendár Facebook obrázkov" aria-busy={loading}>
        <div className={styles.sectionHead}>
          <div><h2>Kalendár</h2><p>Vyber deň na zobrazenie príspevkov alebo vytvorenie nového</p></div>
          <div className={styles.monthNav}>
            <AdminActionButton type="button" variant="secondary" disabled={loading||!ready}
              onClick={()=>{setMonth(moveCalendarMonth(month,-1));setDay(null);}} aria-label="Predošlý mesiac">‹</AdminActionButton>
            <strong>{calendarMonthLabel(month)}</strong>
            <AdminActionButton type="button" variant="secondary" disabled={loading||!ready}
              onClick={()=>{setMonth(moveCalendarMonth(month,1));setDay(null);}} aria-label="Ďalší mesiac">›</AdminActionButton>
          </div>
        </div>
        <div className={[shared.grid,styles.compactGrid].join(" ")}>
          {calendarWeekdays.map(d=><div key={d} className={[shared.weekday,styles.compactWeekday].join(" ")}>{d}</div>)}
          {calendarMonthDays(month).map(cell=>{
            const posts=facebookPostsForDay(data.calendar,cell.date).filter(post=>!post.deletedAt);
            return <div key={cell.date} className={[shared.day,styles.calendarDay,!cell.inMonth?shared.blank:""].join(" ")}>
              <AdminActionButton type="button" className={styles.calendarDayButton}
                aria-label={posts.length?"Zobraziť príspevky "+cell.date:"Vytvoriť príspevok "+cell.date}
                disabled={loading||!!error||!ready}
                onClick={()=>posts.length?setDay(day===cell.date?null:cell.date):edit(null,cell.date)}>
                <time dateTime={cell.date}>{cell.day}</time>
                {posts.length>0&&<span className={styles.dayCount}>{posts.length}</span>}
              </AdminActionButton>
              {posts.slice(0,1).map(entry)}
            </div>;
          })}
        </div>
        {day&&<div className={styles.dayDetail}>
          <div className={styles.sectionHead}>
            <h3>Príspevky — {day}</h3>
            <AdminActionButton type="button" variant="secondary" disabled={loading||!ready}
              onClick={()=>edit(null,day)}>+ Nový v tento deň</AdminActionButton>
          </div>
          {facebookPostsForDay(data.calendar,day).filter(post=>!post.deletedAt).map(entry)}
          {!facebookPostsForDay(data.calendar,day).filter(post=>!post.deletedAt).length&&<p>Na tento deň nie je naplánovaný príspevok.</p>}
        </div>}
      </section>
      <section className={styles.listPanel} aria-labelledby="facebook-posts-heading">
        <div className={styles.sectionHead}>
          <div><h2 id="facebook-posts-heading">Všetky príspevky ({data.total})</h2><p>Zoznam a podrobnosti</p></div>
          <div className={styles.filters}>
            <label>Stav <select disabled={loading||!ready} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}>
              {Object.entries(filters).map(([key,label])=><option key={key} value={key}>{label}</option>)}
            </select></label>
            <label>Zdroj <select disabled={loading||!ready} value={source} onChange={e=>{setSource(e.target.value);setPage(1);}}>
              <option value="all">Všetky zdroje</option><option value="notion">Notion</option><option value="manual">Ručne</option>
            </select></label>
          </div>
        </div>
        <p className={styles.liveNote} aria-live="polite">Stavy sa obnovujú približne každých 12 sekúnd pri otvorenej stránke.</p>
        {data.trashAvailable===false&&<p role="status">Trvalé odstránenie čaká na D1 migráciu 0131.</p>}
        {error&&<p role="alert" className="admin-message admin-message--error">{error}</p>}
        {notice&&<p role="status" className="admin-message">{notice}</p>}
        {!data.items.length&&<p className={styles.emptyNote}>Žiadne príspevky pre zvolený filter.</p>}
        <div className={styles.list}>{data.items.map(post=><article key={post.id}
          className={[styles.listItem,styles[visualStatus(post).kind+"Card"]??""].join(" ")}>
          {post.imageUrl?<img src={post.imageUrl} alt="" width={72} height={72}/>:
            <span className={styles.imageFallback} aria-hidden="true">FB</span>}
          <div className={styles.listText}>
            <div className={styles.listTitle}>{entry(post)}</div>
            <p>{post.source==="notion"?"Notion":"Ručne"} · {post.scheduledAt?
              facebookWallTime(post.scheduledAt).date+" "+facebookWallTime(post.scheduledAt).time+" · Bratislava":"Bez dátumu"}
              {post.approvalStatus==="APPROVED"?" · Povolené plánované publikovanie":""}
              {post.directPublishConsent?" · Súhlas majiteľa s priamym publikovaním":""}
              {post.publicationState==="UNCERTAIN"?" · Neopakovať bez preverenia":""}</p>
            <div className={styles.itemActions}>
              {facebookUrl(post.facebookPostId)&&<a href={facebookUrl(post.facebookPostId)??"#"} target="_blank" rel="noopener noreferrer">Otvoriť na Facebooku ↗</a>}
              {data.trashAvailable&&post.publicationState!=="SENDING"&&<button type="button" disabled={busy}
                onClick={()=>void permanentlyRemove(post)}>Natrvalo odstrániť</button>}
            </div>
          </div>
        </article>)}</div>
        <div className={styles.pagination}>
          <AdminActionButton type="button" variant="secondary" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}>Predošlá strana</AdminActionButton>
          <span>Strana {data.page} / {data.pages}</span>
          <AdminActionButton type="button" variant="secondary" disabled={page>=data.pages||loading} onClick={()=>setPage(p=>p+1)}>Ďalšia strana</AdminActionButton>
        </div>
      </section>
    </div>
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
        {editor.post&&!locked&&<div className={styles.actions}>
          {editor.post.status==="scheduled"&&<>
            <p>Povoliť publikovanie: <strong>{editor.post.approvalStatus==="APPROVED"?"Áno":"Nie"}</strong>. Platí pre naplánovaný termín.</p>
            <AdminActionButton type="button" variant="secondary" disabled={busy||dirty||!publisher} onClick={()=>void setApproval(editor.post!.approvalStatus!=="APPROVED","scheduled")}>
              {editor.post.approvalStatus==="APPROVED"?"Odvolať povolenie publikovania":"Povoliť publikovanie"}
            </AdminActionButton>
          </>}
          <p>Súhlas majiteľa – priame publikovanie: <strong>{editor.post.directPublishConsent?"Áno":"Nie"}</strong>. Samostatný súhlas neodosiela nič bez zabezpečenej autorizovanej požiadavky.</p>
          <AdminActionButton type="button" variant="secondary" disabled={busy||dirty||!publisher||!editor.post.imageKey}
            onClick={()=>void setApproval(!editor.post!.directPublishConsent,"direct")}>
            {editor.post.directPublishConsent?"Odvolať súhlas majiteľa":"Udeliť súhlas majiteľa"}
          </AdminActionButton>
          {dirty&&<p>Najprv ulož zmeny príspevku. Každou úpravou obsahu alebo termínu sa obe povolenia zrušia.</p>}
        </div>}
        {editor.post?.publicationState==="UNCERTAIN"&&<p role="alert">Výsledok odoslania je neistý ({editor.post.publicationError??"neznáma chyba"}). Príspevok sa automaticky neodošle znova. Najskôr skontroluj Facebook stránku.</p>}
        {editor.post?.publicationState==="SENDING"&&<p role="status">Odoslanie sa začalo. Pri prerušení je potrebné manuálne preverenie, aby nevznikla duplicita.</p>}
        {editor.post&&<section className={styles.timeline} aria-label="História príspevku">
          <h3>História príspevku</h3>
          <ol>
            <li>Vytvorený: {shownAt(editor.post.createdAt)}</li>
            <li>Posledná úprava: {shownAt(editor.post.updatedAt)}</li>
            {editor.post.approvedAt&&<li>Povolené plánovanie: {shownAt(editor.post.approvedAt)} · {editor.post.approvedBy}</li>}
            {editor.post.directConsentAt&&<li>Súhlas majiteľa: {shownAt(editor.post.directConsentAt)} · {editor.post.directConsentBy}</li>}
            {editor.post.attemptStartedAt&&<li>Začiatok odosielania: {shownAt(editor.post.attemptStartedAt)}</li>}
            {editor.post.attemptCompletedAt&&<li>Výsledok odosielania: {shownAt(editor.post.attemptCompletedAt)} · {visualStatus(editor.post).label}</li>}
            {editor.post.publishedAt&&<li>Publikovaný: {shownAt(editor.post.publishedAt)}</li>}
            {editor.post.deletedAt&&<li>Natrvalo odstránený z administrácie: {shownAt(editor.post.deletedAt)} · {editor.post.deletedBy}</li>}
          </ol>
          {editor.post.facebookPostId&&<p>Facebook Post ID: {editor.post.facebookPostId}</p>}
        </section>}
        {editor.post&&data.trashAvailable&&editor.post.publicationState!=="SENDING"&&
          <div className={styles.actions}><AdminActionButton type="button" variant="secondary" disabled={busy}
            onClick={()=>void permanentlyRemove(editor.post!)}>Natrvalo odstrániť</AdminActionButton></div>}
        {busy&&<p role="status">Prebieha ukladanie alebo upload…</p>}
        {locked&&<p>Príspevok sa odosiela, bol odoslaný alebo vyžaduje preverenie; úpravy sú blokované.</p>}
      </>}
    </dialog>
  </div>;
}
