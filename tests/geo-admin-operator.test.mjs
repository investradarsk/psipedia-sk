import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { geoAdminGenericOperatorState, geoAdminOperatorState } from "../lib/geo-admin-operator-state.ts";

const operatorStore = readFileSync(new URL("../lib/geo-admin-operator.ts", import.meta.url), "utf8");
const operatorComponent = readFileSync(new URL("../components/admin-geo-operator-dashboard.tsx", import.meta.url), "utf8");
const geoPage = readFileSync(new URL("../app/admin/mapy/page.tsx", import.meta.url), "utf8");
const advancedComponent = readFileSync(new URL("../components/admin-geo-operations.tsx", import.meta.url), "utf8");

const base = {
  addressState: "COMPLETE", addressReason: "COMPLETE", geocodeStatus: null,
  publicVisibility: null, publicPrecision: null, latitude: null, longitude: null,
  sourceFingerprint: null, resolvedSourceFingerprint: null, manualOverride: false,
};

test("operator state helpers keep existing technical lifecycle semantics", () => {
  assert.equal(geoAdminOperatorState({
    ...base, geocodeStatus: "RESOLVED", publicVisibility: "EXACT_PUBLIC", publicPrecision: "EXACT",
    latitude: 48.1, longitude: 18.2, sourceFingerprint: "same", resolvedSourceFingerprint: "same",
  }).state, "ON_MAP");
  assert.equal(geoAdminOperatorState(base).state, "PENDING");
  assert.equal(geoAdminOperatorState({ ...base, addressState: "MISSING", addressReason: "MISSING" }).state, "MISSING_ADDRESS");
  assert.equal(geoAdminGenericOperatorState({
    hasLocationSource: false, geocodeStatus: null, publicVisibility: null, publicPrecision: null,
    latitude: null, longitude: null, sourceFingerprint: null, resolvedSourceFingerprint: null, manualOverride: false,
  }).state, "MISSING_ADDRESS");
});

test("HELP source starts from published organizations and LEFT JOINs one ranked canonical location", () => {
  assert.match(operatorStore, /organization_locations_ranked AS/);
  assert.match(operatorStore, /ROW_NUMBER\(\) OVER[\s\S]*PARTITION BY l\.organization_id/);
  assert.match(operatorStore, /organization_location_canonical AS/);
  assert.match(operatorStore, /FROM help_organizations o[\s\S]*LEFT JOIN organization_location_canonical l ON l\.organization_id = o\.id/);
  assert.match(operatorStore, /WHERE o\.status = 'PUBLISHED' AND o\.archived_at IS NULL/);
  assert.match(operatorStore, /key: `HELP_ORGANIZATION:\$\{organizationId\}`/);
});

test("Admin Mapy default dataset is unresolved-only, with coordinates still requiring Google place", () => {
  assert.match(operatorStore, /google_state IN \('UNRESOLVED', 'COORDINATES'\)/);
  assert.doesNotMatch(operatorComponent, /Operator stav/);
  assert.doesNotMatch(operatorComponent, /Všetky mapové stavy|Konkrétne miesto — vybavené/);
  assert.match(operatorComponent, /Treba vyriešiť/);
  assert.match(operatorComponent, /Iba súradnice — treba Google miesto/);
});

test("operator CTA links to canonical editors while hidden GEO alerts stay out of the Mapy page", () => {
  assert.match(operatorStore, /\/admin\/adresar\/\$\{id\}#service-address/);
  assert.match(operatorStore, /\/admin\/organizacie\/\$\{organizationId\}/);
  assert.match(operatorStore, /\/admin\/podujatia\/\$\{id\}/);
  assert.match(operatorComponent, /Otvoriť profil/);
  assert.match(operatorComponent, /<details/);
  assert.match(operatorComponent, /Technické detaily/);
  assert.doesNotMatch(geoPage, /Technické GEO detaily|GEO_LOCATION_ISSUE/);
  assert.match(advancedComponent, /AdminGeoOperations/);
});

test("main workflow exposes only section, category, search and page size filters", () => {
  assert.match(operatorComponent, /Kategória/);
  assert.match(operatorComponent, /Hľadať/);
  assert.match(operatorComponent, /Na stránku/);
  assert.match(operatorComponent, /setParam\("category"/);
  assert.doesNotMatch(operatorComponent, /setParam\("operator"|setParam\("google"/);
  assert.doesNotMatch(operatorComponent, /selectedCategories|selectedMapTargets|scopedItems/);
  assert.match(operatorStore, /search_text LIKE \? COLLATE NOCASE/);
  assert.match(operatorStore, /LIMIT \? OFFSET \?/);
});

test("mobile-safe card layout avoids main-workflow tables", () => {
  assert.match(operatorComponent, /flexWrap: "wrap"/);
  assert.doesNotMatch(operatorComponent, /<table/);
});
