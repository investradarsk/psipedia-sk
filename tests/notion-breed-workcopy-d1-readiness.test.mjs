import test from "node:test";
import assert from "node:assert/strict";
import {
  BREED_WORKCOPY_SHADOW_COLUMNS,
  summarizeBreedWorkcopyD1Readiness as inspect,
} from "../lib/notion-breed-workcopy-d1-readiness.mjs";

const receipt = "breed-field-v1:synthetic-test";
function sample(count = 344) {
  const canonicalBreeds = Array.from({ length: count }, (_, index) =>
    ({ id: index + 1, slug: "plemeno-" + (index + 1) }));
  const productionLinks = canonicalBreeds.map(row => ({
    breed_id: row.id,
    notion_page_id: "old-notion-" + row.id,
    content_hash: receipt,
  }));
  return { canonicalBreeds, productionLinks,
    isCompatibleReceipt: value => value === receipt };
}

test("pre-0159 diagnostic sees 344 identity links without inventing an applied migration", () => {
  const r = inspect(sample());
  assert.equal(r.canonicalCount, 344);
  assert.equal(r.originalLinkCount, 344);
  assert.equal(r.compatibleOriginalReceipts, 344);
  assert.equal(r.originalLinksReady, true);
  assert.equal(r.originalReceiptsReady, true);
  assert.equal(r.shadowTablePresent, false);
  assert.equal(r.shadowSchemaCompatible, false);
  assert.equal(r.cutoverReady, false);
});

test("post-0159 schema is verified by physical columns and read-only status counts", () => {
  const r = inspect({
    ...sample(),
    shadowTablePresent: true,
    shadowColumns: BREED_WORKCOPY_SHADOW_COLUMNS.map(name => ({ name })),
    shadowStatuses: [{ status: "SHADOW", count: 344 }],
  });
  assert.equal(r.shadowSchemaCompatible, true);
  assert.equal(r.shadowCounts.SHADOW, 344);
  assert.equal(r.totalShadowLinks, 344);
  assert.equal(r.shadowCountsReady, true);
  assert.equal(r.cutoverReady, false);
});

test("a malformed D1 schema fails closed; a SQL file is not physical schema evidence", () => {
  const r = inspect({
    ...sample(), shadowTablePresent: true, shadowColumns: [{ name: "breed_id" }],
  });
  assert.equal(r.shadowSchemaCompatible, false);
  assert(r.missingShadowColumns.includes("original_sync_receipt"));
  assert.equal(r.shadowCountsReady, false);
});

test("missing/duplicate production links and incomplete per-field receipts are reported", () => {
  const i = sample();
  i.productionLinks.pop();
  i.productionLinks[0].content_hash = "legacy";
  const r = inspect(i);
  assert.equal(r.originalLinksReady, false);
  assert.equal(r.originalReceiptsReady, false);
  assert.equal(r.compatibleOriginalReceipts, 342);
  assert.equal(r.incompatibleOriginalReceipts, 1);
  assert.equal(r.cutoverReady, false);

  const duplicate = sample();
  duplicate.productionLinks[1].notion_page_id = duplicate.productionLinks[0].notion_page_id;
  const s = inspect(duplicate);
  assert.equal(s.distinctOriginalPageIds, 343);
  assert.equal(s.originalLinksReady, false);
});

test("shadow statuses must be complete, valid, and remain non-activating", () => {
  const args = {
    ...sample(),
    shadowTablePresent: true,
    shadowColumns: BREED_WORKCOPY_SHADOW_COLUMNS.map(name => ({ name })),
  };
  const missing = inspect({ ...args, shadowStatuses: [{ status: "SHADOW", count: 343 }] });
  assert.equal(missing.shadowCountsReady, false);
  const other = inspect({ ...args, shadowStatuses: [
    { status: "SHADOW", count: 343 }, { status: "UNKNOWN", count: 1 },
  ] });
  assert.equal(other.shadowOther, 1);
  assert.equal(other.shadowCountsReady, false);
  const invalid = inspect({ ...args, shadowStatuses: [{ status: "SHADOW", count: -1 }] });
  assert.equal(invalid.status, "INVALID_D1_COUNTS");
  assert.equal(invalid.cutoverReady, false);
});
