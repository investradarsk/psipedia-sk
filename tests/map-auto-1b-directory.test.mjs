import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { classifyGeoSource } from "../lib/geo.ts";

function source(path) {
  return readFileSync(new URL("../" + path, import.meta.url), "utf8");
}

function functionBody(text, name) {
  const start = text.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const next = text.indexOf("\nexport async function ", start + 1);
  return text.slice(start, next === -1 ? text.length : next);
}

const directoryStore = source("lib/directory-store.ts");
const adminDirectoryRoute = source("app/api/admin/directory/[id]/route.ts");
const adminImport = source("app/api/admin/import/route.ts");
const bulkExecution = source("lib/admin-bulk/execution.ts");
const bulkRoute = source("app/api/admin/bulk/execute/route.ts");
const automationApply = source("lib/data-automation-apply.ts");
const canonicalAutomationApply = source("lib/data-automation-canonical-apply.ts");
const partnerNewAdmin = source("lib/partner-new-profile-admin.ts");
const partnerNewRaw = source("lib/partner-new-profile.ts");
const partnerChangesAdmin = source("lib/partner-profile-changes-admin.ts");
const partnerChangesRaw = source("lib/partner-profile-changes.ts");
const addressSave = source("lib/directory-address-save.ts");
const geoStore = source("lib/geo-store.ts");

const createDirectory = functionBody(directoryStore, "createManagedDirectoryProfile");
const updateDirectory = functionBody(directoryStore, "updateManagedDirectoryProfile");
const archiveDirectory = functionBody(directoryStore, "archiveManagedDirectoryProfile");
const restoreDirectory = functionBody(directoryStore, "restoreManagedDirectoryProfile");
const reconcile = functionBody(geoStore, "reconcileGeoAfterSourceMutation");
const sync = functionBody(geoStore, "syncGeoPointAfterSourceChange");

test("admin DIRECTORY create initializes or reconciles GEO through the centralized helper", () => {
  assert.match(createDirectory, /reconcileGeoAfterSourceMutation\(\{/);
  assert.match(createDirectory, /targetType: "DIRECTORY_PROFILE"/);
});

test("admin DIRECTORY edit reconciles GEO after canonical mutation", () => {
  assert.match(updateDirectory, /UPDATE directory_profiles/);
  assert.match(updateDirectory, /reconcileGeoAfterSourceMutation\(\{/);
});

test("unchanged edits keep the centralized no-op behavior", () => {
  assert.match(reconcile, /action: changed \? "SYNCED" as const : "NO_OP" as const/);
  assert.match(sync, /return current/);
});

test("verified exact admin flow reuses the existing safe provider apply without duplicate route sync", () => {
  assert.match(adminDirectoryRoute, /applyVerifiedDirectoryAddressGeo/);
  assert.doesNotMatch(adminDirectoryRoute, /syncGeoPointAfterSourceChange/);
  assert.match(addressSave, /getGeoPointForTarget\("DIRECTORY_PROFILE"/);
  assert.match(addressSave, /if \(!point\)/);
});

test("physical to online stays classifier-owned and becomes hidden", () => {
  const classification = classifyGeoSource({
    targetType: "DIRECTORY_PROFILE",
    targetId: 1,
    label: "Online",
    category: "veterinari",
    region: "",
    district: "",
    city: "",
    postalCode: "",
    street: "",
    houseNumber: "",
    addressFormat: "",
    serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
    countryCode: "SK",
    online: true,
    published: true,
  });
  assert.equal(classification.proposedVisibility, "HIDDEN");
});

test("online to confirmed physical stays classifier-owned and re-enters exact lifecycle", () => {
  const classification = classifyGeoSource({
    targetType: "DIRECTORY_PROFILE",
    targetId: 1,
    label: "Prevádzka",
    category: "veterinari",
    region: "Nitriansky kraj",
    district: "Zlaté Moravce",
    city: "Zlaté Moravce",
    postalCode: "953 01",
    street: "Hviezdoslavova",
    houseNumber: "74",
    addressFormat: "STREET",
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    countryCode: "SK",
    online: false,
    published: true,
  });
  assert.equal(classification.proposedVisibility, "EXACT_PUBLIC");
  assert.equal(classification.proposedPrecision, "EXACT");
});

test("archive retains GEO lifecycle instead of hard-deleting a point", () => {
  assert.match(archiveDirectory, /status='archived'/);
  assert.match(archiveDirectory, /reconcileGeoAfterSourceMutation\(\{/);
  assert.doesNotMatch(archiveDirectory, /DELETE FROM geo_points/);
});

test("restore reconciles retained GEO lifecycle", () => {
  assert.match(restoreDirectory, /status='draft'/);
  assert.match(restoreDirectory, /reconcileGeoAfterSourceMutation\(\{/);
});

test("bulk publish and move-to-draft reconcile each successful DIRECTORY mutation at the API boundary", () => {
  assert.doesNotMatch(bulkExecution, /reconcileGeoAfterSourceMutation/);
  assert.match(bulkRoute, /payload\?\.module === "directory"/);
  assert.match(bulkRoute, /for \(const item of result\.updated\)/);
  assert.match(bulkRoute, /reconcileGeoAfterSourceMutation\(\{/);
  assert.match(bulkRoute, /targetType: "DIRECTORY_PROFILE"/);
});

test("admin import reconciles every canonical DIRECTORY upsert after the batch", () => {
  assert.match(adminImport, /directoryProfilesToReconcile/);
  assert.match(adminImport, /reconcileGeoAfterSourceMutation\(\{/);
  assert.match(adminImport, /SELECT id FROM directory_profiles/);
});

test("automation create and update paths reconcile DIRECTORY canonical results", () => {
  assert.match(automationApply, /if \(finding\.entityType === "DIRECTORY"\)/);
  assert.match(automationApply, /targetType: "DIRECTORY_PROFILE"/);
  assert.ok((automationApply.match(/reconcileGeoAfterSourceMutation\(\{/g) ?? []).length >= 2);
});

test("reviewed canonical automation apply reconciles DIRECTORY including idempotent replay", () => {
  assert.match(canonicalAutomationApply, /target\.entityType==="DIRECTORY"/);
  assert.match(canonicalAutomationApply, /preview\.entityType==="DIRECTORY"/);
  assert.ok((canonicalAutomationApply.match(/reconcileGeoAfterSourceMutation\(\{/g) ?? []).length >= 3);
});

test("raw partner new-profile staging does not own GEO publication", () => {
  assert.doesNotMatch(partnerNewRaw, /reconcileGeoAfterSourceMutation/);
  assert.doesNotMatch(partnerNewRaw, /applyGeocoderResolution/);
});

test("partner canonical new-profile approval reconciles only after approved canonical creation", () => {
  const approve = functionBody(partnerNewAdmin, "createPartnerNewProfileAdmin");
  assert.match(approve, /applyAtomicModerationTransition/);
  assert.match(approve, /resolvedCanonicalId/);
  assert.match(approve, /reconcileGeoAfterSourceMutation\(\{/);
});

test("raw partner profile-change submission does not trigger GEO lifecycle", () => {
  assert.doesNotMatch(partnerChangesRaw, /reconcileGeoAfterSourceMutation/);
});

test("partner canonical profile-change approval reconciles DIRECTORY after atomic approval", () => {
  const approve = functionBody(partnerChangesAdmin, "approvePartnerProfileChangeAdmin");
  assert.match(approve, /applyAtomicModerationTransition/);
  assert.match(approve, /row\.resourceType === "DIRECTORY_PROFILE"/);
  assert.match(approve, /reconcileGeoAfterSourceMutation\(\{/);
});

test("manual override protection remains centralized and is not disabled by write-path integration", () => {
  assert.match(sync, /if \(current\.manualOverride\)/);
  assert.match(sync, /last_error_code='MANUAL_REVIEW'/);
  const integrations = [directoryStore, adminImport, bulkRoute, automationApply, canonicalAutomationApply, partnerNewAdmin, partnerChangesAdmin].join("\n");
  assert.doesNotMatch(integrations, /manual_override\s*=\s*0/);
});

test("MAP-AUTO integration does not call a geocoder or provider directly", () => {
  const integrations = [directoryStore, adminImport, bulkRoute, automationApply, canonicalAutomationApply, partnerNewAdmin, partnerChangesAdmin].join("\n");
  assert.doesNotMatch(integrations, /Geoapify|geoapify|applyGeocoderResolution|verifyDirectoryAddressSelection|geo-provider/);
});

test("Attention side effects remain owned by GEO core", () => {
  const integrations = [directoryStore, adminImport, bulkRoute, automationApply, canonicalAutomationApply, partnerNewAdmin, partnerChangesAdmin].join("\n");
  assert.doesNotMatch(integrations, /enqueueGeoAttentionEvent|GEO_LOCATION_ISSUE/);
  assert.match(sync, /enqueueGeoAttentionEvent/);
});

test("historical A2 migration is not invoked by any MAP-AUTO write-path integration", () => {
  const integrations = [directoryStore, adminImport, bulkRoute, automationApply, canonicalAutomationApply, partnerNewAdmin, partnerChangesAdmin].join("\n");
  assert.doesNotMatch(integrations, /directory-exact-geo-migration|runDirectoryExactGeoMigration|A2-MIGRATE/);
});

test("reconcile failures are not silently swallowed by admin, import, automation, or partner canonical writers", () => {
  for (const text of [directoryStore, adminImport, automationApply, canonicalAutomationApply, partnerNewAdmin, partnerChangesAdmin]) {
    assert.doesNotMatch(text, /reconcileGeoAfterSourceMutation[\s\S]{0,180}\.catch\(/);
  }
  assert.match(bulkRoute, /await reconcileGeoAfterSourceMutation/);
  assert.match(bulkExecution, /failed\.push\(\{ id, reason: "mutation-failed" \}\)/);
});

test("central helper remains the single lifecycle entrypoint and does not call a provider", () => {
  assert.match(reconcile, /initializeGeoPointForTarget/);
  assert.match(reconcile, /syncGeoPointAfterSourceChange/);
  assert.doesNotMatch(reconcile, /Geoapify|applyGeocoderResolution|verifyDirectoryAddressSelection/);
});
