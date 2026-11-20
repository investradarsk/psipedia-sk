"use client";
import { useCallback,useEffect,useRef,useState } from "react";
import type { ChatMessage } from "@/lib/partner-chat";
import styles from "./partner-private-chat.module.css";

type ChatPage={items:ChatMessage[];nextBefore:string|null};
type Props={mode:"PARTNER"|"ADMIN";accountId?:string;initial:ChatPage};
export function PartnerPrivateChat({mode,accountId,initial}:Props){
  const base=mode==="PARTNER"?"/api/partner/chat":
    "/api/admin/partners/chat/"+encodeURIComponent(accountId??"");
  const readUrl=base+"/read";
  const attachments=mode==="PARTNER"?"/api/partner/chat/attachments/":
    "/api/admin/partners/chat-attachments/";
  const [items,setItems]=useState<ChatMessage[]>(initial.items);
  const [before,setBefore]=useState<string|null>(initial.nextBefore);
  const [body,setBody]=useState("");
  const [files,setFiles]=useState<File[]>([]);
  const [busy,setBusy]=useState(false);
  const [moreBusy,setMoreBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const bottom=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const scrollOnce=useRef(false);
  const ack=useCallback(async()=>{
    try{await fetch(readUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});}
    catch{/* Next poll or later opening will retry. */}
  },[readUrl]);
  const refresh=useCallback(async()=>{
    try{
      const response=await fetch(base,{cache:"no-store"});
      if(!response.ok)return;
      const result=await response.json() as ChatPage;
      setItems(old=>{
        const all=new Map(old.map(item=>[item.id,item]));
        for(const item of result.items)all.set(item.id,item);
        return Array.from(all.values()).sort((a,b)=>
          a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
      });
      if(!scrollOnce.current){scrollOnce.current=true;bottom.current?.scrollIntoView({block:"end"});}
      await ack();
    }catch{/* Polling is best effort, never silently discards an unsent draft. */}
  },[base,ack]);
  useEffect(()=>{
    void ack();
    bottom.current?.scrollIntoView({block:"end"});
    const timer=window.setInterval(()=>{if(!document.hidden)void refresh();},20000);
    return ()=>window.clearInterval(timer);
  },[ack,refresh]);
  async function loadOlder(){
    if(!before||moreBusy)return;
    setMoreBusy(true);setError("");
    try{
      const response=await fetch(base+"?before="+encodeURIComponent(before),{cache:"no-store"});
      const result=await response.json() as ChatPage & {error?:string};
      if(!response.ok)throw new Error(result.error||"Staršie správy sa nenačítali.");
      setItems(old=>{
        const all=new Map([...result.items,...old].map(item=>[item.id,item]));
        return Array.from(all.values()).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
      });
      setBefore(result.nextBefore);
    }catch(e){setError(e instanceof Error?e.message:"Načítanie zlyhalo.");}
    finally{setMoreBusy(false);}
  }
  async function send(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    if(!body.trim()&&!files.length){setError("Napíšte správu alebo pridajte prílohu.");return;}
    setBusy(true);setError("");setNotice("");
    try{
      const form=new FormData();form.set("body",body);
      for(const file of files)form.append("files",file,file.name);
      const response=await fetch(base,{method:"POST",body:form});
      const result=await response.json() as {error?:string};
      if(!response.ok)throw new Error(result.error||"Správu sa nepodarilo odoslať.");
      setBody("");setFiles([]);if(input.current)input.current.value="";
      await refresh();
      bottom.current?.scrollIntoView({block:"end",behavior:"smooth"});
      setNotice("Správa bola odoslaná.");
    }catch(e){setError(e instanceof Error?e.message:"Odoslanie sa nepodarilo.");}
    finally{setBusy(false);}
  }
  return <section className={styles.chat} aria-label="Súkromné správy Partneri">
    <div className={styles.description}>
      <strong>Súkromný rozhovor</strong>
      <p>Len vy a {mode==="ADMIN"?"tento partner":"administrátor Psipedie"}.
        Správy sa ukladajú v Psipedii. Prílohy nie sú verejné.</p>
    </div>
    {before&&<button type="button" className={styles.older} onClick={()=>void loadOlder()} disabled={moreBusy}>
      {moreBusy?"Načítavam…":"Načítať staršie správy"}
    </button>}
    <div className={styles.timeline} role="log" aria-live="polite" aria-relevant="additions">
      {!items.length&&<p className={styles.empty}>Zatiaľ žiadne správy. Napíšte prvú správu.</p>}
      {items.map(item=>{
        const own=item.senderRole===mode;
        return <article key={item.id} className={own?styles.mine:styles.theirs}>
          <div className={styles.messageHeader}>
            <strong>{own?"Vy":mode==="PARTNER"?"Psipedia":"Partner"}</strong>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("sk-SK")}</time>
          </div>
          {item.body&&<p className={styles.messageText}>{item.body}</p>}
          {item.attachments.length>0&&<div className={styles.attachments}>
            {item.attachments.map(file=><a key={file.id} href={attachments+encodeURIComponent(file.id)}
              download rel="nofollow" target="_blank">
              <span aria-hidden="true">📎</span> {file.name} <small>({Math.ceil(file.size/1024)} kB)</small>
            </a>)}
          </div>}
        </article>;
      })}
      <div ref={bottom}/>
    </div>
    <form onSubmit={event=>void send(event)} className={styles.composer}>
      <label htmlFor={mode==="PARTNER"?"partner-chat-text":"admin-chat-text"}>Nová správa</label>
      <textarea id={mode==="PARTNER"?"partner-chat-text":"admin-chat-text"}
        value={body} maxLength={4000} rows={3} disabled={busy}
        onChange={event=>setBody(event.target.value)} placeholder="Napíšte správu…"/>
      <label htmlFor={mode==="PARTNER"?"partner-chat-files":"admin-chat-files"}>Prílohy (JPG, PNG, WebP, PDF)</label>
      <input id={mode==="PARTNER"?"partner-chat-files":"admin-chat-files"} ref={input}
        disabled={busy} type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf"
        onChange={event=>{
          const next=Array.from(event.target.files??[]);
          if(next.length>3||next.reduce((sum,f)=>sum+f.size,0)>12*1024*1024||
            next.some(f=>f.size>5*1024*1024)){
            setError("Najviac 3 prílohy, každá do 5 MB a spolu do 12 MB.");
            event.target.value="";setFiles([]);return;
          }
          setError("");setFiles(next);
        }}/>
      <div className={styles.sendRow}>
        <span>{body.length}/4000 · {files.length} príloh</span>
        <button type="submit" disabled={busy||(!body.trim()&&!files.length)}>
          {busy?"Odosielam…":"Odoslať správu"}
        </button>
      </div>
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      {notice&&<p role="status" className={styles.success}>{notice}</p>}
    </form>
  </section>;
}
