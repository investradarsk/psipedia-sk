import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyGeoSource } from "../lib/geo.ts";

function source(path) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

const geoStore = source("lib/geo-store.ts");
const geoSchema = source("db/geo-schema.ts");
const directoryStore = source("lib/directory-store.ts");
const eventStore = source("lib/event-store.ts");
const orgWrite = source("lib/help-organization-admin-write.ts");
const orgLocationWrite = source("lib/organization-location-admin-write.ts");
const partnerNew = source("lib/partner-new-profile-admin.ts");
const partnerProfile = source("lib/partner-profile-changes-admin.ts");
const partnerEvents = source("lib/partner-events-admin.ts");
const adminImport = source("app/api/admin/import/route.ts");
const automationApply = source("lib/data-automation-apply.ts");
const canonicalApply = source("lib/data-automation-canonical-apply.ts");
const attentionStore = source("lib/admin-attention-queue-store.ts");

test("central lifecycle remains initialize + sync and provider-free", () => {
  assert.match(geoStore, /export async function reconcileGeoAfterSourceMutation/);
  assert.match(geoStore, /initializeGeoPointForTarget/);
  assert.match(geoStore, /syncGeoPointAfterSourceChange/);
  const body=geoStore.slice(geoStore.indexOf("export async function reconcileGeoAfterSourceMutation"),geoStore.indexOf("export async function applyGeocoderResolution"));
  assert.doesNotMatch(body,/Geoapify|geocodeExact|geocodeApproximate|applyGeocoderResolution/);
});

test("schema has one logical GEO point per target", () => {
  assert.match(geoSchema,/geo_points_directory_unique/);
  assert.match(geoSchema,/geo_points_organization_location_unique/);
  assert.match(geoSchema,/geo_points_event_unique/);
});

test("repeated reconcile has explicit no-op paths and manual override protection", () => {
  assert.match(geoStore,/desiredState\.sourceFingerprint === current\.sourceFingerprint/);
  assert.match(geoStore,/action: changed \? "SYNCED" as const : "NO_OP" as const/);
  assert.match(geoStore,/if \(current\.manualOverride\)/);
  assert.match(geoStore,/last_error_code='MANUAL_REVIEW'/);
});

test("Attention is derived from actionable GEO state and successful RESOLVED state closes it", () => {
  assert.match(attentionStore,/WHERE g\.geocode_status IN \('NEEDS_REVIEW', 'STALE', 'FAILED'\)/);
  assert.match(geoStore,/geocode_status='RESOLVED'/);
});

test("DIRECTORY canonical writers remain centralized", () => {
  for(const text of [directoryStore,adminImport,automationApply,canonicalApply,partnerNew,partnerProfile]) {
    assert.match(text,/reconcileGeoAfterSourceMutation/);
  }
});

test("ORGANIZATION location admin create and update use centralized lifecycle", () => {
  assert.match(orgLocationWrite,/targetType: "ORGANIZATION_LOCATION"/);
  assert.ok((orgLocationWrite.match(/reconcileGeoAfterSourceMutation/g)??[]).length>=2);
});

test("ORGANIZATION parent publication lifecycle reconciles child locations", () => {
  assert.match(orgWrite,/reconcileOrganizationLocationsGeo/);
  assert.match(orgWrite,/SELECT id FROM organization_locations WHERE organization_id = \?/);
  assert.match(orgWrite,/targetType: "ORGANIZATION_LOCATION"/);
  assert.match(orgWrite,/await reconcileOrganizationLocationsGeo\(id, editorEmail, db\)/);
});

test("partner organization creation and approved location changes reconcile GEO", () => {
  assert.match(partnerNew,/row\.resourceType === "HELP_ORGANIZATION"/);
  assert.match(partnerNew,/targetType: "ORGANIZATION_LOCATION"/);
  assert.match(partnerProfile,/row\.resourceType === "HELP_ORGANIZATION"/);
  assert.match(partnerProfile,/canonical\.locationId/);
  assert.match(partnerProfile,/targetType: "ORGANIZATION_LOCATION"/);
});

test("MANAGED_EVENT admin full edit covers publication and cancellation changes", () => {
  assert.match(eventStore,/before\.status !== after\.status/);
  assert.match(eventStore,/before\.cancelled !== after\.cancelled/);
  assert.match(eventStore,/if \(managedEventGeoSourceChanged\(existing, event\)\)/);
});

test("MANAGED_EVENT bulk and quick-edit cancellation paths reconcile GEO", () => {
  assert.match(eventStore,/field === "status" \|\| field === "cancelled"/);
  assert.match(eventStore,/await reconcileManagedEventGeo\(id, editorEmail, requireD1Binding\(\)\)/);
});

test("partner event cancellation is GEO-relevant", () => {
  assert.match(partnerEvents,/\["venue","city","region","address","cancelled"\]/);
  assert.match(partnerEvents,/reconcileGeoAfterSourceMutation/);
});

test("classifiers preserve domain-specific contracts", () => {
  const online=classifyGeoSource({targetType:"MANAGED_EVENT",targetId:1,label:"Online",city:"online",countryCode:"SK",published:true});
  assert.equal(online.proposedVisibility,"HIDDEN");
  const city=classifyGeoSource({targetType:"MANAGED_EVENT",targetId:2,label:"City",city:"Nitra",countryCode:"SK",published:true});
  assert.equal(city.proposedVisibility,"APPROXIMATE_PUBLIC");
  const service=classifyGeoSource({targetType:"ORGANIZATION_LOCATION",targetId:3,label:"Area",locationRole:"SERVICE_AREA",city:"Nitra",countryCode:"SK",published:true});
  assert.equal(service.proposedPrecision,"SERVICE_AREA");
  const legal=classifyGeoSource({targetType:"ORGANIZATION_LOCATION",targetId:4,label:"Seat",locationRole:"LEGAL_SEAT",address:"X",city:"Nitra",countryCode:"SK",published:true});
  assert.equal(legal.proposedVisibility,null);
});

test("historical DIRECTORY legacy data cannot auto-promote to exact", () => {
  const legacy=classifyGeoSource({targetType:"DIRECTORY_PROFILE",targetId:5,label:"Legacy",category:"veterinari",region:"Nitriansky kraj",district:"Nitra",city:"Nitra",postalCode:"949 01",street:"Hlavna",houseNumber:"1",addressFormat:"STREET",serviceAddressConfirmation:"LEGACY_UNCONFIRMED",countryCode:"SK",online:false,published:true});
  assert.equal(legacy.proposedVisibility,null);
  assert.equal(legacy.requiresReview,true);
});

test("canonical write integrations do not own providers, queues or schedulers", () => {
  const integrations=[directoryStore,eventStore,orgWrite,orgLocationWrite,partnerNew,partnerProfile,partnerEvents,adminImport,automationApply,canonicalApply].join("\n");
  assert.doesNotMatch(integrations,/Geoapify|geocodeExact|geocodeApproximate|applyGeocoderResolution/);
  assert.doesNotMatch(integrations,/queue\.send|new Queue|scheduled\(/);
});

test("reconcile failures are awaited rather than swallowed", () => {
  const integrations=[directoryStore,eventStore,orgWrite,orgLocationWrite,partnerNew,partnerProfile,partnerEvents,adminImport,automationApply,canonicalApply];
  for(const text of integrations) assert.doesNotMatch(text,/reconcileGeoAfterSourceMutation[\s\S]{0,180}\.catch\(/);
});
