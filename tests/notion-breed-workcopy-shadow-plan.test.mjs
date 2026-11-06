import test from "node:test";
import assert from "node:assert/strict";
import { planBreedWorkcopyShadowRows } from "../lib/notion-breed-workcopy-shadow-plan.mjs";

const source = "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2";
const target = "f460b1e5-4454-4a10-9200-3b35106f9e32";
const uuid = number => "00000000-0000-0000-0000-" + number.toString(16).padStart(12, "0");
function fixture() {
  const rows = Array.from({ length: 344 }, (_, index) => ({
    breedId: index + 1000,
    oldPageId: uuid(index + 1),
    newPageId: uuid(index + 501),
    slug: "plemeno-" + (index + 1000),
    fciNumber: index + 1,
  }));
  const productionLinks = rows.map(row => ({
    breed_id: row.breedId,
    notion_page_id: row.oldPageId,
    content_hash: "breed-field-v1:{\"id\":" + row.breedId + "}",
    last_synced_at: "2026-11-06T10:00:00.000Z",
    notion_last_edited_time: "2026-11-06T09:59:00.000Z",
  }));
  return {
    identityPlan: { identityReady: true, cutoverReady: false, rows },
    productionLinks,
    originalDataSourceId: source,
    workDataSourceId: target,
  };
}

test("344 rollback-aware shadow rows preserve original links and receipts without modifying arguments", () => {
  const args = fixture(), before = JSON.stringify(args);
  const staged = planBreedWorkcopyShadowRows(args);
  assert.equal(staged.length, 344);
  assert.equal(staged[0].status, "SHADOW");
  assert.equal(staged[0].originalSyncReceipt,
    args.productionLinks[0].content_hash);
  assert.equal(staged[343].originalPageId,
    args.productionLinks[343].notion_page_id);
  assert.notEqual(staged[343].originalPageId, staged[343].workPageId);
  assert.equal(JSON.stringify(args), before);
});

test("shadow staging rejects missing or changed original D1 link", () => {
  const args = fixture();
  args.productionLinks[3].notion_page_id = uuid(3456);
  assert.throws(() => planBreedWorkcopyShadowRows(args),
    /BREED_SHADOW_ACTIVE_LINK_CHANGED/);
  const missing = fixture();
  missing.productionLinks.splice(0, 1);
  assert.throws(() => planBreedWorkcopyShadowRows(missing),
    /BREED_SHADOW_ACTIVE_LINK_CHANGED/);
});

test("source receipt must be preserved to guarantee rollback", () => {
  const args = fixture();
  args.productionLinks[0].content_hash = "";
  assert.throws(() => planBreedWorkcopyShadowRows(args),
    /BREED_SHADOW_ACTIVE_RECEIPT_MISSING/);
});

test("unverified content or wrong data source never produces staging candidates", () => {
  const args = fixture();
  args.identityPlan.identityReady = false;
  assert.throws(() => planBreedWorkcopyShadowRows(args),
    /BREED_SHADOW_PARITY_NOT_VERIFIED/);
  const wrong = fixture();
  wrong.workDataSourceId = source;
  assert.throws(() => planBreedWorkcopyShadowRows(wrong),
    /BREED_SHADOW_DATA_SOURCE_UNSAFE/);
});

test("duplicate work-copy Notion pages are rejected even with distinct numeric breed IDs", () => {
  const args = fixture();
  args.identityPlan.rows[4].newPageId = args.identityPlan.rows[3].newPageId;
  assert.throws(() => planBreedWorkcopyShadowRows(args),
    /BREED_SHADOW_PAGE_DUPLICATE/);
});
