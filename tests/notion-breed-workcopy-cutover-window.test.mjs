import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const vars = JSON.parse(read("wrangler.jsonc")).vars;
const page = read("app/admin/plemena/page.tsx");
const ui = read("components/admin-breed-workcopy-activation.tsx");
const route = read("app/api/admin/notion-breeds-workcopy-activate/route.ts");
const source = read("lib/notion-breed-workcopy-sync.ts");
const original = read("lib/notion-breed-sync.ts");
const sql = read("lib/notion-breed-workcopy-activation-sql.mjs");

test("cutover phase is a strictly gated zero-writers maintenance window", () => {
  assert.equal(vars.NOTION_BREED_SYNC_ENABLED, "false");
  assert.equal(vars.NOTION_BREED_WORKCOPY_SYNC_ENABLED, "false");
  assert.equal(vars.NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED, "true");
  assert.equal(vars.NOTION_BREED_WORKCOPY_REBASELINE_ENABLED, "false");
  assert.equal(vars.NOTION_BREED_WORKCOPY_BASELINE_ENABLED, "false");
  assert.equal(vars.NOTION_BREED_WORKCOPY_STAGE_ENABLED, "false");
  assert.match(source, /BREED_DUAL_SYNCHRONIZERS_FORBIDDEN/);
  assert.match(original, /BREED_OLD_SWEEP_DISABLED_IN_WORKCOPY_MODE/);
});

test("activation requires authenticated owner action and is not invoked by page render", () => {
  assert.match(page, /enableActivation/);
  assert.match(page, /NOTION_BREED_SYNC_ENABLED === "false"/);
  assert.match(page, /NOTION_BREED_WORKCOPY_SYNC_ENABLED === "false"/);
  assert.match(page, /<AdminBreedWorkcopyActivation \/>/);
  assert.doesNotMatch(page, /await (?:fetch|activate).*notion-breeds-workcopy-activate/);
  assert.match(ui, /window\.confirm/);
  assert.match(ui, /onClick=\{\(\) => void activate\(\)\}/);
  assert.match(ui, /x-psipedia-editorial-automations/);
  assert.match(route, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(route, /"ACTIVATE_344_BREEDS"/);
  assert.match(route, /"BOTH_PAUSED"/);
  assert.match(route, /ACTIVATION_EXPIRES_AT/);
  assert.match(route, /Date\.now\(\) > ACTIVATION_EXPIRES_AT/);
});

test("one-shot activation is atomic, receipt guarded, and verified after D1 write", () => {
  assert.match(route, /planBreedWorkcopyIdentity/);
  assert.match(route, /expandBreed60WorkPage/);
  assert.match(route, /planBreedWorkcopyActivation/);
  assert.match(route, /isCompatibleBreedWorkcopyReceipt/);
  assert.match(route, /result\.meta\.changes !== 344/);
  assert.match(route, /Number\(after\?\.active\) !== 344/);
  assert.match(route, /Number\(after\?\.shadow\) !== 0/);
  assert.match(sql, /WITH eligible AS MATERIALIZED/);
  assert.match(sql, /eligible_count=344/);
  assert.match(sql, /SET status='ACTIVE'/);
  assert.doesNotMatch(route, /UPDATE managed_breeds|UPDATE breed_notion_sync|method:\s*"PATCH"|NOTION_BREED_WORKCOPY_SYNC_ENABLED:\s*"true"/);
  assert.doesNotMatch(ui, /fetch\(["']\/api\/admin\/notion-breeds-workcopy-activate[^)]*\)\s*;?\s*$/m);
});

test("historical source content differences are informational, never silently replayed", () => {
  assert.match(route, /legacySourceContentParity:parity\.dataParity/);
  assert.doesNotMatch(route, /!parity\.dataParity/);
});
