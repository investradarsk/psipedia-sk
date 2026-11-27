import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseHealthData, healthMonthDays, moveHealthMonth, validHealthDate, removeHealthDog} from "../lib/dog-health-calendar.ts";
import {buildDateCalendar, foldCalendarLine} from "../lib/date-calendar-export.ts";
test("calendar dates validate leap days and Monday grid",()=>{
 assert.equal(validHealthDate("2028-02-29"),true);assert.equal(validHealthDate("2027-02-29"),false);
 assert.equal(healthMonthDays("2026-02").filter(Boolean).length,28);
 assert.equal(healthMonthDays("2026-02")[6],"2026-02-01");
 assert.equal(moveHealthMonth("2026-12",1),"2027-01");
});
test("local data ignores invalid, duplicate and orphaned records",()=>{
 const raw=JSON.stringify({dogs:[{id:"a",name:"Neo"},{id:"a",name:"duplicate"}],entries:[{id:"x",dogId:"a",type:"weight",date:"2026-11-27",weight:30},{id:"bad",dogId:"b",type:"vet",date:"2026-12-01"},{id:"y",dogId:"a",type:"weight",date:"2026-11-27",weight:-1}]});
 const data=parseHealthData(raw);assert.equal(data.dogs.length,1);assert.equal(data.entries.length,1);assert.equal(data.entries[0].done,true);
 assert.deepEqual(removeHealthDog(data,"a"),{dogs:[],entries:[]});assert.deepEqual(parseHealthData("{"),{dogs:[],entries:[]});
});
test("ICS export date-only, exclusive end, escaped strings and UTF8 folding",()=>{
 const value=buildDateCalendar([{uid:"test",date:"2026-12-31",summary:"Očkovanie, Neo;\n test",reminder:true}],new Date("2026-11-27T12:34:56Z"));
 assert.match(value,/DTSTAMP:20261127T123456Z\r\n/);
 assert.match(value,/DTSTART;VALUE=DATE:20261231\r\nDTEND;VALUE=DATE:20270101/);
 assert.ok(value.includes("SUMMARY:Očkovanie\\, Neo\\;\\n test"));
 assert.match(value,/TRIGGER:-P1D/);
 assert.ok(foldCalendarLine("SUMMARY:"+"ž".repeat(100)).split("\r\n").every(s=>Buffer.byteLength(s)<=75));
});
test("tool is a managed public topic, does not send records to a server",()=>{
 const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
 assert.match(read("lib/portal.ts"),/slug: "zdravotny-kalendar"/);
 assert.match(read("app/[section]/[slug]/page.tsx"),/<DogHealthCalendarPage/);
 assert.match(read("components/dog-health-calendar.tsx"),/localStorage.setItem/);
 assert.doesNotMatch(read("components/dog-health-calendar.tsx"),/fetch\(/);
});
