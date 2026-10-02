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
const confirmation = read("lib/admin-google-place-confirmation.ts");
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

test("MAPS-WORKFLOW-SIMPLIFY ignores obsolete operator/google URL filters", () => {
  assert.deepEqual(normalizeGeoAdminOperatorQuery({
    group: "services",
    category: " veterinari ",
    operator: "needs_review",
    google: "place",
    query: " Nitra ",
    page: "2",
    pageSize: "100",
  }), {
    group: "SERVICES",
    category: "veterinari",
    operator: "ALL",
    google: "ALL",
    query: "Nitra",
    page: 2,
    pageSize: 100,
  });
});

test("MAP-ADMIN-PERF loader stays server-paginated", () => {
  assert.doesNotMatch(loader, /LIMIT 2000/);
  assert.match(loader, /COUNT\(\*\) AS total/);
  assert.match(loader, /LIMIT \? OFFSET \?/);
  assert.match(loader, /ORDER BY name COLLATE NOCASE ASC, target_type ASC, target_id ASC/);
  assert.match(loader, /pageRows\.results/);
});

test("Admin Mapy mounts Google picker only for an explicitly opened unresolved row", () => {
  assert.match(dashboard, /activePickerKey/);
  assert.match(dashboard, /pickerOpen = activePickerKey === item\.key/);
  assert.match(dashboard, /pickerOpen && item\.googlePickerAvailable/);
  assert.match(dashboard, /autoDiscover/);
  assert.match(picker, /if \(!autoDiscover \|\| autoStarted\.current/);
  assert.doesNotMatch(dashboard, /window\.location\.reload/);
});

test("HELP Google confirmation no longer depends on SITE/LEGAL_SEAT roles", () => {
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
  assert.equal(googlePlaceConfirmationForSource(legalSeat).available, true);
  assert.equal(googlePlaceConfirmationForSource({ ...legalSeat, locationRole: "SERVICE_AREA" }).available, true);
  assert.match(route, /confirmAdminGooglePlace/);
  assert.doesNotMatch(confirmation, /confirmOrganizationSite|createOrganizationLocationFromAdmin|locationRole !== "SITE"/);
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

test("NOT_REQUIRED persists only as moderation workflow state", () => {
  assert.match(geoStore, /GOOGLE_MAPS_NOT_REQUIRED_ACTION = "GOOGLE_MAPS_NOT_REQUIRED"/);
  assert.match(geoStore, /GOOGLE_MAPS_REQUIRED_AGAIN_ACTION = "GOOGLE_MAPS_REQUIRED_AGAIN"/);
  assert.match(geoStore, /writeGeoModerationEvent/);
  assert.match(route, /google-maps-not-required/);
  assert.match(route, /reset-google-maps-not-required/);
});

test("Admin Mapy dataset is unresolved-only and bulk respects NOT_REQUIRED", () => {
  assert.match(loader, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
  assert.match(quality, /GOOGLE_MAPS_NOT_REQUIRED_SQL/);
  assert.match(bulk, /getGoogleMapsWorkflowDecision/);
  assert.match(bulk, /Admin označil Google Maps ako nepotrebné/);
});
