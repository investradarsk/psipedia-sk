import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ADMIN_BULK_DELETE_LIMIT, validatedAdminBulkIds,
  validatedAdminBulkPreview, runSequentialAdminRemovals,
} from "../lib/admin-record-bulk-delete.ts";

const sample = (id, overrides={}) => ({
  id, name: "Profil " + id, slug: "profil-" + id, category: "veterinari",
  notionLinked: true, notionPages: 1, removalState: null, ...overrides,
});
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("bulk selection is explicit, valid, unique and bounded before any mutation", () => {
  assert.equal(ADMIN_BULK_DELETE_LIMIT, 25);
  assert.deepEqual(validatedAdminBulkIds([2,1,3]), [2,1,3]);
  for (const ids of [[], [1,1], [0], [-3], [1.5], [NaN], [Infinity],
    Array.from({length: 26}, (_, i) => i+1)]) {
    assert.throws(() => validatedAdminBulkIds(ids));
  }
});

test("preflight fails closed on mismatched ID and ambiguous Notion ownership data", () => {
  assert.deepEqual(validatedAdminBulkPreview(5, sample(5)), sample(5));
  for (const item of [null, [], sample(7), sample(5,{name:""}),
    sample(5,{notionLinked:null}), sample(5,{notionPages:-1}),
    sample(5,{notionPages:"2"}), sample(5,{category:null}),
  ]) {
    assert.throws(() => validatedAdminBulkPreview(5, item));
  }
});

test("sequential deletion stops at first failure, preserving rest of selected records", async () => {
  const calls = [];
  const progress = [];
  const batch = [sample(1),sample(2),sample(3),sample(4)];
  const result = await runSequentialAdminRemovals(batch, async item => {
    calls.push(item.id);
    if (item.id===3) throw Error("RECORD_CONFIRMATION_MISMATCH");
    return item.id===2 ? "PENDING_NOTION" : "COMPLETE";
  }, (done,pending)=>progress.push([done,pending]));
  assert.deepEqual(calls, [1,2,3]);
  assert.deepEqual(result.acknowledgedIds,[1,2]);
  assert.equal(result.pending,1);
  assert.equal(result.failedId,3);
  assert.equal(result.error,"RECORD_CONFIRMATION_MISMATCH");
  assert.deepEqual(progress, [[1,0],[2,1]]);
});

test("missing server acknowledgement stops batch and never counts an error as success", async () => {
  const requests=[];
  const result=await runSequentialAdminRemovals([sample(1),sample(2)],async item=>{
    requests.push(item.id);
    return "UNKNOWN_REMOTE_STATUS";
  });
  assert.deepEqual(requests,[1]);
  assert.deepEqual(result.acknowledgedIds,[]);
  assert.equal(result.failedId,1);
  assert.equal(result.error,"RECORD_DELETE_NOT_ACKNOWLEDGED");
});

test("bulk removal reuses existing authenticated lifecycle endpoint with expected identity", () => {
  const ui=read("components/admin-record-bulk-delete.tsx");
  const route=read("app/api/admin/record-lifecycle/[kind]/[id]/route.ts");
  assert.match(ui,/runSequentialAdminRemovals\(frozen/);
  assert.match(ui,/validatedAdminBulkPreview\(id, data\)/);
  assert.match(ui,/action: "delete", confirmed: true, localOnly: !item\.notionLinked/);
  assert.match(ui,/expectedSlug: item\.slug, expectedName: item\.name/);
  assert.match(ui,/expectedCategory: item\.category/);
  assert.match(ui,/method: "POST"/);
  assert.doesNotMatch(ui,/method: "DELETE"|Promise\.all\(/);
  assert.match(route,/requireAdminMutation\(request,\{strictProvenance:true\}\)/);
  assert.match(route,/lifecycleSchemaReady\(db\)/);
  assert.match(route,/removeRecord\(db,bindings,target\.kind,target\.id,auth\.user!\.email/);
});

test("every major admin table exposes the same exact-selection bulk deletion", () => {
  for(const [file,kind] of [
    ["admin-directory-dashboard","directory"],
    ["admin-dashboard","articles"],
    ["admin-breed-dashboard","breeds"],
    ["admin-event-dashboard","events"],
    ["admin-help-dashboard","help"],
    ["admin-organization-publication-dashboard","organizations"],
    ["admin-adoption-dashboard","adoptions"],
    ["admin-lost-found-dashboard","lost-found"],
  ]) {
    const src=read("components/"+file+".tsx");
    assert.match(src,/AdminRecordBulkDelete/);
    assert.ok(src.includes('kind="'+kind+'"'),file);
    assert.match(src,/onFinished=/);
  }
  const mobile=read("components/admin-adoption-dashboard.tsx");
  assert.match(mobile,/mobileCardSelect/);
  assert.match(mobile,/checked=\{selected\.has\(item\.id\)\}/);
});
