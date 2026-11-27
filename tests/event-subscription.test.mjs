import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseEventSubscription,eventSubscriptionUrl,eventSubscriptionWindow,eventSubscriptionCalendar} from "../lib/event-subscription.ts";
const row={id:42,slug:"test",title:"Výstava, test",event_type:"Výstava",start_date:"2027-01-01",start_time:"09:00",end_date:"2027-01-03",end_time:"16:00",venue:"Areál",city:"Nitra",region:"Nitriansky kraj",cancelled:0,updated_at:"2026-11-27T08:00:00Z"};
const filters={type:"Výstava",region:"Nitriansky kraj"};
test("subscription accepts only known finite filters and canonical encoding",()=>{
 assert.deepEqual(parseEventSubscription(new URLSearchParams("typ=Výstava&region=Nitriansky kraj")),filters);
 for(const value of ["typ=unknown","region=unknown","typ=Výstava&typ=Preteky","q=test"])assert.equal(parseEventSubscription(new URLSearchParams(value)),null);
 assert.equal(new URL(eventSubscriptionUrl(filters)).searchParams.get("typ"),"Výstava");
 assert.equal(eventSubscriptionWindow("2026-11-27").from,"2026-10-28");
});
test("stable event UIDs, multi-day exclusive end, cancellation and no private fields",()=>{
 const body=eventSubscriptionCalendar([row],filters,"2026-11-27");
 assert.match(body,/UID:event-42@psipedia.sk/);
 assert.match(body,/DTSTART;VALUE=DATE:20270101\r\nDTEND;VALUE=DATE:20270104/);
 assert.ok(body.includes("Začiatok: 09:00"));
 assert.match(body,/LAST-MODIFIED:20261127T080000Z/);
 assert.equal(body,eventSubscriptionCalendar([row],filters,"2026-11-28"));
 assert.match(eventSubscriptionCalendar([{...row,cancelled:1}],filters,"2026-11-27"),/STATUS:CANCELLED/);
 assert.doesNotMatch(eventSubscriptionCalendar([{...row,region:"Košický kraj"}],filters,"2026-11-27"),/BEGIN:VEVENT/);
 assert.doesNotMatch(eventSubscriptionCalendar([{...row,start_date:"2027-02-30"}],filters,"2026-11-27"),/BEGIN:VEVENT/);
});
test("feed uses bounded public projection and errors rather than empty feed on outage",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 const store=read("lib/event-store.ts").split("export async function getEventSubscriptionRows")[1].split("/** Complete public count")[0];
 assert.match(store,/status = 'published'/);assert.match(store,/EVENT_SUBSCRIPTION_LIMIT\+1/);assert.doesNotMatch(store,/SELECT \*/);
 assert.doesNotMatch(store,/internal_notes|contact_email|created_by/);
 const route=read("app/api/public/events/subscription/route.ts");assert.match(route,/status:503/);assert.match(route,/status:304/);
 assert.match(read("components/event-calendar.tsx"),/<EventSubscription/);
});
