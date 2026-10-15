"use client";
import {useEffect,useRef,useState,useSyncExternalStore} from "react";
import {calendarMonthDays,calendarMonthLabel,calendarWeekdays,moveCalendarMonth} from "@/lib/event-calendar-view";
import {facebookWallTime,facebookPostsForDay,type FacebookImagePost} from "@/lib/facebook-image-post";
import {uploadAdminImage} from "@/lib/admin-image-upload";
import {AdminActionButton} from "@/components/admin-interaction-system";
import shared from "./admin-editorial-calendar.module.css";
import styles from "./admin-facebook-images.module.css";

type Data={items:FacebookImagePost[];calendar:FacebookImagePost[];page:number;pages:number;total:number};
type Form={title:string;imageUrl:string;imageKey:string;caption:string;date:string;time:string;repeatedHour:string};
const blank=(date=""):Form=>({title:"Nový príspevok",imageUrl:"",imageKey:"",caption:"",date,time:date?"09:00":"",repeatedHour:""});
function formFor(post:FacebookImagePost):Form {
  const wall=post.scheduledAt?facebookWallTime(post.scheduledAt):{date:"",time:""};
  // Keep the stored occurrence when an unchanged autumn-hour schedule is saved.
  return {...blank(),title:post.title,imageUrl:post.imageUrl,imageKey:post.imageKey,caption:post.caption,...wall,repeatedHour:""};
}
const subscribe=()=>()=>{};
const labels={draft:"Koncept",scheduled:"Naplánovaný",published:"Publikovaný"};
export function AdminFacebookImages({initial,initialMonth}:{initial:Data;initialMonth:string}){
  const ready=useSyncExternalStore(subscribe,()=>true,()=>false);
  const[data,setData]=useState(initial),[month,setMonth]=useState(initialMonth),[status,setStatus]=useState("all"),[page,setPage]=useState(1);
  const[opening,setOpening]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[day,setDay]=useState<string|null>(null),[refresh,setRefresh]=useState(0);
  const[editor,setEditor]=useState<{post:FacebookImagePost|null}|null>(null),[form,setForm]=useState<Form>(blank()),[baseline,setBaseline]=useState(""),[editorError,setEditorError]=useState(""),[busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null),origin=useRef<HTMLElement|null>(null),openRequest=useRef<AbortController|null>(null),lock=useRef(false);
  const queryKey=`${month}|${status}|${page}|${refresh}`;
  const[settledQuery,setSettledQuery]=useState(queryKey);
  const loading=opening||settledQuery!==queryKey;
  const dirty=!!editor && JSON.stringify(form)!==baseline;
  useEffect(()=>{const abort=new AbortController();
    fetch(`/api/admin/facebook-images?month=${month}&status=${status}&page=${page}`,{signal:abort.signal,cache:"no-store"}).then(async r=>{const body=await r.json() as Data & {error?:string};if(!r.ok)throw new Error(body.error||"Načítanie zlyhalo.");setData(body);setError("");}).catch(e=>{if(!abort.signal.aborted)setError(e.message);}).finally(()=>{if(!abort.signal.aborted)setSettledQuery(queryKey);});
    return()=>abort.abort();
  },[month,status,page,refresh,queryKey]);
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
  const entry=(post:FacebookImagePost)=><AdminActionButton type="button" key={post.id} className={`${shared.entry} ${styles.entry}`} disabled={loading||!ready} onClick={()=>edit(post)}>
    <span className={styles[post.status]}>{labels[post.status]}</span><span className={shared.entryTitle}>{post.title}</span>{post.scheduledAt&&<time dateTime={post.scheduledAt}>{facebookWallTime(post.scheduledAt).time}</time>}
  </AdminActionButton>;
  const published=editor?.post?.status==="published";
  return <div className={styles.root} data-interactive={ready?"true":"false"}>
    <p>Plánovanie v Europe/Bratislava. Termín iba ukladáme — publikovanie na Facebook nie je zapnuté.</p>
    {error&&<p role="alert" className="admin-message admin-message--error">{error}</p>}{notice&&<p role="status" className="admin-message">{notice}</p>}
    <div className={shared.toolbar}><div className={shared.monthNav}><AdminActionButton type="button" variant="secondary" disabled={loading||!ready} onClick={()=>{setMonth(moveCalendarMonth(month,-1));setDay(null);}}>Predošlý mesiac</AdminActionButton><h2>{calendarMonthLabel(month)}</h2><AdminActionButton type="button" variant="secondary" disabled={loading||!ready} onClick={()=>{setMonth(moveCalendarMonth(month,1));setDay(null);}}>Ďalší mesiac</AdminActionButton></div>
      <AdminActionButton type="button" variant="primary" disabled={loading||!!error||!ready} onClick={()=>edit(null)}>Vytvoriť príspevok</AdminActionButton>
      <label>Stav <select disabled={loading||!ready} value={status} onChange={e=>{setStatus(e.target.value);setPage(1);}}><option value="all">Všetky</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
    </div>
    <section aria-label="Kalendár Facebook obrázkov" aria-busy={loading}>
      <p className={shared.caption}>Klikni na deň pre nový príspevok. Termíny sa môžu prekrývať. Koncept bez dátumu je iba v prehľade. Na mobile možno kalendár posúvať do strán.</p>
      <div className={styles.scroll} tabIndex={0} aria-label="Posúvateľný mesačný kalendár"><div className={shared.grid}>
        {calendarWeekdays.map(d=><div key={d} className={shared.weekday}>{d}</div>)}
        {calendarMonthDays(month).map(cell=>{const posts=facebookPostsForDay(data.calendar,cell.date);return <div key={cell.date} className={`${shared.day} ${styles.cell} ${!cell.inMonth?shared.blank:""}`}>
          <AdminActionButton type="button" className={shared.dayButton} aria-label={`Vytvoriť príspevok ${cell.date}`} disabled={loading||!!error||!ready} onClick={()=>edit(null,cell.date)}><time dateTime={cell.date}>{cell.day}</time><span className={shared.count}>{posts.length}</span></AdminActionButton>
          {posts.slice(0,3).map(entry)}{posts.length>3&&<AdminActionButton type="button" className={shared.more} onClick={()=>setDay(cell.date)}>Zobraziť všetky ({posts.length})</AdminActionButton>}
        </div>;})}
      </div></div>
      {day&&<div className={shared.detail}><h3>Príspevky {day}</h3>{facebookPostsForDay(data.calendar,day).map(entry)}</div>}
    </section>
    <section className="admin-form-card" aria-labelledby="facebook-posts-heading"><h2 id="facebook-posts-heading">Prehľad príspevkov ({data.total})</h2>
      {!data.items.length&&<p>Zatiaľ tu nie sú žiadne príspevky.</p>}
      <div className={styles.list}>{data.items.map(post=><article key={post.id} className={styles.listItem}>{post.imageUrl&&<img src={post.imageUrl} alt="" width={100} height={100}/>}<div>{entry(post)}<p>{post.scheduledAt?`${facebookWallTime(post.scheduledAt).date} ${facebookWallTime(post.scheduledAt).time} · Europe/Bratislava`:"Bez dátumu"}</p></div></article>)}</div>
      <div className="admin-actions"><AdminActionButton type="button" variant="secondary" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}>Predošlá strana</AdminActionButton><span>Strana {data.page} / {data.pages}</span><AdminActionButton type="button" variant="secondary" disabled={page>=data.pages||loading} onClick={()=>setPage(p=>p+1)}>Ďalšia strana</AdminActionButton></div>
    </section>
    <dialog ref={dialog} className={styles.dialog} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget){const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)close();}}} aria-labelledby="facebook-editor-heading">
      {editor&&<><header className={styles.dialogHeader}><h2 id="facebook-editor-heading">{editor.post?"Upraviť príspevok":"Nový Facebook obrázok"}</h2><AdminActionButton type="button" variant="secondary" disabled={busy} onClick={close}>Zavrieť</AdminActionButton></header>
        <p>ID: {editor.post?.id??"Vytvorí sa pri uložení"}{editor.post?` · verzia ${editor.post.version}`:""}</p>
        {editorError&&<p role="alert" className="admin-message admin-message--error">{editorError}</p>}
        <form onSubmit={e=>{e.preventDefault();void save("draft");}}><fieldset disabled={busy||published} className={styles.fields}>
          <label>Názov<input autoFocus required maxLength={200} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
          <label>Obrázok (JPG, PNG, WebP, max. 8 MB)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.target.value="";}}/></label>
          {form.imageUrl&&<img className={styles.preview} src={form.imageUrl} alt="Náhľad Facebook obrázka"/>}
          <label htmlFor="facebook-caption">Popis na Facebook</label><textarea id="facebook-caption" rows={6} maxLength={15000} value={form.caption} onChange={e=>setForm({...form,caption:e.target.value})}/>
          <div className={styles.dateFields}><label>Dátum<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value,time:e.target.value?(form.time||"09:00"):"",repeatedHour:""})}/></label><label>Čas (Bratislava)<input type="time" value={form.time} onChange={e=>setForm({...form,time:e.target.value,repeatedHour:""})}/></label></div>
          <label>Ak sa hodina pri zmene zimného času opakuje<select value={form.repeatedHour} onChange={e=>setForm({...form,repeatedHour:e.target.value})}><option value="">Vybrať pri opakovanej hodine</option><option value="earlier">Prvý výskyt (letný čas)</option><option value="later">Druhý výskyt (zimný čas)</option></select></label>
          <p>Stav: {editor.post?labels[editor.post.status]:"Koncept"}. Uloženie naplánovania nepublikuje obrázok.</p>
          <div className={styles.actions}><AdminActionButton type="submit" variant="secondary">Uložiť koncept</AdminActionButton><AdminActionButton type="button" variant="primary" onClick={()=>void save("scheduled")}>Uložiť naplánovanie</AdminActionButton>{editor.post?.status==="scheduled"&&<AdminActionButton type="button" variant="secondary" onClick={()=>void save("draft",true)}>Zrušiť naplánovanie</AdminActionButton>}</div>
        </fieldset></form>{busy&&<p role="status">Prebieha ukladanie alebo upload…</p>}{published&&<p>Publikovaný príspevok je iba na čítanie.</p>}
      </>}
    </dialog>
  </div>;
}
