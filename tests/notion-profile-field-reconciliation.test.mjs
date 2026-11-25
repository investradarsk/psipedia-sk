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
