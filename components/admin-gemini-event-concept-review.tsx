"use client";

import Link from "next/link";
import { useRef,useState } from "react";
import { useRouter } from "next/navigation";
import { AdminActionButton,AdminDestructiveConfirmDialog } from "@/components/admin-interaction-system";
import { safeGeminiReviewUrl,type GeminiEventReviewConcept } from "@/lib/gemini-automation-concept-review";
import styles from "./admin-gemini-concept-review.module.css";

function ExternalLink({label,url}:{label:string;url:string}) {
  const href=safeGeminiReviewUrl(url);
  return href?<a href={href} target="_blank" rel="noopener noreferrer" className={styles.external}>{label}: {href} ↗</a>:null;
}
const format=(value:string)=> {
  const date=new Date(value);
  return Number.isNaN(date.getTime())?"—":new Intl.DateTimeFormat("sk-SK",{dateStyle:"medium",timeStyle:"short",timeZone:"Europe/Bratislava"}).format(date);
};
export function AdminGeminiEventConceptReview({concepts}:{concepts:GeminiEventReviewConcept[]}) {
  const router=useRouter(),inFlight=useRef(false);
  const [confirmId,setConfirmId]=useState<number|null>(null);
  const [pending,setPending]=useState(false);
  const [hidden,setHidden]=useState<number[]>([]);
  const [errors,setErrors]=useState<Record<number,string>>({});
  const visible=concepts.filter(c=>!hidden.includes(c.id));
  async function reject() {
    if(confirmId===null||inFlight.current)return;
    const id=confirmId;inFlight.current=true;setPending(true);setErrors(current=>({...current,[id]:""}));
    try {
      const response=await fetch("/api/admin/gemini-automation/concepts/"+id+"/reject",{
        method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:"{}",
      });
      const data=await response.json().catch(()=>null) as {error?:string}|null;
      if(!response.ok)throw new Error(data?.error??"Odmietnutie podujatia zlyhalo.");
      setHidden(v=>[...v,id]);setConfirmId(null);router.refresh();
    } catch(error) {
      setErrors(current=>({...current,[id]:error instanceof Error?error.message:"Odmietnutie zlyhalo."}));
      setConfirmId(null);
    } finally {inFlight.current=false;setPending(false);}
  }
  return <section className={styles.container} aria-label="Gemini podujatia na kontrolu">
    <div className={styles.heading}><h3>Čakajú na kontrolu</h3><span>{visible.length} podujatí (max. 50)</span></div>
    {!visible.length&&<p className={styles.empty}>Žiadne Gemini podujatia nečakajú na kontrolu.</p>}
    <div className={styles.grid}>{visible.map(event=><article className={styles.card} key={event.id}>
      <div className={styles.top}><div className={styles.title}>
        <span className={styles.state}>Gemini koncept · draft</span>
        <h3>{event.name}</h3>
        <p>{event.category} · {event.startDate}{event.startTime?" "+event.startTime:""}{event.endDate?" – "+event.endDate:""}{event.endTime?" "+event.endTime:""}</p>
      </div><small>Objavené {format(event.discoveredAt)}</small></div>
      <p className={styles.description}>{event.description}</p>
      <dl className={styles.details}>
        <div className={styles.field}><dt>Organizátor</dt><dd>{event.organizer}</dd></div>
        <div className={styles.field}><dt>Miesto</dt><dd>{[event.venue,event.city,event.region].filter(Boolean).join(" · ")}</dd></div>
        <div className={styles.field}><dt>Canonical Event ID</dt><dd>{event.canonicalEntityId}</dd></div>
      </dl>
      <div className={styles.sources}><strong>Zdroje</strong>
        {event.website&&<ExternalLink label="Web podujatia" url={event.website}/>}
        {event.registrationUrl&&<ExternalLink label="Registrácia" url={event.registrationUrl}/>}
        {event.sourceUrls.map((url,i)=><ExternalLink key={url} label={"Zdroj "+(i+1)} url={url}/>)}
        {event.notionPageId&&<span className={styles.notionsync}>Prepojené s Notion</span>}
      </div>
      <div className={styles.actions}>
        <Link className="admin-primary-action" href={"/admin/podujatia/"+event.canonicalEntityId}>Upraviť a skontrolovať</Link>
        <AdminActionButton variant="destructive" disabled={pending} onClick={()=>setConfirmId(event.id)}>Odmietnuť</AdminActionButton>
      </div>
      {errors[event.id]&&<p className={styles.error} role="alert">{errors[event.id]}</p>}
    </article>)}</div>
    <AdminDestructiveConfirmDialog open={confirmId!==null}
      title="Odmietnuť návrh podujatia?"
      description="Podujatie zostane nepublikovaným draftom a jeho Notion prepojenie zostane zachované. Identita sa zapamätá pre deduplikáciu."
      affectedCount={1} affectedLabel="podujatie" confirmLabel="Odmietnuť"
      pending={pending} onCancel={()=>{if(!pending)setConfirmId(null);}} onConfirm={()=>void reject()}/>
  </section>;
}
