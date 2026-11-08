import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EVENT_EDITORIAL_PATHS, EVENT_INITIAL_CONTACT_FIELDS, EVENT_NOTION_EDITORIAL_FIELDS,
  eventAdminChangedFields, eventNotionChangedFields, eventNotionPlainText,
  eventInitialContactBackfill, eventSourcePropertyNames,
} from "../lib/notion-event-field-events.ts";

const txt = (value, id = "opaque") => ({
  id, type: "rich_text", rich_text: value ? [{ plain_text: value }] : [],
});
const phone = "Telefón organizátora", email = "E-mail organizátora", fee = "Vstupné";

test("editorial events never include publication IDs, geo providers or images", () => {
  for (const forbidden of ["slug","status","imageUrl","imageKey","googlePlaceId","seo.noindex"]) {
    assert.equal(EVENT_EDITORIAL_PATHS.includes(forbidden), false, forbidden);
  }
  assert.ok(EVENT_EDITORIAL_PATHS.includes("contactPhone"));
  assert.ok(EVENT_EDITORIAL_PATHS.includes("admissionFee"));
});
test("Admin emits ONLY changed fields; unchanged old form fields are not replayed", () => {
  const before = { title:"Stopárske preteky",description:"A",contactPhone:"0900",seo:{title:"Title"} };
  const after = {...before, contactPhone:"+421 905 223 372"};
  assert.deepEqual(eventAdminChangedFields(before, after), ["contactPhone"]);
  assert.deepEqual(eventAdminChangedFields(before, before), []);
  assert.deepEqual(eventAdminChangedFields(before,{...before,seo:{title:"New"}}), ["seo.title"]);
});
test("opaque Notion property ID identifies exactly one inbound field", () => {
  const properties = {
    [phone]:txt("+421 905 223 372","m3%7D"),
    [email]:txt("knisova@gmail.com","e_2"),
    [fee]:txt("Zdarma","xyz"),
    "Popis":txt("Existing","desc"),
  };
  assert.deepEqual(eventNotionChangedFields(properties,["e_2"]),["contactEmail"]);
  assert.deepEqual(eventNotionChangedFields(properties,["xyz"]),["admissionFee"]);
  assert.deepEqual(eventNotionChangedFields(properties,[]),[]);
  assert.deepEqual(eventNotionChangedFields(properties,["Posledný sync"]),[]);
});
test("on first event sync, only nonempty D1 contact values missing in Notion are backfilled", () => {
  const canonical = { [phone]:"+421 905 223 372",[email]:"knisova@gmail.com",[fee]:"Zdarma" };
  const remote = { [phone]:txt(""),[email]:txt(""),[fee]:txt("") };
  assert.deepEqual(eventInitialContactBackfill(canonical,remote),EVENT_INITIAL_CONTACT_FIELDS);
  const mixed = {...remote,[email]:txt("someone@example.sk")};
  assert.deepEqual(eventInitialContactBackfill(canonical,mixed),["contactPhone","admissionFee"]);
  assert.deepEqual(eventInitialContactBackfill({[phone]:"", [email]:"", [fee]:""},remote),[]);
});
test("blank Notion text has no delete meaning; boolean false is a real value", () => {
  assert.equal(eventNotionPlainText(txt("")),"");
  assert.equal(eventNotionPlainText({type:"checkbox",checkbox:false}),false);
  assert.equal(eventNotionPlainText({type:"rich_text",rich_text:[{type:"text",text:{content:"Zdarma"}}]}),"Zdarma");
  assert.equal(eventNotionPlainText({type:"date",date:{start:"2026-11-08"}}),"2026-11-08");
  assert.equal(eventNotionPlainText(undefined),null);
});
test("new Notion contact fields are text, not special phone/email numbers", () => {
  assert.equal(EVENT_NOTION_EDITORIAL_FIELDS.contactPhone,phone);
  assert.equal(EVENT_NOTION_EDITORIAL_FIELDS.contactEmail,email);
  assert.equal(EVENT_NOTION_EDITORIAL_FIELDS.admissionFee,fee);
  assert.deepEqual(eventSourcePropertyNames(["contactPhone","contactPhone","admissionFee"]),[phone,fee]);
});
test("production wiring uses instant Admin saves and signed webhook without the old whole-record conflict path", () => {
  const root = name => readFileSync(new URL("../"+name,import.meta.url),"utf8");
  const admin = root("lib/notion-targeted-admin-save.ts");
  const route = root("app/api/admin/events/[id]/route.ts");
  const create = root("app/api/admin/events/route.ts");
  const webhook = root("lib/notion-webhook-dispatch.ts");
  const engine = root("lib/notion-event-field-sync.ts");
  const scheduler = root("lib/notion-events-help-sync.ts");
  assert.match(admin,/syncEventFieldsFromAdmin/);
  assert.match(route,/eventAdminChangedFields/);
  assert.match(create,/syncSavedNotionRecord/);
  assert.match(webhook,/syncEventFieldsFromNotionWebhook/);
  assert.match(webhook,/\/\^\\d\+\$\/\.test\(eventId\)/);
  assert.match(engine,/filter:\s*\{\s*property:\s*"Psipedia ID"/);
  assert.match(engine,/eventInitialContactBackfill/);
  assert.match(engine,/changedPropertyIds/);
  assert.match(engine,/EVENT_GOOGLE_PLACE_LOCATION_LOCKED/);
  assert.match(scheduler,/Existing events are owned by the new field-event engine/);
});
