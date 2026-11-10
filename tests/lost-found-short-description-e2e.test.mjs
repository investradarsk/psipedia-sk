import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { agendaEditableFields } from "../lib/notion-events-help-adapters.ts";
import { loadNotionBulkLostFound } from "../lib/notion-bulk-sources.ts";
import { reconcileProfileFields } from "../lib/notion-profile-field-reconciliation.ts";
import {
  LOST_FOUND_SHORT_DESCRIPTION_FIELD as field,
  withoutLostFoundShortDescription,
  extendLostFoundShortDescriptionBaseline,
} from "../lib/notion-lost-found-short-description.ts";
import { stableAgendaSnapshotJson } from "../lib/notion-bidirectional-reconciliation.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("0162 schema, Admin save and public detail share one independent optional short description", () => {
  const schema=read("db/lost-found-dogs-schema.ts");
  const store=read("lib/lost-found-dog-store.ts");
  const editor=read("components/admin-lost-found-editor.tsx");
  const detail=read("components/lost-found-dog-detail.tsx");
  assert.match(schema,/shortDescription: text\("short_description"\)\.notNull\(\)\.default\(""\)/);
  assert.match(editor,/shortDescription:state\.shortDescription,description:state\.description/);
  assert.match(store,/shortDescription: row\.short_description \?\? ""/);
  assert.match(store,/shortDescription = cleanText\(input\.shortDescription, 500\)/);
  assert.match(store,/short_description=\?,/);
  assert.match(detail,/report\.shortDescription\?\.trim\(\) && <p className=\{styles\.detailLead\}>/);
  assert.match(detail,/const lead = report\.shortDescription\?\.trim\(\) \|\| report\.description/);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY, short_description TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '')");
    db.exec("INSERT INTO lost_found_dog_reports(id,description) VALUES (1,'Dlhý popis')");
    assert.deepEqual(({...db.prepare("SELECT short_description, description FROM lost_found_dog_reports WHERE id=1").get()}),
      {short_description:"", description:"Dlhý popis"});
    db.prepare("UPDATE lost_found_dog_reports SET short_description=? WHERE id=1").run("Stratil sa čierny pes");
    assert.deepEqual(({...db.prepare("SELECT short_description, description FROM lost_found_dog_reports WHERE id=1").get()}),
      {short_description:"Stratil sa čierny pes",description:"Dlhý popis"});
    db.prepare("UPDATE lost_found_dog_reports SET short_description=? WHERE id=1").run("");
    assert.equal(db.prepare("SELECT description FROM lost_found_dog_reports WHERE id=1").get().description,"Dlhý popis");
  } finally { db.close(); }
});

test("Notion Lost/Found source includes the lead and never replaces the long description", async () => {
  assert.ok(agendaEditableFields["lost-found"].includes(field));
  const source = read("lib/notion-bulk-sources.ts");
  assert.match(source,/size,short_description,description,distinguishing_marks/);
  const row={id:7,type:"FOUND",status:"ACTIVE",slug:"pes-7",dog_name:"",city:"Nitra",
    short_description:"Našiel sa pes pri stanici",description:"Podrobný popis nálezu"};
  const queries=[];
  const db={prepare(sql){queries.push(sql);return {async all(){return {results:[row]}}}}};
  const result=await loadNotionBulkLostFound(db);
  assert.equal(queries.length,1);
  assert.equal(result.length,1);
  assert.equal(result[0].properties[field],"Našiel sa pes pri stanici");
  assert.equal(result[0].properties["Popis"],"Podrobný popis nálezu");
});

test("verified old hash is still usable only after removing the newly introduced field", () => {
  const historical={"Názov":"Nájdený pes","Popis":"Opis psa","Mesto":"Nitra"};
  const notion={...historical,[field]:""};
  const admin={...historical,[field]:"Našiel sa pes"};
  assert.deepEqual(withoutLostFoundShortDescription(admin),historical);
  assert.deepEqual(extendLostFoundShortDescriptionBaseline(historical),notion);
  assert.equal(extendLostFoundShortDescriptionBaseline({[field]:"Pôvodný text"})[field],"Pôvodný text");
  assert.equal(stableAgendaSnapshotJson("lost-found",withoutLostFoundShortDescription(notion)),
    stableAgendaSnapshotJson("lost-found",historical));
  assert.notEqual(stableAgendaSnapshotJson("lost-found",notion),
    stableAgendaSnapshotJson("lost-found",historical));
});

test("short description propagates Admin -> Notion, Notion -> Admin, and deletes independently", () => {
  const protectedFields=new Set(["Slug","Typ","Psipedia stav"]);
  const baseline={...extendLostFoundShortDescriptionBaseline({"Popis":"Hlavný text"})};
  const reconcile=(notion,admin)=>reconcileProfileFields({
    baseline,notion:{...baseline,...notion},psipedia:{...baseline,...admin},
    protectedFields,canonicalFieldsWin:true,
  });
  const fromAdmin=reconcile({}, {[field]:"Hľadá sa pes"});
  assert.equal(fromAdmin.kind,"MERGE");
  assert.equal(fromAdmin.merged[field],"Hľadá sa pes");
  assert.equal(fromAdmin.merged["Popis"],"Hlavný text");
  const fromNotion=reconcile({[field]:"Nájdený pes"}, {});
  assert.equal(fromNotion.kind,"MERGE");
  assert.equal(fromNotion.merged[field],"Nájdený pes");
  const cleared=reconcile({[field]:""}, {[field]:"Hľadá sa pes"});
  assert.equal(cleared.kind,"MERGE");
  const updatedBaseline={...baseline,[field]:"Pôvodný krátky text"};
  const deleteFromAdmin=reconcileProfileFields({baseline:updatedBaseline,
    notion:{...updatedBaseline},psipedia:{...updatedBaseline,[field]:""},
    protectedFields,canonicalFieldsWin:true});
  assert.equal(deleteFromAdmin.kind,"MERGE");
  assert.equal(deleteFromAdmin.merged[field],"");
  assert.equal(deleteFromAdmin.merged["Popis"],"Hlavný text");
  const deleteFromNotion=reconcileProfileFields({baseline:updatedBaseline,
    notion:{...updatedBaseline,[field]:""},psipedia:{...updatedBaseline},
    protectedFields,canonicalFieldsWin:true});
  assert.equal(deleteFromNotion.kind,"MERGE");
  assert.equal(deleteFromNotion.merged[field],"");
  const simultaneous=reconcileProfileFields({baseline:updatedBaseline,
    notion:{...updatedBaseline,[field]:"Notion zmena"},psipedia:{...updatedBaseline,[field]:"Admin zmena"},
    protectedFields,canonicalFieldsWin:true});
  assert.equal(simultaneous.kind,"CONFLICT");
});
