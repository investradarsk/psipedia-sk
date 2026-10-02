import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  GEO_ADMIN_DEFAULT_PAGE_SIZE,
  GEO_ADMIN_MAX_PAGE_SIZE,
  normalizeGeoAdminOperatorQuery,
  normalizeGeoAdminPageSize,
} from "../lib/geo-admin-operator.ts";
import {
  googlePlaceActionForSource,
  googlePlaceConfirmationForSource,
} from "../lib/google-place-target-discovery.ts";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const loader = read("lib/geo-admin-operator.ts");
const dashboard = read("components/admin-geo-operator-dashboard.tsx");
const picker = read("components/admin-google-place-picker.tsx");
const route = read("app/api/admin/geo/[targetType]/[id]/route.ts");
const geoStore = read("lib/geo-store.ts");
const quality = read("lib/data-quality-store.ts");
const bulk = read("lib/google-place-bulk.ts");

test("MAP-ADMIN-PERF page size defaults to 50, supports 25/50/100 and clamps above 100", () => {
  assert.equal(GEO_ADMIN_DEFAULT_PAGE_SIZE, 50);
  assert.equal(GEO_ADMIN_MAX_PAGE_SIZE, 100);
  assert.equal(normalizeGeoAdminPageSize(undefined), 50);
  assert.equal(normalizeGeoAdminPageSize(25), 25);
  assert.equal(normalizeGeoAdminPageSize(50), 50);
  assert.equal(normalizeGeoAdminPageSize(100), 100);
  assert.equal(normalizeGeoAdminPageSize(101), 100);
  assert.equal(normalizeGeoAdminPageSize(9999), 100);
  assert.equal(normalizeGeoAdminPageSize(75), 50);
});

test("MAP-ADMIN-PERF query normalization validates every URL-backed filter", () => {
  assert.deepEqual(normalizeGeoAdminOperatorQuery({
    group: "services",
    category: " veterinari ",
    operator: "needs_review",
    google: "unresolved",
    query: " Nitra ",
    page: "2",
    pageSize: "100",
  }), {
    group: "SERVICES",
    category: "veterinari",
    operator: "NEEDS_REVIEW",
    google: "UNRESOLVED",
    query: "Nitra",
    page: 2,
    pageSize: 100,
  });

  assert.deepEqual(normalizeGeoAdminOperatorQuery({
    group: "bogus",
    operator: "bogus",
    google: "bogus",
    page: "-1",
    pageSize: "500",
  }), {
    group: "ALL",
    category: "",
    operator: "ALL",
    google: "ALL",
    query: "",
    page: 1,
    pageSize: 100,
  });
});

test("MAP-ADMIN-PERF loader cannot regress to three LIMIT 2000 browser dumps", () => {
  assert.doesNotMatch(loader, /LIMIT 2000/);
  assert.match(loader, /WITH\s+explicit_private/);
  assert.match(loader, /COUNT\(\*\) AS total/);
  assert.match(loader, /LIMIT \? OFFSET \?/);
  assert.match(loader, /ORDER BY name COLLATE NOCASE ASC, target_type ASC, target_id ASC/);
  assert.match(loader, /pageRows\.results/);
  assert.doesNotMatch(loader, /\.results\.map\(directoryRow\)[\s\S]*\.results\.map\(organizationRow\)[\s\S]*\.results\.map\(eventRow\)/);
});

test("MAP-ADMIN-PERF client never mounts one picker per row on initial load", () => {
  assert.match(dashboard, /activePickerKey/);
  assert.match(dashboard, /pickerOpen = activePickerKey === item\.key/);
  assert.match(dashboard, /pickerOpen && item\.googleMapsTarget !== "NOT_REQUIRED"/);
  assert.match(dashboard, /autoDiscover/);
  assert.match(picker, /if \(!autoDiscover \|\| autoStarted\.current/);
  assert.doesNotMatch(dashboard, /window\.location\.reload/);
});

test("HELP Google discovery works without SITE but confirmation stays SITE-gated", () => {
  const legalSeat = {
    targetType: "ORGANIZATION_LOCATION",
    targetId: 11,
    organizationId: 5,
    label: "Útulok Šťastný pes",
    organizationName: "Útulok Šťastný pes",
    locationRole: "LEGAL_SEAT",
    address: "",
    city: "",
    district: "",
    region: "",
    countryCode: "SK",
    published: true,
  };
  assert.equal(googlePlaceActionForSource(legalSeat).available, true);
  assert.equal(googlePlaceConfirmationForSource(legalSeat).available, false);

  const site = { ...legalSeat, locationRole: "SITE" };
  assert.equal(googlePlaceConfirmationForSource(site).available, true);
  assert.match(route, /confirmOrganizationSite !== true/);
  assert.match(route, /createOrganizationLocationFromAdmin/);
});

test("physical event can search by title only while online event never confirms a physical place", () => {
  const physical = {
    targetType: "MANAGED_EVENT",
    targetId: 21,
    label: "Nitra Dog Expo 2026",
    venue: "",
    address: "",
    city: "",
    region: "",
    countryCode: "SK",
    online: false,
    published: true,
  };
  assert.equal(googlePlaceActionForSource(physical).available, true);
  assert.equal(googlePlaceConfirmationForSource(physical).available, true);
  assert.equal(googlePlaceActionForSource({ ...physical, online: true }).available, false);
  assert.equal(googlePlaceConfirmationForSource({ ...physical, online: true }).available, false);
});

test("NOT_REQUIRED persists only as moderation workflow state and has an explicit reset", () => {
  assert.match(geoStore, /GOOGLE_MAPS_NOT_REQUIRED_ACTION = "GOOGLE_MAPS_NOT_REQUIRED"/);
  assert.match(geoStore, /GOOGLE_MAPS_REQUIRED_AGAIN_ACTION = "GOOGLE_MAPS_REQUIRED_AGAIN"/);
  assert.match(geoStore, /writeGeoModerationEvent/);
  assert.match(geoStore, /changedFields: \["google_maps_workflow"\]/);
  assert.match(route, /google-maps-not-required/);
  assert.match(route, /reset-google-maps-not-required/);

  const workflowBlock = geoStore.slice(
    geoStore.indexOf("export async function setGoogleMapsNotRequired"),
    geoStore.indexOf("export async function initializeGeoPointForTarget"),
  );
  assert.doesNotMatch(workflowBlock, /google_place_id|latitude|longitude|provider|geocode_status\s*=/i);
});

test("NOT_REQUIRED closes only map address quality and is excluded from bulk", () => {
  assert.match(quality, /GOOGLE_MAPS_NOT_REQUIRED_SQL/);
  assert.match(quality, /trim\(COALESCE\(address, ''\)\) <> ''/);
  assert.match(quality, /mapReviewClosedWithoutGoogle/);
  assert.match(bulk, /google_state <> 'NOT_REQUIRED'/);
  assert.match(bulk, /getGoogleMapsWorkflowDecision/);
  assert.match(bulk, /Admin označil Google Maps ako nepotrebné/);
});
