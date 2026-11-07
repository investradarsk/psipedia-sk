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
    shadowColumns: BREED_WORKCOPY_SHADOW_COLUMNS.map(name => ({
      name, type: name === "breed_id" ? "INTEGER" : "TEXT",
      pk: name === "breed_id" ? 1 : 0,
    })),
    shadowUniqueKeys: [["original_notion_page_id"], ["work_notion_page_id"]],
    shadowStatuses: [{ status: "SHADOW", count: 344 }],
  });
  assert.equal(r.shadowConstraintsValid, true);
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
    shadowColumns: BREED_WORKCOPY_SHADOW_COLUMNS.map(name => ({
      name, type: name === "breed_id" ? "INTEGER" : "TEXT",
      pk: name === "breed_id" ? 1 : 0,
    })),
    shadowUniqueKeys: [["original_notion_page_id"], ["work_notion_page_id"]],
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

test("missing unique source/work link index or non-integer primary key blocks schema readiness", () => {
  const schema = BREED_WORKCOPY_SHADOW_COLUMNS.map(name => ({
    name, type: name === "breed_id" ? "INTEGER" : "TEXT",
    pk: name === "breed_id" ? 1 : 0,
  }));
  const base = { ...sample(), shadowTablePresent: true,
    shadowColumns: schema, shadowStatuses: [{ status: "SHADOW", count: 344 }] };
  const withoutWork = inspect({
    ...base, shadowUniqueKeys: [["original_notion_page_id"]],
  });
  assert.equal(withoutWork.shadowSourceUnique, true);
  assert.equal(withoutWork.shadowWorkUnique, false);
  assert.equal(withoutWork.shadowSchemaCompatible, false);
  const noPrimary = inspect({
    ...base,
    shadowColumns: schema.map(item => item.name === "breed_id" ?
      { ...item, pk: 0 } : item),
    shadowUniqueKeys: [["original_notion_page_id"], ["work_notion_page_id"]],
  });
  assert.equal(noPrimary.shadowPrimaryKeyValid, false);
  assert.equal(noPrimary.shadowSchemaCompatible, false);
});

test("347 canonical rows with three unrelated drafts still allow the 344 linked identities", () => {
  const args = sample();
  args.canonicalBreeds.push(
    { id: 345, slug: "koncept-345", status: "draft" },
    { id: 346, slug: "koncept-346", status: "draft" },
    { id: 347, slug: "koncept-347", status: "draft" },
  );
  const r = inspect(args);
  assert.equal(r.canonicalCount, 347);
  assert.equal(r.originalLinkCount, 344);
  assert.equal(r.originalLinksReady, true);
  assert.equal(r.extraCanonicalBreeds.length, 3);
  assert.deepEqual(r.extraCanonicalBreeds.map(row => row.status), ["draft", "draft", "draft"]);
  assert.equal(r.cutoverReady, false);
  args.productionLinks[3].breed_id = 987654;
  const broken = inspect(args);
  assert.equal(broken.originalLinksReady, false);
});
