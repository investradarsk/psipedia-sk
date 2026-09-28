import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { geoAdminOperatorState } from "../lib/geo-admin-operator-state.ts";

const operatorStore = readFileSync(new URL("../lib/geo-admin-operator.ts", import.meta.url), "utf8");
const operatorComponent = readFileSync(new URL("../components/admin-geo-operator-dashboard.tsx", import.meta.url), "utf8");
const geoPage = readFileSync(new URL("../app/admin/operations/geo/page.tsx", import.meta.url), "utf8");
const advancedComponent = readFileSync(new URL("../components/admin-geo-operations.tsx", import.meta.url), "utf8");

const base = {
  addressState: "COMPLETE",
  addressReason: "COMPLETE",
  geocodeStatus: null,
  publicVisibility: null,
  publicPrecision: null,
  latitude: null,
  longitude: null,
  sourceFingerprint: null,
  resolvedSourceFingerprint: null,
  manualOverride: false,
};

test("operator state: complete exact resolved profile is on map", () => {
  assert.equal(geoAdminOperatorState({
    ...base,
    geocodeStatus: "RESOLVED",
    publicVisibility: "EXACT_PUBLIC",
    publicPrecision: "EXACT",
    latitude: 48.1,
    longitude: 18.2,
    sourceFingerprint: "same",
    resolvedSourceFingerprint: "same",
  }).state, "ON_MAP");
});

test("operator state: complete canonical address without geo waits for processing", () => {
  assert.equal(geoAdminOperatorState(base).state, "PENDING");
});

test("operator state: missing and incomplete canonical addresses are explicit", () => {
  assert.equal(geoAdminOperatorState({ ...base, addressState: "MISSING", addressReason: "MISSING" }).state, "MISSING_ADDRESS");
  assert.equal(geoAdminOperatorState({ ...base, addressState: "INCOMPLETE", addressReason: "HOUSE_NUMBER_MISSING" }).state, "INCOMPLETE_ADDRESS");
});

test("operator state: invalid canonical values fail closed", () => {
  assert.equal(geoAdminOperatorState({ ...base, addressState: "NEEDS_REVIEW", addressReason: "LOCALITY_INVALID" }).state, "INVALID_ADDRESS");
  assert.equal(geoAdminOperatorState({ ...base, addressState: "NEEDS_REVIEW", addressReason: "POSTAL_CODE_INVALID" }).state, "INVALID_ADDRESS");
});

test("operator state: legacy unconfirmed never looks canonical-complete", () => {
  const result = geoAdminOperatorState({ ...base, addressState: "NEEDS_REVIEW", addressReason: "LEGACY_UNCONFIRMED" });
  assert.equal(result.state, "NEEDS_REVIEW");
  assert.match(result.reason, /Historická adresa/);
});

test("operator state: review, failed and stale exact-only mismatches are human states", () => {
  assert.equal(geoAdminOperatorState({ ...base, geocodeStatus: "NEEDS_REVIEW" }).state, "NEEDS_REVIEW");
  assert.equal(geoAdminOperatorState({ ...base, geocodeStatus: "FAILED" }).state, "FAILED");
  assert.equal(geoAdminOperatorState({ ...base, geocodeStatus: "STALE" }).state, "NEEDS_REVIEW");
  assert.equal(geoAdminOperatorState({
    ...base,
    geocodeStatus: "RESOLVED",
    publicVisibility: "APPROXIMATE_PUBLIC",
    publicPrecision: "MUNICIPALITY",
    latitude: 48.1,
    longitude: 18.2,
    sourceFingerprint: "same",
    resolvedSourceFingerprint: "same",
  }).state, "NEEDS_REVIEW");
});

test("operator loader reads canonical DIRECTORY_PROFILE address and not legacy address as canonical", () => {
  assert.match(operatorStore, /evaluateDirectoryServiceAddress/);
  assert.match(operatorStore, /d\.postal_code/);
  assert.match(operatorStore, /d\.street/);
  assert.match(operatorStore, /d\.house_number/);
  assert.match(operatorStore, /d\.address_format/);
  assert.match(operatorStore, /d\.service_address_confirmation/);
  assert.match(operatorStore, /legacyAddress: value\(row, "address"\)/);
});

test("operator CTA links directly to the directory editor and review reuses Attention Center", () => {
  assert.match(operatorStore, /\/admin\/adresar\/\$\{id\}#service-address/);
  assert.match(operatorStore, /source=GEO_LOCATION_ISSUE/);
  assert.match(operatorComponent, /Otvoriť profil a doplniť adresu/);
  assert.match(operatorComponent, /Opraviť adresu/);
  assert.match(operatorComponent, /Skontrolovať problém/);
});

test("technical details are collapsed and advanced tooling remains available but secondary", () => {
  assert.match(operatorComponent, /<details/);
  assert.match(operatorComponent, /Technické detaily/);
  assert.match(geoPage, /<details className="admin-form-card"/);
  assert.match(geoPage, /Pokročilé nástroje/);
  assert.match(geoPage, /<AdminGeoOperations/);
});

test("operator view exposes human search and filters instead of canonical IDs", () => {
  assert.match(operatorComponent, /Hľadať názov, obec, okres alebo kategóriu/);
  assert.match(operatorComponent, /Na mape/);
  assert.match(operatorComponent, /Čaká na spracovanie/);
  assert.match(operatorComponent, /Treba skontrolovať/);
  assert.match(operatorComponent, /Chýba adresa/);
  assert.match(operatorComponent, /Chyby/);
});

test("mobile-safe layout avoids forced horizontal tables in the operator-first view", () => {
  assert.match(operatorComponent, /flexWrap: "wrap"/);
  assert.match(operatorComponent, /minWidth: 0/);
  assert.match(operatorComponent, /overflow: "hidden"/);
  assert.doesNotMatch(operatorComponent, /<table/);
});

test("existing advanced async tooling preserves immediate busy/progress feedback", () => {
  assert.match(advancedComponent, /disabled=\{busy/);
  assert.match(advancedComponent, /Backfill prebieha:/);
  assert.match(advancedComponent, /setProgress/);
  assert.match(advancedComponent, /setMessage/);
  assert.match(advancedComponent, /setError/);
});
