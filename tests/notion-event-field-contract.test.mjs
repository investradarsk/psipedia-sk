import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  EVENT_NOTION_FIELDS, EVENT_NOTION_PATHS, EVENT_LOCATION_PATHS,
  eventChangedAdminFields, eventPreserveUneditedAdminFields,
  eventChangedNotionFields, eventReadNotionProperty, eventEmpty,
  eventValidateURL,
} from "../lib/notion-event-field-contract.ts";

function text(value, id) {
  return {id, type:"rich_text", rich_text:value?[{type:"text",plain_text:value}]:[]};
}
test("Notion text fields for web and registration use same field names as Admin URLs",()=>{
  assert.equal(EVENT_NOTION_FIELDS.websiteUrl,"Web");
  assert.equal(EVENT_NOTION_FIELDS.registrationUrl,"Registrácia");
  assert.equal(EVENT_NOTION_FIELDS.contactEmail,"E-mail organizátora");
  assert.equal(EVENT_NOTION_FIELDS.imageUrl,"Hlavný obrázok URL");
  assert.equal(EVENT_NOTION_FIELDS["seo.focusKeyword"],"SEO kľúčové slovo");
  assert.equal(EVENT_NOTION_PATHS.includes("slug"),false);
  assert.equal(EVENT_NOTION_PATHS.includes("status"),false);
  assert.equal(EVENT_NOTION_PATHS.includes("imageKey"),false);
  assert.equal(EVENT_LOCATION_PATHS.has("address"),true);
});
test("opaque Notion property ids select only edited fields",()=>{
  const p={Web:text("https://example.sk/a","ABC"),
    Registrácia:text("x","REG"),
    "E-mail organizátora":text("knisova@gmail.comx","EMAIL"),
    "Organizátor":text("Akadémia Sírius x","ORG")};
  assert.deepEqual(eventChangedNotionFields(p,["REG","EMAIL"]),["contactEmail","registrationUrl"]);
  assert.deepEqual(eventChangedNotionFields(p,["ABC"]),["websiteUrl"]);
  assert.deepEqual(eventChangedNotionFields(p,["Posledný sync"]),[]);
  assert.deepEqual(eventChangedNotionFields(p,[]),[]);
});
test("Notion accepts text URLs but Admin still validates before committing",()=>{
  assert.equal(eventReadNotionProperty(text("https://zsksr.sk/narodne-akcie/x","W")),
    "https://zsksr.sk/narodne-akcie/x");
  assert.equal(eventReadNotionProperty(text("x","R")),"x");
  assert.throws(()=>eventValidateURL("x"),/EVENT_URL_INVALID/);
  assert.doesNotThrow(()=>eventValidateURL("https://zsksr.sk/narodne-akcie/x"));
  assert.throws(()=>eventValidateURL("javascript:alert(1)"),/EVENT_URL_SCHEME_INVALID/);
  assert.equal(eventEmpty(""),true);
  assert.equal(eventEmpty(null),true);
  assert.equal(eventEmpty(false),false);
});
test("long Notion page property is not silently accepted from truncated response",()=>{
  assert.throws(()=>eventReadNotionProperty({rich_text:Array.from({length:25},()=>({plain_text:"x"}))}),
    /NOTION_PROPERTY_REQUIRES_COMPLETE_READ/);
});
test("Admin save sends only dirty fields; unedited Notion changes stay in D1",()=>{
  const stale={title:"Title",contactPhone:"0900",contactEmail:"old@example.sk",
    description:"old",seo:{focusKeyword:"old keyword",title:"old title"}};
  const live={...stale,contactEmail:"updated@example.sk",
    description:"new Notion text",seo:{focusKeyword:"new Notion keyword",title:"old title"}};
  const edited={...stale,title:"New title"};
  assert.deepEqual(eventChangedAdminFields(stale,edited),["title"]);
  const safe=eventPreserveUneditedAdminFields(edited,live,["title"]);
  assert.equal(safe.title,"New title");
  assert.equal(safe.contactEmail,"updated@example.sk");
  assert.equal(safe.description,"new Notion text");
  assert.equal(safe.seo.focusKeyword,"new Notion keyword");
});
test("Admin-uploaded main image URL is a dirty field and a stale image key is preserved",()=>{
  const before={title:"Výstava",imageUrl:"/media/old.webp",imageKey:"old-r2-key"};
  const uploaded={...before,imageUrl:"/media/new.webp",imageKey:"new-r2-key"};
  assert.deepEqual(eventChangedAdminFields(before,uploaded),["imageUrl"]);

  const live={...before,imageUrl:"/media/live.webp",imageKey:"live-r2-key"};
  const stale={...before,title:"Upravená výstava"};
  const changed=eventChangedAdminFields(before,stale);
  const safe=eventPreserveUneditedAdminFields(stale,live,changed);
  assert.equal(safe.title,"Upravená výstava");
  assert.equal(safe.imageUrl,"/media/live.webp");
  assert.equal(safe.imageKey,"live-r2-key");

  const properties={"Hlavný obrázok URL":{id:"PHOTO",type:"url",url:"https://psipedia.sk/media/new.webp"}};
  assert.deepEqual(eventChangedNotionFields(properties,["PHOTO"]),["imageUrl"]);
});
test("image mirroring is wired into targeted writeback and pending-save feedback",()=>{
  const read=f=>readFileSync(new URL("../"+f,import.meta.url),"utf8");
  const sync=read("lib/notion-event-field-sync.ts");
  const editor=read("components/admin-event-editor.tsx");
  assert.match(sync, /"imageUrl" as EventNotionField/);
  assert.match(sync, /EVENT_NOTION_FIELDS\[path\]/);
  assert.match(sync, /EVENT_IMAGE_URL_WRITE_FAILED/);
  assert.match(editor, /Fotografia je uložená v Admine, ale jej URL zatiaľ nie je potvrdená v Notione/);
});
test("field-only sync wiring never runs mapped Event changes through whole-profile updater",()=>{
  const read=f=>readFileSync(new URL("../"+f,import.meta.url),"utf8");
  const dispatcher=read("lib/notion-webhook-dispatch.ts");
  const targeted=read("lib/notion-targeted-admin-help.ts");
  const route=read("app/api/admin/events/[id]/route.ts");
  const sweep=read("lib/notion-events-help-sync.ts");
  const engine=read("lib/notion-event-field-sync.ts");
  assert.match(dispatcher,/syncEventNotionFields/);
  assert.match(dispatcher,/updatedPropertyIds:event\.data\.updated_properties/);
  assert.match(targeted,/syncEventAdminFields/);
  assert.match(route,/eventPreserveUneditedAdminFields/);
  assert.match(route,/changedEventFields/);
  assert.match(sweep,/Existing mapped Events now use targeted field events/);
  assert.match(engine,/for\(const path of fields\)/);
  assert.match(engine,/try\{\s*const value=valueFromPage/);
  assert.match(engine,/EVENT_URL_INVALID|eventValidateURL/);
  assert.match(engine,/GOOGLE_PLACE_LOCATION_LOCKED/);
  assert.match(engine,/NOTION_EVENTS_DATA_SOURCE_ID/);
});
