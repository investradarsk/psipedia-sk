import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { reconcileProfileFields } from "../lib/notion-profile-field-reconciliation.ts";
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
  db.exec(await readFile(new URL("../docs/proposals/notion-profile-field-baselines-UNNUMBERED_PROPOSAL.sql", import.meta.url), "utf8"));
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
