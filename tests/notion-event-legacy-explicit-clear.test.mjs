import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("legacy event importer distinguishes omitted contact/fee properties from explicit clears",()=>{
  const adapters=read("lib/notion-events-help-adapters.ts");
  const source=adapters.split("function eventInput(")[1].split("function organizationPayload(")[0];
  for(const [name,member] of [
    ["Telefón organizátora","contactPhone"],
    ["E-mail organizátora","contactEmail"],
    ["Vstupné","admissionFee"],
  ]){
    assert.match(source,new RegExp('Object\\.hasOwn\\(values, "'+name+'"\\)'));
    assert.ok(source.includes('s(values["'+name+'"])'));
    assert.ok(source.includes("existing?."+member));
  }
  assert.doesNotMatch(source,/s\(values\["Telefón organizátora"\]\) \|\| existing\?\.contactPhone/);
  assert.doesNotMatch(source,/s\(values\["E-mail organizátora"\]\) \|\| existing\?\.contactEmail/);
  assert.doesNotMatch(source,/s\(values\["Vstupné"\]\) \|\| existing\?\.admissionFee/);
});

test("signed Notion event property update remains the active atomic field writer",()=>{
  const sync=read("lib/notion-event-field-sync.ts");
  assert.match(sync,/export async function syncEventNotionFields/);
  assert.match(sync,/if\(!Object\.hasOwn\(input\.page\.properties\?\?\{\},property\)/);
  assert.match(sync,/value\?\?""/);
  assert.match(sync,/EVENT_LOCATION_PATHS\.has\(path\)/);
  assert.match(sync,/isAdminNotionSyncLocked\(input\.database,"events",id\)/);
});

test("legacy import is still reachable only through scoped reconciliation and respects Google Place",()=>{
  const sync=read("lib/notion-events-help-sync.ts");
  assert.match(sync,/if\(input\.manualDirection==="NOTION_TO_ADMIN"\)/);
  assert.match(sync,/await applyNotionToCanonical\(/);
  const adapters=read("lib/notion-events-help-adapters.ts");
  assert.match(adapters,/GOOGLE_PLACE_LOCATION_LOCKED/);
  assert.match(adapters,/eventStatusFromNotion/);
});
