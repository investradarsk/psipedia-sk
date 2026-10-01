import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { verifyDirectoryNumberlessLocality } from "../lib/directory-address-provider.ts";
import { evaluateNumberlessGooglePlaceCandidates } from "../lib/google-place-matching.ts";

const autocompleteSource = readFileSync(new URL("../components/directory-address-autocomplete.tsx", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
const createRouteSource = readFileSync(new URL("../app/api/admin/directory/route.ts", import.meta.url), "utf8");
const updateRouteSource = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
const geoRouteSource = readFileSync(new URL("../app/api/admin/geo/[targetType]/[id]/route.ts", import.meta.url), "utf8");
const geoSource = readFileSync(new URL("../lib/geo.ts", import.meta.url), "utf8");

test("MAP-ADDRESS-FREETEXT-1 accepts the explicit AgiPaws locality without a Geoapify result id", () => {
  const verified = verifyDirectoryNumberlessLocality({
    region: "Žilinský kraj",
    district: "Liptovský Mikuláš",
    city: "Liptovský Mikuláš",
    postalCode: "03101",
    street: "  Nábrežie  ",
  });
  assert.deepEqual(verified, {
    region: "Žilinský kraj",
    district: "Liptovský Mikuláš",
    city: "Liptovský Mikuláš",
    postalCode: "031 01",
    street: "Nábrežie",
    houseNumber: "",
    addressFormat: "STREET",
  });
});

test("free-text locality still requires canonical Slovak locality and postcode", () => {
  assert.throws(() => verifyDirectoryNumberlessLocality({
    region: "Žilinský kraj",
    district: "Liptovský Mikuláš",
    city: "Neexistujúce mesto",
    postalCode: "031 01",
    street: "Nábrežie",
  }), /platný kraj, okres a obec/);

  assert.throws(() => verifyDirectoryNumberlessLocality({
    region: "Žilinský kraj",
    district: "Liptovský Mikuláš",
    city: "Liptovský Mikuláš",
    postalCode: "031",
    street: "Nábrežie",
  }), /platné PSČ/);
});

test("free-text locality rejects control and markup characters instead of sanitizing them into canonical data", () => {
  for (const street of ["Nábrežie<script>", "Nábrežie\u0000x"]) {
    assert.throws(() => verifyDirectoryNumberlessLocality({
      region: "Žilinský kraj",
      district: "Liptovský Mikuláš",
      city: "Liptovský Mikuláš",
      postalCode: "031 01",
      street,
    }), /nepovolené znaky/);
  }
});

test("autocomplete preserves Geoapify suggestions and adds an explicit typed-locality action", () => {
  assert.match(autocompleteSource, /\/api\/admin\/directory\/address-autocomplete/);
  assert.match(autocompleteSource, /Použiť „\{query\.trim\(\)\}“ ako lokalitu/);
  assert.match(autocompleteSource, /Nenašiel si správnu ulicu\?/);
  assert.match(autocompleteSource, /onUseLocality\(locality\)/);
  assert.match(autocompleteSource, /Táto lokalita nebola vybraná zo zoznamu ulíc/);
  assert.match(autocompleteSource, /Presné miesto musí následne potvrdiť Google Maps/);
});

test("admin editor sends the confirmation only after the explicit locality action", () => {
  assert.match(editorSource, /numberlessLocalityConfirmed/);
  assert.match(editorSource, /onUseLocality=\{\(locality\) => \{/);
  assert.match(editorSource, /setNumberlessLocalityConfirmed\(true\)/);
  assert.match(editorSource, /setStreet\(locality\)/);
  assert.match(editorSource, /setHouseNumber\(""\)/);
  assert.match(editorSource, /setAddressFormat\("STREET"\)/);
  assert.match(editorSource, /numberlessLocalityConfirmed: numberlessLocalityConfirmed \|\| undefined/);
  assert.match(editorSource, /if \(event\.target\.value\.trim\(\)\) \{[\s\S]*setNumberlessLocalityConfirmed\(false\)/);
});

test("create and update routes keep explicit numberless verification optional and allow sparse address hints", () => {
  for (const source of [createRouteSource, updateRouteSource]) {
    assert.match(source, /rawNumberlessLocalityConfirmed === true/);
    assert.match(source, /verifyDirectoryNumberlessLocality/);
    assert.match(source, /withVerifiedDirectoryNumberlessAddress/);
    assert.match(source, /withUnconfirmedDirectoryAddress/);
    assert.match(source, /catch \{/);
    assert.doesNotMatch(source, /Zadanú lokalitu možno použiť iba bez čísla domu/);
    assert.doesNotMatch(source, /Zadanú lokalitu možno použiť iba ako ulicu \/ lokalitu/);
  }
});

test("numbered and Geoapify-selected numberless flows remain provider-verified", () => {
  for (const source of [createRouteSource, updateRouteSource]) {
    assert.match(source, /verifyDirectoryAddressSelection/);
    assert.match(source, /verifyDirectoryNumberlessAddressSelection/);
    assert.match(source, /addressProviderResultId/);
  }
  assert.match(createRouteSource, /body\.addressProviderResultId\?\.trim\(\) && body\.houseNumber\?\.trim\(\) && hasLocality[\s\S]*verifyDirectoryAddressSelection/);
  assert.match(updateRouteSource, /const houseNumber = \(body\.houseNumber \?\? before\.houseNumber\)\.trim\(\)/);
  assert.match(updateRouteSource, /body\.addressProviderResultId\?\.trim\(\) && houseNumber && hasLocality[\s\S]*verifyDirectoryAddressSelection/);
});

test("free-text and sparse hint saves never fabricate an exact geo resolution", () => {
  for (const source of [createRouteSource, updateRouteSource]) {
    assert.match(source, /let verified = null/);
    assert.match(source, /if \(verified\) \{[\s\S]*applyVerifiedDirectoryAddressGeo/);
    assert.match(source, /numberlessLocalityConfirmed/);
    assert.match(source, /verifyDirectoryNumberlessLocality/);
    assert.match(source, /withVerifiedDirectoryNumberlessAddress/);
    assert.match(source, /withUnconfirmedDirectoryAddress/);
  }
});

test("AgiPaws free-text locality is still accepted only through a strong concrete Google Place match", () => {
  const target = {
    targetId: 202,
    name: "AgiPaws",
    city: "Liptovský Mikuláš",
    postalCode: "031 01",
    street: "Nábrežie",
    canonicalAddress: "Nábrežie\n031 01 Liptovský Mikuláš",
  };
  const place = {
    id: "places/agi-paws",
    displayName: "AgiPaws",
    formattedAddress: "Nábrežie, 031 01 Liptovský Mikuláš, Slovensko",
    latitude: 49.081,
    longitude: 19.612,
  };
  assert.equal(evaluateNumberlessGooglePlaceCandidates(target, [place]).decision, "MATCH");
  assert.equal(evaluateNumberlessGooglePlaceCandidates(target, [{ ...place, id: "street-only", displayName: "Nábrežie" }]).decision, "NO_MATCH");
  assert.equal(evaluateNumberlessGooglePlaceCandidates(target, [place, { ...place, id: "competitor" }]).decision, "REVIEW");
});

test("existing numberless Google preview, google_places provenance, and source fingerprint contracts remain in place", () => {
  assert.match(geoRouteSource, /\[source\.label, source\.street, source\.postalCode, source\.city, "Slovensko"\]/);
  assert.match(geoRouteSource, /evaluateNumberlessGooglePlaceCandidates/);
  assert.match(geoRouteSource, /applyGooglePlaceResolution/);
  assert.match(geoSource, /sourceAddress: includeStreet[\s\S]*directoryCanonicalPublicAddress/);
});
