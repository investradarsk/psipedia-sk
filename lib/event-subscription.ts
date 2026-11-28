import { eventTypes, slovakRegions, type EventType, type SlovakRegion } from "./events";
import { buildDateCalendar, type CalendarDateEvent } from "./date-calendar-export";

export const EVENT_SUBSCRIPTION_LIMIT = 2000;
export const EVENT_SUBSCRIPTION_PATH = "/api/public/events/subscription";
export const EVENT_SUBSCRIPTION_ORIGIN = "https://psipedia.sk";
export type EventSubscriptionFilters = { type: EventType | "Všetky"; region: SlovakRegion | "" };
export type EventSubscriptionRow = {id:number;slug:string;title:string;event_type:string;start_date:string;start_time:string;end_date:string|null;end_time:string|null;venue:string;city:string;region:string;cancelled:number;updated_at:string};
export function parseEventSubscription(params:URLSearchParams):EventSubscriptionFilters|null {
  for(const key of params.keys()) if(key!=="typ"&&key!=="region") return null;
  if(params.getAll("typ").length>1||params.getAll("region").length>1)return null;
  const type=params.get("typ")??"Všetky",region=params.get("region")??"";
  if(type!=="Všetky"&&!(eventTypes as readonly string[]).includes(type))return null;
  if(region&&!(slovakRegions as readonly string[]).includes(region))return null;
  return {type:type as EventSubscriptionFilters["type"],region:region as EventSubscriptionFilters["region"]};
}
export function eventSubscriptionUrl(filters:EventSubscriptionFilters){
  const url=new URL(EVENT_SUBSCRIPTION_PATH,EVENT_SUBSCRIPTION_ORIGIN);
  if(filters.type!=="Všetky")url.searchParams.set("typ",filters.type);
  if(filters.region)url.searchParams.set("region",filters.region);
  return url.href;
}
export function eventSubscriptionWindow(today:string){
  const day = new Date(today+"T00:00:00Z");
  const from=new Date(day),to=new Date(day);
  from.setUTCDate(from.getUTCDate()-30);to.setUTCDate(to.getUTCDate()+730);
  return {from:from.toISOString().slice(0,10),to:to.toISOString().slice(0,10)};
}
function validDate(date:string){
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date))return false;
  const time=new Date(date+"T00:00:00Z");return Number.isFinite(time.getTime())&&time.toISOString().slice(0,10)===date;
}
function validTime(time:string|null){return !!time&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);}
export function eventSubscriptionCalendar(rows:readonly EventSubscriptionRow[],filters:EventSubscriptionFilters,today:string){
  const events:CalendarDateEvent[]=[];
  const {from,to}=eventSubscriptionWindow(today);
  for(const row of rows){
    if(!Number.isSafeInteger(row.id)||row.id<=0||!validDate(row.start_date)||!row.title.trim()||!row.slug.trim())continue;
    const end=row.end_date&&validDate(row.end_date)&&row.end_date>=row.start_date?row.end_date:row.start_date;
    if(end<from||row.start_date>to)continue;
    if(filters.region&&row.region!==filters.region||filters.type!=="Všetky"&&row.event_type!==filters.type)continue;
    const url=EVENT_SUBSCRIPTION_ORIGIN+"/podujatia/"+encodeURIComponent(row.slug);
    const cancelled=Boolean(row.cancelled);
    const description=[row.event_type,cancelled?"Podujatie je zrušené.":null,validTime(row.start_time)?"Začiatok: "+row.start_time+" (slovenský čas)":null,validTime(row.end_time)?"Koniec: "+row.end_time+" (slovenský čas)":null,"Aktuálne informácie: "+url].filter(Boolean).join("\n");
    events.push({uid:"event-"+row.id,date:row.start_date,endDate:end,summary:(cancelled?"ZRUŠENÉ – ":"")+row.title.trim(),description,location:[row.venue,row.city,row.region].filter(Boolean).join(", "),url,cancelled,updatedAt:row.updated_at});
  }
  // Stable fallback timestamp for legacy rows with no valid modification date.
  return buildDateCalendar(events,new Date("2000-01-01T00:00:00Z"),["Psipedia – podujatia",filters.region||"všetky kraje",filters.type==="Všetky"?"všetky typy":filters.type].join(" · "));
}
