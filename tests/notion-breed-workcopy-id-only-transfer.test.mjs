import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BREED_NOTION_SCHEMA } from "../lib/notion-breed-property-registry.ts";
import { workCopyChangedEditorialIds } from "../lib/notion-breed-workcopy-field-events.mjs";
import { validateBreedControlledValue } from "../lib/breed-workcopy-controlled.mjs";
import { planBreedWorkCopyFieldWrite } from "../lib/notion-breed-workcopy-patch-bridge.mjs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const sync = read("lib/notion-breed-workcopy-sync.ts");
const controlled = read("lib/notion-breed-workcopy-controlled.ts");
const breedStore = read("lib/breed-store.ts");
const delta = read("lib/notion-breed-workcopy-delta.ts");
const outbound = read("lib/notion-breed-sync.ts");
const fields = read("lib/notion-breed-workcopy-field-events.mjs");
const webhook = read("app/api/integrations/notion/webhook/route.ts");

test("Psipedia ID is the sole breed match, while page-source ownership remains authenticated", () => {
  assert.match(sync, /notionRichTextProperty\(page, "Psipedia ID"\) !== String\(breed.id\)/);
  assert.match(sync, /notionPageBelongsToDataSource\(page, source\)/);
  assert.doesNotMatch(sync, /notionNumberProperty\(page, "FCI číslo"\) !== breed.fciNumber/);
  assert.doesNotMatch(sync, /link.canonical_slug !== breed.slug/);
  assert.doesNotMatch(sync, /BREED_WORKCOPY_PROVENANCE_CHANGED/);
  assert.match(controlled, /notionRichTextProperty\(page,"Psipedia ID"\)!==String\(link.breed_id\)/);
  assert.doesNotMatch(controlled, /breed.slug!==link.canonical_slug/);
  assert.match(webhook, /verifyNotionWebhook/);
});

test("one unhealthy record cannot lock other profiles; drafts can receive content", () => {
  assert.doesNotMatch(sync, /requireActiveCohort/);
  assert.doesNotMatch(controlled, /BREED_CONTROLLED_COHORT_INACTIVE/);
  assert.match(sync, /await notionPageIsTombstoned\(args.database,link.work_notion_page_id\)/);
  assert.doesNotMatch(sync, /notionPageMustSkipInboundSync/);
  assert.match(sync, /Only the signed edited property IDs/);
  assert.match(sync, /saveBreedNotionField\(/);
});

test("signed Notion edits use fresh Admin values rather than stale receipt priorities", () => {
  assert.match(delta, /const current = breedFieldSnapshot\(input.canonical\)/);
  assert.match(delta, /current,\s*current,\s*\{\}/);
  assert.doesNotMatch(delta, /!blank.includes\(field\)/);
  assert.match(sync, /allowCurrentRemote: true/);
  assert.match(outbound, /forceFieldKeys: args.forceFieldKeys/);
});

test("published placeholder text and unusual measurements are not publication blockers on Notion import", () => {
  assert.match(breedStore, /clean\(input, existing, true\)/);
  assert.match(breedStore, /input.status === "published" && !allowNotionEditorialValues/);
  assert.match(breedStore, /if \(allowNotionEditorialValues \|\| \(preserved && value === old\)\) continue/);
  assert.match(breedStore, /user === "notion-breed-sync@psipedia.sk"/);
});

test("all six measurement fields allow 1, 2 and clearing in either direction", () => {
  const names = ["heightMinCm", "heightMaxCm", "weightMinKg", "weightMaxKg",
    "lifespanMinYears", "lifespanMaxYears"];
  for (const name of names) {
    assert.equal(validateBreedControlledValue(name, 1), 1);
    assert.equal(validateBreedControlledValue(name, 2), 2);
    assert.equal(validateBreedControlledValue(name, null), null);
  }
  assert.throws(() => validateBreedControlledValue("heightMinCm","x"),
    /BREED_CONTROLLED_NUMBER_INVALID/);
  assert.doesNotMatch(read("components/admin-breed-editor.tsx"),
    /min=\{field.min\} max=\{field.max\}/);
});

test("Notion physical FCI and media columns are not blocked by editorial allowlists", () => {
  const p = {
    properties: {
      "Titulná fotografia (JPG, PNG, WebP alebo AVIF do 8 MB)": {id:"img",type:"url",url:"https://psipedia.sk/media/old.png"},
      "Ďalšie fotografie": {id:"gallery",type:"rich_text",rich_text:[]},
      "Športy a aktivity": {id:"sports",type:"rich_text",rich_text:[]},
    },
  };
  const changed = workCopyChangedEditorialIds(p,["img","gallery","sports"],BREED_NOTION_SCHEMA);
  assert.deepEqual(changed,["gallery","image","sports"]);
  assert.match(sync, /breedWorkcopyEventValues\(page,edited,BREED_NOTION_SCHEMA\)/);
  assert.match(sync, /"FCI číslo":\{number\}/);
  assert.match(read("lib/notion-breed-workcopy-field-values.mjs"), /JSON_ARRAY_FIELDS/);
  assert.doesNotMatch(fields, /"image", "gallery", "relatedBreedIds"/);
});

test("Admin PATCH may replace stale Notion text but does not bypass revision checking", () => {
  const page={last_edited_time:"2026-11-11T12:00:00.000Z",
    properties:{"Krátky úvod v hero (2–4 vety)":{type:"rich_text",rich_text:[{plain_text:"Old"}]}}};
  const plan=planBreedWorkCopyFieldWrite({
    schema:BREED_NOTION_SCHEMA,page,fieldId:"intro",
    value:"New",baseline:"outdated",allowCurrentRemote:true,
    expectedPageRevision:page.last_edited_time,
  });
  assert.equal(plan.changed,true);
  assert.equal(plan.properties["Krátky úvod v hero (2–4 vety)"].rich_text[0].text.content,"New");
  assert.throws(()=>planBreedWorkCopyFieldWrite({
    schema:BREED_NOTION_SCHEMA,page,fieldId:"intro",
    value:"New",baseline:"outdated",allowCurrentRemote:true,
    expectedPageRevision:"2026-11-10T12:00:00.000Z",
  }),/BREED_WORKCOPY_PAGE_REVISION_CHANGED/);
});
