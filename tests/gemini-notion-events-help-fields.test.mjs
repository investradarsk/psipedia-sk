import test from "node:test";
import assert from "node:assert/strict";
import { buildNotionEventsHelpDraft, assertNotionEventsHelpUnique } from "../scripts/gemini-notion-events-help-fields.mjs";

const field = (type, options) => ({ type, ...(options ? {select:{options:options.map(name=>({name}))}} : {}) });
const events = {
  "Názov":field("title"), "Stav":field("select",["Nápad","Na kontrolu","Ready","Publikované","Archív"]),
  "Typ podujatia":field("rich_text"), "Začiatok":field("date"), "Koniec":field("date"),
  "Mesto":field("rich_text"), "Miesto":field("rich_text"), "Organizátor":field("rich_text"),
  "Popis":field("rich_text"), "Perex":field("rich_text"), "Web":field("url"), "Zdroj dát":field("url"),
};
const help = {
  "Názov":field("title"), "Kategória":field("rich_text"), "Psipedia stav":field("rich_text"),
  "Mesto":field("rich_text"), "Miesto":field("rich_text"), "Organizácia":field("rich_text"),
  "Kontakt":field("rich_text"), "Popis":field("rich_text"), "Perex":field("rich_text"),
};
const source = "https://skj.sk/podujatia/2027/vystava";
const eargs = {
  name:"Krajská výstava psov", summary:"Výstava psov",
  description:"Krajská výstava psov s oficiálnymi informáciami o organizácii a mieste.",
  city:"Nitra", organizer:"Kynologický klub", start_date:"2027-04-12",
  source_url:source, website_url:source,
  evidence:[{source_url:source,fields:["name","organizer","start_date","description","city","source_url"]}],
};
const hsource = "https://pomoc.example.org/vyzva";
const hargs = {
  name:"Zbierka na liečbu", summary:"Zbierka na liečbu psa",
  description:"Verejná výzva organizácie na pomoc psovi pri liečbe a starostlivosti.",
  city:"Nitra", source_url:hsource,
  evidence:[{source_url:hsource,fields:["name","description","city","source_url"]}],
};
const ep = (args=eargs, properties=events, rows=[]) =>
  buildNotionEventsHelpDraft({section:"events",subcategory:"vystavy",args,properties,rows,scanComplete:true,today:"2026-10-14"});
const hp = (args=hargs, properties=help, category="zbierky") =>
  buildNotionEventsHelpDraft({section:"help",subcategory:category,args,properties,rows:[],scanComplete:true});
const rejects = (fn, code) => assert.throws(fn,new RegExp("GEMINI_NOTION_CATEGORY_"+code));

test("event maps actual singular Notion text type and calendar date; cannot publish", () => {
  const p=ep();
  assert.equal(p["Typ podujatia"].rich_text[0].text.content,"Výstava");
  assert.deepEqual(p["Stav"],{select:{name:"Nápad"}});
  assert.deepEqual(p["Začiatok"],{date:{start:"2027-04-12"}});
  assert.equal(p["Organizátor"].rich_text[0].text.content,"Kynologický klub");
  assert.equal(p["Zdroj dát"].url,source);
  assert.ok(!p["Slug"] && !p["Koniec"] && !p["Čas začiatku"]);
});
test("event missing, wrong-type or publish-only Notion schema fails closed", () => {
  rejects(()=>ep(eargs,{...events,"Typ podujatia":field("select",["Výstava"])}),"FIELD_TYPE_Typ podujatia");
  rejects(()=>ep(eargs,{...events,Stav:field("select",["Publikované","Ready"])}),"EVENT_DRAFT_OPTION_MISSING");
  rejects(()=>ep(eargs,{...events,Stav:undefined}),"FIELD_MISSING_Stav");
  rejects(()=>ep(eargs,{...events,"Začiatok":undefined}),"FIELD_MISSING_Začiatok");
});
test("event rejects fake dates, expired events, missing organizer and weak evidence", () => {
  rejects(()=>ep({...eargs,start_date:"2027-02-30"}),"EVENT_DATE_INVALID");
  rejects(()=>ep({...eargs,start_date:"2025-01-01"}),"EVENT_IN_PAST");
  rejects(()=>ep({...eargs,organizer:""}),"ORGANIZER_REQUIRED");
  rejects(()=>ep({...eargs,evidence:[{source_url:source,fields:["name","start_date","description","source_url"]}]}),"EVIDENCE_INSUFFICIENT");
  rejects(()=>ep({...eargs,venue:"Miesto bez dôkazu"}),"VENUE_UNVERIFIED");
  rejects(()=>ep({...eargs,end_date:"2027-04-13"}),"END_DATE_UNVERIFIED");
  rejects(()=>ep({...eargs,website_url:"https://other.example.org"}),"WEBSITE_UNVERIFIED");
});
test("event rejects unsafe source URLs, incomplete scan and duplicate identities", () => {
  for(const link of ["http://example.org/event","https://psipedia.sk/podujatia","https://localhost/admin","https://127.0.0.1/secret"]) {
    rejects(()=>ep({...eargs,source_url:link}),"SOURCE_UNSAFE");
  }
  rejects(()=>buildNotionEventsHelpDraft({section:"events",subcategory:"vystavy",args:eargs,properties:events,rows:[],scanComplete:false,today:"2026-10-14"}),"DUPLICATE_SCAN_INCOMPLETE");
  const row={properties:{"Názov":{type:"title",title:[{plain_text:eargs.name}]},"Začiatok":{type:"date",date:{start:eargs.start_date}}}};
  rejects(()=>ep(eargs,events,[row]),"DUPLICATE_OR_AMBIGUOUS");
  rejects(()=>ep(eargs,events,[{properties:{"Názov":row.properties["Názov"]}}]),"DUPLICATE_OR_AMBIGUOUS");
});
test("help: generic help cases draft-only; no slug prevents auto canonical create", () => {
  const p=hp();
  assert.equal(p["Kategória"].rich_text[0].text.content,"zbierky");
  assert.equal(p["Psipedia stav"].rich_text[0].text.content,"draft");
  assert.ok(!p.Slug&&!p.Stav&&!p["Sync stav"]);
  assert.match(p.Popis.rich_text[0].text.content,/Zdroj: https:\/\/pomoc\.example\.org\/vyzva/);
  for(const category of ["adopcia","utulky","stratene-a-najdene"])
    rejects(()=>hp(hargs,help,category),"HELP_DEDICATED_AGENDA");
});
test("help: draft type, category, evidence and unverified contact enforced", () => {
  rejects(()=>hp(hargs,{...help,"Psipedia stav":field("select",["Publikované"])}),"FIELD_TYPE_Psipedia stav");
  rejects(()=>hp(hargs,{...help,"Kategória":undefined}),"FIELD_MISSING_Kategória");
  rejects(()=>hp({...hargs,evidence:[]}),"EVIDENCE_REQUIRED");
  rejects(()=>hp({...hargs,contact:"1234"}),"CONTACT_UNVERIFIED");
  rejects(()=>hp({...hargs,source_url:"https://127.0.0.1/secret"}),"SOURCE_UNSAFE");
});
test("help: complete scan compulsory, same-name existing entries block new drafts", () => {
  const row={properties:{"Názov":{type:"title",title:[{plain_text:hargs.name}]},"Mesto":{type:"rich_text",rich_text:[{plain_text:hargs.city}]}}};
  rejects(()=>assertNotionEventsHelpUnique({section:"help",args:hargs,rows:[row],scanComplete:true}),"DUPLICATE_OR_AMBIGUOUS");
  rejects(()=>assertNotionEventsHelpUnique({section:"help",args:hargs,rows:[],scanComplete:false}),"DUPLICATE_SCAN_INCOMPLETE");
});

test("event times require field evidence, valid local HH:MM and chronological end", () => {
  const properties = { ...events, "Čas začiatku": field("rich_text"), "Čas konca": field("rich_text") };
  const args = { ...eargs, start_time: "10:30", end_time: "12:00",
    evidence: [{ source_url: source, fields: [...eargs.evidence[0].fields, "start_time", "end_time"] }] };
  assert.equal(ep(args, properties)["Čas začiatku"].rich_text[0].text.content, "10:30");
  rejects(() => ep({ ...args, start_time: "25:00" }, properties), "EVENT_TIME_UNVERIFIED");
  rejects(() => ep({ ...args, evidence: eargs.evidence }, properties), "EVENT_TIME_UNVERIFIED");
  rejects(() => ep({ ...args, end_time: "09:00" }, properties), "EVENT_TIME_INVALID");
  rejects(() => ep(args, { ...properties, "Čas začiatku": field("date") }), "FIELD_TYPE");
});

test("help source identity survives renamed title and long descriptions retain every source", () => {
  const secondary = "https://pomoc.example.org/" + "a".repeat(1800);
  const args = { ...hargs, description: "d".repeat(1600), source_urls: [secondary] };
  const properties = hp(args);
  const text = properties.Popis.rich_text.map(item => item.text.content).join("");
  assert.ok(text.includes(secondary));
  assert.ok(properties.Popis.rich_text.every(item => item.text.content.length <= 1800));
  const row = { properties: { "Názov": { type: "title", title: [{ plain_text: "Different title" }] },
    "Popis": { type: "rich_text", rich_text: properties.Popis.rich_text } } };
  rejects(() => assertNotionEventsHelpUnique({ section: "help", args, rows: [row], scanComplete: true }), "DUPLICATE");
});

// Active worker contract; legacy helper tests above remain for existing callers.
const { buildGeminiNotionDraft, notionDraftProperty } = await import("../scripts/gemini-notion-directory-fields.mjs");
const target = { section: "events", categoryValue: "Výstava" };
const simple = args => buildGeminiNotionDraft({ args, properties: { ...events, "Gemini poznámka": field("rich_text") }, rows: [], target });
test("active worker accepts short incomplete private concepts, without inventing missing data", () => {
  const p = simple({ name: "Koncept", description: "Krátky opis" }).properties;
  assert.equal(p.Stav.select.name, "Nápad");
  assert.equal(p.Začiatok, undefined);
  assert.equal(p["Gemini poznámka"], undefined);
  assert.equal(p.Popis.rich_text[0].text.content, "Krátky opis");
  assert.throws(() => simple({ gemini_note: "Žiadny subjekt" }), /NAME_REQUIRED/);
});
test("active worker normalizes minor formats, omits invalid optional facts and keeps notes separate", () => {
  const d = buildGeminiNotionDraft({ args: { name: "Koncept", start_date: "1.4.2027", start_time: "8.05", end_date: "2027-02-30", website_url: "javascript:alert(1)", gemini_note: "Overte aktuálnosť" },
    properties: { ...events, "Čas začiatku": field("rich_text"), "Gemini poznámka": field("rich_text") }, rows: [], target });
  assert.equal(d.properties.Začiatok.date.start, "2027-04-01");
  assert.equal(d.properties["Čas začiatku"].rich_text[0].text.content, "08:05");
  assert.equal(d.properties.Koniec, undefined);
  assert.equal(d.properties.Web, undefined);
  assert.match(d.properties["Gemini poznámka"].rich_text[0].text.content, /Overte aktuálnosť/);
  assert.equal(d.properties.Popis, undefined);
});
test("actual Notion types and existing options control encoding; no schema mutation", () => {
  assert.deepEqual(notionDraftProperty(field("select", ["Výstava"]), "vystava"), { select: { name: "Výstava" } });
  assert.equal(notionDraftProperty(field("select", ["Výstava"]), "unknown"), null);
  assert.deepEqual(notionDraftProperty({ type: "status", status: { options: [{ name: "Koncept" }] } }, "Koncept"), { status: { name: "Koncept" } });
  assert.deepEqual(notionDraftProperty(field("number"), "3,5"), { number: 3.5 });
  assert.equal(notionDraftProperty(field("date"), "2027-02-30"), null);
  assert.equal(notionDraftProperty(field("url"), "https://127.0.0.1/"), null);
});
