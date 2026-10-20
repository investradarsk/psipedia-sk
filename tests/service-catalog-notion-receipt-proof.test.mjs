import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {validateServiceNotionReceiptProof} from "../lib/service-catalog-notion-receipt-proof.ts";

const ID="svc.admin."+"a".repeat(32);
const OTHER="svc.admin."+"b".repeat(32);
const PAGE="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const DATA_SOURCE="11111111-2222-4333-8444-555555555555";
const fields=()=>({kind:"service",label:"Mobilná veterinárna pomoc",group:"Veterinárna starostlivosť",
  meaning:"Veterinárna starostlivosť vykonaná mimo ambulancie.",
  primaryCategory:"veterinari",categories:["veterinari"],valueKind:"tri_state"});
function contentHash(id,version,f){
  return createHash("sha256").update(JSON.stringify({schema:"psipedia.service-option.v1",
    source:"psipedia-d1:service_catalog_admin_options",optionId:id,version,
    kind:f.kind,label:f.label,group:f.group,meaning:f.meaning,
    primaryCategory:f.primaryCategory,categories:[...f.categories].sort(),valueKind:f.valueKind})).digest("hex");
}
function fixture(){
  const f=fields();
  return {
    local:{id:ID,version:4,status:"DRAFT",notionMirrorStatus:"PENDING",...f},
    writeAck:{optionId:ID,optionVersion:4,pageId:PAGE,
      notionLastEditedAt:"2026-10-19T12:00:59Z",completedAt:"2026-10-19T12:01:00Z"},
    remoteRead:{pageId:PAGE,dataSourceId:DATA_SOURCE,sourceOptionId:ID,sourceOptionVersion:4,
      notionLastEditedAt:"2026-10-19T12:00:59Z",fetchedAt:"2026-10-19T12:01:01Z",
      archived:false,inTrash:false,fields:{...f},payloadSha256:contentHash(ID,4,f)},
    context:{expectedDataSourceId:DATA_SOURCE,expectedPageId:PAGE,
      verifiedAt:"2026-10-19T12:01:02Z",verifiedBy:"service-catalog-notion-reconciler-v1",
      currentOptionId:ID,currentVersion:4,receipts:[],pageMappings:[]},
  };
}
async function fails(input,reason){assert.deepEqual(await validateServiceNotionReceiptProof(input),{ok:false,reason});}
test("verified read-after-write derives exact 0134 receipt for CAS post-transition version",async()=>{
  const candidate=await validateServiceNotionReceiptProof(fixture());
  assert.equal(candidate.ok,true);
  assert.deepEqual(candidate.guard,{optionId:ID,expectedVersion:4,nextVersion:5,
    expectedStatus:"DRAFT",expectedMirrorStatus:"PENDING",requiredAbsentReceiptVersion:5});
  assert.deepEqual(candidate.receipt,{option_id:ID,option_version:5,notion_page_id:PAGE,
    notion_last_edited_at:"2026-10-19T12:00:59Z",remote_payload_sha256:contentHash(ID,4,fields()),
    verified_at:"2026-10-19T12:01:02Z",verified_by:"service-catalog-notion-reconciler-v1"});
});
test("caller-supplied SYNCED cannot manufacture a proof",async()=>{
  const f=fixture();f.local.notionMirrorStatus="SYNCED";
  await fails(f,"UNTRUSTED_STATE");
  const injected=fixture();injected.origin="verified_notion_reconciliation";
  injected.outcome="SYNCED";
  await fails(injected,"INVALID_INPUT");
  const missing=fixture();delete missing.remoteRead;
  await fails(missing,"INVALID_INPUT");
});
test("missing or caller-shaped remote evidence fails closed",async()=>{
  const f=fixture();f.remoteRead={origin:"verified_notion_reconciliation",status:"SYNCED"};
  await fails(f,"REMOTE_PROOF_MISSING");
  const g=fixture();delete g.remoteRead.payloadSha256;
  await fails(g,"REMOTE_PROOF_MISSING");
});
test("stale and replayed versions are rejected",async()=>{
  const f=fixture();f.context.currentVersion=5;await fails(f,"STALE_VERSION");
  const g=fixture();g.writeAck.optionVersion=3;await fails(g,"STALE_VERSION");
  const h=fixture();h.remoteRead.sourceOptionVersion=3;await fails(h,"SOURCE_MISMATCH");
});
test("source identity and remote Notion parent cannot drift",async()=>{
  const f=fixture();f.remoteRead.dataSourceId="ffffffff-ffff-4fff-8fff-ffffffffffff";
  await fails(f,"SOURCE_MISMATCH");
  const g=fixture();g.remoteRead.sourceOptionId=OTHER;await fails(g,"SOURCE_MISMATCH");
  const h=fixture();h.context.currentOptionId=OTHER;await fails(h,"STALE_VERSION");
});
test("Notion page identity checked against write ACK and canonical mapping",async()=>{
  const f=fixture();f.remoteRead.pageId="ffffffff-ffff-4fff-8fff-ffffffffffff";
  await fails(f,"PAGE_MISMATCH");
  const g=fixture();g.writeAck.pageId="ffffffff-ffff-4fff-8fff-ffffffffffff";
  await fails(g,"PAGE_MISMATCH");
  const h=fixture();h.context.pageMappings=[{optionId:OTHER,pageId:PAGE}];
  await fails(h,"IDENTITY_CONFLICT");
  const j=fixture();j.context.pageMappings=[{optionId:ID,pageId:"ffffffff-ffff-4fff-8fff-ffffffffffff"}];
  await fails(j,"IDENTITY_CONFLICT");
});
test("wrong payload values and hash both reject independently",async()=>{
  const f=fixture();f.remoteRead.fields.meaning="Upravený význam bez súhlasu";
  await fails(f,"PAYLOAD_HASH_MISMATCH");
  f.remoteRead.payloadSha256=contentHash(ID,4,f.remoteRead.fields);
  await fails(f,"PAYLOAD_MISMATCH");
  const g=fixture();g.remoteRead.payloadSha256="f".repeat(64);
  await fails(g,"PAYLOAD_HASH_MISMATCH");
});
test("canonical category sets hash deterministically despite ordering",async()=>{
  const f=fixture();f.local.categories=["veterinari","treneri"];
  f.remoteRead.fields.categories=["treneri","veterinari"];
  f.remoteRead.payloadSha256=contentHash(ID,4,f.remoteRead.fields);
  assert.equal((await validateServiceNotionReceiptProof(f)).ok,true);
});
test("archived, trashed, changed remote write version all reject",async()=>{
  const f=fixture();f.remoteRead.archived=true;await fails(f,"REMOTE_CHANGED");
  const g=fixture();g.remoteRead.inTrash=true;await fails(g,"REMOTE_CHANGED");
  const h=fixture();h.remoteRead.notionLastEditedAt="2026-10-19T12:01:02Z";
  await fails(h,"REMOTE_CHANGED");
});
test("read-before-write, stale read, impossible clock orders reject",async()=>{
  const f=fixture();f.remoteRead.fetchedAt="2026-10-19T12:00:00Z";
  await fails(f,"TIME_INVALID");
  const g=fixture();g.context.verifiedAt="2026-10-19T12:00:00Z";
  await fails(g,"TIME_INVALID");
  const h=fixture();h.context.verifiedAt="2026-10-19T12:09:00Z";
  await fails(h,"TIME_INVALID");
  const i=fixture();i.remoteRead.fetchedAt="nonsense";
  await fails(i,"REMOTE_PROOF_MISSING");
});
test("duplicate receipt, receipt replay and cross-option reuse fail",async()=>{
  const f=fixture();f.context.receipts=[{optionId:ID,optionVersion:5,pageId:PAGE}];
  await fails(f,"DUPLICATE_RECEIPT");
  const g=fixture();g.context.receipts=[{optionId:OTHER,optionVersion:2,pageId:PAGE}];
  await fails(g,"IDENTITY_CONFLICT");
  const h=fixture();h.local.version=5;h.writeAck.optionVersion=5;
  await fails(h,"STALE_VERSION");
});
test("unknown fields, fabricated reconciler, bad IDs and versions fail closed",async()=>{
  const f=fixture();f.context.verifiedBy="browser";await fails(f,"INVALID_INPUT");
  const g=fixture();g.local.adminId="forged";await fails(g,"INVALID_INPUT");
  const h=fixture();h.local.id="svc.admin.malicious";await fails(h,"INVALID_INPUT");
  const i=fixture();i.local.version=1.5;await fails(i,"INVALID_INPUT");
});
/** This model exercises the returned guard only; actual safety needs D1 CAS + UNIQUE in one transaction. */
function syntheticAtomicCommit(state,candidate){
  if(!candidate.ok)return false;
  const g=candidate.guard,r=candidate.receipt;
  const key=r.option_id+":"+r.option_version;
  if(state.version!==g.expectedVersion||state.status!==g.expectedStatus||
      state.mirror!==g.expectedMirrorStatus||state.receipts.has(key))return false;
  state.version=g.nextVersion;state.mirror="SYNCED";state.receipts.add(key);
  return true;
}
test("two concurrent proofs with the same CAS version have exactly one winner",async()=>{
  const [a,b]=await Promise.all([validateServiceNotionReceiptProof(fixture()),
    validateServiceNotionReceiptProof(fixture())]);
  const state={version:4,status:"DRAFT",mirror:"PENDING",receipts:new Set()};
  assert.equal(syntheticAtomicCommit(state,a),true);
  assert.equal(syntheticAtomicCommit(state,b),false);
  assert.equal(state.version,5);assert.equal(state.receipts.size,1);
});
test("edit/retire races invalidate a previously validated receipt candidate",async()=>{
  const a=await validateServiceNotionReceiptProof(fixture());
  const changed={version:5,status:"DRAFT",mirror:"PENDING",receipts:new Set()};
  assert.equal(syntheticAtomicCommit(changed,a),false);
  const retired={version:4,status:"RETIRED",mirror:"PENDING",receipts:new Set()};
  assert.equal(syntheticAtomicCommit(retired,a),false);
});
