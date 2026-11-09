import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  inspectBreedIndependentReceipt, auditBreedBaselinePostflight,
} from "../lib/production-breed-workcopy-postflight.mjs";
import { BREED_NOTION_PRIORITY_FIELDS } from "../lib/notion-breed-property-registry.ts";

const originalSource = "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2";
const workSource = "f460b1e5-4454-4a10-9200-3b35106f9e32";
const fields = BREED_NOTION_PRIORITY_FIELDS
  .filter(f => f.mode === "content").map(f => f.id);
const id = n => "00000000-0000-0000-0000-" + n.toString(16).padStart(12, "0");
const text = s => ({ type: "rich_text", rich_text: [{ plain_text: s }] });
const receipt = (notion, admin) => "breed-field-v1:" + JSON.stringify({
  hash: "0".repeat(64),
  notion: JSON.stringify(notion), admin: JSON.stringify(admin),
});
const complete = Object.fromEntries(fields.map(key => [key,
  key === "seo.noindex" || key === "editorialComplete" ? false : "",
]));

function fixture() {
  const canonicalBreeds = [], productionLinks = [], shadowRows = [];
  const originalPages = [], workPages = [];
  for (let i = 0; i < 344; i++) {
    const n = i + 1, breedId = n + 100;
    const originalId = id(n), workId = id(n + 400);
    const oldHash = "original-" + n;
    const last = "2026-11-08T18:30:00.000Z";
    const revision = "2026-11-08T19:00:00.000Z";
    canonicalBreeds.push({ id: breedId, slug: "plemeno-" + breedId,
      fci_number: n, status: "published" });
    productionLinks.push({ breed_id: breedId, notion_page_id: originalId,
      content_hash: oldHash, last_synced_at: last });
    shadowRows.push({
      breed_id: breedId, original_notion_page_id: originalId,
      work_notion_page_id: workId, original_data_source_id: originalSource,
      work_data_source_id: workSource, canonical_slug: "plemeno-" + breedId,
      fci_number: n, original_sync_receipt: oldHash,
      original_sync_last_synced_at: last, work_sync_receipt:
        receipt(complete, complete),
      work_notion_last_edited_time: revision, work_last_error_code: null,
      status: "SHADOW", verified_at: null, activated_at: null,
      rolled_back_at: null,
    });
    originalPages.push({
      id: originalId, properties: {
        "Psipedia ID": text(String(breedId)), "FCI číslo": {
          type: "number", number: n,
        },
      },
    });
    workPages.push({
      id: workId, last_edited_time: revision,
      properties: {
        "Psipedia ID": text(String(breedId)),
        "FCI číslo": { type: "number", number: n },
        "Zdrojový profil Notion": {
          type: "url", url: "https://www.notion.so/" + originalId,
        },
      },
    });
  }
  // Existing unrelated canonical public/draft records are not migrated.
  for (const [n,slug] of [[5,"madarska-vyzla"],[13,"beagle"],[14,"anglicky-koker-spaniel"]])
    canonicalBreeds.push({ id:n,slug,fci_number:n,status:"published" });
  return { canonicalBreeds, productionLinks, shadowRows, originalPages,
    workPages, originalSource, workSource, requiredFields: fields };
}
test("complete new per-field receipts verify with original snapshot values separate", () => {
  assert.ok(fields.length > 60);
  const notion = { ...complete, intro: "Notion introduction" };
  const admin = { ...complete, intro: "Admin introduction" };
  assert.equal(inspectBreedIndependentReceipt(receipt(notion, admin), fields)?.differences, 1);
  assert.equal(inspectBreedIndependentReceipt(receipt({ intro: "incomplete" }, admin), fields), null);
  assert.equal(inspectBreedIndependentReceipt("legacy-sha", fields), null);
});

test("344 SHADOW receipts and both sources pass without changing any data", () => {
  const input = fixture();
  const before = JSON.stringify(input);
  const out = auditBreedBaselinePostflight(input);
  assert.equal(out.success, true);
  assert.equal(out.counters.canonical, 347);
  assert.equal(out.counters.originalLinks, 344);
  assert.equal(out.counters.shadowLinks, 344);
  assert.equal(out.counters.independentReceiptsCompatible, 344);
  assert.equal(out.counters.originalLinkIdentityMatches, 344);
  assert.equal(out.counters.workLinkIdentityMatches, 344);
  assert.equal(out.counters.savedNotionRevisions, 344);
  assert.equal(out.counters.originalReceiptDrift, 0);
  assert.equal(out.readyForSeparateCutoverReview, true);
  assert.equal(out.cutoverReady, false);
  assert.equal(JSON.stringify(input), before);
});

test("one malformed receipt remains isolated and prevents claiming all 344", () => {
  const input = fixture();
  input.shadowRows[17].work_sync_receipt = receipt({ intro: "partial" }, complete);
  const out = auditBreedBaselinePostflight(input);
  assert.equal(out.success, false);
  assert.equal(out.counters.independentReceiptsCompatible, 343);
  assert.equal(out.counters.independentReceiptsMissingOrInvalid, 1);
  assert.ok(out.errors.includes("BREED_POSTFLIGHT_INDEPENDENT_RECEIPT_INVALID"));
  assert.equal(out.cutoverReady, false);
});

test("still-live original receipt drift reports review, not missing SHADOW rows", () => {
  const input = fixture();
  input.productionLinks[8].content_hash = "legitimate-active-edit";
  const out = auditBreedBaselinePostflight(input);
  assert.equal(out.success, true);
  assert.equal(out.counters.originalReceiptDrift, 1);
  assert.equal(out.counters.independentReceiptsCompatible, 344);
  assert.equal(out.readyForSeparateCutoverReview, false);
  assert.equal(out.cutoverReady, false);
});

test("Notion edit after baseline is explicitly reported for follow-up", () => {
  const input = fixture();
  input.workPages[0].last_edited_time = "2026-11-08T20:00:00Z";
  const out = auditBreedBaselinePostflight(input);
  assert.equal(out.success, true);
  assert.equal(out.counters.workNotionRevisionDrift, 1);
  assert.equal(out.readyForSeparateCutoverReview, false);
});

test("changed mapping, FCI, status, provenance and duplicates fail closed", () => {
  const mutations = [
    f => f.productionLinks[0].notion_page_id = id(8000),
    f => f.shadowRows[0].fci_number = 0,
    f => f.shadowRows[0].status = "ACTIVE",
    f => f.workPages[0].properties["Zdrojový profil Notion"].url = "https://www.notion.so/" + id(8000),
    f => f.workPages[0].id = f.workPages[1].id,
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    const out = auditBreedBaselinePostflight(input);
    assert.equal(out.success, false);
    assert.ok(out.errors.length > 0);
  }
});

test("manual-only production workflow cannot mutate D1, Notion or sync flags", () => {
  const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");
  const workflow = read(".github/workflows/production-breed-workcopy-postflight.yml");
  const script = read("scripts/production-breed-workcopy-postflight.mjs");
  const config = JSON.parse(read("wrangler.jsonc")).vars;
  assert.equal(config.NOTION_BREED_SYNC_ENABLED, "false");
  assert.equal(config.NOTION_BREED_WORKCOPY_SYNC_ENABLED, "true");
  for (const key of [
    "NOTION_BREED_WORKCOPY_STAGE_ENABLED",
    "NOTION_BREED_WORKCOPY_BASELINE_ENABLED",
    "NOTION_BREED_WORKCOPY_REBASELINE_ENABLED",
    "NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED",
  ]) assert.equal(config[key], "false");
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^\s*(?:push|pull_request|schedule):/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /AUDIT-BREED-BASELINES-344/);
  assert.match(script, /GITHUB_REF === "refs\/heads\/main"/);
  assert.match(script, /d1", "execute"/);
  assert.match(script, /"SELECT id,slug,status,fci_number FROM managed_breeds"/);
  assert.match(script, /BREED_POSTFLIGHT_NON_READONLY_SQL/);
  assert.doesNotMatch(script, /--file|method: "PATCH"|method: "DELETE"|method: "PUT"/);
});
