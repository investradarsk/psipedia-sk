"use client";

import { EventListingResults } from './event-listing-results';
import { DesktopEventFullCalendar } from "./desktop-event-fullcalendar";
import { PublicMediaFallback } from "@/components/public-visual-system/public-media-fallback";
import { eventListingParams, parseEventListing, type EventListingFilters } from '@/lib/event-listing';
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type MouseEvent } from "react";
import { eventTypePresentation } from "@/lib/event-type-presentation";
import {
  calendarMonthDays,
  calendarDaySummary,
  calendarMonthLabel,
  calendarWeekdays,
  eventsForCalendarDay,
  moveCalendarMonth,
  resolveCalendarMonth,
} from "@/lib/event-calendar-view";
import {
  eventHref,
  eventTimeFilterParam,
  eventTimeFilterFromParam,
  eventMonthFilterFromParam,
  eventTypeFromPortalSlug,
  eventTypePortalHref,
  eventTypes,
  formatEventDate,
  type PublicEventDayPreview,
  type PublicEventCard,
  type EventTimeFilter,
  type EventType,
  type SlovakRegion,
} from "@/lib/events";
import { publicLocationValue } from "@/lib/public-location";
import styles from "./events-public.module.css";

function dateLabel(day: string) {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(day + "T12:00:00Z"));
}

export function EventCalendar({
  events,
  filters,
  listing,
  calendarEvents = [],
  calendarSummaries,
  today,
  initialType = "Všetky",
  initialTime = "upcoming",
  initialQuery = "",
  initialRegion = "",
  initialMonth = "",
  initialCalendarMonth = "",
  initialDay = "",
  afterCalendar,
}: {
  events: PublicEventCard[];
  filters?: EventListingFilters;
  listing?: {total:number;page:number;pages:number};
  calendarEvents?: PublicEventDayPreview[];
  calendarSummaries?: {date:string;count:number;types:EventType[]}[];
  today: string;
  initialType?: EventType | "Všetky";
  initialTime?: EventTimeFilter;
  initialQuery?: string;
  initialRegion?: "" | SlovakRegion;
  initialMonth?: string;
  initialCalendarMonth?: string;
  initialDay?: string;
  afterCalendar?: ReactNode;
}) {
  const initialFilters = filters ?? parseEventListing({q:initialQuery,region:initialRegion,mesiac:initialMonth,termin:eventTimeFilterParam(initialTime)},initialType);
  type View = { month: string; day: string; filterMonth: string; time: EventTimeFilter; type: EventType | "Všetky" };
  type CalendarData = {
    events: PublicEventCard[];
    listing: {total:number;page:number;pages:number};
    calendarEvents: PublicEventDayPreview[];
    calendarSummaries?: {date:string;count:number;types:EventType[]}[];
  };
  const [view,setView] = useState<View>(()=>({
    month:resolveCalendarMonth(initialCalendarMonth,initialMonth,today),
    day:initialDay,filterMonth:initialMonth,time:initialTime,type:initialType,
  }));
  const [data,setData] = useState<CalendarData>(()=>({
    events,listing:listing ?? {total:events.length,page:1,pages:1},calendarEvents,calendarSummaries,
  }));
  const [pending,setPending] = useState(false);
  const [loadError,setLoadError] = useState("");
  const requestRef = useRef<AbortController|null>(null);
  const cacheRef = useRef(new Map<string,CalendarData>());
  const f = {...initialFilters,month:view.filterMonth,time:view.time,type:view.type};
  const query = initialQuery.trim().slice(0,120);
  const region = initialRegion;
  const month = view.filterMonth;
  const visibleMonth = view.month;
  const todayMonth = today.slice(0,7);
  const days = calendarMonthDays(visibleMonth);
  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(view.day)
    && days.some(item=>item.inMonth && item.date===view.day) ? view.day : "";
  const typePathname = view.type === "Všetky" ? "/podujatia" : eventTypePortalHref(view.type) ?? "/podujatia";
  const filtered = pending ? [] : data.events;
  const daySummaries = pending
    ? new Map<string,{date:string;count:number;types:EventType[]}>()
    : data.calendarSummaries
      ? new Map(data.calendarSummaries.map(item=>[item.date,item]))
      : new Map(days.filter(day=>day.inMonth).map(day=>[day.date,calendarDaySummary(data.calendarEvents,day.date)]));
  const dailyEvents = selectedDay && !pending ? eventsForCalendarDay(data.calendarEvents,selectedDay) : [];

  async function navigate(href:string,next:View,addHistory=true) {
    requestRef.current?.abort();
    const controller=new AbortController();
    requestRef.current=controller;
    if (addHistory) window.history.pushState(window.history.state,"",href);
    setView(next); // Immediate visual response; only bounded data is loaded.
    setPending(true);
    setLoadError("");
    const target=new URL(href,window.location.origin);
    const endpoint=new URL("/api/public/events/calendar",window.location.origin);
    target.searchParams.forEach((value,key)=>endpoint.searchParams.set(key,value));
    if (next.type!=="Všetky") endpoint.searchParams.set("typ",next.type);
    const key=endpoint.pathname+endpoint.search;
    const cached=cacheRef.current.get(key);
    if (cached) {
      setData(cached);
      setPending(false);
      return;
    }
    try {
      const response=await fetch(endpoint.toString(),{signal:controller.signal,headers:{Accept:"application/json"}});
      if (!response.ok) throw new Error("Calendar request failed");
      const payload=await response.json() as CalendarData;
      if (!Array.isArray(payload.events)||!Array.isArray(payload.calendarEvents)
        ||!Array.isArray(payload.calendarSummaries)||!payload.listing) throw new Error("Calendar response invalid");
      if (!controller.signal.aborted) {
        cacheRef.current.set(key,payload);
        // A bounded, short-lived cache uses an expiry timer rather than rendering-time
        // clock reads, and never removes a newer response for the same key.
        window.setTimeout(() => {
          if (cacheRef.current.get(key) === payload) cacheRef.current.delete(key);
        }, 60_000);
        if (cacheRef.current.size>16) cacheRef.current.delete(cacheRef.current.keys().next().value!);
        setData(payload);
      }
    } catch {
      if (!controller.signal.aborted) setLoadError("Podujatia sa nepodarilo načítať. Skúste to znova.");
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }
  function clickNavigate(event:MouseEvent<HTMLAnchorElement>,href:string,next:View) {
    if (event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey) return;
    event.preventDefault();
    void navigate(href,next);
  }
  useEffect(()=>{
    function restore() {
      const url=new URL(window.location.href);
      if (!url.pathname.startsWith("/podujatia")) return;
      const fromUrlMonth=eventMonthFilterFromParam(url.searchParams.get("mesiac")??"");
      const visible=resolveCalendarMonth(eventMonthFilterFromParam(url.searchParams.get("kalendar")??""),fromUrlMonth,today);
      const slug=url.pathname.split("/").filter(Boolean)[1];
      const type=slug ? eventTypeFromPortalSlug(slug)??"Všetky" : "Všetky";
      void navigate(url.pathname+url.search,{
        month:visible,day:url.searchParams.get("den")??"",filterMonth:fromUrlMonth,
        time:eventTimeFilterFromParam(url.searchParams.get("termin")??""),type,
      },false);
    }
    window.addEventListener("popstate",restore);
    return ()=>{window.removeEventListener("popstate",restore);requestRef.current?.abort();};
  },[]);


  function calendarHref(targetMonth: string, day = "") {
    const params = eventListingParams(f);
    if (query) params.set("q", query);
    if (region) params.set("region", region);
    // A month filter must not silently suppress every day after navigating to a different month.
    if (month && targetMonth !== month) params.delete("mesiac");
    const timeParam = eventTimeFilterParam(view.time);
    if (timeParam) params.set("termin", timeParam);
    if (targetMonth !== (month || todayMonth)) params.set("kalendar", targetMonth);
    if (day) params.set("den", day);
    const serialized = params.toString();
    return serialized ? typePathname + "?" + serialized : typePathname;
  }


  function timeHref(value: EventTimeFilter) {
    const params = eventListingParams(f);
    if (query) params.set("q", query);
    if (region) params.set("region", region);
    if (month) params.set("mesiac", month);
    if (visibleMonth !== (month || todayMonth)) params.set("kalendar", visibleMonth);
    if (selectedDay) params.set("den", selectedDay);
    params.delete("termin");
    const timeParam = eventTimeFilterParam(value);
    if (timeParam) params.set("termin", timeParam);
    const serialized = params.toString();
    return serialized ? typePathname + "?" + serialized : typePathname;
  }

  useEffect(()=>{
    if (pending || !selectedDay || loadError) return;
    const target=document.getElementById("vybrany-den");
    if (!target) return;
    const motion=window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const id=window.requestAnimationFrame(()=>target.scrollIntoView({behavior:motion,block:"start"}));
    return ()=>window.cancelAnimationFrame(id);
  },[selectedDay,pending,loadError]);

  const windowSafeQuery = (state:View)=> {
    const params=eventListingParams({...initialFilters,time:state.time,month:state.filterMonth,type:state.type});
    if (state.month!==(state.filterMonth||todayMonth)) params.set("kalendar",state.month);
    if (state.day) params.set("den",state.day);
    return params.size?"?"+params.toString():"";
  };
  const upcomingTitle = view.time === "past" ? "Ukončené podujatia" : view.time === "current"
    ? "Prebiehajúce podujatia" : view.time === "all" ? "Zoznam podujatí" : "Nadchádzajúce podujatia";

  return (
    <div className={styles.calendar} data-public-calendar aria-busy={pending}>
      <div className={styles.resultBar}>
        <div className={styles.timeBar} role="group" aria-label="Obdobie podujatia">
          {([
            ["upcoming", "Najbližšie"],
            ["current", "Prebiehajúce"],
            ["past", "Ukončené"],
            ["all", "Všetky"],
          ] as const).map(([value, label]) => (
            <Link
              href={timeHref(value)}
              onClick={(event)=>clickNavigate(event,timeHref(value),{...view,time:value})}
              className={view.time === value ? styles.activeTimeChip : styles.timeChip}
              aria-current={view.time === value ? "page" : undefined}
              key={value}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className={styles.calendarLayout} data-events-calendar-layout>
      <section className={styles.monthCalendar} id="events-calendar" data-events-month-calendar aria-labelledby="events-calendar-title">
        <div className={styles.monthHeading}>
          <div>
            <p className={styles.monthEyebrow}>Vyberte si deň</p>
            <h2 id="events-calendar-title">{calendarMonthLabel(visibleMonth)}</h2>
          </div>
          <nav className={styles.monthNavigation} aria-label="Navigácia kalendára">
            <Link href={calendarHref(moveCalendarMonth(visibleMonth, -1))}
              onClick={(event)=>{const target=moveCalendarMonth(visibleMonth,-1);clickNavigate(event,calendarHref(target),{...view,month:target,day:"",filterMonth:month&&target!==month?"":month});}}
              aria-label="Predchádzajúci mesiac" rel="prev">←</Link>
            <Link href={calendarHref(todayMonth)}
              onClick={(event)=>clickNavigate(event,calendarHref(todayMonth),{...view,month:todayMonth,day:"",filterMonth:month&&todayMonth!==month?"":month})}
              aria-label="Prejsť na aktuálny mesiac">Dnes</Link>
            <Link href={calendarHref(moveCalendarMonth(visibleMonth, 1))}
              onClick={(event)=>{const target=moveCalendarMonth(visibleMonth,1);clickNavigate(event,calendarHref(target),{...view,month:target,day:"",filterMonth:month&&target!==month?"":month});}}
              aria-label="Nasledujúci mesiac" rel="next">→</Link>
          </nav>
        </div>

        <DesktopEventFullCalendar
          month={visibleMonth}
          today={today}
          selectedDay={selectedDay}
          summaries={Array.from(daySummaries.values())}
          hrefForDay={date=>calendarHref(visibleMonth,date)}
          onDayLinkClick={(event,date)=>clickNavigate(event,calendarHref(visibleMonth,date)+"#vybrany-den",{...view,day:date})}
        />
        <div className={styles.monthGrid} role="group" aria-label={"Dni kalendára " + calendarMonthLabel(visibleMonth)}>
          {calendarWeekdays.map((name) => <span className={styles.weekday} key={name}>{name}</span>)}
          {days.map((day) => {
            const { count = 0, types = [] } = daySummaries.get(day.date) ?? {};
            const dayName = dateLabel(day.date);
            const active = selectedDay === day.date;
            const todayFlag = day.date === today;
            if (!day.inMonth) return <span className={styles.outsideDay} aria-hidden="true" key={day.date} />;
            return (
              <Link
                key={day.date}
                href={calendarHref(visibleMonth, day.date) + "#vybrany-den"}
                onClick={(event)=>clickNavigate(event,calendarHref(visibleMonth,day.date)+"#vybrany-den",{...view,day:day.date})}
                className={styles.monthDay}
                data-calendar-date={day.date}
                data-selected={active ? "true" : undefined}
                data-today={todayFlag ? "true" : undefined}
                data-count={count}
                aria-current={todayFlag ? "date" : undefined}
                aria-label={(active ? "Vybraný deň " : "") + dayName + (count ? ", " + count + " podujatí, " + types.map((type) => eventTypePresentation[type].label).join(", ") : ", bez podujatí")}
              >
                <span className={styles.dayHeading}>
                <span className={styles.monthDayNumber}>{day.day}</span>
                {count > 0 ? <span className={styles.monthDayCount} aria-hidden="true">{count}</span> : null}
                </span>
                {types.length ? (
                  <span className={styles.dayIndicators} aria-hidden="true">
                    {types.slice(0, 4).map((type) => <span key={type} className={styles.typeDot} data-event-type={type} style={{ "--event-type-color": eventTypePresentation[type].color } as CSSProperties} />)}
                    {types.length > 4 ? <span className={styles.moreTypes}>+{types.length - 4}</span> : null}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {selectedDay ? (
          <section className={styles.dayDetail} id="vybrany-den" tabIndex={-1} aria-labelledby="selected-day-title" data-selected-day={selectedDay}>
            <div className={styles.dayDetailHeading}>
              <div><p className={styles.selectedDayEyebrow}>Vybraný dátum</p><h3 id="selected-day-title">{dateLabel(selectedDay)}</h3></div>
              <Link href={calendarHref(visibleMonth)} onClick={(event)=>clickNavigate(event,calendarHref(visibleMonth),{...view,day:""})} aria-label="Zrušiť výber dňa">Zavrieť výber</Link>
            </div>
            {!pending && (daySummaries.get(selectedDay)?.count ?? 0) > dailyEvents.length ? <p>Zobrazených prvých {dailyEvents.length} z {daySummaries.get(selectedDay)?.count} podujatí. <Link href={typePathname + '?' + (()=>{const p=eventListingParams({...f,from:selectedDay,to:selectedDay,page:1}); return p.toString();})() + '#events-list'}>Zobraziť všetky podujatia tohto dňa</Link></p>:null}
            {pending ? <p role="status" className={styles.dayEmpty}>Načítavajú sa podujatia pre vybraný deň…</p> : loadError ? <p role="alert" className={styles.dayEmpty}>{loadError}</p> : dailyEvents.length ? (
              <ul className={styles.dayEvents}>
                {dailyEvents.map((event) => (
                  <li key={event.id} className={styles.dayEvent}>
                    <Link className={styles.dayEventMedia} href={eventHref(event)} aria-label={"Otvoriť podujatie: "+event.title}>
                      {event.imageUrl ? <img src={event.imageUrl} alt="" loading="lazy" decoding="async" /> : <PublicMediaFallback decorative />}
                    </Link>
                    <div>
                      <span className={styles.dayEventType}>{eventTypePresentation[event.eventType].label}</span>
                      <Link href={eventHref(event)}>{event.title}</Link>
                      <span>{formatEventDate(event)}{event.startTime ? " · " + event.startTime : ""}</span>
                      <span>{[event.venue, publicLocationValue(event.city, "city")].filter(Boolean).join(" · ") || (/\bwebin[aá]r\b/iu.test(event.title) ? "Webinár" : "Miesto nie je uvedené")}</span>
                      {event.cancelled ? <strong>Zrušené</strong> : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.dayEmpty}>V tento deň nie sú podujatia, ktoré zodpovedajú zvoleným filtrom. Skúste iný deň alebo upravte filtre.</p>
            )}
          </section>
        ) : (
          <p className={styles.monthHint}>{pending ? "Načítavajú sa podujatia…" : daySummaries.size === 0 ? "V tomto mesiaci nie sú podujatia zodpovedajúce aktuálnym filtrom. Zmeňte mesiac alebo upravte vyhľadávanie." : "Vyberte deň a zobrazia sa podujatia s odkazmi na ich detail."}</p>
        )}
        <nav className={styles.calendarLegend} aria-label="Kategórie podujatí" data-events-legend>
        {eventTypes.map((type) => {
          const presentation = eventTypePresentation[type];
          const href = eventTypePortalHref(type);
          if (!href) return null;
          return <Link key={type} href={href + timeHref(view.time).slice(typePathname.length)}
            onClick={(event)=>{const target=href + timeHref(view.time).slice(typePathname.length);clickNavigate(event,target,{...view,type});}}
            aria-current={view.type === type ? "page" : undefined}>
            <span className={styles.typeDot} aria-hidden="true" data-event-type={type} style={{ "--event-type-color": presentation.color } as CSSProperties} />
            {presentation.label}
          </Link>;
        })}
        </nav>
      </section>
      </div>
      {afterCalendar}
      {pending ? <p role="status" className={styles.monthHint}>Načítavajú sa podujatia…</p> : null}
      {loadError ? <p role="alert" className={styles.monthHint}>{loadError} <a href={typePathname+windowSafeQuery(view)}>Načítať stránku</a></p> : null}

      {!pending && !loadError && <EventListingResults events={filtered} filters={f} listing={data.listing} today={today} pathname={typePathname} title={upcomingTitle} calendarMonth={visibleMonth} day={selectedDay}/>}

    </div>
  );
}
