import test from "node:test";
import assert from "node:assert/strict";
import { planBreedWorkcopyActivation } from "../lib/notion-breed-workcopy-activation-plan.mjs";
const receipt = "breed-field-v1:" + JSON.stringify({
  hash: "0".repeat(64),
  notion: JSON.stringify({ intro: "hello" }),
  admin: JSON.stringify({ intro: "hello" }),
});
const oldId = "2054d277-2e1b-45b5-aeb6-b1a5dcdf2db2";
const newId = "f460b1e5-4454-4a10-9200-3b35106f9e32";
function setup() {
  const planned=[], staged=[], workPages=[];
  for(let n=1;n<=344;n++) {
    const originalPageId="00000000-0000-0000-0001-"+String(n).padStart(12,"0");
    const workPageId="00000000-0000-0000-0002-"+String(n).padStart(12,"0");
    const candidate={breedId:n,originalPageId,workPageId,
      slug:"breed-"+n,fciNumber:n,originalSyncReceipt:receipt};
    planned.push(candidate);
    staged.push({breed_id:n,original_notion_page_id:originalPageId,
      work_notion_page_id:workPageId,original_data_source_id:oldId,
      work_data_source_id:newId,canonical_slug:candidate.slug,fci_number:n,
      original_sync_receipt:receipt,work_sync_receipt:receipt,
      work_notion_last_edited_time:"2026-11-06T12:00:00.000Z",status:"SHADOW"});
    workPages.push({id:workPageId,last_edited_time:"2026-11-06T12:00:00.000Z"});
  }
  return {planned,staged,workPages,oldSourceId:oldId,newSourceId:newId};
}
test("only a complete identical 344-row cohort can activate",()=>{
  const input=setup();
  assert.equal(planBreedWorkcopyActivation(input).ready,true);
  input.staged.pop();
  assert.equal(planBreedWorkcopyActivation(input).ready,false);
});
test("refuses modified Notion revisions and altered D1 mapping",()=>{
  const input=setup();
  input.workPages[0].last_edited_time="2026-11-06T12:01:00.000Z";
  assert.equal(planBreedWorkcopyActivation(input).ready,false);
  input.workPages[0].last_edited_time="2026-11-06T12:00:00.000Z";
  input.staged[0].canonical_slug="wrong";
  assert.equal(planBreedWorkcopyActivation(input).ready,false);
});
test("refuses missing per-field receipts and already ACTIVE rows",()=>{
  const input=setup();
  input.staged[0].work_sync_receipt="old-sha";
  assert.equal(planBreedWorkcopyActivation(input).ready,false);
  input.staged[0].work_sync_receipt=receipt;
  input.staged[0].status="ACTIVE";
  assert.equal(planBreedWorkcopyActivation(input).ready,false);
});

test("independent new 60-field baseline may differ from preserved 109-field receipt", () => {
  const args = setup();
  const updated = "breed-field-v1:" + JSON.stringify({
    hash: "0".repeat(64),
    notion: JSON.stringify({ intro: "new-notion" }),
    admin: JSON.stringify({ intro: "existing-admin" }),
  });
  args.staged[0].work_sync_receipt = updated;
  assert.equal(planBreedWorkcopyActivation(args).ready, true);
  args.staged[0].original_sync_receipt = "changed-old";
  assert.equal(planBreedWorkcopyActivation(args).ready, false);
});
