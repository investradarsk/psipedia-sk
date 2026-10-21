import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { reconcileProfileFields, trustedProfileBaselineFromHashes } from "../lib/notion-profile-field-reconciliation.ts";
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
  assert.ok(sync.includes('"Zrušené", "Kontakt"'));
  assert.ok(sync.includes('"Zdroj", "Zdroj URL", "Zdroj dát"'));
  assert.ok(sync.includes("pageIdentity.psipediaId && pageIdentity.psipediaId !== source.id"));
});


test("both profile adapters reject malformed IDs without rejecting valid numeric identities", async () => {
  const [directory, eventsHelp] = await Promise.all([
    readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/notion-events-help-sync.ts", import.meta.url), "utf8"),
  ]);
  // Compare source text without JS string-literal backslash interpretation.
  assert.equal(directory.includes(String.raw`if (!/^[1-9]\\\\d*$/.test(rawId)) return null;`), false);
  assert.ok(directory.includes(String.raw`if (!/^[1-9]\\d*$/.test(rawId)) return null;`));
  assert.ok(eventsHelp.includes(String.raw`if (!/^[1-9]\\d*$/.test(source.id)) return null;`));
  const valid = /^[1-9]\\d*$/;
  for (const id of ["1", "42", "999999"]) assert.equal(valid.test(id), true);
  for (const id of ["", "0", "02", "42-other", "42\\\\d", "-1", "4.2", "0x2A"]) {
    assert.equal(valid.test(id), false, id);
  }
});
