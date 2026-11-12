import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  defaultFacebookWeeklyTemplate, validateFacebookWeeklyTemplate,
  facebookWeeklySlotLabel, FACEBOOK_WEEKLY_TOPICS,
} from "../lib/facebook-weekly-template.ts";
import {
  readFacebookWeeklyTemplate, saveFacebookWeeklyTemplate,
  listFacebookTemplateMarks, setFacebookTemplateMark, FacebookTemplateConflict,
} from "../lib/facebook-weekly-template-store.ts";

function fakeD1(sqlite) {
  return {
    prepare(query) {
      let args=[];
      return {
        bind(...values) { args=values;return this; },
        async first() { return sqlite.prepare(query).get(...args)??null; },
        async all() { return {results:sqlite.prepare(query).all(...args)}; },
        async run() { return sqlite.prepare(query).run(...args); },
      };
    },
  };
}
function makeDb() {
  const sqlite=new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("drizzle/0157_facebook_weekly_plan_marks.sql","utf8"));
  const store=fakeD1(sqlite);
  return {sqlite,store};
}

test("defaults preserve 56 unique slots and custom plan can add repeated categories",()=>{
  const defaults=defaultFacebookWeeklyTemplate();
  assert.equal(defaults.length,56);
  assert.deepEqual(defaults.map(slot=>slot.day).filter(day=>day===0).length,8);
  assert.ok(FACEBOOK_WEEKLY_TOPICS.service.includes("Psie salóny"));
  assert.ok(FACEBOOK_WEEKLY_TOPICS.article.includes("Zdravie"));
  const monday=defaults.filter(slot=>slot.day===0);
  const custom=[
    ...defaults,
    {id:"extra-salons",day:0,time:"21:00",key:"service",topic:"Psie salóny"},
    {id:"extra-health",day:0,time:"21:30",key:"article",topic:"Zdravie"},
  ];
  const normalized=validateFacebookWeeklyTemplate(custom);
  assert.equal(normalized.filter(slot=>slot.day===0).length,10);
  assert.equal(normalized.filter(slot=>slot.day===0&&slot.key==="service").length,2);
  assert.equal(facebookWeeklySlotLabel(normalized.find(slot=>slot.id==="extra-salons")),
    "Profil · Psie salóny");
  assert.equal(monday.length,8);
});

test("strict slot contract rejects invalid time, same-time duplicates, >20/day and reused IDs",()=>{
  const basic=defaultFacebookWeeklyTemplate();
  assert.throws(()=>validateFacebookWeeklyTemplate([...basic,{...basic[0]}]),/jedinečné ID/);
  assert.throws(()=>validateFacebookWeeklyTemplate([...basic,{...basic[0],id:"same-time"}]),/rovnaký čas/);
  assert.throws(()=>validateFacebookWeeklyTemplate([...basic,{...basic[0],id:"bad",time:"24:30"}]),/Čas/);
  assert.throws(()=>validateFacebookWeeklyTemplate([...basic,{...basic[0],id:"bad",day:7}]),/Neplatný deň/);
  const tooMany=Array.from({length:21},(_,index)=>({
    id:"more-"+index,day:0,time:String(index).padStart(2,"0")+":15",key:"service",topic:"Salóny",
  }));
  assert.throws(()=>validateFacebookWeeklyTemplate(tooMany),/najviac 20/);
  assert.equal(validateFacebookWeeklyTemplate([]).length,0);
});

test("0166 is additive; absent template tables keep 0157 checklist and read-only fallback",async()=>{
  const {sqlite,store}=makeDb();
  sqlite.prepare("INSERT INTO facebook_weekly_plan_marks VALUES (?,?,?,?)")
    .run("2026-11-16","article","2026-11-12","owner");
  const before=await readFacebookWeeklyTemplate(store);
  assert.equal(before.available,false);
  assert.equal(before.slots.length,56);
  sqlite.exec(readFileSync("drizzle/0166_facebook_weekly_template.sql","utf8"));
  const installed=await readFacebookWeeklyTemplate(store);
  assert.equal(installed.available,true);
  assert.equal(installed.custom,false);
  assert.equal(installed.version,0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM facebook_weekly_plan_marks").get().n,1);
  sqlite.close();
});

test("versioned template saves are CAS-safe; manual slot marks are independent of publisher",async()=>{
  const {sqlite,store}=makeDb();
  sqlite.exec(readFileSync("drizzle/0166_facebook_weekly_template.sql","utf8"));
  const slots=[
    {id:"monday-salon",day:0,time:"09:00",key:"service",topic:"Psie salóny"},
    {id:"monday-article",day:0,time:"10:15",key:"article",topic:"Výcvik"},
  ];
  const first=await saveFacebookWeeklyTemplate(slots,0,"owner",store);
  assert.equal(first.version,1);
  await assert.rejects(saveFacebookWeeklyTemplate(slots,0,"other",store),FacebookTemplateConflict);
  const updated=await saveFacebookWeeklyTemplate([...slots,{id:"tuesday",day:1,time:"12:00",key:"video",topic:"Flyball"}],1,"owner",store);
  assert.equal(updated.version,2);
  await assert.rejects(saveFacebookWeeklyTemplate(slots,1,"other",store),FacebookTemplateConflict);
  await setFacebookTemplateMark("2026-11-16","monday-salon",true,"owner",store);
  assert.deepEqual((await listFacebookTemplateMarks("2026-11-16",store)).map(row=>({...row})),
    [{slot_date:"2026-11-16",slot_id:"monday-salon"}]);
  await assert.rejects(setFacebookTemplateMark("2026-11-17","monday-salon",true,"owner",store),/nie je v uloženom/);
  await setFacebookTemplateMark("2026-11-16","monday-salon",false,"owner",store);
  assert.deepEqual(await listFacebookTemplateMarks("2026-11-16",store),[]);
  const saved=await readFacebookWeeklyTemplate(store);
  assert.equal(saved.slots[0].topic,"Psie salóny");
  sqlite.close();
});

test("admin PUT is authenticated, version-checked and does not touch Meta transport",()=>{
  const route=readFileSync("app/api/admin/facebook-weekly-plan/route.ts","utf8");
  const planner=readFileSync("components/admin-facebook-weekly-planner.tsx","utf8");
  const migration=readFileSync("drizzle/0166_facebook_weekly_template.sql","utf8");
  assert.match(route,/export async function PUT\(request: Request\)/);
  assert.match(route,/requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route,/saveFacebookWeeklyTemplate\(values.slots,values.expectedVersion/);
  assert.match(route,/status:409/);
  assert.match(planner,/Upraviť týždenný plán/);
  assert.match(planner,/FACEBOOK_WEEKLY_TOPICS/);
  assert.match(planner,/onCreate\(date, slot.time\)/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS facebook_weekly_template_marks/);
  assert.doesNotMatch(route,/publishPhotoToMeta|publishFacebook|sendToFacebook|notionSync/i);
});
