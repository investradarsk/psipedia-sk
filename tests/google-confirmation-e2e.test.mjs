
import assert from "node:assert/strict";
import test from "node:test";
import { confirmAdminGooglePlace } from "../lib/admin-google-place-confirmation.ts";
import { harness } from "./google-confirmation-harness.mjs";

const confirm = (targetType,placeId="place-A") => confirmAdminGooglePlace({
  targetType,targetId:1,placeId,actorRef:"editor@example.sk",publicLocation:true,
});
const types = ["DIRECTORY_PROFILE","MANAGED_EVENT","ORGANIZATION_LOCATION"];
for(const type of types){
  test("real Google confirmation completes and publishes matching exact GEO: "+type,async()=>{
    harness.init(type,{publicExact:false});
    assert.equal(harness.publishable().length,0);
    const result=await confirm(type);
    assert.equal(result.googlePlaceId,"place-A");
    assert.equal(harness.row("geo_points").provider,"google_places");
    assert.equal(harness.row("geo_points").google_place_id,"place-A");
    assert.equal(harness.row("geo_points").geocode_status,"RESOLVED");
    assert.equal(harness.row(type==="DIRECTORY_PROFILE"?"directory_profiles":type==="MANAGED_EVENT"?"managed_events":"organization_locations").address,"New address place-A");
    assert.equal(harness.publishable().length,1);
  });
  test("source committed but reconciliation fails: old exact marker suppressed "+type,async()=>{
    harness.init(type);
    assert.equal(harness.publishable().length,1);
    harness.inject("afterBatch",()=>{throw Error("RECONCILIATION_FAILED");});
    await assert.rejects(confirm(type),/GOOGLE_CONFIRMATION_REPAIR_REQUIRED/);
    assert.equal(harness.publishable().length,0);
    assert.equal(harness.row("geo_points").resolved_source_fingerprint,null);
  });
  test("D1 batch failure rolls back canonical address and GEO: "+type,async()=>{
    harness.init(type);
    harness.inject("duringBatch",()=>{throw Error("D1_BATCH_FAILURE");});
    await assert.rejects(confirm(type),/D1_BATCH_FAILURE/);
    assert.equal(harness.row(type==="DIRECTORY_PROFILE"?"directory_profiles":type==="MANAGED_EVENT"?"managed_events":"organization_locations").address,"Old address");
    assert.equal(harness.publishable().length,1);
  });
  test("precommit source CAS rejects conflicting revision: "+type,async()=>{
    harness.init(type);
    harness.inject("beforeBatch",()=>harness.changeCanonical());
    await assert.rejects(confirm(type),/GOOGLE_CONFIRMATION_CONFLICT/);
    assert.notEqual(harness.row(type==="DIRECTORY_PROFILE"?"directory_profiles":type==="MANAGED_EVENT"?"managed_events":"organization_locations").address,"New address place-A");
    assert.equal(harness.row("geo_points").google_place_id,null);
  });
  test("new admin HIDDEN between source and visibility rejects Google: "+type,async()=>{
    harness.init(type,{publicExact:false});
    harness.inject("beforeVisibility",()=>harness.markHidden());
    await assert.rejects(confirm(type),/GOOGLE_CONFIRMATION_REPAIR_REQUIRED/);
    assert.equal(harness.row("geo_points").public_visibility,"HIDDEN");
    assert.equal(harness.publishable().length,0);
  });
  test("manual override during final resolution rejects Google: "+type,async()=>{
    harness.init(type);
    harness.inject("beforeResolution",()=>harness.markManual());
    await assert.rejects(confirm(type),/GOOGLE_CONFIRMATION_REPAIR_REQUIRED/);
    assert.equal(harness.row("geo_points").manual_override,1);
    assert.equal(harness.row("geo_points").google_place_id,null);
    assert.equal(harness.publishable().length,0);
  });
  test("new NOT_REQUIRED audit decision wins over stale confirmation: "+type,async()=>{
    harness.init(type);
    harness.inject("beforeAudit",()=>harness.markNotRequired("new-other-admin"));
    await assert.rejects(confirm(type),/GOOGLE_CONFIRMATION_REPAIR_REQUIRED/);
    assert.equal(harness.decision().id,"new-other-admin");
    assert.equal(harness.decision().action,"GOOGLE_MAPS_NOT_REQUIRED");
  });
  test("concurrent confirmations A/B: only first committed source wins "+type,async()=>{
    harness.init(type);
    let b;
    harness.inject("discover",async()=>{b=await confirm(type,"place-B");});
    await assert.rejects(confirm(type,"place-A"),/GOOGLE_CONFIRMATION_CONFLICT/);
    assert.equal(b.googlePlaceId,"place-B");
    assert.equal(harness.row("geo_points").google_place_id,"place-B");
    assert.equal(harness.publishable().length,1);
  });
  test("manual/admin change before source CAS rejects late Google: "+type,async()=>{
    harness.init(type);
    harness.inject("beforeBatch",()=>harness.markManual());
    await assert.rejects(confirm(type),/GOOGLE_CONFIRMATION_CONFLICT/);
    assert.equal(harness.row("geo_points").manual_override,1);
    assert.equal(harness.row("geo_points").google_place_id,null);
  });
  test("no initial GEO point still confirms safely: "+type,async()=>{
    harness.init(type,{missingGeo:true});
    const result=await confirm(type);
    assert.equal(result.googlePlaceId,"place-A");
    assert.equal(harness.publishable().length,1);
  });
}
test("online managed event rejects physical Google confirmation before source commit",async()=>{
  harness.init("MANAGED_EVENT",{online:true});
  await assert.rejects(confirm("MANAGED_EVENT"),/GOOGLE_ONLINE_EVENT_FORBIDDEN/);
  assert.equal(harness.row("managed_events").address,"Old address");
  assert.equal(harness.row("geo_points").google_place_id,null);
});
