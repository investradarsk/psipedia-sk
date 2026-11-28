import { getEventSubscriptionRows } from "@/lib/event-store";
import { bratislavaDateKey } from "@/lib/events";
import { parseEventSubscription, eventSubscriptionCalendar } from "@/lib/event-subscription";
import { retryTransientPublicRead } from "@/lib/public-read-retry";
import { getManagedPortalSection } from "@/lib/section-store";

export const dynamic = "force-dynamic";
export async function GET(request:Request){
  const filters=parseEventSubscription(new URL(request.url).searchParams);
  const noStore={"Cache-Control":"no-store","X-Robots-Tag":"noindex"};
  if(!filters)return new Response("Neplatný filter podujatí.",{status:400,headers:noStore});
  try{
    const section=await getManagedPortalSection("podujatia");
    if(!section?.visible)return new Response("Kalendár nie je dostupný.",{status:404,headers:noStore});
    const today=bratislavaDateKey();
    const rows=await retryTransientPublicRead(()=>getEventSubscriptionRows(filters,today),{signal:request.signal,stage:"events_calendar"});
    const body=eventSubscriptionCalendar(rows,filters,today);
    const bytes=new TextEncoder().encode(body);
    const hash=await crypto.subtle.digest("SHA-256",bytes);
    const etag='"'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,"0")).join("")+'"';
    const headers={"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":'inline; filename="psipedia-podujatia.ics"',"Cache-Control":"public, max-age=900, s-maxage=900","ETag":etag,"X-Robots-Tag":"noindex","X-Content-Type-Options":"nosniff"};
    if(request.headers.get("If-None-Match")?.split(",").some(tag=>tag.trim().replace(/^W\//,"")===etag||tag.trim()==="*"))return new Response(null,{status:304,headers});
    return new Response(body,{headers});
  }catch{
    // Do not replace existing subscriptions with an empty feed on a read error.
    return new Response("Kalendár sa dočasne nepodarilo načítať.",{status:503,headers:{...noStore,"Retry-After":"300"}});
  }
}
