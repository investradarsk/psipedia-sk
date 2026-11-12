"use client";

import { useEffect, useState } from "react";
import { facebookWallTime, type FacebookImagePost } from "@/lib/facebook-image-post";
import {
  FACEBOOK_PLAN_KEYS,
  FACEBOOK_PLAN_WEEKDAYS,
  bratislavaToday,
  facebookPlanAddDays,
  facebookPlanSlotsForDay,
  facebookPlanWeekStart,
  type FacebookPlanKey,
} from "@/lib/facebook-weekly-plan";
import { FACEBOOK_WEEKLY_TOPICS, defaultFacebookWeeklyTemplate, facebookWeeklySlotLabel,
  validateFacebookWeeklyTemplate, type FacebookWeeklySlot } from "@/lib/facebook-weekly-template";
import styles from "./admin-facebook-weekly-planner.module.css";

type Mark = { slot_date: string; slot_key: FacebookPlanKey };
type TemplateState = {available:boolean;custom:boolean;version:number;slots:FacebookWeeklySlot[]};
type PlanResponse = { weekStart?: string; marks?: Mark[]; slotMarks?: {slot_date:string;slot_id:string}[];
  template?:TemplateState;error?:string };
type PostsResponse = { calendar?: FacebookImagePost[]; error?: string };

type Props = {
  onCreate: (date: string, time: string) => void;
  onEdit: (post: FacebookImagePost) => void;
  refresh: number;
};

function markId(date: string, key: string) {
  return date + "|" + key;
}
function shortDate(date: string) {
  const [year, month, day] = date.split("-");
  return day + ". " + month + ". " + year;
}
function dayIndex(date: string) {
  return (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
}
function postState(post: FacebookImagePost) {
  if (["UNCERTAIN", "RETRY_EXHAUSTED"].includes(post.publicationState || "")) {
    return { label: "Na preverenie", code: "review" };
  }
  if (post.publicationState === "SENDING") return { label: "Odosiela sa", code: "sending" };
  if (post.status === "published") return { label: "Publikované", code: "published" };
  if (post.status === "scheduled") {
    return post.approvalStatus === "APPROVED"
      ? { label: "Naplánované · schválené", code: "scheduled" }
      : { label: "Naplánované · bez súhlasu", code: "scheduled" };
  }
  return { label: "Koncept", code: "draft" };
}

/**
 * Read-only projection of actual D1 Facebook items + a distinct manual
 * editorial checklist. The checklist never schedules or approves a Meta post.
 * All creation/edits go through the existing post editor and its safeguards.
 */
export function AdminFacebookWeeklyPlanner({ onCreate, onEdit, refresh }: Props) {
  const [week, setWeek] = useState<0 | 1>(0);
  const [selectedDay, setSelectedDay] = useState(() => dayIndex(bratislavaToday()));
  const [weekStart, setWeekStart] = useState(() => facebookPlanWeekStart());
  const [today, setToday] = useState(() => bratislavaToday());
  const [posts, setPosts] = useState<FacebookImagePost[]>([]);
  const [marks, setMarks] = useState<Set<string>>(() => new Set());
  const [slotMarks,setSlotMarks] = useState<Set<string>>(() => new Set());
  const [template,setTemplate] = useState<TemplateState>(()=>({
    available:false,custom:false,version:0,slots:defaultFacebookWeeklyTemplate(),
  }));
  const [editPlan,setEditPlan] = useState(false);
  const [editVersion,setEditVersion] = useState(0);
  const [draft,setDraft] = useState<FacebookWeeklySlot[]>([]);
  const [editDay,setEditDay] = useState(0);
  const [templateBusy,setTemplateBusy] = useState(false);
  const [marksAvailable, setMarksAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError("");
      const current = bratislavaToday();
      setToday(current);
      let starting = facebookPlanWeekStart();
      try {
        const markResponse = await fetch("/api/admin/facebook-weekly-plan", {
          signal: controller.signal, cache: "no-store", credentials: "same-origin",
        });
        const markData = await markResponse.json() as PlanResponse;
        if (markResponse.ok && markData.weekStart && Array.isArray(markData.marks)) {
          starting = markData.weekStart;
          if (controller.signal.aborted) return;
          setMarks(new Set(markData.marks.map((item) => markId(item.slot_date, item.slot_key))));
          setSlotMarks(new Set((markData.slotMarks||[]).map(item=>markId(item.slot_date,item.slot_id))));
          if(markData.template) setTemplate(markData.template);
          setMarksAvailable(true);
        } else {
          if (controller.signal.aborted) return;
          setMarksAvailable(false);
          setError(markData.error || "Ručné označenia nie sú dostupné.");
        }
      } catch {
        if (controller.signal.aborted) return;
        setMarksAvailable(false);
        setError("Ručné označenia sa nepodarilo načítať.");
      }
      if (controller.signal.aborted) return;
      setWeekStart(starting);
      const months = Array.from(new Set(
        Array.from({ length: 14 }, (_, index) => facebookPlanAddDays(starting, index).slice(0, 7)),
      ));
      try {
        const monthPosts = await Promise.all(months.map(async (month) => {
          const response = await fetch("/api/admin/facebook-images?month=" + month +
            "&status=all&source=all&page=1", {
            signal: controller.signal, cache: "no-store", credentials: "same-origin",
          });
          const data = await response.json() as PostsResponse;
          if (!response.ok || !Array.isArray(data.calendar)) {
            throw new Error(data.error || "Príspevky sa nepodarilo načítať.");
          }
          return data.calendar;
        }));
        if (controller.signal.aborted) return;
        // Month queries include an eight-day overlap; deduplicate by canonical ID.
        const unique = new Map<string, FacebookImagePost>();
        monthPosts.flat().forEach((post) => {
          if (!post.deletedAt && post.scheduledAt) unique.set(post.id, post);
        });
        setPosts(Array.from(unique.values()));
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError((currentError) => [currentError,
          reason instanceof Error ? reason.message : "Príspevky sa nepodarilo načítať."
        ].filter(Boolean).join(" "));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [refresh]);

  async function toggle(date: string, slot: FacebookWeeklySlot) {
    if (!marksAvailable || saving || loading || date < today || editPlan) return;
    const custom = template.custom;
    const id = markId(date, custom ? slot.id : slot.key);
    const planned = !(custom ? slotMarks : marks).has(id);
    setSaving(id);
    setError("");
    try {
      const response = await fetch("/api/admin/facebook-weekly-plan", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({date, ...(custom?{slotId:slot.id}:{slotKey:slot.key}),planned}),
      });
      const result = await response.json() as {error?:string};
      if (!response.ok) throw new Error(result.error || "Označenie sa neuložilo.");
      const setter=custom?setSlotMarks:setMarks;
      setter(previous=>{
        const next=new Set(previous);
        if(planned)next.add(id);else next.delete(id);
        return next;
      });
    } catch(reason) {
      setError(reason instanceof Error?reason.message:"Označenie sa neuložilo.");
    } finally {setSaving(null);}
  }

  function beginTemplateEdit() {
    setDraft(template.slots.map(slot=>({...slot})));
    setEditVersion(template.version);
    setEditDay(week===0?selectedDay:0);
    setEditPlan(true);
    setError("");
  }
  function leaveTemplateEdit() {
    if(templateBusy)return;
    if(JSON.stringify(draft)!==JSON.stringify(template.slots) &&
      !window.confirm("Zahodiť neuložené zmeny týždenného plánu?"))return;
    setEditPlan(false);
    setError("");
  }
  function updateSlot(id:string,patch:Partial<FacebookWeeklySlot>) {
    setDraft(previous=>previous.map(slot=>slot.id===id?{...slot,...patch}:slot));
  }
  function addSlot(day:number) {
    const previous=draft.filter(slot=>slot.day===day);
    const taken=new Set(previous.map(slot=>slot.time));
    let time="09:00";
    for(let m=8*60;m<=22*60;m+=30) {
      const candidate=String(Math.floor(m/60)).padStart(2,"0")+":"+
        String(m%60).padStart(2,"0");
      if(!taken.has(candidate)){time=candidate;break;}
    }
    setDraft(old=>[...old,{id:crypto.randomUUID(),day,time,key:"service",topic:"Psie salóny"}]);
  }
  function removeSlot(id:string) {setDraft(old=>old.filter(slot=>slot.id!==id));}
  async function saveTemplate() {
    if(templateBusy||!template.available)return;
    setTemplateBusy(true);setError("");
    try {
      const slots=validateFacebookWeeklyTemplate(draft);
      const response=await fetch("/api/admin/facebook-weekly-plan",{
        method:"PUT",credentials:"same-origin",cache:"no-store",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({slots,expectedVersion:editVersion}),
      });
      const result=await response.json() as {template?:TemplateState;error?:string};
      if(!response.ok||!result.template)throw new Error(result.error||"Plán sa neuložil.");
      setTemplate(result.template);
      setDraft(slots);
      setEditPlan(false);
      // Old per-category marks remain intact; new per-slot marks start separately.
      setSlotMarks(new Set());
    } catch(reason) {
      setError(reason instanceof Error?reason.message:"Plán sa neuložil.");
    } finally {setTemplateBusy(false);}
  }

  const start = facebookPlanAddDays(weekStart, week * 7);
  const dates = Array.from({ length: 7 }, (_, index) => facebookPlanAddDays(start, index));
  const visible = posts.filter((post) => {
    if (!post.scheduledAt) return false;
    const date = facebookWallTime(post.scheduledAt).date;
    return date >= start && date <= dates[6];
  });
  const marked = dates.reduce((sum,date) =>
    sum+template.slots.filter(slot=>slot.day===dayIndex(date) &&
      (template.custom?slotMarks:marks).has(markId(date,template.custom?slot.id:slot.key))).length,0);
  const plannedTotal=dates.reduce((sum,date)=>
    sum+template.slots.filter(slot=>slot.day===dayIndex(date)).length,0);
  const published = visible.filter((post) => post.status === "published").length;
  const scheduled = visible.filter((post) => post.status === "scheduled").length;

  function postButton(post: FacebookImagePost) {
    const state = postState(post);
    return (
      <button key={post.id} type="button" onClick={() => onEdit(post)}
        className={styles.post} data-status={state.code}
        aria-label={"Otvoriť príspevok " + post.title + " – " + state.label}>
        {post.imageUrl ? <img src={post.imageUrl} alt="" width={32} height={32} loading="lazy" /> :
          <span className={styles.fallback} aria-hidden="true">FB</span>}
        <span className={styles.postText}>
          <strong title={post.title}>{post.articleId ? "Článok · " : ""}{post.title}</strong>
          <small>{state.label}</small>
        </span>
      </button>
    );
  }

  return (
    <div className={styles.planner} aria-busy={loading}>
      <div className={styles.navigation}>
        <div className={styles.weekButtons} aria-label="Výber týždňa">
          <button type="button" aria-pressed={week === 0} onClick={() => {
            setWeek(0); setSelectedDay(dayIndex(today));
          }}>Tento týždeň</button>
          <button type="button" aria-pressed={week === 1} onClick={() => {
            setWeek(1); setSelectedDay(0);
          }}>Budúci týždeň</button>
        </div>
        <p className={styles.summary}>
          <strong>{shortDate(start)} – {shortDate(dates[6])}</strong>
          <span>{published} publikované · {scheduled} naplánované · {marked}/{plannedTotal} ručne označených</span>
        </p>
      </div>
      <div className={styles.templateToolbar}>
        {editPlan ?
          <><strong>Vlastný týždenný rozpis</strong>
            <button type="button" onClick={leaveTemplateEdit} disabled={templateBusy}>Zrušiť</button>
            <button type="button" className={styles.saveTemplate} onClick={()=>void saveTemplate()}
              disabled={templateBusy||!template.available}>
              {templateBusy?"Ukladám…":"Uložiť celý týždeň"}
            </button></> :
          <><span>{template.custom?"Vlastný plán":"Pôvodný plán"} · zmeny platia pre ďalšie týždne</span>
            <button type="button" onClick={beginTemplateEdit}
              disabled={loading||!template.available||!!saving}>Upraviť týždenný plán</button></>}
      </div>
      {!template.available&&<p className={styles.helper} role="status">
        Úpravy rozpisu budú dostupné po samostatnej migrácii D1 0166. Doterajší plán funguje ďalej.
      </p>}
      {editPlan&&<section className={styles.templateEditor} aria-label="Editor týždenného rozpisu">
        <p>Každý deň môže mať 0 až 20 príspevkov. Čas, kategóriu aj konkrétnu tému si určuješ sám.
          Zmena šablóny nemení už uložené ani publikované Facebook príspevky.</p>
        <div className={styles.editorDays} role="group" aria-label="Vyber deň na úpravu">
          {FACEBOOK_PLAN_WEEKDAYS.map((name,index)=>
            <button key={name} type="button" aria-pressed={editDay===index}
              onClick={()=>setEditDay(index)}>{name.slice(0,2)}
              <small>{draft.filter(slot=>slot.day===index).length}</small></button>)}
        </div>
        <div className={styles.editorRows}>
          {draft.filter(slot=>slot.day===editDay)
            .sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id))
            .map(slot=><div key={slot.id} className={styles.editorRow}>
              <label>Čas
                <input type="time" value={slot.time}
                  onChange={e=>updateSlot(slot.id,{time:e.target.value})}/>
              </label>
              <label>Typ príspevku
                <select value={slot.key}
                  onChange={e=>updateSlot(slot.id,{key:e.target.value as FacebookPlanKey,topic:""})}>
                  {FACEBOOK_PLAN_KEYS.map(key=>
                    <option key={key} value={key}>{facebookWeeklySlotLabel({ ...slot,key,topic:"" })}</option>)}
                </select>
              </label>
              <label>Konkrétna téma / kategória
                <input type="text" list={"fb-topics-"+slot.id} value={slot.topic}
                  maxLength={80} placeholder="Napr. Psie salóny alebo Výcvik"
                  onChange={e=>updateSlot(slot.id,{topic:e.target.value})}/>
                <datalist id={"fb-topics-"+slot.id}>
                  {FACEBOOK_WEEKLY_TOPICS[slot.key].map(topic=>
                    <option key={topic} value={topic}/>)}
                </datalist>
              </label>
              <button type="button" className={styles.deleteSlot} title="Odstrániť čas"
                aria-label={"Odstrániť "+slot.time+" "+facebookWeeklySlotLabel(slot)}
                onClick={()=>removeSlot(slot.id)}>Odstrániť</button>
            </div>)}
          {!draft.some(slot=>slot.day===editDay)&&
            <p>V tento deň zatiaľ nemáš žiadne príspevky.</p>}
        </div>
        <button className={styles.addSlot} type="button"
          disabled={draft.filter(slot=>slot.day===editDay).length>=20}
          onClick={()=>addSlot(editDay)}>+ Pridať príspevok v tento deň</button>
      </section>}
      {error && <p className={styles.error} role="alert">{error}</p>}
      {loading && <p className={styles.helper} role="status">Načítavam kalendár a skutočné príspevky…</p>}
      <nav className={styles.dayButtons} aria-label="Vyber deň">
        {FACEBOOK_PLAN_WEEKDAYS.map((name, index) =>
          <button type="button" key={name} aria-pressed={selectedDay === index}
            onClick={() => setSelectedDay(index)}>
            {name.slice(0, 2)} {dates[index].slice(8)}
          </button>)}
      </nav>
      <div className={styles.grid}>
        {dates.map((date, index) => {
          const past = date < today;
          const dayPosts = visible.filter((post) =>
            post.scheduledAt && facebookWallTime(post.scheduledAt).date === date);
          const slots = (template.custom?template.slots.filter(slot=>slot.day===index):
            facebookPlanSlotsForDay(index,date).map(slot=>({
              id:"base-"+index+"-"+slot.key,day:index,time:slot.time,key:slot.key,
              topic:slot.key==="article"?slot.label.replace(/^Článok · /,""):"",
            }))).sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
          const templateTimes = new Set(slots.map((slot) => slot.time));
          const extra = dayPosts.filter((post) =>
            post.scheduledAt && !templateTimes.has(facebookWallTime(post.scheduledAt).time));
          return (
            <section key={date} className={[styles.day, past ? styles.dayPast : ""].join(" ")}
              data-selected={selectedDay === index ? "true" : "false"}
              aria-label={FACEBOOK_PLAN_WEEKDAYS[index] + " " + shortDate(date)}>
              <div className={styles.dayTitle}>
                <strong>{FACEBOOK_PLAN_WEEKDAYS[index]}</strong>
                <time dateTime={date}>{shortDate(date)}</time>
              </div>
              <div className={styles.slots}>
                {slots.map((slot) => {
                  const id = markId(date,template.custom?slot.id:slot.key);
                  const checked = (template.custom?slotMarks:marks).has(id);
                  const matched = dayPosts.filter((post) =>
                    post.scheduledAt && facebookWallTime(post.scheduledAt).time === slot.time);
                  return (
                    <div key={slot.id} className={styles.slot} data-marked={checked ? "true" : "false"}>
                      <div className={styles.slotTop}>
                        <time>{slot.time}</time>
                        <button type="button" className={styles.mark}
                          aria-label={(checked ? "Zrušiť ručné označenie: " : "Ručne označiť v pláne: ") + facebookWeeklySlotLabel(slot)}
                          aria-pressed={checked} title="Iba redakčné označenie; nepublikuje príspevok"
                          disabled={!marksAvailable || !!saving || loading || past || editPlan}
                          onClick={() => void toggle(date, slot)}>
                          {checked ? "✓" : "○"}
                        </button>
                      </div>
                      <span className={styles.slotLabel}>{facebookWeeklySlotLabel(slot)}</span>
                      {matched.map(postButton)}
                      {!past && <button className={styles.add} type="button"
                        onClick={() => onCreate(date, slot.time)}>+ Nový príspevok</button>}
                    </div>
                  );
                })}
              </div>
              {extra.length > 0 && <div className={styles.extra}>
                <strong>Ďalšie časy</strong>
                {extra.map((post) => <div key={post.id} className={styles.extraPost}>
                  <time>{facebookWallTime(post.scheduledAt!).time}</time>
                  {postButton(post)}
                </div>)}
              </div>}
            </section>
          );
        })}
      </div>
      <p className={styles.footer}>
        Náhľady a stavy pochádzajú zo skutočných príspevkov. Značka ✓ je iba tvoja
        ručná redakčná evidencia – nič neplánuje, neschvaľuje ani neodosiela na Facebook.
        Koncepty bez termínu zostávajú v zozname nižšie.
      </p>
    </div>
  );
}
