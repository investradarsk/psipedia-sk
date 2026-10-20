import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { triageNotionQuality } from "../lib/notion-conflict-quality-triage.ts";
import { analyzeNotionCrossBatch } from "../lib/notion-data-quality-cross-batch.ts";

const uuid = (n) => "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function row(n, overrides = {}) {
  return {
    notionPageId: uuid(n), psipediaId: String(n), decision: "REVIEW",
    reason: "UNKNOWN_SNAPSHOT", mapping: "MATCH", canonical: "EXISTS",
    baseline: "PRESENT", notionChanged: null, d1Changed: null, fieldNames: null,
    ...overrides,
  };
}
const analyze = (items, flags = [], evidence = "VERIFIED_IDS_ONLY", agenda = "directory") =>
  triageNotionQuality(agenda, flags, { evidence, items });
const flag = (n, kind = "BIDIRECTIONAL_CONFLICT") => ({ notionPageId: uuid(n), kind });

test("historical CONFLICT cannot become a confirmed current content conflict without snapshots", () => {
  const r = analyze([row(1)], [flag(1)]);
  assert.equal(r.counts.CONFIRMED, 0);
  assert.equal(r.items[0].verdict, "NEEDS_REVIEW");
  assert.equal(r.items[0].basis, "HISTORICAL_NOTION_FLAG");
  assert.equal(r.items[0].issue, "SYNC_CONFLICT");
});
test("historical error resolved only with separately comparable current snapshots", () => {
  const r = analyze([row(1, { decision: "UNCHANGED", reason: null })], [flag(1)]);
  assert.equal(r.items[0].verdict, "STALE_OR_RESOLVED");
  assert.equal(r.items[0].basis, "COMPARABLE_SNAPSHOTS");
});
test("confirmed identity collision is not conflated with an editorial conflict", () => {
  const r = analyze([row(1, { decision: "CONFLICT", reason: "MAPPING_CONFLICT", mapping: "CONFLICT" })]);
  assert.equal(r.items[0].verdict, "CONFIRMED");
  assert.equal(r.items[0].issue, "IDENTITY");
  assert.equal(r.items[0].basis, "CURRENT_IDENTITY_ONLY");
  assert.equal(r.items[0].editorHref, null);
});
test("three comparable hashes can prove a current content conflict, not choose a winner", () => {
  const r = analyze([row(1, { decision: "CONFLICT", reason: "BIDIRECTIONAL_CONFLICT", fieldNames: ["Názov", "Secret Contact"] })], [flag(1)]);
  assert.equal(r.items[0].verdict, "CONFIRMED");
  assert.deepEqual(r.items[0].fieldNames, ["Názov"]);
  assert.equal(r.items[0].editorHref, "/admin/adresar/1");
});
test("unknown D1 or Notion evidence remains UNKNOWN", () => {
  const r = analyze([row(1, { reason: "UNKNOWN_SOURCE", mapping: "UNKNOWN" })], [flag(1)], "UNKNOWN");
  assert.equal(r.items[0].verdict, "UNKNOWN");
  assert.equal(r.items[0].editorHref, null);
});
test("missing mapping, orphan identity and missing canonical never trigger automatic repairs", () => {
  for (const reason of ["MISSING_MAPPING", "ORPHAN_MAPPING", "MISSING_CANONICAL", "NO_PSID"]) {
    const r = analyze([row(1, { reason, mapping: "MISSING", canonical: "MISSING" })]);
    assert.equal(r.items[0].verdict, "NEEDS_REVIEW");
    assert.equal(r.items[0].issue, "IDENTITY");
    assert.equal(r.items[0].editorHref, null);
  }
});
test("same entity ID in two distinct agendas does not collide; only trusted agenda editors are linked", () => {
  assert.equal(analyze([row(1)], [flag(1)], "VERIFIED_IDS_ONLY", "events").items[0].editorHref, "/admin/podujatia/1");
  assert.equal(analyze([row(1)], [flag(1)], "VERIFIED_IDS_ONLY", "help-cases").items[0].editorHref, null);
});
test("protection and content errors are distinct from content conflicts", () => {
  const guard = analyze([row(1, { reason: "CONFIRMED_SITE_REVIEW_REQUIRED" })]);
  assert.equal(guard.items[0].issue, "PROTECTION");
  assert.equal(guard.items[0].verdict, "NEEDS_REVIEW");
  const content = analyze([row(2)], [flag(2, "MISSING_HOUSE_NUMBER")]);
  assert.equal(content.items[0].issue, "CONTENT");
  assert.equal(content.items[0].verdict, "NEEDS_REVIEW");
});
test("strict invalid IDs, untrusted fields, foreign page receipt and 101-item bounds fail closed", () => {
  assert.throws(() => analyze([row(1, { notionPageId: "PRIVATE PERSON" })]), /INVALID_NOTION_QUALITY_EVIDENCE/);
  assert.throws(() => analyze([row(1, { psipediaId: "/admin/../bad" })], [flag(1)]).items[0].editorHref !== null);
  assert.throws(() => analyze([row(1)], [{ ...flag(2), kind: "PRIVATE PHONE" }]), /INVALID_NOTION_QUALITY_EVIDENCE/);
  assert.throws(() => analyze([row(1)], [flag(2)]), /INVALID_NOTION_QUALITY_EVIDENCE/);
  assert.throws(() => analyze(Array.from({ length: 101 }, (_, i) => row(i + 1))), /INVALID_NOTION_QUALITY_EVIDENCE/);
});
test("values, unknown historic text and secret sources cannot enter report", () => {
  const r = analyze([row(1, { fieldNames: ["Sensitive name", "Názov"] })], [flag(1, "OTHER")]);
  assert.equal(JSON.stringify(r).includes("Sensitive name"), false);
  assert.equal(JSON.stringify(r).includes("CURRENT_NOTION_CONTENT"), true);
  assert.ok(!JSON.stringify(r).match(/token|latitude|longitude|phone|email/i));
});
test("cross-batch parser remains the only dedicated identity/pagination checkpoint engine", () => {
  assert.throws(() => analyzeNotionCrossBatch([{ privateAddress: "EXACT" }]), /INVALID_ANONYMIZED_CROSS_BATCH_INPUT/);
});
test("integration is read-only, reports do not export identifiers or cursors", async () => {
  const route = await readFile(new URL("../app/api/admin/notion-data-quality-audit/route.ts", import.meta.url), "utf8");
  const ui = await readFile(new URL("../components/admin-notion-data-quality-audit.tsx", import.meta.url), "utf8");
  const quality = await readFile(new URL("../components/admin-data-quality-dashboard.tsx", import.meta.url), "utf8");
  assert.match(route, /triageNotionQuality/);
  assert.match(route, /mode: "dry-run"/);
  assert.doesNotMatch(route, /method: "PATCH"|\.run\(\)|INSERT INTO|DELETE FROM/);
  assert.match(ui, /"Historické príznaky"/);
  assert.doesNotMatch(ui, /reviewItems: totals.reviewItems/);
  assert.doesNotMatch(ui, /checkpoint: lastBatch\?\.resume/);
  assert.match(quality, /href="\/admin\/nastroje\/notion-audit"/);
});
