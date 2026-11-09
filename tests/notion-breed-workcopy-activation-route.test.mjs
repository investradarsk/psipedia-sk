import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const config = JSON.parse(read("wrangler.jsonc"));
const activate = read("app/api/admin/notion-breeds-workcopy-activate/route.ts");
const atomic = read("lib/notion-breed-workcopy-activation-sql.mjs");

test("activation API remains disabled once the new workcopy engine is enabled", () => {
  assert.equal(config.vars.NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED,"false");
  assert.equal(config.vars.NOTION_BREED_SYNC_ENABLED,"false");
  assert.equal(config.vars.NOTION_BREED_WORKCOPY_SYNC_ENABLED,"true");
  assert.match(activate, /requireAdminMutation\(request, \{ strictProvenance: true \}\)/);
  assert.match(activate, /Date\.now\(\) > ACTIVATION_EXPIRES_AT/);
  assert.match(activate, /NOTION_BREED_WORKCOPY_ACTIVATE_ENABLED !== "true"/);
  assert.match(activate, /NOTION_BREED_SYNC_ENABLED !== "false"/);
  assert.match(activate, /NOTION_BREED_WORKCOPY_SYNC_ENABLED !== "false"/);
  assert.match(activate, /"ACTIVATE_344_BREEDS"/);
  assert.match(activate, /"BOTH_PAUSED"/);
});

test("activation requires live parity, safe receipts and an atomic 344-row D1 transition", () => {
  for(const required of [
    /fetchBreedNotionInventory/, /planBreedWorkcopyIdentity/,
    /inspectBreedWorkCopy/, /expandBreed60WorkPage/,
    /planBreedWorkcopyShadowRows/, /planBreedWorkcopyActivation/,
    /isCompatibleBreedWorkcopyReceipt/,
    /breedWorkcopyAtomicActivationSql/,
    /result\.meta\.changes !== 344/,
  ]) assert.match(activate,required);
  assert.doesNotMatch(activate,/UPDATE breed_notion_sync|UPDATE managed_breeds|method: "PATCH"/);
  assert.match(atomic, /WITH eligible AS MATERIALIZED/);
  assert.match(atomic, /guard AS MATERIALIZED/);
  assert.match(atomic, /UPDATE breed_notion_workcopy_links/);
  assert.match(atomic, /eligible_count=344/);
});
