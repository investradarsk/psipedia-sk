import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("a reviewed profile can be approved while the remainder stays read-only", () => {
  const queue = source("lib/notion-manual-transfer-queue.ts");
  const api = source("app/api/admin/notion-manual-transfer/route.ts");
  assert.match(queue, /export async function confirmManualTransferItem/);
  assert.match(queue, /status='PREVIEWED' AND preview_hash IS NOT NULL AND changed_fields>0/);
  assert.match(queue, /requested_by=\? AND status IN \('PREVIEW','PREVIEW_READY'\)/);
  assert.match(api, /action==="confirm_item"/);
  assert.match(api, /CONFIRM_ONE_NOTION_PROFILE/);
});

test("unreviewed profiles can only be previewed, approved profiles can only execute", () => {
  const queue = source("lib/notion-manual-transfer-queue.ts");
  assert.match(queue, /preview\?"i\.preview_hash IS NULL":"i\.preview_hash IS NOT NULL"/);
  assert.match(queue, /before\.fingerprint!==job\.preview_hash/);
  assert.match(queue, /TRANSFER_PREVIEW_STALE/);
  assert.match(queue, /WHERE run_id=\? AND status='PREVIEWED' AND preview_hash IS NOT NULL/);
  assert.match(queue, /status='PREVIEWED' AND preview_hash IS NOT NULL AND changed_fields>0/);
});

test("manual breed transfers use verified ACTIVE 60+2 workcopy links, never legacy links", () => {
  const queue = source("lib/notion-manual-transfer-queue.ts");
  const inspect = source("lib/notion-manual-transfer-inspect.ts");
  const breed = source("lib/notion-breed-workcopy-sync.ts");
  assert.match(queue, /FROM breed_notion_workcopy_links/);
  assert.match(queue, /runNotionBreedWorkCopySyncSweep/);
  assert.match(queue, /writeBackBreedToWorkCopy/);
  assert.doesNotMatch(queue, /runNotionBreedSyncSweep|FROM breed_notion_sync/);
  assert.match(inspect, /inspectManualBreedWorkCopyProfile/);
  assert.match(breed, /assertOwnedPage\(page, link, canonical, input\.bindings\)/);
  assert.match(breed, /forceFieldKeys/);
});

test("UI streams differences and never auto-confirms a transfer", () => {
  const view = source("components/admin-notion-manual-transfer.tsx");
  assert.match(view, /onlyDifferences/);
  assert.match(view, /Preniesť tento profil/);
  assert.match(view, /item\.status==="PREVIEWED"/);
  assert.match(view, /window\.confirm\("Preniesť profil ID "/);
  assert.match(view, /confirm_item/);
  assert.match(view, /setInterval\(\(\)=>\{void refresh\(\)\},7000\)/);
});
