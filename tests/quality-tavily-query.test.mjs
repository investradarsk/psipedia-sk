import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {buildQualityTavilyQuery,qualityMayResearch,qualityTodayInSlovakia} from "../lib/data-quality-tavily-query.ts";

const row=(fields={})=>({...fields});
const base={kind:"EVENT",label:"Športové skúšky IGP – KK Čaňa",row:row({
  title:"Športové skúšky IGP – KK Čaňa",organizer:"KK Čaňa",
  city:"Čaňa",venue:"Kynologický areál Čaňa",start_date:"2026-11-14",
  event_type:"Preteky",
})};

test("search identity contains recorded organizer, venue, date and dog sport, not generic image alone",()=>{
  const q=buildQualityTavilyQuery({...base,missing:[{key:"imageUrl",group:"image"}]});
  assert.match(q,/Športové skúšky IGP/);
  assert.match(q,/KK Čaňa/);
  assert.match(q,/2026-11-14/);
  assert.match(q,/kynológia psy/);
  assert.match(q,/plagát/);
  assert.ok(q.length<=450);
});
test("all nine manual data types have meaningful search instructions",()=>{
  const cases={
    address:/adresa ulica/,image:/fotografia/,web:/oficiálna webová stránka/,
    phone:/telefón/,email:/e-mail/,social:/Facebook Instagram/,
    registration:/registrácia prihláška/,date:/čas začiatku dátum/,other:/organizátor/,
  };
  for(const [group,expected] of Object.entries(cases)) {
    const query=buildQualityTavilyQuery({...base,missing:[{key:group==="other"?"organizer":group,group}]});
    assert.match(query,expected,"group "+group+" must be represented");
  }
});
test("hourly multi-field query combines field-specific terms without one search per field",()=>{
  const q=buildQualityTavilyQuery({...base,missing:[
    {key:"imageUrl",group:"image"},{key:"publicPhone",group:"phone"},
    {key:"registrationUrl",group:"registration"},
  ]});
  assert.match(q,/plagát/);assert.match(q,/telefón/);assert.match(q,/registrácia/);
  assert.ok(q.length<=450);
});
test("hourly search reserves room for every missing group, not only first ones",()=>{
  const groups=["address","image","web","phone","email","social","registration","date","other"];
  const q=buildQualityTavilyQuery({...base,missing:groups.map(group=>({key:group,group}))});
  for(const needle of ["adresa","fotografia","web","telefón","email","Facebook","registrácia","dátum","IČO"])
    assert.ok(q.includes(needle),"missing search term "+needle);
  assert.ok(q.length<=450);
});
test("queries use stored identity and context for all seven record kinds",()=>{
  const samples=[
    ["DIRECTORY",{city:"Nitra",category:"veterinari"},"služby pre psov"],
    ["EVENT",{city:"Žilina",start_date:"2026-12-03",organizer:"Kynoklub"},"kynológia"],
    ["ORGANIZATION",{city:"Bratislava",type:"SHELTER"},"útulok"],
    ["ADOPTION",{city:"Nitra",organization_name:"Útulok Nitra",breed_name:"Kríženec"},"pes na adopciu"],
    ["FOSTER",{city:"Trnava",organization:"OZ Pomoc",dog_name:"Ben"},"pomoc psom"],
    ["HELP_ITEM",{city:"Trenčín",category:"zbierky"},"pomoc psom"],
    ["LOST_FOUND",{city:"Levice",type:"FOUND",event_date:"2026-10-20"},"nájdený pes"],
  ];
  for(const [kind,record,term] of samples) {
    const query=buildQualityTavilyQuery({kind,label:"Identita profilu",row:record,missing:[{key:"imageUrl",group:"image"}]});
    assert.match(query,/Identita profilu/);assert.ok(query.includes(term),kind);
  }
});
test("past and cancelled events are skipped; same-day or future events remain eligible",()=>{
  const today="2026-10-25";
  assert.equal(qualityMayResearch("EVENT",row({start_date:"2026-10-24",cancelled:0}),today),false);
  assert.equal(qualityMayResearch("EVENT",row({start_date:"2026-10-24",end_date:"2026-10-25",cancelled:0}),today),true);
  assert.equal(qualityMayResearch("EVENT",row({start_date:"2026-10-26",cancelled:0}),today),true);
  assert.equal(qualityMayResearch("EVENT",row({start_date:"2026-10-26",cancelled:1}),today),false);
  assert.equal(qualityMayResearch("EVENT",row({start_date:"2026-10-26",cancelled:true}),today),false);
});
test("Slovak local date is used at midnight and DST boundaries",()=>{
  assert.equal(qualityTodayInSlovakia(new Date("2026-10-25T22:30:00Z")),"2026-10-25");
  assert.equal(qualityTodayInSlovakia(new Date("2026-10-25T23:30:00Z")),"2026-10-26");
});
test("reserved/adopted/archived dogs are paused; reopening resumes discovery",()=>{
  for(const status of ["RESERVED","ADOPTED","ARCHIVED"])
    assert.equal(qualityMayResearch("ADOPTION",row({status}),"2026-10-25"),false,status);
  for(const status of ["DRAFT","ACTIVE"])
    assert.equal(qualityMayResearch("ADOPTION",row({status}),"2026-10-25"),true,status);
});
test("resolved help cases, archived organizations and closed lost/found records are excluded",()=>{
  assert.equal(qualityMayResearch("FOSTER",row({resolved:1}),"2026-10-25"),false);
  assert.equal(qualityMayResearch("HELP_ITEM",row({resolved:true}),"2026-10-25"),false);
  assert.equal(qualityMayResearch("HELP_ITEM",row({resolved:0}),"2026-10-25"),true);
  assert.equal(qualityMayResearch("ORGANIZATION",row({status:"ARCHIVED"}),"2026-10-25"),false);
  assert.equal(qualityMayResearch("ORGANIZATION",row({status:"PUBLISHED"}),"2026-10-25"),true);
  for(const status of ["RESOLVED","EXPIRED","REJECTED","ARCHIVED"])
    assert.equal(qualityMayResearch("LOST_FOUND",row({status}),"2026-10-25"),false);
  assert.equal(qualityMayResearch("LOST_FOUND",row({status:"ACTIVE",expires_at:"2026-10-24T12:00:00Z"}),"2026-10-25"),false);
  assert.equal(qualityMayResearch("LOST_FOUND",row({status:"ACTIVE"}),"2026-10-25"),true);
});
test("both scheduled and manual research use the same query and eligibility helpers",()=>{
  const engine=readFileSync(new URL("../lib/data-quality-missing-hourly.ts",import.meta.url),"utf8");
  assert.match(engine,/if\(!qualityMayResearch\(kind,row,today\)\) return null/);
  assert.match(engine,/const profile=eligible\(area,kind,i,row,today\)/);
  assert.match(engine,/const profile=eligible\(input\.area,kind,index,row,today\)/);
  assert.match(engine,/const query = buildQualityTavilyQuery\(profile\)/);
  assert.match(engine,/buildQualityTavilyQuery\(profile!\)/);
  assert.doesNotMatch(engine,/fotografia obrázok":terms/);
});
