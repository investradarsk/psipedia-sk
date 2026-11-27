import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { reconcileProfileFields, reconcileProfileFieldsWithoutBaseline, trustedProfileBaselineFromHashes } from "../lib/notion-profile-field-reconciliation.ts";
import {
  readProfileFieldBaseline, recordProfileFieldBaseline, profileFieldBaselineTableReady,
  profileFieldSnapshotHash,
} from "../lib/notion-profile-field-baseline.ts";

const baseline = {
  "Názov": "Old name", "Perex": "Original", "Popis": "Original description",
  "Web": "https://example.sk", "Stav": "Publikované", "Slug": "original",
  "Latitude": 48.4, "Verejný kontakt": false, "Zrušené": false,
};
const canon = (patch = {}) => ({ ...baseline, ...patch });
function reconcile(notion, psipedia, extra = {}) {
  return reconcileProfileFields({
    baseline, notion: canon(notion), psipedia: canon(psipedia),
    protectedFields: new Set(["Stav", "Slug", "Latitude", "Verejný kontakt"]),
    ...extra,
  });
}
test("Notion-only field changes pull into canonical", () => {
  const result = reconcile({ Popis: "Notion edit" }, {});
  assert.equal(result.kind, "MERGE");
  assert.equal(result.merged.Popis, "Notion edit");
});
test("Admin-only field changes push back to Notion", () => {
  const result = reconcile({}, { Popis: "Admin edit" });
  assert.equal(result.kind, "MERGE");
  assert.equal(result.merged.Popis, "Admin edit");
});
test("independent edits from both sides merge without replacing untouched data", () => {
  const result = reconcile({ Popis: "Notion" }, { Web: "https://new.sk" });
  assert.equal(result.kind, "MERGE");
  assert.equal(result.merged.Popis, "Notion");
  assert.equal(result.merged.Web, "https://new.sk");
  assert.equal(result.merged["Perex"], "Original");
});
test("same field modified on both sides conflicts regardless of record timestamps", () => {
  const result = reconcile({ Popis: "Notion" }, { Popis: "Admin" });
  assert.equal(result.kind, "CONFLICT");
  assert.equal(result.conflicts[0].reason, "AMBIGUOUS_SAME_FIELD");
  // Reversing nominal operation order cannot make up edit provenance.
  assert.equal(reconcile({ Popis: "Admin" }, { Popis: "Notion" }).kind, "CONFLICT");
});
test("Directory one-sided verified edits cannot be undone by historical source-priority flags",()=>{
  const base={name:"Vet",description:"Original",city:"Nitra",status:"published"};
  for(const authorities of [
    {description:"notion"}, {description:"admin"},
    {description:"latest"}, {description:"safe"},
  ]) {
    const adminChanged=reconcileProfileFields({
      baseline:base, notion:base, psipedia:{...base,description:"Nové z Adminu"},
      protectedFields:new Set(["status"]), authorities, changedSideWins:true,
    });
    assert.equal(adminChanged.kind,"MERGE");
    assert.equal(adminChanged.merged.description,"Nové z Adminu",
      "Unchanged Notion is NOT a newer edit");

    const notionChanged=reconcileProfileFields({
      baseline:base, notion:{...base,description:"Nové z Notionu"}, psipedia:base,
      protectedFields:new Set(["status"]), authorities, changedSideWins:true,
    });
    assert.equal(notionChanged.kind,"MERGE");
    assert.equal(notionChanged.merged.description,"Nové z Notionu",
      "Unchanged Admin is NOT a newer edit");
    assert.equal(notionChanged.merged.city,"Nitra");
  }
});
test("Directory one-sided explicit clears still require a trusted human delete receipt",()=>{
  const base={name:"Vet",description:"Pôvodný"};
  for(const source of ["notion","psipedia"]){
    const changed=source==="notion"
      ?{notion:{...base,description:""},psipedia:base}
      :{notion:base,psipedia:{...base,description:""}};
    const policy={baseline:base,...changed,protectedFields:new Set(),
      changedSideWins:true,authorities:{description:source==="notion"?"admin":"notion"}};
    const blocked=reconcileProfileFields(policy);
    assert.equal(blocked.kind,"CONFLICT");
    assert.equal(blocked.conflicts[0].reason,"UNVERIFIED_DELETE");
    const approved=reconcileProfileFields({
      ...policy,verifiedDeletes:new Set([source+":description"]),
    });
    assert.equal(approved.kind,"MERGE");
    assert.equal(approved.merged.description,"");
  }
});
test("Directory never treats historical Notion/Admin priority as proof of which simultaneous edit was newer",()=>{
  const baseline={name:"Vet",description:"Spoločný",city:"Nitra"};
  const notion={...baseline,description:"Nová Notion hodnota"};
  const psipedia={...baseline,description:"Nová Admin hodnota"};
  for(const mode of ["safe","notion","admin","latest"]){
    const result=reconcileProfileFields({
      baseline,notion,psipedia,
      protectedFields:new Set(),changedSideWins:true,
      authorities:{description:mode},
    });
    assert.equal(result.kind,"CONFLICT",mode);
    assert.deepEqual(result.conflicts,[{
      field:"description",reason:"AMBIGUOUS_SAME_FIELD",
    }]);
    assert.equal(result.merged.description,"Nová Admin hodnota");
  }
});
test("Directory never accepts unverified deletion, even from legacy preferred Admin side",()=>{
  const baseline={description:"Pôvodný",publicPhone:"0900"};
  const emptyAdmin={...baseline,description:""};
  const emptyNotion={...baseline,publicPhone:""};
  for(const {notion,psipedia,key,side} of [
    {notion:baseline,psipedia:emptyAdmin,key:"description",side:"psipedia"},
    {notion:emptyNotion,psipedia:baseline,key:"publicPhone",side:"notion"},
  ]){
    for(const mode of ["admin","notion","safe","latest"]){
      const input={baseline,notion,psipedia,protectedFields:new Set(),
        changedSideWins:true,authorities:{[key]:mode}};
      const rejected=reconcileProfileFields(input);
      assert.equal(rejected.kind,"CONFLICT",key+":"+mode);
      assert.equal(rejected.conflicts[0].reason,"UNVERIFIED_DELETE");
      const confirmed=reconcileProfileFields({
        ...input,verifiedDeletes:new Set([side+":"+key]),
      });
      assert.equal(confirmed.kind,"MERGE",key+":"+mode);
      assert.equal(confirmed.merged[key],"");
      assert.equal(confirmed.merged[key==="description"?"publicPhone":"description"],
        baseline[key==="description"?"publicPhone":"description"]);
    }
  }
});
test("Directory newest authenticated human event can win a two-sided field edit independently of old source priority",()=>{
  const baseline={description:"Old",city:"Nitra"};
  const notion={...baseline,description:"Changed in Notion"};
  const psipedia={...baseline,description:"Changed in Admin"};
  const trusted={
    notion:{editId:"notion-field-11",observedAt:"2026-11-20T03:00:01.000Z",value:notion.description},
    psipedia:{editId:"admin-field-11",observedAt:"2026-11-20T03:00:02.000Z",value:psipedia.description},
  };
  for(const mode of ["safe","notion","admin","latest"]){
    const input={baseline,notion,psipedia,changedSideWins:true,
      protectedFields:new Set(),authorities:{description:mode}};
    const winner=reconcileProfileFields({...input,verifiedFieldEdits:{description:trusted}});
    assert.equal(winner.kind,"MERGE",mode);
    assert.equal(winner.merged.description,psipedia.description,mode);
    const reversed=reconcileProfileFields({...input,verifiedFieldEdits:{
      description:{...trusted,notion:{...trusted.notion,observedAt:"2026-11-20T03:00:03.000Z"}},
    }});
    assert.equal(reversed.kind,"MERGE");
    assert.equal(reversed.merged.description,notion.description);
  }
});
test("Directory equal concurrent edits converge, not a false conflict, across all legacy modes",()=>{
  const baseline={name:"Vet",description:"Old"};
  for(const mode of ["safe","notion","admin","latest"]){
    const updated={...baseline,description:"Same"};
    const resolution=reconcileProfileFields({
      baseline,notion:updated,psipedia:updated,
      protectedFields:new Set(),changedSideWins:true,authorities:{description:mode},
    });
    assert.equal(resolution.kind,"MERGE",mode);
    assert.equal(resolution.merged.description,"Same");
  }
});
test("Latest same-field revisions choose only value-matched, UTC-authenticated field receipts",()=>{
  const base={description:"Pôvodný",city:"Nitra"};
  const notion={...base,description:"Nový Notion"};
  const psipedia={...base,description:"Nový Admin"};
  const input={baseline:base,notion,psipedia,
    protectedFields:new Set(),changedSideWins:true,
    authorities:{description:"latest"}};
  const verified={
    notion:{observedAt:"2026-11-20T00:00:00.200Z",editId:"signed-notion-ev-1",value:notion.description},
    psipedia:{observedAt:"2026-11-20T00:00:00.100Z",editId:"verified-admin-ev-2",value:psipedia.description},
  };
  assert.equal(reconcileProfileFields(input).kind,"CONFLICT");
  const notionWins=reconcileProfileFields({...input,verifiedFieldEdits:{description:verified}});
  assert.equal(notionWins.kind,"MERGE");
  assert.equal(notionWins.merged.description,notion.description);
  const adminWins=reconcileProfileFields({...input,verifiedFieldEdits:{description:{
    ...verified,psipedia:{...verified.psipedia,observedAt:"2026-11-20T00:00:00.300Z"},
  }}});
  assert.equal(adminWins.kind,"MERGE");
  assert.equal(adminWins.merged.description,psipedia.description);
  for(const bad of [
    {...verified,notion:{...verified.notion,value:"Other Notion value"}},
    {...verified,psipedia:{...verified.psipedia,observedAt:verified.notion.observedAt}},
    {...verified,notion:{...verified.notion,observedAt:"2026-11-20 00:00:00"}},
    {...verified,notion:{...verified.notion,editId:""}},
    {...verified,notion:{...verified.notion,observedAt:"2026-02-30T00:00:00.100Z"}},
  ]) {
    const unresolved=reconcileProfileFields({...input,verifiedFieldEdits:{description:bad}});
    assert.equal(unresolved.kind,"CONFLICT");
    assert.equal(unresolved.conflicts[0].reason,"AMBIGUOUS_SAME_FIELD");
  }
});
test("Field revision evidence cannot unlock Google Place / reviewed identities",()=>{
  const base={city:"Nitra",status:"published",description:"Old"};
  const changes={notion:{...base,city:"Bratislava",status:"draft"},
    psipedia:{...base,city:"Trnava",status:"published"}};
  const both={notion:{observedAt:"2026-11-20T00:00:03.000Z",editId:"notion",value:"Bratislava"},
    psipedia:{observedAt:"2026-11-20T00:00:01.000Z",editId:"admin",value:"Trnava"}};
  const result=reconcileProfileFields({
    baseline:base,...changes,protectedFields:new Set(["city","status"]),
    canonicalFieldsWin:true,authorities:{city:"latest",status:"latest"},
    verifiedFieldEdits:{city:both},
  });
  assert.equal(result.merged.city,"Trnava");
  assert.equal(result.merged.status,"published");
  assert.equal(result.kind,"MERGE");
});
test("Directory sync actually opts into baseline-proven one-sided field precedence", async()=>{
  const source=await readFile(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
  const start=source.indexOf("const resolution = baseline");
  assert.ok(start>0);
  const block=source.slice(start,start+650);
  assert.match(block,/reconcileProfileFields\(\{/);
  assert.match(block,/changedSideWins: true/);
  assert.doesNotMatch(block,/updatedAt \> page\.last_edited_time/);
});

test("identical concurrent field edits converge safely", () => {
  assert.equal(reconcile({ Popis: "Same" }, { Popis: "Same" }).kind, "MERGE");
});
test("Notion and D1 clearing populated fields needs proven explicit human deletion", () => {
  assert.equal(reconcile({ Popis: "" }, {}).conflicts[0].reason, "UNVERIFIED_DELETE");
  assert.equal(reconcile({}, { Popis: null }).conflicts[0].reason, "UNVERIFIED_DELETE");
  assert.equal(reconcile({ Popis: "" }, {}, { verifiedDeletes: new Set(["notion:Popis"]) }).kind, "MERGE");
});
test("omitted fields are not deletion requests", () => {
  const { Popis, ...missing } = baseline;
  const result = reconcileProfileFields({
    baseline, notion: missing, psipedia: baseline, protectedFields: new Set(),
  });
  assert.equal(result.kind, "CONFLICT");
  assert.ok(result.conflicts.some((x) => x.field === "Popis" && x.reason === "MISSING_FIELD"));
});
test("empty-to-filled, false and zero have explicit semantics", () => {
  const b = { Count: null, Flag: false, Text: "" };
  const r = reconcileProfileFields({
    baseline: b,
    notion: { Count: 0, Flag: false, Text: "new" },
    psipedia: b,
    protectedFields: new Set(),
  });
  assert.equal(r.kind, "MERGE");
  assert.equal(r.merged.Count, 0);
  assert.equal(r.merged.Text, "new");
});
test("publication, identity, private location and contact remain under canonical control", () => {
  for (const [field, value] of [
    ["Stav", "Koncept"], ["Slug", "another"], ["Latitude", 1], ["Verejný kontakt", true],
  ]) {
    const r = reconcile({ [field]: value }, {});
    assert.equal(r.kind, "CONFLICT", field);
    assert.equal(r.conflicts[0].reason, "PROTECTED_FIELD");
  }
  const r = reconcile({}, { Stav: "Koncept" });
  assert.equal(r.kind, "MERGE");
  assert.equal(r.merged.Stav, "Koncept");
});
test("nested SEO fields are merged per leaf without dropping siblings", () => {
  const a = { seo: { title: "Old", description: "Old", noindex: false } };
  const r = reconcileProfileFields({
    baseline: a,
    notion: { seo: { ...a.seo, description: "Notion" } },
    psipedia: { seo: { ...a.seo, title: "Admin" } },
    protectedFields: new Set(["seo.noindex"]),
  });
  assert.equal(r.kind, "MERGE");
  assert.deepEqual(r.merged.seo, { title: "Admin", description: "Notion", noindex: false });
});
test("repeated sync converges and is idempotent", () => {
  const once = reconcile({ Popis: "Merged" }, { Web: "https://new.sk" });
  const twice = reconcileProfileFields({
    baseline: once.merged, notion: once.merged, psipedia: once.merged, protectedFields: new Set(),
  });
  assert.equal(twice.kind, "UNCHANGED");
});
test("legacy records without per-field baseline require review", () => {
  const result = reconcileProfileFields({
    baseline: null, notion: canon({ Popis: "new" }), psipedia: baseline,
    protectedFields: new Set(),
  });
  assert.equal(result.kind, "CONFLICT");
  assert.equal(result.conflicts[0].reason, "BASELINE_UNAVAILABLE");
});
function d1(db) {
  return {
    prepare(sql) {
      return {
        first: async () => db.prepare(sql).get() ?? null,
        bind(...values) {
          return {
            first: async () => db.prepare(sql).get(...values) ?? null,
            run: async () => db.prepare(sql).run(...values),
          };
        },
      };
    },
  };
}
test("D1 migration stores isolated agenda/page-bound baselines and rejects ID confusion", async () => {
  const db = new DatabaseSync(":memory:");
  const database = d1(db);
  assert.equal(await profileFieldBaselineTableReady(database), false);
  assert.equal(await readProfileFieldBaseline({
    database, agenda: "events", entityId: 1, pageId: "a", expectedHash: "hash",
  }), null);
  db.exec(await readFile(new URL("../drizzle/0153_notion_profile_field_baselines.sql", import.meta.url), "utf8"));
  assert.equal(await profileFieldBaselineTableReady(database), true);
  const arg = {
    database, agenda: "events", entityId: 1, pageId: "notion-a",
    hash: await profileFieldSnapshotHash("events", baseline),
    snapshot: baseline, syncedAt: "2026-10-20T12:00:00Z",
  };
  await recordProfileFieldBaseline(arg);
  await recordProfileFieldBaseline(arg);
  assert.deepEqual(await readProfileFieldBaseline({
    database, agenda: "events", entityId: 1, pageId: "notion-a", expectedHash: arg.hash,
  }), baseline);
  for (const wrong of [
    { agenda: "adoptions" }, { entityId: 2 }, { pageId: "notion-other" }, { expectedHash: "bad" },
  ]) {
    assert.equal(await readProfileFieldBaseline({
      database, agenda: "events", entityId: 1, pageId: "notion-a",
      expectedHash: "verified", ...wrong,
    }), null);
  }
  await assert.rejects(() => recordProfileFieldBaseline({ ...arg, entityId: 2 }));
  await assert.rejects(
    () => recordProfileFieldBaseline({ ...arg, hash: "not-a-content-hash" }),
    /PROFILE_BASELINE_HASH_MISMATCH/,
  );
  db.prepare("UPDATE notion_profile_field_baselines SET snapshot_json=? WHERE agenda='events' AND entity_id=1")
    .run(JSON.stringify({ ...baseline, Popis: "CORRUPTED_SNAPSHOT" }));
  assert.equal(await readProfileFieldBaseline({
    database, agenda: "events", entityId: 1, pageId: "notion-a", expectedHash: arg.hash,
  }), null, "declared hash cannot authenticate modified snapshot JSON");
  db.close();
});
test("existing adapters enforce canonical publication lock across every agenda", async () => {
  const directory = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const adapter = await readFile(new URL("../lib/notion-events-help-adapters.ts", import.meta.url), "utf8");
  const eventSync = await readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.match(directory, /desired.status !== current.status/);
  assert.match(directory, /readProfileFieldBaseline\(/);
  assert.match(eventSync, /reconcileProfileFields\(/);
  assert.match(adapter, /CANONICAL_PUBLICATION_OR_IDENTITY_LOCKED/);
  assert.match(eventSync, /LOSSLESS_FIELD_REVIEW_REQUIRED/);
});


test("equal Events/Help snapshots persist the actual verified common field values", async () => {
  const sync = await readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.match(sync,
    /mapping\.content_hash === canonicalHash\) \{[\s\S]{0,250}recordProfileFieldBaseline\(\{[\s\S]{0,220}snapshot: sourceSnapshot,/);
});

test("changed Events/Help mappings never advance on an unverified Notion PATCH echo", async () => {
  const sync = await readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.match(sync,
    /if \(!written\.properties \|\|[\s\S]{0,200}NOTION_EDITORIAL_WRITEBACK_ECHO_MISMATCH/);
  assert.match(sync,
    /NOTION_EDITORIAL_WRITEBACK_ECHO_MISMATCH[\s\S]{0,350}snapshot: verifiedSnapshot,/);
});


test("directory mapping and baseline cannot advance on a partial or wrong-page Notion echo", async () => {
  const directory = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const fn = directory.slice(directory.indexOf("async function writeProfileToNotion("),
    directory.indexOf("function fullProfileInput("));
  assert.ok(fn.length > 1000, "test must inspect the actual directory writeback function");
  const guard = fn.indexOf('throw new Error("NOTION_DIRECTORY_EDITORIAL_WRITEBACK_ECHO_MISMATCH")');
  const mapping = fn.indexOf("await saveMapping(");
  const baselineWrite = fn.indexOf("await recordProfileFieldBaseline(");
  assert.ok(guard > 0 && guard < mapping && mapping < baselineWrite,
    "remote identity/payload must be checked before committing mapping and baseline");
  assert.match(fn, /input\.pageId && page\.id !== input\.pageId/);
  assert.match(fn, /!page\.properties \|\| await snapshotHash\(notionSnapshot\(page\)\) !== hash/);
});


test("common baseline is inferred from one unchanged side without any new D1 table", () => {
  const common = { name: "Old", web: "https://original.sk" };
  const changedNotion = { ...common, name: "Notion title" };
  const changedAdmin = { ...common, web: "https://admin.sk" };
  const read = (notion, psipedia, nHash, pHash) =>
    trustedProfileBaselineFromHashes({
      recorded: null, notion, psipedia,
      mappingHash: "last-good", notionHash: nHash, psipediaHash: pHash,
    });

  const notionBaseline = read(changedNotion, common, "notion-new", "last-good");
  assert.deepEqual(notionBaseline, common);
  assert.deepEqual(reconcileProfileFields({
    baseline: notionBaseline, notion: changedNotion, psipedia: common,
    protectedFields: new Set(),
  }).merged, changedNotion);

  const adminBaseline = read(common, changedAdmin, "last-good", "admin-new");
  assert.deepEqual(adminBaseline, common);
  assert.deepEqual(reconcileProfileFields({
    baseline: adminBaseline, notion: common, psipedia: changedAdmin,
    protectedFields: new Set(),
  }).merged, changedAdmin);

  // With two independent different edits there is no provable common field
  // snapshot unless a separate, validated receipt has been stored.
  assert.equal(read(changedNotion, changedAdmin, "notion-new", "admin-new"), null);
  assert.equal(reconcileProfileFields({
    baseline: null, notion: changedNotion, psipedia: changedAdmin,
    protectedFields: new Set(),
  }).kind, "CONFLICT");

  // Both current sides have exactly the same values, so neither is overwritten.
  assert.deepEqual(read(changedAdmin, changedAdmin, "same-new", "same-new"), changedAdmin);

  const stored = common;
  assert.deepEqual(trustedProfileBaselineFromHashes({
    recorded: stored, notion: changedNotion, psipedia: changedAdmin,
    mappingHash: "last-good", notionHash: "notion-new", psipediaHash: "admin-new",
  }), common);
});

test("one-sided inferred baseline still refuses unauthorized clears and protected edits", () => {
  const state = { title: "Original", status: "published" };
  const change = { title: "", status: "published" };
  const baseline = trustedProfileBaselineFromHashes({
    recorded: null, notion: change, psipedia: state,
    mappingHash: "last-good", notionHash: "notion-new", psipediaHash: "last-good",
  });
  assert.equal(reconcileProfileFields({
    baseline, notion: change, psipedia: state,
    protectedFields: new Set(["status"]),
  }).conflicts[0].reason, "UNVERIFIED_DELETE");
  assert.equal(reconcileProfileFields({
    baseline, notion: { ...change, status: "draft" }, psipedia: state,
    protectedFields: new Set(["status"]),
  }).kind, "CONFLICT");
});


test("existing owner-gated Gemini and Events priority branches remain reachable", async () => {
  const [directory, sync] = await Promise.all([
    readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8"),
  ]);
  const directoryMapped = directory.slice(directory.indexOf("async function syncMappedPage("),
    directory.indexOf("async function recoverMappingFromPage("));
  assert.match(directoryMapped,
    /if \(!gemini22PriorityEnabled\(input\.bindings\.NOTION_GEMINI_22_PRIORITY_A_ENABLED\)\) \{/);
  assert.match(directoryMapped,
    /if \(gemini22PriorityEnabled\(input\.bindings\.NOTION_GEMINI_22_PRIORITY_A_ENABLED\)\) \{/);
  assert.match(sync,
    /legacyPriorityEnabled = input\.definition\.key === "events"[\s\S]{0,260}NOTION_EVENTS_NOTION_PRIORITY_A_ENABLED[\s\S]{0,180}NOTION_GEMINI_22_PRIORITY_A_ENABLED/);
  assert.match(sync, /decision\.decision !== "UNCHANGED" && !legacyPriorityEnabled/);
});


test("reordered JSON object keys inside a list do not create phantom field edits", () => {
  const original = { items: [{ name: "Luna", meta: { age: 3, color: "black" } }] };
  const reordered = { items: [{ meta: { color: "black", age: 3 }, name: "Luna" }] };
  const result = reconcileProfileFields({
    baseline: original, notion: reordered, psipedia: original, protectedFields: new Set(),
  });
  assert.equal(result.kind, "UNCHANGED");
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.notionFields, []);
});

test("list order remains meaningful even when members have identical properties", () => {
  const a = { images: [{ id: "front" }, { id: "back" }] };
  const b = { images: [{ id: "back" }, { id: "front" }] };
  const result = reconcileProfileFields({
    baseline: a, notion: b, psipedia: a, protectedFields: new Set(),
  });
  assert.equal(result.kind, "MERGE");
  assert.deepEqual(result.merged.images, b.images);
  assert.deepEqual(result.notionFields, ["images"]);
});

test("two independently reordered lists are not guessed into one ordering", () => {
  const baseline = { images: ["a", "b", "c"] };
  const result = reconcileProfileFields({
    baseline,
    notion: { images: ["b", "a", "c"] },
    psipedia: { images: ["a", "c", "b"] },
    protectedFields: new Set(),
  });
  assert.equal(result.kind, "CONFLICT");
  assert.equal(result.conflicts[0].reason, "AMBIGUOUS_SAME_FIELD");
});

test("nested independent edits still merge even when sibling objects have reordered keys", () => {
  const old = { seo: { title: "Old", description: "Old", noindex: false }, links: [{ a: 1, b: 2 }] };
  const notion = { seo: { title: "Old", description: "New", noindex: false }, links: [{ b: 2, a: 1 }] };
  const admin = { seo: { title: "Changed", description: "Old", noindex: false }, links: [{ a: 1, b: 2 }] };
  const result = reconcileProfileFields({
    baseline: old, notion, psipedia: admin, protectedFields: new Set(["seo.noindex"]),
  });
  assert.equal(result.kind, "MERGE");
  assert.deepEqual(result.merged.seo, { title: "Changed", description: "New", noindex: false });
  assert.deepEqual(result.conflicts, []);
});

test("a protected parent locks every descendant against Notion edits", () => {
  const original = { private: { email: "internal@example.sk", phone: "0900" } };
  const result = reconcileProfileFields({
    baseline: original,
    notion: { private: { email: "attacker@example.sk", phone: "0900" } },
    psipedia: original, protectedFields: new Set(["private"]),
  });
  assert.equal(result.kind, "CONFLICT");
  assert.deepEqual(result.conflicts, [{ field: "private.email", reason: "PROTECTED_FIELD" }]);
});

test("empty object is never silently omitted from the three-way evidence", () => {
  const b = { payload: {} };
  const result = reconcileProfileFields({
    baseline: b, notion: { payload: { name: "Notion" } },
    psipedia: b, protectedFields: new Set(),
  });
  assert.equal(result.kind, "CONFLICT");
  assert.ok(result.conflicts.some((conflict) => conflict.reason === "MISSING_FIELD"));
});

test("nested array content changed on both sides remains manual without trustworthy intent", () => {
  const b = { images: [{ src: "a", alt: "old" }] };
  const n = { images: [{ alt: "new", src: "a" }] };
  const p = { images: [{ src: "b", alt: "old" }] };
  const result = reconcileProfileFields({ baseline: b, notion: n, psipedia: p, protectedFields: new Set() });
  assert.equal(result.kind, "CONFLICT");
  assert.equal(result.conflicts[0].reason, "AMBIGUOUS_SAME_FIELD");
});

test("semantic equality can repair a stale historical mapping hash without picking a winner", () => {
  const n = { photos: [{ alt: "photo", src: "photo.webp" }] };
  const p = { photos: [{ src: "photo.webp", alt: "photo" }] };
  const result = trustedProfileBaselineFromHashes({
    recorded: null, notion: n, psipedia: p,
    mappingHash: "historic", notionHash: "notion-different-order", psipediaHash: "admin-different-order",
  });
  assert.deepEqual(result, p);
  assert.equal(reconcileProfileFields({
    baseline: result, notion: n, psipedia: p, protectedFields: new Set(),
  }).kind, "UNCHANGED");
});

test("different edits with no verified baseline must still fail closed", () => {
  const result = trustedProfileBaselineFromHashes({
    recorded: null, notion: { title: "notion" }, psipedia: { title: "admin" },
    mappingHash: "old", notionHash: "n", psipediaHash: "p",
  });
  assert.equal(result, null);
  assert.equal(reconcileProfileFields({
    baseline: result, notion: { title: "notion" }, psipedia: { title: "admin" },
    protectedFields: new Set(),
  }).conflicts[0].reason, "BASELINE_UNAVAILABLE");
});

test("field-level equality can follow canonical Events/Help string and time normalization", async () => {
  const { stableAgendaSnapshotJson } = await import("../lib/notion-bidirectional-reconciliation.ts");
  const original = { "Popis": "Text", "Naposledy videný": "2026-10-20T12:00:00+02:00" };
  const notion = { "Popis": "  Text  ", "Naposledy videný": "2026-10-20T10:00:00Z" };
  const result = reconcileProfileFields({
    baseline: original, notion, psipedia: original, protectedFields: new Set(),
    equalField: (path, left, right) =>
      stableAgendaSnapshotJson("lost-found", { [path]: left })
      === stableAgendaSnapshotJson("lost-found", { [path]: right }),
  });
  assert.equal(result.kind, "UNCHANGED");
});

test("real Events/Help adapter uses canonical equality, strict ID parsing and privacy locks", async () => {
  const sync = await readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.ok(sync.includes('if (!/^[1-9]\\d*$/.test(source.id)) return null;'));
  assert.ok(sync.includes("equalField: (path, left, right) =>"));
  assert.ok(sync.includes("stableAgendaSnapshotJson(agenda, { [path]: left })"));
  const locks = await readFile(new URL("../lib/notion-field-authority.ts", import.meta.url), "utf8");
  assert.ok(locks.includes('events: ["Slug", "Stav", "Zrušené"]'));
  assert.ok(locks.includes('"Vyriešené", "Kontakt"'));
  assert.ok(locks.includes('"Zdroj", "Zdroj URL", "Miesto"'));
  assert.ok(sync.includes("pageIdentity.psipediaId && pageIdentity.psipediaId !== source.id"));
});


test("both profile adapters reject malformed IDs without rejecting valid numeric identities", async () => {
  const [directory, eventsHelp] = await Promise.all([
    readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8"),
  ]);
  // Source-level backslashes must be checked literally, not unescaped by JS.
  assert.equal(directory.includes(String.raw`if (!/^[1-9]\\d*$/.test(rawId)) return null;`), false);
  assert.ok(directory.includes(String.raw`if (!/^[1-9]\d*$/.test(rawId)) return null;`));
  assert.ok(eventsHelp.includes(String.raw`if (!/^[1-9]\d*$/.test(source.id)) return null;`));
  const valid = /^[1-9]\d*$/;
  for (const id of ["1", "42", "999999"]) assert.equal(valid.test(id), true);
  for (const id of ["", "0", "02", "42-other", "42\\d", "-1", "4.2", "0x2A"]) {
    assert.equal(valid.test(id), false, id);
  }
});

test("canonical-owned confirmed address mirrors to Notion while accepting a different Notion field", () => {
  const before = { address: "Hlavná 8", name: "Vet", description: "Old" };
  const result = reconcileProfileFields({
    baseline: before,
    notion: { ...before, description: "New from Notion" },
    psipedia: { ...before, address: "Hlavná 10" },
    protectedFields: new Set(["address"]), canonicalFieldsWin: true,
  });
  assert.equal(result.kind, "MERGE");
  assert.deepEqual(result.merged, { ...before, address: "Hlavná 10", description: "New from Notion" });
  assert.deepEqual(result.conflicts, []);
});
test("canonical-only address differs in Notion: mark as pending write-back, not conflict", () => {
  const before = { address: "Hlavná 10", name: "Vet" };
  const result = reconcileProfileFields({
    baseline: before, notion: { ...before, address: "Hlavná 8" },
    psipedia: before, protectedFields: new Set(["address"]), canonicalFieldsWin: true,
  });
  assert.equal(result.kind, "MERGE");
  assert.equal(result.merged.address, "Hlavná 10");
  assert.deepEqual(result.notionFields, ["address"]);
});
test("canonical authority never guesses the last writer of unrelated simultaneous edits", () => {
  const before = { address: "A", description: "Original" };
  const result = reconcileProfileFields({
    baseline: before,
    notion: { address: "B", description: "Notion" },
    psipedia: { address: "C", description: "Admin" },
    protectedFields: new Set(["address"]), canonicalFieldsWin: true,
  });
  assert.equal(result.kind, "CONFLICT");
  assert.deepEqual(result.conflicts.map(c => c.field), ["description"]);
  assert.equal(result.merged.address, "C");
});
test("directory sync exports canonical address through a scoped and echo-verified PATCH", async () => {
  const source = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const mapped = source.slice(source.indexOf("async function syncMappedPage("),
    source.indexOf("async function recoverMappingFromPage("));
  assert.match(mapped, /const addressKeys = \[/);
  assert.match(mapped, /await patchNotionPage\(input.bindings, latest.id, patch\)/);
  assert.match(mapped, /NOTION_DIRECTORY_ADDRESS_WRITEBACK_UNVERIFIED/);
  assert.match(mapped, /canonicalFieldsWin: true/);
});
test("events and all help agendas use canonical authority through shared reconciliation", async () => {
  const source = await readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8");
  assert.match(source, /canonicalFieldsWin: true/);
  assert.match(source, /const protectedFields = fixedNotionAgendaFields\(agenda\)/);
  assert.match(source, /if \(currentGooglePlace\)/);
  assert.match(source, /"Adresa", "Miesto", "Mesto", "Okres", "Kraj"/);
  const registry = await readFile(new URL("../lib/notion-field-authority.ts", import.meta.url), "utf8");
  assert.match(registry,/events: \["Slug", "Stav", "Zrušené"\]/);
});


test("missing-baseline reconciliation never guesses safe/latest concurrent edits", () => {
  const input = {
    notion: { name: "Notion title", seo: { title: "Same" }, status: "draft" },
    psipedia: { name: "Admin title", seo: { title: "Same" }, status: "published" },
    protectedFields: new Set(["status"]),
    canonicalFieldsWin: true,
  };
  const result = reconcileProfileFieldsWithoutBaseline(input);
  assert.equal(result.kind, "CONFLICT");
  assert.deepEqual(result.conflicts, [
    { field: "name", reason: "BASELINE_UNAVAILABLE" },
    { field: "status", reason: "PROTECTED_FIELD" },
  ]);
  assert.deepEqual(result.psipediaFields, []);
  assert.equal(result.merged.name, "Admin title");
  assert.equal(result.merged.status, "published");
  assert.equal(reconcileProfileFieldsWithoutBaseline({
    ...input, authorities: { name: "latest" },
  }).conflicts[0].reason, "BASELINE_UNAVAILABLE");
});

test("missing baseline can safely heal owner-selected nonempty field values", () => {
  const state = { name: "Old admin", excerpt: "Canonical excerpt", status: "published" };
  const notion = { name: "Editorial approved", excerpt: "Old notion", status: "published" };
  const result = reconcileProfileFieldsWithoutBaseline({
    notion, psipedia: state, protectedFields: new Set(["status"]),
    canonicalFieldsWin: true, authorities: { name: "notion", excerpt: "admin" },
  });
  assert.equal(result.kind, "MERGE");
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.notionFields, ["name"]);
  assert.deepEqual(result.psipediaFields, ["excerpt"]);
  assert.deepEqual(result.merged, { ...state, name: "Editorial approved" });
});

test("missing baseline never infers deletes, identity overrides or absent fields", () => {
  const canonical = { name: "Keep this title", services: ["a"], email: "owner@example.sk" };
  const notion = { name: "", services: [], email: "owner@example.sk" };
  const result = reconcileProfileFieldsWithoutBaseline({
    notion, psipedia: canonical,
    protectedFields: new Set(["services"]),
    canonicalFieldsWin: true, authorities: { name: "notion" },
  });
  assert.equal(result.kind, "CONFLICT");
  assert.ok(result.conflicts.some(x => x.field === "name" && x.reason === "UNVERIFIED_DELETE"));
  assert.deepEqual(result.psipediaFields, ["services"]);
  assert.deepEqual(result.merged, canonical);
  assert.equal(reconcileProfileFieldsWithoutBaseline({
    notion: { name: "notion", services: ["a"] },
    psipedia: { name: "admin", services: ["a"] },
    protectedFields: new Set(["name"]),
  }).conflicts[0].reason, "PROTECTED_FIELD");
  assert.equal(reconcileProfileFieldsWithoutBaseline({
    notion: { name: "Notion" }, psipedia: { name: "Admin", website: "" },
    protectedFields: new Set(), authorities: { name: "notion" },
  }).conflicts[0].reason, "MISSING_FIELD");
});

test("baseline-free reconciliation is idempotent for identical snapshots", () => {
  const a = { title: "same", seo: { title: "same", description: "" } };
  const b = { seo: { description: "", title: "same" }, title: "same" };
  const result = reconcileProfileFieldsWithoutBaseline({
    notion: b, psipedia: a, protectedFields: new Set(),
  });
  assert.equal(result.kind, "UNCHANGED");
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.notionFields, []);
  assert.deepEqual(result.psipediaFields, []);
});

test("Directory baseline-free recovery never advances a mapping on partial conflict", async () => {
  const sync = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
  const start = sync.indexOf("const resolution = baseline\n");
  const end = sync.indexOf("const desired = resolution.merged as EditableDirectorySnapshot", start);
  assert.ok(start > 0 && end > start);
  const section = sync.slice(start, end);
  assert.match(section, /reconcileProfileFieldsWithoutBaseline/);
  assert.match(section, /resolution\.psipediaFields\.length/);
  assert.match(section, /NOTION_DIRECTORY_PARTIAL_RECOVERY_REVISION_CHANGED/);
  assert.match(section, /NOTION_DIRECTORY_PARTIAL_RECOVERY_ECHO_MISMATCH/);
  assert.match(section, /LOSSLESS_FIELD_REVIEW_REQUIRED/);
  assert.doesNotMatch(section, /saveMapping\(/);
  assert.doesNotMatch(section, /recordProfileFieldBaseline\(/);
});

test("unverified identity and publication differences never auto-push under canonical priority", () => {
  const notion = { status: "archived", slug: "foreign-slug", category: "salony-a-sluzby" };
  const psipedia = { status: "published", slug: "canonical-slug", category: "veterinari" };
  const result = reconcileProfileFieldsWithoutBaseline({
    notion, psipedia, protectedFields: new Set(["status", "slug", "category"]),
    canonicalFieldsWin: true,
  });
  assert.equal(result.kind, "CONFLICT");
  assert.deepEqual(result.conflicts, [
    { field: "status", reason: "PROTECTED_FIELD" },
    { field: "slug", reason: "PROTECTED_FIELD" },
    { field: "category", reason: "PROTECTED_FIELD" },
  ]);
  assert.deepEqual(result.psipediaFields, []);
  assert.deepEqual(result.merged, psipedia);
});

test("V2 shared profile adapters enable verified changed-side precedence", async () => {
  for (const path of [
    "../lib/notion-directory-sync.ts",
    "../lib/notion-events-help-sync.ts",
    "../lib/notion-eshop-sync.ts",
  ]) {
    const code = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(code, /reconcileProfileFields\(\{[\s\S]*?changedSideWins: true,[\s\S]*?\}\)/, path);
  }
});

test("V2 shared policy preserves independent edits and never trusts obsolete authority", () => {
  const baseline = { title: "Old title", description: "Old text", status: "published" };
  for (const mode of ["safe", "notion", "admin", "latest"]) {
    const result = reconcileProfileFields({
      baseline,
      notion: { ...baseline, description: "New Notion text", status: "draft" },
      psipedia: { ...baseline, title: "New Admin title" },
      protectedFields: new Set(["status"]),
      canonicalFieldsWin: true,
      changedSideWins: true,
      authorities: { title: mode, description: mode, status: mode },
    });
    assert.equal(result.kind, "MERGE");
    assert.deepEqual(result.merged, {
      title: "New Admin title",
      description: "New Notion text",
      status: "published",
    });
  }
});


test("V2 field engine applies identical rules to all eight agendas", async () => {
  const { decideUnifiedField, UNIFIED_SYNC_AGENDAS } = await import("../lib/notion-unified-field-sync.ts");
  assert.equal(UNIFIED_SYNC_AGENDAS.length, 8);
  const present = (value) => ({ present: true, value });
  for (const agenda of UNIFIED_SYNC_AGENDAS) {
    const identity = { agenda, entityId: "42", pageId: "page-42", field: "description" };
    const base = { identity, baseline: { value: "old", version: "v1" } };
    const decide = (notion, psipedia, extra = {}) =>
      decideUnifiedField({ ...base, notion: present(notion), psipedia: present(psipedia), ...extra });
    assert.equal(decide("new", "old").action, "pull");
    assert.equal(decide("old", "new").action, "push");
    assert.equal(decide("same", "same", { baseline: null }).action, "unchanged");
    assert.equal(decide("new", "newer").reason, "AMBIGUOUS_SAME_FIELD");
    assert.equal(decide("", "old").reason, "UNVERIFIED_NOTION_CLEAR");
    assert.equal(decide("old", "").reason, "UNVERIFIED_ADMIN_CLEAR");
    assert.equal(decide("old", "new", { locked: true }).reason, "LOCKED");
    assert.equal(decide("old", "new", { protected: true }).reason, "PROTECTED_FIELD");
    assert.equal(decide("old", "new", { baseline: null }).reason, "BASELINE_UNAVAILABLE");
    assert.equal(decide("old", "new", { notion: { present: false } }).reason, "MISSING_FIELD");
    const notionEdit = { identity, source: "notion", baselineVersion: "v1", editId: "n1",
      value: "new", observedAt: "2026-11-25T09:00:00.000Z" };
    const psipediaEdit = { identity, source: "psipedia", baselineVersion: "v1", editId: "p1",
      value: "newer", observedAt: "2026-11-25T10:00:00.000Z" };
    assert.equal(decide("new", "newer", { notionEdit, psipediaEdit }).action, "push");
    assert.equal(decide("new", "newer", {
      notionEdit: { ...notionEdit, observedAt: "2026-11-25T11:00:00.000Z" }, psipediaEdit,
    }).action, "pull");
    assert.equal(decide("new", "newer", {
      notionEdit: { ...notionEdit, identity: { ...identity, pageId: "other" } }, psipediaEdit,
    }).reason, "AMBIGUOUS_SAME_FIELD");
    assert.equal(decide("new", "newer", {
      notionEdit, psipediaEdit: { ...psipediaEdit, baselineVersion: "stale" },
    }).reason, "AMBIGUOUS_SAME_FIELD");
    assert.equal(decide("new", "newer", {
      notionEdit: { ...notionEdit, value: "different" }, psipediaEdit,
    }).reason, "AMBIGUOUS_SAME_FIELD");
    assert.equal(decide("old", "", {
      psipediaEdit: { ...psipediaEdit, value: "", explicitClear: true },
    }).action, "push");
  }
});

test("V2 field state proposal preserves independent scoped observations with CAS", async () => {
  const { readUnifiedFieldState, writeUnifiedFieldState } = await import("../lib/notion-unified-field-state.ts");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql", import.meta.url), "utf8"));
    const adapter = { prepare(sql) { return { bind(...args) {
      return { async first() { return db.prepare(sql).get(...args) ?? null; } };
    } }; } };
    const id = { agenda: "events", entityId: "1", pageId: "page", field: "title" };
    const pending = { baseline: "old", notion: "old", psipedia: "new",
      notionEdit: undefined, psipediaEdit: undefined, status: "PENDING", reason: null };
    assert.equal(await writeUnifiedFieldState(adapter, id, null, pending), 1);
    assert.equal(await writeUnifiedFieldState(adapter, id, null, pending), null);
    assert.equal(await readUnifiedFieldState(adapter, { ...id, field: "description" }), null);
    assert.equal((await readUnifiedFieldState(adapter, id)).status, "PENDING");
    assert.equal(await writeUnifiedFieldState(adapter, id, 1, {
      ...pending, baseline: "new", notion: "new", status: "SYNCED",
    }), 2);
    assert.equal(await writeUnifiedFieldState(adapter, id, 1, pending), null);
    assert.equal((await readUnifiedFieldState(adapter, id)).baseline, "new");
  } finally { db.close(); }
});

test("V2 Admin receipt trigger binds only actual committed selected changes", async () => {
  const { commitEventAdminEdit, readUnifiedAdminEdit } = await import("../lib/notion-unified-admin-edits.ts");
  const db = new DatabaseSync(":memory:");
  try {
    const columns = "title event_type start_date start_time end_date end_time venue city region address organizer excerpt description practical_info contact_phone contact_email admission_fee website_url registration_url image_url image_alt internal_notes seo_json updated_at updated_by".split(" ");
    db.exec("CREATE TABLE managed_events(id INTEGER PRIMARY KEY," + columns.map(c => c + " TEXT").join(",") + ");");
    db.exec("CREATE TABLE event_notion_sync(event_id INTEGER PRIMARY KEY, notion_page_id TEXT, content_hash TEXT);");
    for (const file of ["0178_notion_unified_field_state.sql", "0179_notion_unified_admin_edits.sql"]) {
      db.exec(await readFile(new URL("../drizzle/" + file, import.meta.url), "utf8"));
    }
    db.exec("INSERT INTO managed_events(id,title,description,updated_at,updated_by,seo_json) VALUES(1,'old','keep','r1','admin','{}'); INSERT INTO event_notion_sync VALUES(1,'page','hash');");
    const adapter = {
      prepare(sql) { return { bind(...args) {
        return { sql, args, async first() { return db.prepare(sql).get(...args) ?? null; } };
      } }; },
      async batch(statements) {
        db.exec("BEGIN");
        try {
          const results = statements.map(({sql,args}) => {
            const stmt = db.prepare(sql);
            if (sql.includes("RETURNING")) return { success: true, results: stmt.all(...args) };
            stmt.run(...args);
            return { success: true, results: [] };
          });
          db.exec("COMMIT");
          return results;
        } catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    };
    const update = (expected, next, title) => adapter.prepare("UPDATE managed_events SET title=?,updated_at=?,updated_by='admin' WHERE id=1 AND updated_at=? RETURNING *").bind(title,next,expected);
    const info = { id: 1, expectedRevision: "r1", nextRevision: "r2", editor: "admin", fields: ["title","description"] };
    assert.equal(await commitEventAdminEdit(adapter, update("stale","r2","bad"), {...info, expectedRevision:"stale"}), null);
    assert.equal(db.prepare("SELECT count(*) AS n FROM notion_unified_admin_field_edits").get().n, 0);
    assert.equal((await commitEventAdminEdit(adapter, update("r1","r2","new"), info)).title,"new");
    const identity = { agenda:"events",entityId:"1",pageId:"page",field:"title" };
    const receipt = await readUnifiedAdminEdit(adapter,identity,"r2");
    assert.equal(receipt.value,"new");
    assert.equal(receipt.baselineVersion,"hash");
    assert.match(receipt.observedAt,/Z$/);
    assert.equal(await readUnifiedAdminEdit(adapter,{...identity,field:"description"},"r2"),undefined);
    assert.equal(db.prepare("SELECT count(*) AS n FROM notion_event_admin_edit_intent").get().n,0);
    db.exec("UPDATE managed_events SET title='remote',updated_at='r3',updated_by='notion' WHERE id=1");
    assert.equal(await readUnifiedAdminEdit(adapter,identity,"r3"),undefined);
    assert.equal(db.prepare("SELECT count(*) AS n FROM notion_unified_admin_field_edits").get().n,1);
  } finally { db.close(); }
});

test("V2 pending recovery verifies convergence without replaying uncertain writes", async () => {
  const { readUnifiedFieldState, writeUnifiedFieldState } = await import("../lib/notion-unified-field-state.ts");
  const { reserveUnifiedField } = await import("../lib/notion-unified-field-transfer.ts");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql", import.meta.url), "utf8"));
    const adapter = { prepare(sql) { return { bind(...args) {
      return { async first() { return db.prepare(sql).get(...args) ?? null; } };
    } }; } };
    const identity = {agenda:"events",entityId:"1",pageId:"p",field:"title"};
    const pending = {baseline:"old",notion:"old",psipedia:"new",notionEdit:undefined,psipediaEdit:undefined,status:"PENDING",reason:null};
    const present = value => ({present:true,value});
    const reserve = (n,p) => reserveUnifiedField({database:adapter,identity,historicalBaseline:null,notion:present(n),psipedia:present(p),direction:"push"});
    await writeUnifiedFieldState(adapter,identity,null,pending);
    await assert.rejects(reserve("old","new"),/PENDING_RECOVERY/);
    db.exec("UPDATE notion_unified_field_state SET updated_at='2000-01-01T00:00:00.000Z'");
    await assert.rejects(reserve("old","new"),/RECOVERY_DIVERGED/);
    assert.equal((await readUnifiedFieldState(adapter,identity)).status,"REVIEW");
    await assert.rejects(reserve("old","new"),/RECOVERY_DIVERGED/);
    assert.equal(await reserve("new","new"),null);
    assert.equal((await readUnifiedFieldState(adapter,identity)).baseline,"new");
  } finally { db.close(); }
});

test("V2 Directory receipts record only committed scalar and relational SQL changes", async () => {
  const { planDirectoryAdminReceipts, directoryFacetReceiptField,
    directoryMetadataReceiptField, directoryBreederRelationReceiptField } =
    await import("../lib/notion-directory-admin-receipts.ts");
  const db = new DatabaseSync(":memory:");
  try {
    const columns = "name excerpt description region district city address postal_code street house_number address_format price_note website_url public_phone public_email facebook_url instagram_url category updated_at updated_by".split(" ");
    db.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY," + columns.map(c => c + " TEXT").join(",") + ");");
    db.exec("CREATE TABLE directory_profile_seo(profile_id INTEGER PRIMARY KEY,title TEXT,description TEXT,focus_keyword TEXT,canonical_url TEXT,og_title TEXT,og_description TEXT,og_image_url TEXT);");
    db.exec(`
      CREATE TABLE directory_profile_qualifications(profile_id INTEGER,item_order INTEGER,qualification_text TEXT);
      CREATE TABLE directory_profile_service_texts(profile_id INTEGER,item_order INTEGER,service_text TEXT);
      CREATE TABLE directory_profile_extra_fields(profile_id INTEGER,field_key TEXT,value_kind TEXT,text_value TEXT);
      CREATE TABLE directory_profile_additional_categories(profile_id INTEGER,category TEXT);
      CREATE TABLE directory_profile_filter_values(profile_id INTEGER,category TEXT,filter_id TEXT,value_text TEXT);
      CREATE TABLE directory_profile_opening_hours(profile_id INTEGER,day_of_week INTEGER,hours_text TEXT);
      CREATE TABLE directory_profile_public_facts(profile_id INTEGER,field_key TEXT,value_text TEXT);
      CREATE TABLE breed_directory_relations(profile_id INTEGER,breed_id INTEGER);
      CREATE TABLE directory_breeder_club_relations(station_profile_id INTEGER,club_profile_id INTEGER);
      CREATE TABLE directory_notion_sync(directory_profile_id INTEGER PRIMARY KEY,notion_page_id TEXT,content_hash TEXT);
      CREATE TABLE managed_events(id INTEGER PRIMARY KEY,updated_at TEXT,updated_by TEXT);
      CREATE TABLE event_notion_sync(event_id INTEGER PRIMARY KEY,notion_page_id TEXT,content_hash TEXT);
    `);
    // SQLite validates event trigger column references only when executing that
    // trigger; this test uses only the Directory proposal tables.
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql", import.meta.url), "utf8"));
    const proposal = await readFile(new URL("../drizzle/0179_notion_unified_admin_edits.sql", import.meta.url), "utf8");
    db.exec(proposal.slice(proposal.indexOf("CREATE TABLE IF NOT EXISTS notion_unified_admin_field_edits"), proposal.indexOf("-- Trigger sees actual")));
    db.exec(proposal.slice(proposal.indexOf("-- Directory captures SQL")));
    db.exec(`INSERT INTO directory_profiles(id,name,description,category,updated_at,updated_by) VALUES(1,'Old','Keep','chovatelske-stanice','r1','admin');
      INSERT INTO directory_notion_sync VALUES(1,'page','hash');
      INSERT INTO directory_profile_qualifications VALUES(1,0,'old certificate');
      INSERT INTO directory_profile_service_texts VALUES(1,0,'old service');
      INSERT INTO directory_profile_additional_categories VALUES(1,'treneri');
      INSERT INTO directory_profile_filter_values VALUES(1,'chovatelske-stanice','filter','yes');
      INSERT INTO directory_profile_public_facts VALUES(1,'Organizácia','old');
      INSERT INTO breed_directory_relations VALUES(1,5);`);
    const adapter = { prepare(sql) { return { bind(...args) { return {sql,args}; } }; } };
    const run = statement => db.prepare(statement.sql).run(...statement.args);
    const plan = (expectedRevision,nextRevision) => planDirectoryAdminReceipts(adapter, {
      id:1, expectedRevision,nextRevision,editor:"admin",
      fields:["name","description","qualifications","services","additionalCategories"],
      structured:[directoryFacetReceiptField("chovatelske-stanice","filter"),
        directoryMetadataReceiptField("Organizácia","fact"),
        directoryBreederRelationReceiptField("breedIds")],
    });
    let edit = plan("stale","r2");
    db.exec("BEGIN");
    edit.before.forEach(run);
    db.exec("UPDATE directory_profiles SET updated_at='r2' WHERE id=1 AND updated_at='stale'");
    edit.after.forEach(run);
    db.exec("COMMIT");
    assert.equal(db.prepare("SELECT count(*) n FROM notion_unified_admin_field_edits").get().n,0);
    edit=plan("r1","r2");
    db.exec("BEGIN");
    edit.before.forEach(run);
    db.exec(`UPDATE directory_profiles SET name='New',updated_at='r2' WHERE id=1 AND updated_at='r1';
      DELETE FROM directory_profile_qualifications WHERE profile_id=1;
      UPDATE directory_profile_service_texts SET service_text='new service' WHERE profile_id=1;
      DELETE FROM directory_profile_additional_categories WHERE profile_id=1;
      DELETE FROM directory_profile_filter_values WHERE profile_id=1;
      UPDATE directory_profile_public_facts SET value_text='new' WHERE profile_id=1;
      UPDATE breed_directory_relations SET breed_id=6 WHERE profile_id=1;`);
    edit.after.forEach(run);
    db.exec("COMMIT");
    const receipts = Object.fromEntries(db.prepare("SELECT field_key,value_json,explicit_clear FROM notion_unified_admin_field_edits").all().map(row=>[row.field_key,[JSON.parse(row.value_json),row.explicit_clear]]));
    assert.deepEqual(receipts.name,["New",0]);
    assert.equal(receipts.description,undefined);
    assert.deepEqual(receipts.qualifications,[[],1]);
    assert.deepEqual(receipts.services,[["new service"],0]);
    assert.deepEqual(receipts.additionalCategories,[[],1]);
    assert.deepEqual(receipts["facet:chovatelske-stanice:filter"],[null,1]);
    assert.deepEqual(receipts["meta:Organizácia"],["new",0]);
    assert.deepEqual(receipts["relation:breedIds"],[[6],0]);
    assert.equal(db.prepare("SELECT count(*) n FROM notion_directory_admin_edit_intent").get().n,0);
  } finally { db.close(); }
});

test("V2 Directory structured sets retain populated values when Notion is blank", async () => {
  const { decideUnifiedField } = await import("../lib/notion-unified-field-sync.ts");
  for (const field of ["additionalCategories","qualifications","services","relation:breedIds"]) {
    const identity = {agenda:"directory",entityId:"1",pageId:"page",field};
    const baseline = {value:["previous"],version:"v1"};
    const observe = value => ({present:true,value});
    assert.equal(decideUnifiedField({identity,baseline,notion:observe([]),psipedia:observe(["previous"])}).reason,"UNVERIFIED_NOTION_CLEAR");
    assert.equal(decideUnifiedField({identity,baseline,notion:observe(["previous"]),psipedia:observe(["new"])}).action,"push");
    assert.equal(decideUnifiedField({identity,baseline,notion:observe(["new"]),psipedia:observe(["previous"])}).action,"pull");
  }
});

test("Breed V2 workcopy never treats absent cells or moderation as editorial edits", async () => {
  const {breedWorkcopyObservation,isUnifiedBreedEditorialField}=await import("../lib/notion-breed-unified-policy.ts");
  assert.deepEqual(breedWorkcopyObservation("",false),{present:false});
  assert.deepEqual(breedWorkcopyObservation(undefined,true),{present:false});
  assert.deepEqual(breedWorkcopyObservation([],true),{present:true,value:[]});
  assert.equal(isUnifiedBreedEditorialField("intro"),true);
  assert.equal(isUnifiedBreedEditorialField("controlled.heightMinCm"),true);
  for(const field of ["id","slug","status","seo.noindex","editorialComplete","relatedBreedIds","accent"])
    assert.equal(isUnifiedBreedEditorialField(field),false);
  const {decideUnifiedField}=await import("../lib/notion-unified-field-sync.ts");
  const identity={agenda:"breeds",entityId:"1",pageId:"p",field:"intro"};
  const present=value=>({present:true,value});
  assert.equal(decideUnifiedField({identity,baseline:null,notion:present("remote"),psipedia:present("SQL")}).reason,"BASELINE_UNAVAILABLE");
  assert.equal(decideUnifiedField({identity,baseline:{value:"old",version:"1"},notion:present(""),psipedia:present("old")}).reason,"UNVERIFIED_NOTION_CLEAR");
});

test("V2 organization receipts include actual scalar and canonical location edits only", async () => {
  const {commitOrganizationAdminEdit,commitOrganizationLocationAdminEdit,ORGANIZATION_V2_COLUMNS}=await import("../lib/notion-organization-admin-receipts.ts");
  const db=new DatabaseSync(":memory:");
  try {
    const columns=[...new Set([...Object.values(ORGANIZATION_V2_COLUMNS),"city","district","region","status","archived_at","updated_at","updated_by"])];
    db.exec("CREATE TABLE help_organizations(id INTEGER PRIMARY KEY,"+columns.map(c=>c+" TEXT").join(",")+");");
    db.exec("CREATE TABLE organization_locations(id INTEGER PRIMARY KEY,organization_id INTEGER,role TEXT,city TEXT,district TEXT,region TEXT,is_primary INTEGER,sort_order INTEGER); CREATE TABLE notion_agenda_sync(agenda TEXT,entity_id INTEGER,notion_page_id TEXT,content_hash TEXT);");
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
    const proposal=await readFile(new URL("../drizzle/0179_notion_unified_admin_edits.sql",import.meta.url),"utf8");
    db.exec(proposal.slice(proposal.indexOf("CREATE TABLE IF NOT EXISTS notion_unified_admin_field_edits"),proposal.indexOf("-- Trigger sees actual")));
    db.exec(await readFile(new URL("../drizzle/0180_notion_unified_help_receipts.sql",import.meta.url),"utf8"));
    db.exec("INSERT INTO help_organizations(id,name,description,public_email,city,status,updated_at,updated_by) VALUES(1,'Old','Keep','contact@example.com','Old town','PUBLISHED','2026-11-25T08:00:00.000Z','admin'); INSERT INTO notion_agenda_sync VALUES('organizations',1,'page','hash'); INSERT INTO organization_locations VALUES(1,1,'SITE','Town','','',1,0);");
    const adapter={
      prepare(sql){const wrap=args=>({sql,args,bind(...params){return wrap(params)},async first(){return db.prepare(sql).get(...args)??null}});return wrap([])},
      async batch(statements){
        db.exec("BEGIN");
        try{const results=statements.map(({sql,args})=>{
          const statement=db.prepare(sql);
          if(/^SELECT/i.test(sql))return {success:true,results:statement.all(...args)};
          const result=statement.run(...args);
          return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};
        });db.exec("COMMIT");return results}catch(error){db.exec("ROLLBACK");throw error}
      }
    };
    const before="2026-11-25T08:00:00.000Z",next="2026-11-25T08:00:01.000Z";
    const mutation=adapter.prepare("UPDATE help_organizations SET name=?,public_email=NULL,updated_at=?,updated_by='admin' WHERE id=1 AND updated_at=?");
    await assert.rejects(commitOrganizationAdminEdit(adapter,mutation.bind("Wrong",next,"stale"),{id:1,expectedRevision:"stale",nextRevision:next,editor:"admin"}));
    assert.equal(db.prepare("SELECT count(*) n FROM notion_unified_admin_field_edits").get().n,0);
    await commitOrganizationAdminEdit(adapter,mutation.bind("New",next,before),{id:1,expectedRevision:before,nextRevision:next,editor:"admin"});
    const receipts=()=>Object.fromEntries(db.prepare("SELECT field_key,value_json,explicit_clear FROM notion_unified_admin_field_edits").all().map(row=>[row.field_key,[JSON.parse(row.value_json),row.explicit_clear]]));
    assert.deepEqual(receipts()["Názov"],["New",0]);
    assert.deepEqual(receipts()["Verejný e-mail"],["",1]);
    assert.equal(receipts()["Popis"],undefined);
    await commitOrganizationLocationAdminEdit(adapter,adapter.prepare("UPDATE organization_locations SET city=? WHERE id=1").bind("New town"),1,"admin");
    assert.deepEqual(receipts()["Mesto"],["New town",0]);
    assert.equal(db.prepare("SELECT count(*) n FROM notion_help_admin_edit_intent").get().n,0);
    assert.notEqual(db.prepare("SELECT updated_at FROM help_organizations WHERE id=1").get().updated_at,next);
  } finally {db.close()}
});

test("V2 adoption Admin receipts preserve typed zero, false and explicit clears", async () => {
  const {ADOPTION_V2_FIELDS,commitAdoptionV2AdminEdit,adoptionV2Value}=await import("../lib/notion-adoption-v2-contract.ts");
  const {decideUnifiedField}=await import("../lib/notion-unified-field-sync.ts");
  const db=new DatabaseSync(":memory:");
  try {
    const columns=[...new Set([...Object.values(ADOPTION_V2_FIELDS).map(([column])=>column),"updated_at","updated_by"])];
    db.exec("CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY,"+columns.map(c=>c+" "+(["approximate_age_months","weight","breed_mix"].includes(c)?"NUMERIC":"TEXT")).join(",")+"); CREATE TABLE notion_agenda_sync(agenda TEXT,entity_id INTEGER,notion_page_id TEXT,content_hash TEXT);");
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
    const sql=await readFile(new URL("../drizzle/0179_notion_unified_admin_edits.sql",import.meta.url),"utf8");
    db.exec(sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS notion_unified_admin_field_edits"),sql.indexOf("-- Trigger sees actual")));
    db.exec(await readFile(new URL("../drizzle/0180_notion_unified_help_receipts.sql",import.meta.url),"utf8"));
    db.exec("INSERT INTO adoption_dogs(id,name,description,breed_mix,approximate_age_months,contact_phone,updated_at,updated_by) VALUES(1,'Dog','Keep',1,3,'123','r1','admin'); INSERT INTO notion_agenda_sync VALUES('adoptions',1,'page','hash');");
    const adapter={
      prepare(sql){const wrap=args=>({sql,args,bind(...params){return wrap(params)},async first(){return db.prepare(sql).get(...args)??null}});return wrap([])},
      async batch(statements){
        db.exec("BEGIN");
        try{const results=statements.map(({sql,args})=>{
          const stmt=db.prepare(sql);
          if(/^SELECT/i.test(sql))return {success:true,results:stmt.all(...args)};
          const result=stmt.run(...args);
          return {success:true,meta:{changes:Number(result.changes)}};
        });db.exec("COMMIT");return results}catch(error){db.exec("ROLLBACK");throw error}
      }
    };
    const mutation=adapter.prepare("UPDATE adoption_dogs SET breed_mix=0,approximate_age_months=0,contact_phone=NULL,updated_at='r2' WHERE id=1 AND updated_at=?");
    const input={id:1,expectedRevision:"r1",nextRevision:"r2",editor:"admin"};
    await assert.rejects(commitAdoptionV2AdminEdit(adapter,mutation.bind("stale"),{...input,expectedRevision:"stale"}));
    assert.equal(db.prepare("SELECT count(*) n FROM notion_unified_admin_field_edits").get().n,0);
    await commitAdoptionV2AdminEdit(adapter,mutation.bind("r1"),input);
    const receipts=Object.fromEntries(db.prepare("SELECT field_key,value_json,explicit_clear FROM notion_unified_admin_field_edits").all().map(row=>[row.field_key,[JSON.parse(row.value_json),row.explicit_clear]]));
    assert.deepEqual(receipts["Kríženec"],[false,0]);
    assert.deepEqual(receipts["Vek mesiace"],[0,0]);
    assert.deepEqual(receipts["Kontaktný telefón"],["",1]);
    assert.equal(receipts["Popis"],undefined);
    assert.equal(db.prepare("SELECT count(*) n FROM notion_help_admin_edit_intent").get().n,0);
    assert.equal(adoptionV2Value("Hmotnosť",null),null);
    assert.equal(adoptionV2Value("Vek mesiace",0),0);
    assert.equal(adoptionV2Value("Kríženec",0),false);
    const identity={agenda:"adoptions",entityId:"1",pageId:"page",field:"Kontaktný telefón"};
    const present=value=>({present:true,value});
    assert.equal(decideUnifiedField({identity,baseline:{value:"123",version:"hash"},notion:present(""),psipedia:present("123")}).reason,"UNVERIFIED_NOTION_CLEAR");
  }finally{db.close()}
});

test("V2 Lost/Found receipts exclude private contacts and roll back companion failures", async () => {
  const {LOST_FOUND_V2_FIELDS,LOST_FOUND_V2_PROTECTED,isLostFoundV2Field,lostFoundV2Kind,lostFoundV2Value,commitLostFoundV2AdminEdit}=await import("../lib/notion-lost-found-v2-contract.ts");
  const db=new DatabaseSync(":memory:");
  try {
    const columns=[...new Set([...Object.values(LOST_FOUND_V2_FIELDS).map(([column])=>column),"updated_at"])];
    db.exec("CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY,"+columns.map(c=>c+" TEXT").join(",")+"); CREATE TABLE notion_agenda_sync(agenda TEXT,entity_id INTEGER,notion_page_id TEXT,content_hash TEXT); CREATE TABLE lost_found_dog_private_details(report_id INTEGER PRIMARY KEY,encrypted_contact TEXT NOT NULL);");
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
    const sql=await readFile(new URL("../drizzle/0179_notion_unified_admin_edits.sql",import.meta.url),"utf8");
    db.exec(sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS notion_unified_admin_field_edits"),sql.indexOf("-- Trigger sees actual")));
    db.exec(await readFile(new URL("../drizzle/0180_notion_unified_help_receipts.sql",import.meta.url),"utf8"));
    db.exec("INSERT INTO lost_found_dog_reports(id,dog_name,short_description,description,last_seen_date_time,updated_at) VALUES(1,'Dog','Old','Keep','2026-11-22T08:00:00.000Z','r1'); INSERT INTO notion_agenda_sync VALUES('lost-found',1,'page','hash'); INSERT INTO lost_found_dog_private_details VALUES(1,'ciphertext');");
    const adapter={
      prepare(sql){const wrap=args=>({sql,args,bind(...params){return wrap(params)},async first(){return db.prepare(sql).get(...args)??null}});return wrap([])},
      async batch(statements){
        db.exec("BEGIN");
        try{const results=statements.map(({sql,args})=>{
          const stmt=db.prepare(sql);
          if(/^SELECT/i.test(sql))return {success:true,results:stmt.all(...args)};
          const result=stmt.run(...args);
          return {success:true,meta:{changes:Number(result.changes)}};
        });db.exec("COMMIT");return results}catch(error){db.exec("ROLLBACK");throw error}
      }
    };
    const mutation=adapter.prepare("UPDATE lost_found_dog_reports SET short_description='',last_seen_date_time='2026-11-22T09:00:00+01:00',updated_at='r2' WHERE id=1 AND updated_at=?");
    const input={id:1,expectedRevision:"r1",nextRevision:"r2",editor:"admin"};
    const privateWrite=adapter.prepare("UPDATE lost_found_dog_private_details SET encrypted_contact=? WHERE report_id=1");
    await assert.rejects(commitLostFoundV2AdminEdit(adapter,mutation.bind("stale"),{...input,expectedRevision:"stale",companionStatements:[privateWrite.bind("wrong")]}));
    await assert.rejects(commitLostFoundV2AdminEdit(adapter,mutation.bind("r1"),{...input,companionStatements:[privateWrite.bind(null)]}));
    assert.equal(db.prepare("SELECT updated_at FROM lost_found_dog_reports WHERE id=1").get().updated_at,"r1");
    assert.equal(db.prepare("SELECT encrypted_contact FROM lost_found_dog_private_details WHERE report_id=1").get().encrypted_contact,"ciphertext");
    assert.equal(db.prepare("SELECT count(*) n FROM notion_unified_admin_field_edits").get().n,0);
    await commitLostFoundV2AdminEdit(adapter,mutation.bind("r1"),{...input,companionStatements:[privateWrite.bind("new-ciphertext")]});
    const receipts=db.prepare("SELECT field_key,value_json,explicit_clear FROM notion_unified_admin_field_edits").all();
    assert.equal(receipts.length,1);
    assert.equal(receipts[0].field_key,"Krátky popis");
    assert.equal(JSON.parse(receipts[0].value_json),"");
    assert.equal(receipts[0].explicit_clear,1);
    assert.equal(db.prepare("SELECT count(*) n FROM notion_help_admin_edit_intent").get().n,0);
    for(const field of ["Latitude","Longitude","Miesto","Verejný kontakt","Verejný e-mail","Verejný telefón","Psipedia stav","Typ","Slug","Zdroj"]){
      assert.equal(isLostFoundV2Field(field),false);
      assert.equal(LOST_FOUND_V2_PROTECTED.has(field),true);
    }
    assert.equal(lostFoundV2Kind("Naposledy videný"),"instant");
    assert.equal(lostFoundV2Value("Naposledy videný","2026-11-22T09:00:00+01:00"),"2026-11-22T08:00:00.000Z");
  }finally{db.close()}
});

test("V2 generic Help receipts preserve typed amounts, SEO siblings and protected lifecycle", async () => {
  const {HELP_CASE_V2_FIELDS,HELP_CASE_V2_PROTECTED,helpCaseV2Kind,helpCaseV2Value,isHelpCaseV2Field,isHelpCaseV2SeoField,commitHelpCaseV2AdminEdit}=await import("../lib/notion-help-case-v2-contract.ts");
  const db=new DatabaseSync(":memory:");
  try {
    const columns=[...new Set([...Object.values(HELP_CASE_V2_FIELDS).map(([column])=>column),"updated_at","updated_by","seo_json","status","category","resolved","verified"])];
    db.exec("CREATE TABLE help_cases(id INTEGER PRIMARY KEY,"+columns.map(c=>c+" "+(["goal_amount","raised_amount","urgent","resolved","verified"].includes(c)?"NUMERIC":"TEXT")).join(",")+"); CREATE TABLE notion_agenda_sync(agenda TEXT,entity_id INTEGER,notion_page_id TEXT,content_hash TEXT);");
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
    const sql=await readFile(new URL("../drizzle/0179_notion_unified_admin_edits.sql",import.meta.url),"utf8");
    db.exec(sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS notion_unified_admin_field_edits"),sql.indexOf("-- Trigger sees actual")));
    db.exec(await readFile(new URL("../drizzle/0180_notion_unified_help_receipts.sql",import.meta.url),"utf8"));
    db.prepare("INSERT INTO help_cases(id,title,excerpt,goal_amount,raised_amount,urgent,seo_json,status,category,resolved,verified,updated_at,updated_by) VALUES(1,'Collection','Keep',100,20,1,?,'published','zbierky',0,1,'r1','admin')").run(JSON.stringify({title:"Old",description:"Keep",noindex:true,focusKeyword:"Preserve"}));
    db.exec("INSERT INTO notion_agenda_sync VALUES('help-cases',1,'page','hash');");
    const adapter={
      prepare(sql){const wrap=args=>({sql,args,bind(...params){return wrap(params)},async first(){return db.prepare(sql).get(...args)??null}});return wrap([])},
      async batch(statements){
        db.exec("BEGIN");
        try{const results=statements.map(({sql,args})=>{
          const stmt=db.prepare(sql);
          if(/^SELECT/i.test(sql))return {success:true,results:stmt.all(...args)};
          const result=stmt.run(...args);
          return {success:true,meta:{changes:Number(result.changes)}};
        });db.exec("COMMIT");return results}catch(error){db.exec("ROLLBACK");throw error}
      }
    };
    const mutation=adapter.prepare("UPDATE help_cases SET raised_amount=0,urgent=0,seo_json=json_set(seo_json,'$.title','New'),'updated_at'='r2' WHERE id=1 AND updated_at=?");
    const input={id:1,expectedRevision:"r1",nextRevision:"r2",editor:"admin"};
    await assert.rejects(commitHelpCaseV2AdminEdit(adapter,mutation.bind("stale"),{...input,expectedRevision:"stale"}));
    assert.equal(db.prepare("SELECT count(*) n FROM notion_unified_admin_field_edits").get().n,0);
    await commitHelpCaseV2AdminEdit(adapter,mutation.bind("r1"),input);
    const receipts=Object.fromEntries(db.prepare("SELECT field_key,value_json,explicit_clear FROM notion_unified_admin_field_edits").all().map(row=>[row.field_key,[JSON.parse(row.value_json),row.explicit_clear]]));
    assert.deepEqual(receipts["Vyzbierané"],[0,0]);
    assert.deepEqual(receipts["Urgentné"],[false,0]);
    assert.deepEqual(receipts["SEO title"],["New",0]);
    assert.equal(receipts["SEO popis"],undefined);
    assert.equal(receipts["Noindex"],undefined);
    assert.equal(JSON.parse(db.prepare("SELECT seo_json FROM help_cases WHERE id=1").get().seo_json).focusKeyword,"Preserve");
    assert.equal(db.prepare("SELECT count(*) n FROM notion_help_admin_edit_intent").get().n,0);
    for(const field of ["Slug","Kategória","Psipedia stav","Vyriešené","Noindex"]){
      assert.equal(HELP_CASE_V2_PROTECTED.has(field),true);
      assert.equal(isHelpCaseV2Field(field)||isHelpCaseV2SeoField(field),false);
    }
    assert.equal(helpCaseV2Kind("Cieľ"),"number");
    assert.equal(helpCaseV2Value("Cieľ",null),null);
    assert.equal(helpCaseV2Value("Vyzbierané",0),0);
    assert.equal(helpCaseV2Value("Urgentné",0),false);
  }finally{db.close()}
});

test("V2 Eshop evidence preserves array values and only canonical editable fields", async () => {
  const {commitEshopV2AdminEdit,observeEshopV2Property}=await import("../lib/notion-eshop-v2-contract.ts");
  const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_eshops(id INTEGER PRIMARY KEY,name TEXT,website_url TEXT,description TEXT,source_url TEXT,focus_tags_json TEXT,logo_url TEXT,updated_at TEXT,updated_by TEXT,status TEXT,slug TEXT); CREATE TABLE eshop_notion_sync(eshop_id INTEGER,notion_page_id TEXT,content_hash TEXT);");
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
    const sql=await readFile(new URL("../drizzle/0179_notion_unified_admin_edits.sql",import.meta.url),"utf8");
    db.exec(sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS notion_unified_admin_field_edits"),sql.indexOf("-- Trigger sees actual")));
    db.exec(await readFile(new URL("../drizzle/0180_notion_unified_help_receipts.sql",import.meta.url),"utf8"));
    db.prepare("INSERT INTO managed_eshops VALUES(1,'Shop','https://example.sk/','Keep','',?,'/media/eshops/logo.png','r1','admin','published','shop')").run(JSON.stringify(["Krmivo","Hračky"]));
    db.exec("INSERT INTO eshop_notion_sync VALUES(1,'page','hash');");
    const adapter={
      prepare(sql){const wrap=args=>({sql,args,bind(...params){return wrap(params)},async first(){return db.prepare(sql).get(...args)??null}});return wrap([])},
      async batch(statements){
        db.exec("BEGIN");
        try{const results=statements.map(({sql,args})=>{
          const stmt=db.prepare(sql);
          if(/^SELECT/i.test(sql))return {success:true,results:stmt.all(...args)};
          const result=stmt.run(...args);
          return {success:true,meta:{changes:Number(result.changes)}};
        });db.exec("COMMIT");return results}catch(error){db.exec("ROLLBACK");throw error}
      }
    };
    const mutation=adapter.prepare("UPDATE managed_eshops SET focus_tags_json='[]',description='',status='draft',updated_at='r2' WHERE id=1 AND updated_at=?");
    const input={id:1,expectedRevision:"r1",nextRevision:"r2",editor:"admin"};
    await assert.rejects(commitEshopV2AdminEdit(adapter,mutation.bind("stale"),{...input,expectedRevision:"stale"}));
    assert.equal(db.prepare("SELECT count(*) n FROM notion_unified_admin_field_edits").get().n,0);
    await commitEshopV2AdminEdit(adapter,mutation.bind("r1"),input);
    const receipts=Object.fromEntries(db.prepare("SELECT field_key,value_json,explicit_clear FROM notion_unified_admin_field_edits").all().map(row=>[row.field_key,[JSON.parse(row.value_json),row.explicit_clear]]));
    assert.deepEqual(receipts.focusTags,[[],1]);
    assert.deepEqual(receipts.description,["",1]);
    assert.equal(receipts.status,undefined);
    assert.equal(receipts.logoUrl,undefined);
    assert.equal(db.prepare("SELECT count(*) n FROM notion_help_admin_edit_intent").get().n,0);
    assert.deepEqual(observeEshopV2Property({Zameranie:{type:"multi_select",multi_select:[]}},"focusTags"),{present:true,value:[]});
    assert.deepEqual(observeEshopV2Property({Zameranie:{type:"rich_text",rich_text:[]}},"focusTags"),{present:false});
    assert.deepEqual(observeEshopV2Property({Zameranie:{type:"multi_select",multi_select:[{name:"Krmivo"},{name:"krmivo"}]}},"focusTags"),{present:false});
    assert.deepEqual(observeEshopV2Property({Popis:{type:"rich_text",rich_text:[{plain_text:"Line 1\r\nLine 2"}]}},"description"),{present:true,value:"Line 1\nLine 2"});
  }finally{db.close()}
});

test("V2 observation preserves confirmed baseline generation across review and retry; invalidation blocks historical fallback", async () => {
  const {readUnifiedFieldState,writeUnifiedFieldState}=await import("../lib/notion-unified-field-state.ts");
  const {reserveUnifiedField,confirmUnifiedField,assertUnifiedReservationCurrent}=await import("../lib/notion-unified-field-transfer.ts");
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
    const adapter={prepare(sql){const wrap=args=>({bind(...params){return wrap(params)},async first(){return db.prepare(sql).get(...args)??null}});return wrap([])}};
    const identity={agenda:"eshops",entityId:"1",pageId:"page",field:"description"};
    const p=value=>({present:true,value});
    const reserve=(n,a,direction,receipt)=>reserveUnifiedField({database:adapter,identity,historicalBaseline:{value:"old",version:"hash"},notion:p(n),psipedia:p(a),direction,psipediaEdit:receipt});
    await reserve("old","old","observe");
    const first=await readUnifiedFieldState(adapter,identity);
    const receipt={identity,source:"psipedia",baselineVersion:first.baselineVersion,editId:"a",observedAt:"2026-11-26T09:00:00.000Z",value:"",explicitClear:true};
    assert.equal(await reserve("old","","observe",receipt),null);
    const review=await readUnifiedFieldState(adapter,identity);
    assert.equal(review.baselineVersion,first.baselineVersion);
    assert.equal(review.reason,"RECOVERY_DIRECTION_REQUIRED");
    assert.ok(review.version>first.version);
    const reservation=await reserve("old","","push",receipt);
    assert.ok(reservation);
    await assertUnifiedReservationCurrent(adapter,reservation);
    await confirmUnifiedField(adapter,reservation,p(""),p(""));
    const synced=await readUnifiedFieldState(adapter,identity);
    assert.equal(synced.status,"SYNCED");
    assert.notEqual(synced.baselineVersion,first.baselineVersion);
    db.exec("DELETE FROM notion_unified_field_state; INSERT INTO notion_unified_scope_invalidation VALUES('eshops','1','now');");
    await reserve("old","new","observe");
    assert.equal((await readUnifiedFieldState(adapter,identity)).reason,"BASELINE_UNAVAILABLE");
    const state=await readUnifiedFieldState(adapter,identity);
    await writeUnifiedFieldState(adapter,identity,state.version,{...state,status:"REVIEW",reason:"SCOPE_INVALIDATED",baselineVersion:undefined,baseline:undefined});
    await assert.rejects(assertUnifiedReservationCurrent(adapter,reservation),/INVALIDATED/);
  }finally{db.close()}
});

test("V2 manual transfer fence blocks both insertion and update of automatic field reservations", async () => {
  const {acquireUnifiedManualFence,releaseUnifiedManualFence}=await import("../lib/notion-unified-manual-fence.ts");
  const {writeUnifiedFieldState,readUnifiedFieldState}=await import("../lib/notion-unified-field-state.ts");
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
    const sql=await readFile(new URL("../drizzle/0179_notion_unified_admin_edits.sql",import.meta.url),"utf8");
    db.exec(sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS notion_unified_admin_field_edits"),sql.indexOf("-- Trigger sees actual")));
    const adapter={
      prepare(sql){const wrap=args=>({sql,args,bind(...params){return wrap(params)},async first(){return db.prepare(sql).get(...args)??null}});return wrap([])},
      async batch(statements){
        db.exec("BEGIN");
        try{const results=statements.map(({sql,args})=>{const x=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(x.changes)}};});db.exec("COMMIT");return results;}
        catch(error){db.exec("ROLLBACK");throw error;}
      }
    };
    const id={agenda:"directory",entityId:"42",pageId:"page",field:"description"};
    const snapshot={baselineVersion:"old-version",baseline:"old",notion:"old",psipedia:"old",notionEdit:undefined,psipediaEdit:undefined,status:"SYNCED",reason:null};
    await writeUnifiedFieldState(adapter,id,null,{...snapshot,status:"PENDING"});
    await assert.rejects(acquireUnifiedManualFence(adapter,{scope:"directory:veterinari",profile_id:42}),/SCOPE_BUSY/);
    await writeUnifiedFieldState(adapter,id,1,snapshot);
    const fence=await acquireUnifiedManualFence(adapter,{scope:"directory:veterinari",profile_id:42});
    const state=await readUnifiedFieldState(adapter,id);
    assert.equal(state.reason,"SCOPE_INVALIDATED");
    assert.equal(state.baseline,undefined);
    assert.equal(await writeUnifiedFieldState(adapter,id,state.version,snapshot),null);
    assert.equal(await writeUnifiedFieldState(adapter,{...id,field:"name"},null,snapshot),null);
    assert.equal(await writeUnifiedFieldState(adapter,{...id,entityId:"43"},null,snapshot),1);
    // Stale token cannot mutate another owner's evidence or release the fence.
    await assert.rejects(releaseUnifiedManualFence(adapter,{...fence,token:"wrong"}),/FENCE_RELEASE_FAILED/);
    assert.equal((await readUnifiedFieldState(adapter,id)).version,state.version);
    assert.equal(db.prepare("SELECT owner_token FROM notion_unified_manual_fence").get().owner_token,fence.token);
    await releaseUnifiedManualFence(adapter,fence);
    const after=await readUnifiedFieldState(adapter,id);
    assert.ok(after.version>state.version);
    assert.equal(db.prepare("SELECT count(*) n FROM notion_unified_manual_fence").get().n,0);
    assert.equal(await writeUnifiedFieldState(adapter,id,after.version,snapshot),after.version+1);
  }finally{db.close()}
});

test("V2 numbered migrations install and invalidate only the affected record", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    const columns = "title event_type start_date start_time end_date end_time venue city region address organizer excerpt description practical_info contact_phone contact_email admission_fee website_url registration_url image_url image_alt internal_notes seo_json updated_at updated_by".split(" ");
    db.exec("CREATE TABLE managed_events(id INTEGER PRIMARY KEY," + columns.map((c) => c + " TEXT").join(",") + ");");
    db.exec(`
      CREATE TABLE directory_notion_sync(directory_profile_id INTEGER PRIMARY KEY, notion_page_id TEXT, content_hash TEXT);
      CREATE TABLE event_notion_sync(event_id INTEGER PRIMARY KEY, notion_page_id TEXT, content_hash TEXT);
      CREATE TABLE eshop_notion_sync(eshop_id INTEGER PRIMARY KEY, notion_page_id TEXT, content_hash TEXT);
      CREATE TABLE breed_notion_workcopy_links(breed_id INTEGER PRIMARY KEY, work_notion_page_id TEXT, status TEXT, work_data_source_id TEXT, content_hash TEXT);
      CREATE TABLE notion_agenda_sync(agenda TEXT, entity_id INTEGER, notion_page_id TEXT, content_hash TEXT, PRIMARY KEY(agenda,entity_id));
      CREATE TABLE admin_entity_reviews(entity_type TEXT, entity_id INTEGER, reviewed_at TEXT, PRIMARY KEY(entity_type,entity_id));
      CREATE TABLE directory_profile_review_state(profile_id INTEGER PRIMARY KEY, reviewed_at TEXT, unlock_pending INTEGER);
    `);
    const files = [
      "0178_notion_unified_field_state.sql",
      "0179_notion_unified_admin_edits.sql",
      "0180_notion_unified_help_receipts.sql",
      "0181_notion_unified_scope_invalidation.sql",
    ];
    for (let pass = 0; pass < 2; pass++) {
      for (const file of files) {
        db.exec(await readFile(new URL("../drizzle/" + file, import.meta.url), "utf8"));
      }
    }
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name GLOB 'unified_scope_*'").get().n, 20);
    const scope = [
      ["directory", "directory_notion_sync", "directory_profile_id", "notion_page_id"],
      ["events", "event_notion_sync", "event_id", "notion_page_id"],
      ["eshops", "eshop_notion_sync", "eshop_id", "notion_page_id"],
      ["breeds", "breed_notion_workcopy_links", "breed_id", "work_notion_page_id"],
      ...["organizations", "adoptions", "lost-found", "help-cases"].map((agenda) => [agenda, "notion_agenda_sync", "entity_id", "notion_page_id"]),
    ];
    function seed(agenda, id) {
      db.prepare("DELETE FROM notion_unified_scope_invalidation WHERE agenda=? AND entity_id=?").run(agenda, id);
      db.prepare("INSERT OR REPLACE INTO notion_unified_field_state(agenda,entity_id,notion_page_id,field_key,baseline_version,baseline_json,status,updated_at) VALUES(?,?, 'p','title','v','42','SYNCED','old')").run(agenda,id);
      db.prepare("INSERT OR REPLACE INTO notion_unified_admin_field_edits(agenda,entity_id,notion_page_id,field_key,edit_id,baseline_version,canonical_revision,observed_at,value_json,explicit_clear) VALUES(?,?,'p','title','edit','v','r','old','42',0)").run(agenda,id);
    }
    function verify(agenda, id, invalidated) {
      const state = db.prepare("SELECT status,baseline_version,baseline_json,reason FROM notion_unified_field_state WHERE agenda=? AND entity_id=?").get(agenda,id);
      assert.equal(state.status, invalidated ? "REVIEW" : "SYNCED");
      assert.equal(state.baseline_version, invalidated ? null : "v");
      assert.equal(state.baseline_json, invalidated ? null : "42");
      assert.equal(state.reason, invalidated ? "SCOPE_INVALIDATED" : null);
      assert.equal(db.prepare("SELECT count(*) AS n FROM notion_unified_admin_field_edits WHERE agenda=? AND entity_id=?").get(agenda,id).n, invalidated ? 0 : 1);
      assert.equal(db.prepare("SELECT count(*) AS n FROM notion_unified_scope_invalidation WHERE agenda=? AND entity_id=?").get(agenda,id).n, invalidated ? 1 : 0);
    }
    for (const [agenda,table,id,page] of scope) {
      const generic = table === "notion_agenda_sync";
      const predicate = id + "=1" + (generic ? " AND agenda='" + agenda + "'" : "");
      const insert = "INSERT INTO " + table + "(" + (generic ? "agenda," : "") + id + "," + page + ") VALUES(" + (generic ? "'" + agenda + "'," : "") + "1,'p')";
      seed(agenda, "1");
      seed(agenda, "2");
      db.exec(insert);
      verify(agenda,"1",true);
      verify(agenda,"2",false);
      seed(agenda,"1");
      db.exec("UPDATE " + table + " SET content_hash='new' WHERE " + predicate);
      verify(agenda,"1",false);
      db.exec("UPDATE " + table + " SET " + page + "='changed' WHERE " + predicate);
      verify(agenda,"1",true);
      verify(agenda,"2",false);
      seed(agenda,"1");
      db.exec("DELETE FROM " + table + " WHERE " + predicate);
      verify(agenda,"1",true);
      verify(agenda,"2",false);
    }
    for (const [type,agenda] of [["EVENT","events"],["ORGANIZATION","organizations"],["ADOPTION","adoptions"],["LOST_FOUND","lost-found"],["HELP_CASE","help-cases"]]) {
      seed(agenda,"1");
      db.prepare("INSERT INTO admin_entity_reviews VALUES(?,1,'reviewed')").run(type);
      verify(agenda,"1",true);
      seed(agenda,"1");
      db.prepare("DELETE FROM admin_entity_reviews WHERE entity_type=? AND entity_id=1").run(type);
      verify(agenda,"1",true);
      verify(agenda,"2",false);
    }
    seed("directory","1");
    db.exec("INSERT INTO directory_profile_review_state VALUES(1,'reviewed',0)");
    verify("directory","1",true);
    seed("directory","1");
    db.exec("UPDATE directory_profile_review_state SET unlock_pending=1 WHERE profile_id=1");
    verify("directory","1",true);
    seed("directory","1");
    db.exec("DELETE FROM directory_profile_review_state WHERE profile_id=1");
    verify("directory","1",true);
    verify("directory","2",false);
    assert.equal(db.prepare("PRAGMA quick_check").get().quick_check,"ok");
  } finally {
    db.close();
  }
});


test("Retired visual accent is not an editorial or recovery field", async () => {
  const { BREED_NOTION_PRIORITY_FIELDS } = await import("../lib/notion-breed-property-registry.ts");
  const { breedWorkcopyEventValues } = await import("../lib/notion-breed-workcopy-field-values.mjs");
  assert.equal(BREED_NOTION_PRIORITY_FIELDS.some((field) => field.id === "accent"), false);
  const page = { properties: { "Farba akcentu": { id: "accent", type: "select", select: { name: "coral" } } } };
  const schema = [{ notion: "Farba akcentu", id: "accent", type: "select", mode: "content" }];
  assert.deepEqual(breedWorkcopyEventValues(page, ["accent"], schema, true), { values: [], failures: [] });
  for (const path of ["../lib/notion-unified-recovery.ts", "../lib/notion-unified-diagnostics.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /NOT \(agenda=\x27breeds\x27 AND field_key=\x27accent\x27\)/);
  }
});

test("V2 initial fill is explicit, non-destructive and available across eight agendas", async () => {
  const {decideUnifiedField,UNIFIED_SYNC_AGENDAS}=await import("../lib/notion-unified-field-sync.ts");
  const p=value=>({present:true,value});
  for(const agenda of UNIFIED_SYNC_AGENDAS){
    const identity={agenda,entityId:"1",pageId:"p",field:"sample"};
    const decide=(n,a,extra={})=>decideUnifiedField({identity,baseline:null,notion:p(n),psipedia:p(a),initializeEmpty:true,...extra});
    assert.deepEqual(decide(null,3),{action:"push",value:3});
    assert.deepEqual(decide("filled",""),{action:"pull",value:"filled"});
    assert.deepEqual(decide(null,0),{action:"push",value:0});
    assert.deepEqual(decide(null,false),{action:"push",value:false});
    assert.equal(decide(0,1).reason,"BASELINE_UNAVAILABLE");
    assert.equal(decide(false,true).reason,"BASELINE_UNAVAILABLE");
    assert.equal(decide("old","new").reason,"BASELINE_UNAVAILABLE");
    assert.equal(decide(null,3,{initializeEmpty:false}).reason,"BASELINE_UNAVAILABLE");
    assert.equal(decide(null,3,{notion:{present:false}}).reason,"MISSING_FIELD");
    assert.equal(decide(null,3,{locked:true}).reason,"LOCKED");
    assert.equal(decide(null,3,{protected:true}).reason,"PROTECTED_FIELD");
    assert.equal(decide(null,3,{baseline:{value:3,version:"v"}}).reason,"UNVERIFIED_NOTION_CLEAR");
    assert.equal(decide("old","",{baseline:{value:"old",version:"v"}}).reason,"UNVERIFIED_ADMIN_CLEAR");
  }
});
test("V2 initial fill requires an observed scoped marker; never replays uncertainty", async()=>{
  const {reserveUnifiedField,confirmUnifiedField}=await import("../lib/notion-unified-field-transfer.ts");
  const {readUnifiedFieldState}=await import("../lib/notion-unified-field-state.ts");
  const db=new DatabaseSync(":memory:");
  try{
    for(const f of ["0178_notion_unified_field_state.sql","0179_notion_unified_admin_edits.sql"]){
      if(f.startsWith("0179"))db.exec("CREATE TABLE managed_events(id INTEGER PRIMARY KEY, updated_at TEXT, updated_by TEXT); CREATE TABLE event_notion_sync(event_id INTEGER,notion_page_id TEXT,content_hash TEXT);");
      db.exec(await readFile(new URL("../drizzle/"+f,import.meta.url),"utf8"));
    }
    const adapter={prepare(sql){return{bind(...args){return{async first(){return db.prepare(sql).get(...args)??null;}};}};}};
    const p=value=>({present:true,value});
    const identity={agenda:"breeds",entityId:"1",pageId:"p",field:"apartment"};
    const reserve=(n,a,direction,id=identity)=>reserveUnifiedField({database:adapter,identity:id,historicalBaseline:null,notion:p(n),psipedia:p(a),direction});
    await assert.rejects(reserve(null,3,"push"),/BASELINE_UNAVAILABLE/);
    await reserve(null,3,"observe");
    assert.equal((await readUnifiedFieldState(adapter,identity)).reason,"INITIAL_FILL_PUSH");
    const claim=await reserve(null,3,"push");
    assert.equal(claim.value,3);
    await confirmUnifiedField(adapter,claim,p(3),p(3));
    assert.equal((await readUnifiedFieldState(adapter,identity)).status,"SYNCED");
    await assert.rejects(reserve(null,3,"push"),/UNVERIFIED_NOTION_CLEAR/);
    const changed={...identity,field:"energy"};
    await reserve(null,4,"observe",changed);
    await assert.rejects(reserve(null,5,"push",changed),/INITIAL_FILL_CHANGED/);
    await reserve(null,5,"observe",changed);
    assert.equal((await readUnifiedFieldState(adapter,changed)).reason,"INITIAL_FILL_CHANGED");
    const inbound={...identity,entityId:"2",field:"intro"};
    await reserve("text","", "observe",inbound);
    const pull=await reserve("text","","pull",inbound);
    assert.equal(pull.value,"text");
    await confirmUnifiedField(adapter,pull,p("text"),p("text"));
    db.exec("INSERT INTO notion_unified_scope_invalidation VALUES('breeds','3','now')");
    const blocked={...identity,entityId:"3"};
    await reserve(null,3,"observe",blocked);
    assert.equal((await readUnifiedFieldState(adapter,blocked)).reason,"BASELINE_UNAVAILABLE");
    await assert.rejects(reserve(null,3,"push",blocked),/BASELINE_UNAVAILABLE/);
  }finally{db.close();}
});

test("V2 breed recovery excludes only logical fields without a physical workcopy mapping", async()=>{
  const {isUnifiedBreedEditorialField,NON_MIRRORED_BREED_FIELDS,nonMirroredBreedPredicate}=await import("../lib/notion-breed-unified-policy.ts");
  for(const field of ["accent","family","fciGroup","fciSection","fciSectionNumber","editorial.heroTraits","editorial.coatTip","editorial.exerciseTip","editorial.trainingTip","editorial.healthTip"]){
    assert.ok(NON_MIRRORED_BREED_FIELDS.includes(field),field);
    assert.equal(isUnifiedBreedEditorialField(field),false,field);
  }
  for(const field of ["apartment","children","exercise","editorial.coatCare","fciStandard.telo","fciNumber","controlled.heightMinCm"])
    assert.equal(isUnifiedBreedEditorialField(field),true,field);
  const db=new DatabaseSync(":memory:");
  try{
    db.exec("CREATE TABLE t(agenda TEXT,field_key TEXT,status TEXT,reason TEXT); INSERT INTO t VALUES('breeds','accent','REVIEW','MISSING_FIELD'),('breeds','exercise','REVIEW','MISSING_FIELD'),('events','accent','REVIEW','MISSING_FIELD'),('breeds','family','PENDING',NULL)");
    const pred="(status='REVIEW' AND reason='MISSING_FIELD' AND "+nonMirroredBreedPredicate()+")";
    assert.equal(db.prepare("SELECT count(*) n FROM t WHERE "+pred).get().n,1);
    assert.equal(db.prepare("SELECT count(*) n FROM t WHERE status='PENDING' AND "+pred).get().n,0);
  }finally{db.close();}
});
test("V2 instant offset validator accepts real timezone offsets rather than literal backslashes", async()=>{
  const source=await readFile(new URL("../lib/notion-help-v2-field-transport.ts",import.meta.url),"utf8");
  const expected=/(Z|[+-]\d{2}:\d{2})$/i;
  assert.equal(source.split(expected.toString()).length,3);
  for(const input of ["2026-10-19T02:00:00+02:00","2026-10-19T00:00:00Z"])
    assert.equal(expected.test(input),true);
  assert.equal(expected.test("2026-10-19"),false);
});

test("V2 recovery can fill confirmed blank Notion fields without inventing a receipt", async()=>{
  const {isConfirmedBlankPush,UNIFIED_SYNC_AGENDAS}=await import("../lib/notion-unified-field-sync.ts");
  const p=value=>({present:true,value});
  for(const agenda of UNIFIED_SYNC_AGENDAS){
    const identity={agenda,entityId:"1",pageId:"p",field:"sample"};
    const check=(base,n,a)=>isConfirmedBlankPush({identity,baseline:{value:base,version:"v"},notion:p(n),psipedia:p(a)});
    for(const value of ["https://example.com/photo.webp",false,0,["a"]])assert.equal(check("","",value),true);
    for(const values of [["","remote","local"],["old","","local"],["old","old","local"],["","",""],["",null,"local"],["","",{}]])assert.equal(check(...values),false);
    assert.equal(isConfirmedBlankPush({identity,baseline:null,notion:p(""),psipedia:p("local")}),false);
    assert.equal(isConfirmedBlankPush({identity,baseline:{value:"",version:"v"},notion:{present:false},psipedia:p("local")}),false);
  }
});
test("V2 confirmed-blank recovery marker requires fresh pair, stable scope and no edit receipt",async()=>{
  const {reserveUnifiedField,confirmUnifiedField}=await import("../lib/notion-unified-field-transfer.ts");
  const {readUnifiedFieldState}=await import("../lib/notion-unified-field-state.ts");
  const db=new DatabaseSync(":memory:");
  try{
    for(const f of ["0178_notion_unified_field_state.sql","0179_notion_unified_admin_edits.sql"]){
      if(f.startsWith("0179"))db.exec("CREATE TABLE managed_events(id INTEGER PRIMARY KEY, updated_at TEXT, updated_by TEXT); CREATE TABLE event_notion_sync(event_id INTEGER,notion_page_id TEXT,content_hash TEXT);");
      db.exec(await readFile(new URL("../drizzle/"+f,import.meta.url),"utf8"));
    }
    const adapter={prepare(sql){return{bind(...args){return{async first(){return db.prepare(sql).get(...args)??null;}};}};}};
    const p=value=>({present:true,value});
    const key=id=>({agenda:"organizations",entityId:String(id),pageId:"p",field:"Facebook"});
    const reserve=(id,n,a,direction,baseline="")=>reserveUnifiedField({database:adapter,identity:key(id),historicalBaseline:{value:baseline,version:"v"},notion:p(n),psipedia:p(a),direction});
    const mark=async id=>{
      await reserve(id,"","url","observe");
      assert.equal((await readUnifiedFieldState(adapter,key(id))).reason,"RECOVERY_DIRECTION_REQUIRED");
      await reserve(id,"","url","observe");
      assert.equal((await readUnifiedFieldState(adapter,key(id))).reason,"CONFIRMED_BLANK_PUSH");
    };
    await mark(1);
    const claim=await reserve(1,"","url","push");
    assert.equal(claim.value,"url");
    await confirmUnifiedField(adapter,claim,p("url"),p("url"));
    assert.equal((await readUnifiedFieldState(adapter,key(1))).status,"SYNCED");
    await mark(2);
    await assert.rejects(reserve(2,"","changed","push"),/CONFIRMED_BLANK_CHANGED/);
    await mark(3);
    await assert.rejects(reserve(3,"remote","url","push"),/CONFIRMED_BLANK_CHANGED/);
    await mark(4);
    db.exec("INSERT INTO notion_unified_scope_invalidation VALUES('organizations','4','now')");
    await assert.rejects(reserve(4,"","url","push"),/CONFIRMED_BLANK_CHANGED/);
    await mark(5);
    db.exec("INSERT INTO notion_unified_manual_fence(agenda,entity_id,owner_token,started_at) VALUES('organizations','5','owner','now')");
    await assert.rejects(reserve(5,"","url","push"),/UNIFIED_FIELD_CONCURRENT_RESERVATION/);
    await mark(6);
    db.prepare("INSERT INTO notion_unified_admin_field_edits(agenda,entity_id,notion_page_id,field_key,edit_id,baseline_version,canonical_revision,observed_at,value_json,explicit_clear) VALUES(?,?,?,?,?,?,?,?,?,?)").run("organizations","6","p","Facebook","edit","v","rev","2026-11-27T08:00:00.000Z",JSON.stringify("url"),0);
    await assert.rejects(reserve(6,"","url","push"),/CONFIRMED_BLANK_CHANGED/);
  }finally{db.close();}
});


test("profile authority: all eight agendas use validated Notion values without a baseline", async () => {
  const { decideUnifiedField, UNIFIED_SYNC_AGENDAS } = await import("../lib/notion-unified-field-sync.ts");
  assert.equal(UNIFIED_SYNC_AGENDAS.length, 8);
  assert.ok(!UNIFIED_SYNC_AGENDAS.includes("articles"));
  const present = value => ({present:true,value});
  for (const agenda of UNIFIED_SYNC_AGENDAS) {
    const identity = {agenda,entityId:"42",pageId:"page",field:"description"};
    const profileAuthority = {owner:"notion",fieldAllowed:true,notionValidated:true};
    const input = {identity, baseline:null, notion:present("new"), psipedia:present("old"), profileAuthority};
    const decide = patch => decideUnifiedField({...input,...patch});
    assert.deepEqual(decide({}), {action:"pull",value:"new"}, agenda);
    assert.deepEqual(decide({baseline:{value:"new",version:"v1"}}), {action:"pull",value:"new"});
    assert.deepEqual(decide({psipedia:present("new")}), {action:"unchanged",value:"new"});
    for (const value of ["",null,[],false,0]) {
      assert.deepEqual(decide({notion:present(value)}), {action:"pull",value}, agenda);
    }
    for (const owner of ["admin","partner","unlocking"]) {
      assert.deepEqual(decide({profileAuthority:{...profileAuthority,owner}}), {action:"review",reason:"LOCKED"});
    }
    assert.deepEqual(decide({locked:true}), {action:"review",reason:"LOCKED"});
    assert.deepEqual(decide({protected:true}), {action:"review",reason:"PROTECTED_FIELD"});
    assert.deepEqual(decide({profileAuthority:{...profileAuthority,fieldAllowed:false}}), {action:"review",reason:"PROTECTED_FIELD"});
    assert.deepEqual(decide({profileAuthority:{...profileAuthority,notionValidated:false},notion:present(null)}), {action:"review",reason:"INVALID_NOTION_FIELD"});
    assert.deepEqual(decide({profileAuthority:{...profileAuthority,notionValidated:false},psipedia:present("new")}), {action:"review",reason:"INVALID_NOTION_FIELD"});
    for (const absent of [{present:false},present(undefined)]) {
      assert.deepEqual(decide({notion:absent}), {action:"review",reason:"MISSING_FIELD"});
      assert.deepEqual(decide({psipedia:absent}), {action:"review",reason:"MISSING_FIELD"});
    }
    assert.deepEqual(decide({profileAuthority:undefined}), {action:"review",reason:"BASELINE_UNAVAILABLE"});
    assert.deepEqual(decide({notion:present(""),initializeEmpty:true}), {action:"pull",value:""});
  }
});


test("shared review transition fences every agenda and unlocks only after verified transfer and CAS", async () => {
  const {runUnifiedReviewTransition,isUnifiedManualFenceActive,releaseUnifiedManualFence} = await import("../lib/notion-unified-manual-fence.ts");
  const {UNIFIED_SYNC_AGENDAS} = await import("../lib/notion-unified-field-sync.ts");
  const {writeUnifiedFieldState} = await import("../lib/notion-unified-field-state.ts");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
    const sql=await readFile(new URL("../drizzle/0179_notion_unified_admin_edits.sql",import.meta.url),"utf8");
    db.exec(sql.slice(sql.indexOf("CREATE TABLE IF NOT EXISTS notion_unified_admin_field_edits"),sql.indexOf("-- Trigger sees actual")));
    const adapter={
      prepare(sql){const wrap=args=>({sql,args,bind(...params){return wrap(params)},async first(){return db.prepare(sql).get(...args)??null}});return wrap([])},
      async batch(statements){
        db.exec("BEGIN");
        try{const results=statements.map(({sql,args})=>{const x=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(x.changes)}};});db.exec("COMMIT");return results;}
        catch(error){db.exec("ROLLBACK");throw error;}
      }
    };
    for (const agenda of UNIFIED_SYNC_AGENDAS) {
      const link={scope:agenda,profile_id:42};
      const identity={agenda,entityId:"42",pageId:"page",field:"description"};
      const state={baselineVersion:"old",baseline:"old",notion:"old",psipedia:"old",status:"PENDING",reason:null};
      let reviewed=false, calls=[];
      const snapshot={revision:"r1",content:{description:"",phone:"original"}};
      const guard=async()=>{
        assert.equal(await isUnifiedManualFenceActive(adapter,link),true);
        assert.equal(await writeUnifiedFieldState(adapter,identity,null,state),null);
      };
      await runUnifiedReviewTransition(adapter,link,{kind:"lock",async saveAndLock(){await guard();calls.push("save+lock");reviewed=true;return true}});
      assert.equal(reviewed,true);
      assert.equal(await isUnifiedManualFenceActive(adapter,link),false);
      const operation={kind:"unlock",
        async readLockedSnapshot(){await guard();assert.equal(reviewed,true);calls.push("snapshot");return snapshot},
        async transferAndVerify(_,value){await guard();assert.equal(reviewed,true);assert.deepEqual(value,snapshot);calls.push("transfer+verify");return true},
        async unlockIfCurrent(_,value){await guard();assert.deepEqual(value,snapshot);assert.equal(reviewed,true);calls.push("unlock CAS");reviewed=false;return true}
      };
      await runUnifiedReviewTransition(adapter,link,operation);
      assert.deepEqual(calls,["save+lock","snapshot","transfer+verify","unlock CAS"]);
      assert.equal(reviewed,false);
      assert.equal(await isUnifiedManualFenceActive(adapter,link),false);
      reviewed=true;
      let finalized=false;
      for (const failure of ["remote","revision","lock"]) {
        const failing=failure==="lock" ? {kind:"lock",async saveAndLock(){await guard();return false}} : {
          ...operation,
          async transferAndVerify(){await guard();return failure!=="remote"},
          async unlockIfCurrent(){await guard();finalized=true;return false}
        };
        await assert.rejects(runUnifiedReviewTransition(adapter,link,failing),
          /REVIEW_(UNLOCK_TRANSFER_UNVERIFIED|UNLOCK_REVISION_CHANGED|LOCK_NOT_CONFIRMED)/);
        assert.equal(reviewed,true);
        assert.equal(finalized,failure==="revision");
        assert.equal(await isUnifiedManualFenceActive(adapter,link),true);
        await assert.rejects(runUnifiedReviewTransition(adapter,link,operation),/SCOPE_BUSY/);
        // Simulate operator-verified recovery in this isolated fixture only.
        const token=db.prepare("SELECT owner_token FROM notion_unified_manual_fence WHERE agenda=? AND entity_id=?").get(agenda,"42").owner_token;
        await releaseUnifiedManualFence(adapter,{agenda,entityId:"42",token});
        finalized=false;
      }
    }
  } finally { db.close(); }
});


test("authority reservation across all eight mapped agendas rejects missing raw text and blocks ordinary push",async()=>{
  const {reserveUnifiedField,assertUnifiedReservationCurrent,isVerifiedAuthorityText}=await import("../lib/notion-unified-field-transfer.ts");
  const {readUnifiedFieldState}=await import("../lib/notion-unified-field-state.ts");
  const db=new DatabaseSync(":memory:");
  try{
    db.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
    db.exec(`
      CREATE TABLE admin_record_tombstones(kind TEXT,record_id INTEGER);
      CREATE TABLE admin_entity_reviews(entity_type TEXT,entity_id INTEGER,reviewed_at TEXT,reviewed_by TEXT);
      CREATE TABLE directory_profile_review_state(profile_id INTEGER,reviewed_at TEXT,unlock_pending INTEGER);
      CREATE TABLE partner_resources(id TEXT,entity_type TEXT,directory_profile_id INTEGER,managed_event_id INTEGER,help_organization_id INTEGER);
      CREATE TABLE partner_memberships(resource_id TEXT,revoked_at TEXT);
      CREATE TABLE partner_help_claims(status TEXT,adoption_dog_id INTEGER,lost_found_report_id INTEGER,help_case_id INTEGER);
      CREATE TABLE notion_agenda_sync(agenda TEXT,entity_id INTEGER,notion_page_id TEXT);
      CREATE TABLE directory_notion_sync(directory_profile_id INTEGER,notion_page_id TEXT);
      CREATE TABLE breed_notion_workcopy_links(breed_id INTEGER,work_notion_page_id TEXT,status TEXT,work_last_error_code TEXT);
      CREATE TABLE event_notion_sync(event_id INTEGER,notion_page_id TEXT);
      CREATE TABLE eshop_notion_sync(eshop_id INTEGER,notion_page_id TEXT);
      INSERT INTO directory_notion_sync VALUES(1,'p');
      INSERT INTO breed_notion_workcopy_links VALUES(1,'p','ACTIVE',NULL);
      INSERT INTO event_notion_sync VALUES(1,'p');
      INSERT INTO eshop_notion_sync VALUES(1,'p');
    `);
    const rows=[
      ["directory","directory_profiles","excerpt",null],
      ["breeds","managed_breeds","seo.title","BREED"],
      ["events","managed_events","excerpt","EVENT"],
      ["organizations","help_organizations","Krátky popis","ORGANIZATION"],
      ["adoptions","adoption_dogs","Krátky popis","ADOPTION"],
      ["lost-found","lost_found_dog_reports","Krátky popis","LOST_FOUND"],
      ["help-cases","help_cases","Perex","HELP_CASE"],
      ["eshops","managed_eshops","description","ESHOP"],
    ];
    const database={prepare(sql){const wrap=args=>({bind(...v){return wrap(v)},async first(){return db.prepare(sql).get(...args)??null}});return wrap([])}};
    const present=value=>({present:true,value});
    const raw={type:"rich_text",rich_text:[{type:"text",plain_text:"new"}]};
    assert.equal(isVerifiedAuthorityText({type:"rich_text",rich_text:[]},present("")),true);
    assert.equal(isVerifiedAuthorityText({type:"url",url:null},present("")),false);
    assert.equal(isVerifiedAuthorityText({type:"rich_text",rich_text:[{}]},present("")),false);
    assert.equal(isVerifiedAuthorityText({type:"rich_text",rich_text:[],has_more:true},present("")),false);
    assert.equal(isVerifiedAuthorityText({type:"rich_text",rich_text:Array(25).fill({plain_text:""})},present("")),false);
    for(const [agenda,table,field,type] of rows){
      db.exec("CREATE TABLE "+table+"(id INTEGER PRIMARY KEY,status TEXT); INSERT INTO "+table+" VALUES(1,'draft')");
      if(["organizations","adoptions","lost-found","help-cases"].includes(agenda))
        db.prepare("INSERT INTO notion_agenda_sync VALUES(?,1,'p')").run(agenda);
      const identity={agenda,entityId:"1",pageId:"p",field};
      const input={database,identity,historicalBaseline:null,notion:present("new"),psipedia:present("old"),
        authorityBindings:{NOTION_PROFILE_AUTHORITY_MODE:"validated-text"},authorityProperty:raw};
      await assert.rejects(reserveUnifiedField({...input,direction:"push"}),/NOTION_AUTHORITY_PULL_REQUIRED/);
      assert.equal(await reserveUnifiedField({...input,direction:"observe"}),null);
      assert.equal((await readUnifiedFieldState(database,identity)).reason,"NOTION_AUTHORITY_PULL_REQUIRED");
      await assert.rejects(reserveUnifiedField({...input,direction:"pull",authorityProperty:undefined,notion:present("")}),/INVALID_NOTION_FIELD/);
      const reservation=await reserveUnifiedField({...input,direction:"pull",authorityProperty:{type:"rich_text",rich_text:[]},notion:present("")});
      assert.equal(reservation.value,"");
      await assertUnifiedReservationCurrent(database,reservation);
      if(type)db.prepare("INSERT INTO admin_entity_reviews VALUES(?,1,'now','admin')").run(type);
      else db.exec("INSERT INTO directory_profile_review_state VALUES(1,'now',0)");
      await assert.rejects(assertUnifiedReservationCurrent(database,reservation),/UNIFIED_FIELD_AUTHORITY_CHANGED/);
    }
  }finally{db.close()}
});


test("raw authority observations preserve typed blank, zero, false and exact list values",async()=>{
  const {isVerifiedAuthorityProperty:verified}=await import("../lib/notion-unified-field-transfer.ts");
  const present=value=>({present:true,value});
  for(const [raw,value] of [
    [{type:"number",number:0},0],[{type:"number",number:null},null],
    [{type:"checkbox",checkbox:false},false],[{type:"url",url:null},""],
    [{type:"select",select:null},""],[{type:"date",date:{start:"2026-11-27",end:null}},"2026-11-27"],
    [{type:"multi_select",multi_select:[{name:"Krmivo"}]},["Krmivo"]],
    [{type:"multi_select",multi_select:[]},[]],
  ]) assert.equal(verified(raw,present(value)),true);
  for(const [raw,value] of [
    [{type:"number"},null],[{type:"checkbox",checkbox:"false"},false],
    [{type:"url",url:false},""],[{type:"select",select:{}},""],
    [{type:"date",date:{start:"2026-02-30"}},"2026-02-30"],
    [{type:"multi_select",multi_select:[{name:"Krmivo"},{name:"Krmivo"}]},["Krmivo","Krmivo"]],
    [{type:"multi_select",multi_select:[],has_more:true},[]],
  ]) assert.equal(verified(raw,present(value)),false);
});


test("first-create uses a durable fence, verifies the exact copy, and never retries uncertain POST",async()=>{
  const {runInNewContext}=await import("node:vm");
  const ts=(await import("typescript")).default;
  const {acquireUnifiedManualFence,releaseUnifiedManualFence}=await import("../lib/notion-unified-manual-fence.ts");
  const {sameNotionProperty}=await import("../lib/notion-selective-property-patch.ts");
  const {notionPageBelongsToDataSource}=await import("../lib/notion-sync-page-ownership.ts");
  const code=await readFile(new URL("../lib/notion-profile-first-create.ts",import.meta.url),"utf8");
  const section=code.slice(code.indexOf("type Page=")).replace("export async function ensureFirstProfileNotionCopy","async function ensureFirstProfileNotionCopy");
  const js=ts.transpileModule(section,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const sourceId="76d9ccde-5816-422c-bcfe-863ab69db080";
  const pageId="11111111-1111-4111-8111-111111111111";
  for(const agenda of ["eshops","breeds"])for(const mode of ["success","timeout-after-create","duplicate","bad-schema","wrong-echo"]){
    const sqlite=new DatabaseSync(":memory:");
    try{
      sqlite.exec(await readFile(new URL("../drizzle/0178_notion_unified_field_state.sql",import.meta.url),"utf8"));
      sqlite.exec(`
        CREATE TABLE notion_unified_admin_field_edits(agenda TEXT,entity_id TEXT);
        CREATE TABLE admin_record_tombstones(kind TEXT,record_id INTEGER);
        CREATE TABLE managed_breeds(id INTEGER PRIMARY KEY,status TEXT,updated_at TEXT,slug TEXT,fci_number INTEGER);
        INSERT INTO managed_breeds VALUES(42,\'draft\',\'revision\',\'new-breed\',NULL);
        CREATE TABLE breed_notion_sync(breed_id INTEGER);
        CREATE TABLE admin_entity_reviews(entity_type TEXT,entity_id INTEGER);
        INSERT INTO admin_entity_reviews VALUES(\'BREED\',42);
        CREATE TABLE breed_notion_workcopy_links(breed_id INTEGER PRIMARY KEY,original_notion_page_id TEXT,original_data_source_id TEXT,original_sync_receipt TEXT,fci_number INTEGER,work_notion_page_id TEXT UNIQUE,work_data_source_id TEXT,canonical_slug TEXT,work_sync_receipt TEXT,work_last_synced_at TEXT,work_notion_last_edited_time TEXT,status TEXT,verified_at TEXT,activated_at TEXT,created_at TEXT,updated_at TEXT);
        CREATE TABLE breed_notion_controlled_values(breed_id INTEGER PRIMARY KEY,values_json TEXT,notion_values_json TEXT,revision INTEGER,updated_at TEXT);
        CREATE TABLE managed_eshops(id INTEGER PRIMARY KEY,status TEXT,updated_at TEXT);
        INSERT INTO managed_eshops VALUES(42,'draft','revision');
        CREATE TABLE eshop_notion_sync(notion_page_id TEXT UNIQUE,eshop_id INTEGER UNIQUE,content_hash TEXT,
          notion_last_edited_time TEXT,psipedia_updated_at TEXT,last_synced_at TEXT,created_at TEXT,updated_at TEXT);
      `);
      const database={
        prepare(sql){const wrap=args=>({sql,args,bind(...params){return wrap(params)},async first(){return sqlite.prepare(sql).get(...args)??null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const x=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(x.changes)}}}});return wrap([])},
        async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error}}
      };
      const source={properties:{"Psipedia ID":{type:"rich_text"},"Popis":{type:"rich_text"},"Odkontrolované":{type:mode==="bad-schema"?"number":"checkbox"}}};
      const rich=value=>({rich_text:[{text:{content:value}}]});
      const snapshot=async()=>({revision:"revision",hash:"hash",reviewed:true,...(agenda==="breeds"?{breedControlledValues:{originCountries:[]}}:{}),properties:{"Psipedia ID":rich("42"),Popis:rich("text")}});
      let posts=0,remote=null;
      const notionRequest=async(_bindings,path,init,options)=>{
        if(path.endsWith("/query"))return {results:mode==="duplicate"?[{id:pageId},{id:"other"}]:remote?[remote]:[],has_more:false};
        if(path.startsWith("/data_sources/"))return source;
        if(path==="/pages"&&init.method==="POST"){
          posts++;assert.equal(options.retryTransient,false);
          const payload=JSON.parse(init.body);
          const properties=Object.fromEntries(Object.entries(payload.properties).map(([name,value])=>[name,{...value,type:Object.keys(value)[0]}]));
          remote={id:pageId,parent:{type:"data_source_id",data_source_id:sourceId},properties,last_edited_time:"now"};
          if(mode==="timeout-after-create")throw Error("TIMEOUT_AFTER_CREATE");
          if(mode==="wrong-echo")remote.properties.Popis={type:"rich_text",rich_text:[]};
          return remote;
        }
        if(path==="/pages/"+pageId&&remote)return remote;
        throw Error("unexpected provider operation "+path);
      };
      const context={acquireUnifiedManualFence,releaseUnifiedManualFence,sameNotionProperty,notionPageBelongsToDataSource,notionRequest,
        notionRichTextProperty:(page,name)=>page.properties?.[name]?.rich_text?.map(part=>part.text.content).join("")??""};
      runInNewContext(js,context);
      const run=()=>context.ensureFirstProfileNotionCopy({database,bindings:{NOTION_PROFILE_AUTHORITY_MODE:"validated-text"},agenda,id:42,sourceId,snapshot});
      if(mode==="success"){
        assert.equal((await run()).created,true);assert.equal((await run()).created,false);
        assert.equal(posts,1);assert.equal(sqlite.prepare("SELECT count(*) AS n FROM "+(agenda==="breeds"?"breed_notion_workcopy_links":"eshop_notion_sync")).get().n,1);
        assert.equal(remote.properties.Odkontrolované.checkbox,true);
        if(agenda==="breeds"){
          assert.equal(sqlite.prepare("SELECT original_notion_page_id FROM breed_notion_workcopy_links").get().original_notion_page_id,null);
          assert.deepEqual(JSON.parse(sqlite.prepare("SELECT values_json FROM breed_notion_controlled_values").get().values_json),{originCountries:[]});
        }
        assert.equal(sqlite.prepare("SELECT count(*) AS n FROM notion_unified_manual_fence").get().n,0);
      }else{
        await assert.rejects(run());
        assert.equal(sqlite.prepare("SELECT count(*) AS n FROM "+(agenda==="breeds"?"breed_notion_workcopy_links":"eshop_notion_sync")).get().n,0);
        assert.equal(posts,mode==="timeout-after-create"||mode==="wrong-echo"?1:0);
        if(mode!=="bad-schema"){assert.equal(sqlite.prepare("SELECT count(*) AS n FROM notion_unified_manual_fence").get().n,1);await assert.rejects(run(),/SCOPE_BUSY/);}
        assert.equal(posts,mode==="timeout-after-create"||mode==="wrong-echo"?1:0);
      }
    }finally{sqlite.close();}
  }
});


test("E-shop save and review lock roll back together on canonical CAS failure",async()=>{
  const {commitHelpV2AdminEdit}=await import("../lib/notion-help-v2-admin-receipts.ts");
  const sqlite=new DatabaseSync(":memory:");
  try{
    sqlite.exec(`
      CREATE TABLE managed_eshops(id INTEGER PRIMARY KEY, name TEXT,updated_at TEXT,updated_by TEXT);
      INSERT INTO managed_eshops VALUES(1,'old','rev1','editor');
      CREATE TABLE eshop_notion_sync(eshop_id INTEGER,notion_page_id TEXT,content_hash TEXT);
      CREATE TABLE notion_help_admin_edit_intent(edit_id TEXT,agenda TEXT,entity_id INTEGER,notion_page_id TEXT,before_json TEXT);
      CREATE TABLE notion_unified_field_state(agenda TEXT,entity_id TEXT,notion_page_id TEXT,field_key TEXT,baseline_version TEXT);
      CREATE TABLE notion_unified_admin_field_edits(agenda TEXT,entity_id TEXT,notion_page_id TEXT,field_key TEXT,edit_id TEXT,baseline_version TEXT,canonical_revision TEXT,observed_at TEXT,value_json TEXT,explicit_clear INTEGER,
        PRIMARY KEY(agenda,entity_id,notion_page_id,field_key));
      CREATE TABLE admin_entity_reviews(entity_type TEXT,entity_id INTEGER,reviewed_at TEXT,reviewed_by TEXT,PRIMARY KEY(entity_type,entity_id));
    `);
    const database={
      prepare(sql){const wrap=args=>({bind(...params){return wrap(params)},async run(){const x=sqlite.prepare(sql).run(...args);return {success:true,meta:{changes:Number(x.changes)}}}});return wrap([])},
      async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec("COMMIT");return results;}catch(error){sqlite.exec("ROLLBACK");throw error}}
    };
    const save=(expected,next,failReview=false)=>commitHelpV2AdminEdit(database,
      database.prepare("UPDATE managed_eshops SET name=?,updated_at=?,updated_by=? WHERE id=1 AND updated_at=?").bind("new",next,"editor",expected),
      {agenda:"eshops",table:"managed_eshops",projection:"json_object('name',p.name)",id:1,expectedRevision:expected,nextRevision:next,editor:"editor",
        companionStatements:[
          database.prepare("INSERT OR IGNORE INTO admin_entity_reviews SELECT 'ESHOP',id,updated_at,updated_by FROM managed_eshops WHERE id=1 AND updated_at=?").bind(next),
          database.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type='ESHOP' AND entity_id=?) THEN 1 ELSE json_extract('ESHOP_REVIEW_LOCK_FAILED','$') END").bind(failReview?99:1)
        ]});
    await assert.rejects(save("stale","rev2"));
    assert.equal(sqlite.prepare("SELECT name FROM managed_eshops").get().name,"old");
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM admin_entity_reviews").get().n,0);
    await assert.rejects(save("rev1","rev2",true));
    assert.equal(sqlite.prepare("SELECT name FROM managed_eshops").get().name,"old");
    assert.equal(sqlite.prepare("SELECT count(*) AS n FROM admin_entity_reviews").get().n,0);
    await save("rev1","rev2");
    assert.equal(sqlite.prepare("SELECT name FROM managed_eshops").get().name,"new");
    assert.equal(sqlite.prepare("SELECT reviewed_at FROM admin_entity_reviews").get().reviewed_at,"rev2");
    await save("rev2","rev3");
    assert.equal(sqlite.prepare("SELECT reviewed_at FROM admin_entity_reviews").get().reviewed_at,"rev2","retain first review timestamp");
  }finally{sqlite.close();}
});


test("V3 E-shop lifecycle proposal preserves existing ledger and protects ratings",async()=>{
  const db=new DatabaseSync(":memory:");
  const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
  try{
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE review_authors(id TEXT PRIMARY KEY); INSERT INTO review_authors VALUES('a')");
    for(const table of ["directory_profiles","managed_events","help_cases","managed_breeds","managed_articles","adoption_dogs","lost_found_dog_reports","help_organizations"])
      db.exec("CREATE TABLE "+table+"(id INTEGER PRIMARY KEY,slug TEXT,status TEXT,import_key TEXT,fci_number INTEGER)");
    db.exec(await read("drizzle/0100_eshop_ratings.sql"));
    db.exec(await read("drizzle/0164_admin_record_lifecycle.sql"));
    db.exec("INSERT INTO admin_record_tombstones(kind,record_id,record_slug,record_name,record_category,state,created_by,created_at,updated_at) VALUES('directory',42,'old','Old','directory','COMPLETE','owner','old','old')");
    db.exec("INSERT INTO admin_record_publication_guards VALUES('directory',43,'PENDING',NULL,'old')");
    const old=db.prepare("SELECT * FROM admin_record_tombstones").all(),guards=db.prepare("SELECT * FROM admin_record_publication_guards").all();
    const migration=await read("docs/proposals/notion-v3-eshop-lifecycle-UNNUMBERED_PROPOSAL.sql");
    db.exec("BEGIN;"+migration+"COMMIT;");
    assert.deepEqual(db.prepare("SELECT * FROM admin_record_tombstones").all(),old);
    assert.deepEqual(db.prepare("SELECT * FROM admin_record_publication_guards").all(),guards);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name LIKE 'admin_%'").get().n,27);
    assert.throws(()=>db.exec("INSERT INTO directory_profiles(id,slug,status) VALUES(42,'old','draft')"),/RECORD_TOMBSTONED/);
    const shop=db.prepare("SELECT id,slug,website_url FROM managed_eshops LIMIT 1").get();
    assert.throws(()=>db.prepare("DELETE FROM managed_eshops WHERE id=?").run(shop.id),/USE_VERIFIED_LIFECYCLE_DELETE/);
    db.prepare("INSERT INTO admin_record_tombstones(kind,record_id,record_slug,record_external_key,record_name,record_category,state,created_by,created_at,updated_at) VALUES('eshops',?,?,?,'Shop','eshops','PENDING_NOTION','owner','now','now')").run(shop.id,shop.slug,shop.website_url.replace(/\/+$/,"").toLowerCase());
    db.prepare("UPDATE managed_eshops SET status='draft' WHERE id=?").run(shop.id);
    assert.throws(()=>db.prepare("UPDATE managed_eshops SET status='published' WHERE id=?").run(shop.id),/RECORD_REMOVAL_PENDING/);
    assert.throws(()=>db.prepare("DELETE FROM managed_eshops WHERE id=?").run(shop.id),/USE_VERIFIED_LIFECYCLE_DELETE/);
    db.prepare("INSERT INTO eshop_ratings VALUES('r',?,'a',5,5,5,5,5,'now','now')").run(shop.id);
    db.prepare("UPDATE admin_record_tombstones SET state='READY_LOCAL' WHERE kind='eshops' AND record_id=?").run(shop.id);
    assert.throws(()=>db.prepare("DELETE FROM managed_eshops WHERE id=?").run(shop.id),/FOREIGN KEY/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM eshop_ratings").get().n,1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  }finally{db.close();}
});

test("V3 breed work-only proposal keeps historical originals and rejects partial identities",async()=>{
  const db=new DatabaseSync(":memory:");
  const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
  try{
    db.exec("PRAGMA foreign_keys=ON; CREATE TABLE managed_breeds(id INTEGER PRIMARY KEY,status TEXT DEFAULT 'draft',fci_group INTEGER DEFAULT 0,energy INTEGER DEFAULT 0,trainability INTEGER DEFAULT 0,family INTEGER DEFAULT 0,children INTEGER DEFAULT 0,other_dogs INTEGER DEFAULT 0,apartment INTEGER DEFAULT 0,grooming INTEGER DEFAULT 0,shedding INTEGER DEFAULT 0,prey_drive INTEGER DEFAULT 0); INSERT INTO managed_breeds(id) VALUES(1),(2),(3)");
    db.exec(await read("drizzle/0178_notion_unified_field_state.sql"));
    db.exec("CREATE TABLE notion_unified_admin_field_edits(agenda TEXT,entity_id TEXT)");
    db.exec(await read("drizzle/0159_breed_notion_workcopy_links.sql"));
    const oldTriggers=(await read("drizzle/0181_notion_unified_scope_invalidation.sql")).match(/CREATE TRIGGER IF NOT EXISTS \w+\n[\s\S]*?\nEND;/g).filter(x=>/ON breed_notion_workcopy_links\b/.test(x));
    db.exec(oldTriggers.join("\n"));
    db.exec("INSERT INTO breed_notion_workcopy_links(breed_id,original_notion_page_id,work_notion_page_id,original_data_source_id,work_data_source_id,canonical_slug,fci_number,original_sync_receipt,status,activated_at) VALUES(1,'old','work1','legacy','work','breed1',10,'receipt','ACTIVE','then')");
    const old=db.prepare("SELECT * FROM breed_notion_workcopy_links").get();
    const migration=await read("docs/proposals/notion-v3-breed-workonly-links-UNNUMBERED_PROPOSAL.sql");
    db.exec("BEGIN;"+migration+"COMMIT;");
    assert.deepEqual(db.prepare("SELECT * FROM breed_notion_workcopy_links WHERE breed_id=1").get(),old);
    db.exec("INSERT INTO breed_notion_workcopy_links(breed_id,work_notion_page_id,work_data_source_id,canonical_slug,status,activated_at) VALUES(2,'work2','work','breed2','ACTIVE','now')");
    assert.equal(db.prepare("SELECT original_notion_page_id FROM breed_notion_workcopy_links WHERE breed_id=2").get().original_notion_page_id,null);
    assert.throws(()=>db.exec("UPDATE managed_breeds SET status='published' WHERE id=2"),/BREED_DRAFT_REQUIRED_VALUES/);
    db.exec("UPDATE managed_breeds SET fci_group=1,energy=1,trainability=1,family=1,children=1,other_dogs=1,apartment=1,grooming=1,shedding=1,prey_drive=1 WHERE id=2");
    db.exec("UPDATE breed_notion_workcopy_links SET work_last_error_code='INBOUND_ID_PENDING' WHERE breed_id=2");
    assert.throws(()=>db.exec("UPDATE managed_breeds SET status='published' WHERE id=2"),/BREED_DRAFT_REQUIRED_VALUES/);
    db.exec("UPDATE breed_notion_workcopy_links SET work_last_error_code=NULL WHERE breed_id=2");
    db.exec("UPDATE managed_breeds SET status='published' WHERE id=2");
    assert.throws(()=>db.exec("INSERT INTO breed_notion_workcopy_links(breed_id,original_notion_page_id,work_notion_page_id,work_data_source_id,canonical_slug,status,activated_at) VALUES(3,'fake','work3','work','breed3','ACTIVE','now')"),/CHECK constraint/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM notion_unified_scope_invalidation WHERE agenda='breeds' AND entity_id='2'").get().n,1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(),[]);
  }finally{db.close();}
});


test("shared atomic review-on-save preserves prior reviews and aborts stale canonical writes",async()=>{
  const {reviewOnSaveStatements}=await import("../lib/admin-review-on-save.ts");
  const {commitEventAdminEdit}=await import("../lib/notion-unified-admin-edits.ts");
  const {commitHelpV2AdminEdit}=await import("../lib/notion-help-v2-admin-receipts.ts");
  for(const [type,table] of [["EVENT","managed_events"],["ADOPTION","adoption_dogs"]]){
    const sqlite=new DatabaseSync(":memory:");
    try{
      sqlite.exec(`
        CREATE TABLE ${table}(id INTEGER PRIMARY KEY,name TEXT,updated_at TEXT,updated_by TEXT);
        INSERT INTO ${table} VALUES(1,'old','r1','admin');
        CREATE TABLE admin_entity_reviews(entity_type TEXT,entity_id INTEGER,reviewed_at TEXT,reviewed_by TEXT,PRIMARY KEY(entity_type,entity_id));
        CREATE TABLE notion_agenda_sync(agenda TEXT,entity_id INTEGER,notion_page_id TEXT,content_hash TEXT);
        CREATE TABLE notion_help_admin_edit_intent(edit_id TEXT,agenda TEXT,entity_id INTEGER,notion_page_id TEXT,before_json TEXT);
        CREATE TABLE notion_unified_field_state(agenda TEXT,entity_id TEXT,notion_page_id TEXT,field_key TEXT,baseline_version TEXT);
        CREATE TABLE notion_unified_admin_field_edits(agenda TEXT,entity_id TEXT,notion_page_id TEXT,field_key TEXT,edit_id TEXT,baseline_version TEXT,canonical_revision TEXT,observed_at TEXT,value_json TEXT,explicit_clear INTEGER,
          PRIMARY KEY(agenda,entity_id,notion_page_id,field_key));
      `);
      const db={
        prepare(sql){const wrap=args=>({sql,args,bind(...v){return wrap(v)},async run(){
          const p=sqlite.prepare(sql),rows=/RETURNING|^SELECT/i.test(sql)?p.all(...args):(p.run(...args),[]);
          return {success:true,results:rows,meta:{changes:sqlite.prepare("SELECT changes() n").get().n}};
        }});return wrap([])},
        async batch(statements){sqlite.exec("BEGIN");try{const results=[];for(const s of statements)results.push(await s.run());sqlite.exec("COMMIT");return results;}catch(e){sqlite.exec("ROLLBACK");throw e}}
      };
      const save=(expected,next,wrongReview=false)=>{
        const statement=db.prepare("UPDATE "+table+" SET name=?,updated_at=?,updated_by=? WHERE id=1 AND updated_at=?"+(type==="EVENT"?" RETURNING *":"")).bind("new",next,"admin",expected);
        const companionStatements=reviewOnSaveStatements(db,{type,id:wrongReview?99:1,revision:next,actor:"admin"});
        const options={id:1,expectedRevision:expected,nextRevision:next,editor:"admin",companionStatements};
        return type==="EVENT"?commitEventAdminEdit(db,statement,{...options,fields:[]}):
          commitHelpV2AdminEdit(db,statement,{...options,agenda:"adoptions",table,projection:"json_object('name',p.name)"});
      };
      await assert.rejects(save("stale","r2"));
      assert.equal(sqlite.prepare("SELECT name FROM "+table).get().name,"old");
      assert.equal(sqlite.prepare("SELECT count(*) n FROM admin_entity_reviews").get().n,0);
      await assert.rejects(save("r1","r2",true));
      assert.equal(sqlite.prepare("SELECT name FROM "+table).get().name,"old");
      assert.equal(sqlite.prepare("SELECT count(*) n FROM admin_entity_reviews").get().n,0);
      await save("r1","r2");
      assert.equal(sqlite.prepare("SELECT updated_at FROM "+table).get().updated_at,"r2");
      assert.equal(sqlite.prepare("SELECT reviewed_at FROM admin_entity_reviews").get().reviewed_at,"r2");
      await save("r2","r3");
      assert.equal(sqlite.prepare("SELECT reviewed_at FROM admin_entity_reviews").get().reviewed_at,"r2");
    }finally{sqlite.close();}
  }
});

test("V3 directory structured proof distinguishes real blanks from malformed or lossy reads",async()=>{
  const {isVerifiedDirectoryStructuredProperty:verify}=await import("../lib/notion-unified-field-transfer.ts");
  const raw=text=>({type:"rich_text",rich_text:text?[{type:"text",plain_text:text}]:[]});
  const obs=value=>({present:true,value});
  assert.equal(verify("qualifications",raw(""),obs([])),true);
  assert.equal(verify("qualifications",raw("Kurzy; semináre\n- Certifikát"),obs(["Kurzy; semináre","Certifikát"])),true);
  assert.equal(verify("qualifications",{...raw(""),has_more:true},obs([])),false);
  assert.equal(verify("qualifications",{type:"rich_text"},obs([])),false);
  assert.equal(verify("qualifications",{type:"rich_text",rich_text:[{type:"mention",plain_text:""}]},obs([])),false);
  const overflow=Array.from({length:41},(_,i)=>String(i));
  assert.equal(verify("qualifications",raw(overflow.join("\n")),obs(overflow.slice(0,40))),false);
  const candidates=[{id:1,name:"Labrador"},{id:2,name:"Retriever"}];
  const relation=(text,options=candidates)=>({property:raw(text),candidates:options});
  assert.equal(verify("relation:breedIds",relation("Labrador"),obs([1])),true);
  assert.equal(verify("relation:breedIds",relation(""),obs([])),true);
  assert.equal(verify("relation:breedIds",relation("Labrador; Unknown"),obs([1])),false);
  assert.equal(verify("relation:breedIds",relation("Labrador",[{id:1,name:"Labrador"},{id:2,name:"Labrador"}]),obs([1])),false);
  assert.equal(verify("relation:breedIds",relation("Labrador"),obs([2])),false);
});

test("V3 directory facets require exact registry scope and typed explicit selects",async()=>{
  const {isVerifiedDirectoryFacetProperty:verify}=await import("../lib/notion-unified-field-transfer.ts");
  const obs=value=>({present:true,value});
  const select=name=>({type:"select",select:name===null?null:{name}});
  const field="facet:veterinari:veterinari.facility_type";
  assert.equal(verify(field,select("Ambulancia"),obs("ambulance")),true);
  assert.equal(verify(field,select(null),obs(null)),true);
  assert.equal(verify(field,{type:"select"},obs(null)),false);
  assert.equal(verify(field,select(""),obs(null)),false);
  assert.equal(verify(field,select("not registered"),obs(null)),false);
  assert.equal(verify(field,{...select(null),has_more:true},obs(null)),false);
  assert.equal(verify("facet:treneri:veterinari.facility_type",select("Ambulancia"),obs("ambulance")),false);
  const emergency="facet:veterinari:veterinari.emergency";
  assert.equal(verify(emergency,select("Nie"),obs("no")),true);
  assert.equal(verify(emergency,select("Neznáme"),obs("unknown")),true);
  assert.equal(verify(emergency,select("Neznáme"),obs(null)),false);
});
