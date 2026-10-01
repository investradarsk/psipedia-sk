import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { verifyDirectoryNumberlessAddressSelection } from "../lib/directory-address-provider.ts";
import { applyGooglePlaceResolution } from "../lib/geo-store.ts";
import { evaluateNumberlessGooglePlaceCandidates } from "../lib/google-place-matching.ts";

const routeSource = readFileSync(new URL("../app/api/admin/geo/[targetType]/[id]/route.ts", import.meta.url), "utf8");
const geoStoreSource = readFileSync(new URL("../lib/geo-store.ts", import.meta.url), "utf8");
const geoSource = readFileSync(new URL("../lib/geo.ts", import.meta.url), "utf8");
const editorSource = readFileSync(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
const geoUiSource = readFileSync(new URL("../components/admin-geo-location.tsx", import.meta.url), "utf8");
const directoryCreateSource = readFileSync(new URL("../app/api/admin/directory/route.ts", import.meta.url), "utf8");
const directoryUpdateSource = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");

const agiPawsTarget = {
  targetId: 77,
  name: "AgiPaws",
  city: "Liptovský Mikuláš",
  postalCode: "031 01",
  street: "Nábrežie",
  canonicalAddress: "Nábrežie\n031 01 Liptovský Mikuláš",
};

const agiPawsPlace = {
  id: "places/agi-paws",
  displayName: "AgiPaws",
  formattedAddress: "Nábrežie, 031 01 Liptovský Mikuláš, Slovensko",
  latitude: 49.081,
  longitude: 19.612,
};

test("MAP-ADDRESS-NUMBERLESS-1 accepts a strong AgiPaws Google Place match without a house number", () => {
  const result = evaluateNumberlessGooglePlaceCandidates(agiPawsTarget, [agiPawsPlace]);
  assert.equal(result.decision, "MATCH");
  assert.equal(result.candidate?.id, "places/agi-paws");
  assert.equal(result.candidate?.nameScore, 1);
  assert.equal(result.candidate?.cityMatch, true);
  assert.equal(result.candidate?.postalCodeMatch, true);
  assert.equal(result.candidate?.streetMatch, true);
  assert.equal(result.candidate?.geographicConsistency, true);
});

test("MAP-ADDRESS-NUMBERLESS-1 rejects a street result that is not the concrete business", () => {
  const result = evaluateNumberlessGooglePlaceCandidates(agiPawsTarget, [{
    ...agiPawsPlace,
    id: "places/nabrezie-street",
    displayName: "Nábrežie",
  }]);
  assert.equal(result.decision, "NO_MATCH");
});

test("MAP-ADDRESS-NUMBERLESS-1 rejects a geographically inconsistent candidate even when text matches", () => {
  const result = evaluateNumberlessGooglePlaceCandidates(agiPawsTarget, [{
    ...agiPawsPlace,
    id: "places/agi-paws-outside-sk",
    latitude: 50.1,
    longitude: 19.6,
  }]);
  assert.equal(result.decision, "NO_MATCH");
  assert.equal(result.candidate?.geographicConsistency, false);
});

test("MAP-ADDRESS-NUMBERLESS-1 blocks equally strong competing Google Places", () => {
  const result = evaluateNumberlessGooglePlaceCandidates(agiPawsTarget, [
    agiPawsPlace,
    { ...agiPawsPlace, id: "places/agi-paws-2", latitude: 49.082, longitude: 19.613 },
  ]);
  assert.equal(result.decision, "REVIEW");
  assert.match(result.reason, /Viac Google kandidátov/);
});

test("numberless canonical save revalidates the selected Geoapify street but never invents a house number", async () => {
  const calls = [];
  const provider = {
    autocomplete: async (request) => {
      calls.push(request.query);
      return [{
        latitude: 49.081,
        longitude: 19.612,
        country: "Slovakia",
        countryCode: "SK",
        region: "Žilinský kraj",
        district: "Liptovský Mikuláš",
        city: "Liptovský Mikuláš",
        street: "Nábrežie",
        housenumber: "",
        postcode: "03101",
        formatted: "Nábrežie, 031 01 Liptovský Mikuláš, Slovensko",
        addressLine1: "Nábrežie",
        addressLine2: "031 01 Liptovský Mikuláš, Slovensko",
        resultType: "street",
        confidence: 0.99,
        cityConfidence: 0.99,
        streetConfidence: 0.99,
        buildingConfidence: null,
        matchType: "full_match",
        provider: "geoapify",
        provenance: "Geoapify Geocoding API",
        sourceLicense: "OpenStreetMap contributors",
        providerResultId: "geoapify-nabrezie",
      }];
    },
  };
  const verified = await verifyDirectoryNumberlessAddressSelection({
    region: "Žilinský kraj",
    district: "Liptovský Mikuláš",
    city: "Liptovský Mikuláš",
    postalCode: "03101",
    providerResultId: "geoapify-nabrezie",
    street: "Nábrežie",
    provider,
  });
  assert.deepEqual(calls, ["Nábrežie"]);
  assert.equal(verified.street, "Nábrežie");
  assert.equal(verified.postalCode, "031 01");
  assert.equal(verified.houseNumber, "");
  assert.equal(verified.addressFormat, "STREET");
});

test("numberless admin address UX never requires a fake house number", () => {
  assert.match(editorSource, /Číslo domu <small>nepovinné pri miestach bez prideleného čísla<\/small>/);
  assert.match(editorSource, /Ak miesto nemá verejne dohľadateľné číslo domu, nechaj pole prázdne/);
  assert.doesNotMatch(editorSource, /id="directory-house-number"[\s\S]{0,400}required=\{!online\}/);
  assert.match(editorSource, /id="directory-postal-code"/);
  assert.doesNotMatch(editorSource, /id="directory-postal-code"[\s\S]{0,300}required=/);
  assert.match(editorSource, /PSČ je nepovinné/);
});

test("directory routes verify complete numberless data but keep missing fields as unconfirmed hints", () => {
  for (const source of [directoryCreateSource, directoryUpdateSource]) {
    assert.match(source, /verifyDirectoryNumberlessAddressSelection/);
    assert.match(source, /withVerifiedDirectoryNumberlessAddress/);
    assert.match(source, /clearServiceAddressConfirmation: true/);
  }
  assert.match(directoryCreateSource, /body\.addressProviderResultId\?\.trim\(\) && body\.postalCode\?\.trim\(\) && hasLocality/);
  assert.match(directoryUpdateSource, /const houseNumber = \(body\.houseNumber \?\? before\.houseNumber\)\.trim\(\)/);
});

test("numberless preview is place-oriented and requires Google confirmation before showing a marker", () => {
  assert.match(routeSource, /googleMapsNumberlessPlacePreview/);
  assert.match(routeSource, /\[source\.label, source\.street, source\.postalCode, source\.city, "Slovensko"\]/);
  assert.match(routeSource, /evaluateNumberlessGooglePlaceCandidates/);
  assert.match(routeSource, /Konkrétne miesto sa nepodarilo jednoznačne potvrdiť v Google Maps/);
  assert.match(routeSource, /mode: "NUMBERLESS_PLACE"/);
  assert.match(geoUiSource, /preview\.mode === "NUMBERLESS_PLACE" \? "✅ Nájdené miesto v Google Maps"/);
});

test("numberless confirm revalidates the same Google Place and persists Google coordinates, not a manual override", () => {
  assert.match(routeSource, /google\.candidate\.id !== expectedGooglePlaceId/);
  assert.match(routeSource, /applyGooglePlaceResolution/);
  assert.match(routeSource, /place: \{[\s\S]*id: google\.candidate\.id,[\s\S]*latitude: google\.candidate\.latitude,[\s\S]*longitude: google\.candidate\.longitude/);
  assert.doesNotMatch(geoUiSource, /action:\s*"manual"|setManualGeoCoordinates/);
});

function googleResolutionDb(patch = {}) {
  const writes = [];
  const row = {
    id: 501,
    target_type: "DIRECTORY_PROFILE",
    directory_profile_id: 77,
    organization_location_id: null,
    managed_event_id: null,
    public_visibility: "EXACT_PUBLIC",
    public_precision: "EXACT",
    latitude: null,
    longitude: null,
    resolution_method: null,
    provider: null,
    provenance: null,
    source_license: null,
    normalized_query: null,
    query_fingerprint: null,
    source_fingerprint: "agi-source",
    resolved_source_fingerprint: null,
    geocode_status: "PENDING",
    last_error_code: null,
    last_error_at: null,
    retry_after_at: null,
    attempt_count: 0,
    manual_override: 0,
    manual_updated_at: null,
    manual_updated_by: null,
    last_geocoded_at: null,
    created_at: "2026-09-30T00:00:00.000Z",
    updated_at: "2026-09-30T00:00:00.000Z",
    ...patch,
  };
  return {
    writes,
    db: {
      prepare(sql) {
        if (/PRAGMA table_info\('geo_points'\)/.test(sql)) {
          return { async all() { return { results: [{ name: "provider_result_id" }] }; } };
        }
        return {
          bind(...args) {
            return {
              async first() {
                if (/FROM geo_points WHERE directory_profile_id = \? LIMIT 1/.test(sql)) return { ...row };
                return null;
              },
              async run() {
                writes.push({ sql, args });
                if (/provider='google_places'/.test(sql)) {
                  row.latitude = args[0];
                  row.longitude = args[1];
                  row.resolution_method = "GEOCODER";
                  row.provider = "google_places";
                  row.provenance = "Google Places API (New)";
                  row.source_license = null;
                  row.resolved_source_fingerprint = row.source_fingerprint;
                  row.geocode_status = "RESOLVED";
                  row.last_error_code = null;
                  row.attempt_count += 1;
                }
                return { meta: { changes: 1 } };
              },
              async all() { return { results: [] }; },
            };
          },
          async first() { return null; },
          async all() { return { results: [] }; },
          async run() { return { meta: { changes: 0 } }; },
        };
      },
      async batch() { return []; },
    },
  };
}

test("numberless Google confirmation resolves the existing geo_point as EXACT_PUBLIC / EXACT / RESOLVED", async () => {
  const fixture = googleResolutionDb();
  const point = await applyGooglePlaceResolution({
    targetType: "DIRECTORY_PROFILE",
    targetId: 77,
    place: { id: "agi-google-place", latitude: 49.081, longitude: 19.612 },
  }, fixture.db);
  assert.equal(point.publicVisibility, "EXACT_PUBLIC");
  assert.equal(point.publicPrecision, "EXACT");
  assert.equal(point.geocodeStatus, "RESOLVED");
  assert.equal(point.latitude, 49.081);
  assert.equal(point.longitude, 19.612);
  assert.equal(point.resolutionMethod, "GEOCODER");
  assert.equal(point.provider, "google_places");
  assert.equal(point.provenance, "Google Places API (New)");
  assert.equal(point.resolvedSourceFingerprint, point.sourceFingerprint);
  assert.equal(point.manualOverride, false);
  assert.equal(fixture.writes.length, 1);
  assert.match(fixture.writes[0].sql, /google_place_id=\?/);
  assert.equal(fixture.writes[0].args[2], "agi-google-place");
  assert.equal(fixture.writes[0].args[3], "agi-google-place");
});

test("Google Place resolution refuses manual overrides and non-exact publication contracts", async () => {
  const manual = googleResolutionDb({ manual_override: 1 });
  await assert.rejects(
    applyGooglePlaceResolution({
      targetType: "DIRECTORY_PROFILE",
      targetId: 77,
      place: { id: "agi-google-place", latitude: 49.081, longitude: 19.612 },
    }, manual.db),
    /manual override/,
  );

  const approximate = googleResolutionDb({ public_visibility: "APPROXIMATE_PUBLIC", public_precision: "MUNICIPALITY" });
  await assert.rejects(
    applyGooglePlaceResolution({
      targetType: "DIRECTORY_PROFILE",
      targetId: 77,
      place: { id: "agi-google-place", latitude: 49.081, longitude: 19.612 },
    }, approximate.db),
    /EXACT_PUBLIC \/ EXACT/,
  );
});

test("Google Place resolution keeps exact public map contract and truthful provider identity", () => {
  const start = geoStoreSource.indexOf("export async function applyGooglePlaceResolution");
  const end = geoStoreSource.indexOf("export async function recordGeocoderFailure", start);
  const block = geoStoreSource.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(block, /current\.publicVisibility !== "EXACT_PUBLIC" \|\| current\.publicPrecision !== "EXACT"/);
  assert.match(block, /provider='google_places'/);
  assert.match(block, /provenance='Google Places API \(New\)'/);
  assert.match(block, /google_place_id=\?/);
  assert.match(block, /google_place_source_fingerprint=source_fingerprint/);
  assert.match(block, /resolved_source_fingerprint=source_fingerprint/);
  assert.match(block, /geocode_status='RESOLVED'/);
  assert.doesNotMatch(block, /manual_override=1|resolution_method='MANUAL'/);
});

test("numberless canonical address participates in the exact source fingerprint so address changes invalidate old resolution", () => {
  assert.match(geoSource, /directoryCanonicalPublicAddress/);
  assert.match(geoSource, /sourceAddress: includeStreet[\s\S]*directoryCanonicalPublicAddress/);
});

test("existing numbered address flow remains Geoapify-first and Google-place-enriched", () => {
  assert.match(routeSource, /const preview = await previewGeoSource\(\{ source, visibility: "EXACT_PUBLIC", precision: "EXACT" \}\)/);
  assert.match(routeSource, /point = await applyGeocoderResolution/);
  assert.match(routeSource, /autoAssignGooglePlaceForDirectoryProfile/);
});

test("numberless UI displays street even when houseNumber is empty", () => {
  assert.match(geoUiSource, /snapshot\.source\.street \? \[snapshot\.source\.street, snapshot\.source\.houseNumber\]\.filter\(Boolean\)\.join\(" "\)/);
});
