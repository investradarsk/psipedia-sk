import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { searchGooglePlacesText, GOOGLE_PLACES_FIELD_MASK } from "../lib/google-places-provider.ts";

const editorSource = readFileSync(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
const geoUiSource = readFileSync(new URL("../components/admin-geo-location.tsx", import.meta.url), "utf8");
const googlePickerSource = readFileSync(new URL("../components/admin-google-place-picker.tsx", import.meta.url), "utf8");
const geoRouteSource = readFileSync(new URL("../app/api/admin/geo/[targetType]/[id]/route.ts", import.meta.url), "utf8");
const updateRouteSource = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
const createRouteSource = readFileSync(new URL("../app/api/admin/directory/route.ts", import.meta.url), "utf8");
const storeSource = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
const geoSource = readFileSync(new URL("../lib/geo.ts", import.meta.url), "utf8");
const googleDiscoverySource = readFileSync(new URL("../lib/google-place-directory-discovery.ts", import.meta.url), "utf8");
const targetDiscoverySource = readFileSync(new URL("../lib/google-place-target-discovery.ts", import.meta.url), "utf8");

test("DIRECTORY-OPTIONAL-DATA keeps only identity fields mandatory in the editor/store", () => {
  assert.doesNotMatch(editorSource, /id="directory-excerpt"[\s\S]{0,250}\brequired\b/);
  assert.doesNotMatch(editorSource, /id="directory-description"[\s\S]{0,350}\brequired\b/);
  assert.doesNotMatch(editorSource, /id="directory-postal-code"[\s\S]{0,300}\brequired=/);
  assert.match(editorSource, /required=\{false\}[\s\S]{0,120}idPrefix="directory-service-location"/);
  assert.doesNotMatch(storeSource, /Krátky popis by mal mať aspoň 20 znakov/);
  assert.doesNotMatch(storeSource, /Podrobný popis by mal mať aspoň 40 znakov/);
  assert.doesNotMatch(storeSource, /Pre osobnú službu vyber kraj, okres a obec \/ mesto/);
  assert.match(storeSource, /if \(!name\) throw new Error\("Doplň názov profilu\."\)/);
  assert.match(storeSource, /if \(!category\) throw new Error\("Vyber kategóriu adresára\."\)/);
});

test("DIRECTORY-OPTIONAL-DATA saves partial address hints instead of forcing Geoapify confirmation", () => {
  assert.doesNotMatch(updateRouteSource, /Zmenu fyzickej adresy potvrď výberom ulice z Geoapify návrhov/);
  assert.doesNotMatch(createRouteSource, /Vyber ulicu z Geoapify návrhov alebo explicitne použi zadanú lokalitu/);
  assert.match(updateRouteSource, /withUnconfirmedDirectoryAddress\(body\)/);
  assert.match(createRouteSource, /const physicalHints = Boolean/);
});

test("GOOGLE-PLACE-DISCOVERY asks Google for structured address components", async () => {
  assert.match(GOOGLE_PLACES_FIELD_MASK, /places\.addressComponents/);
  const responseBody = {
    places: [{
      id: "places/abovzoo",
      displayName: { text: "Veterinárna ambulancia AbovZoo" },
      formattedAddress: "Jesenského 17, 040 01 Staré Mesto, Slovensko",
      location: { latitude: 48.7264679, longitude: 21.2591098 },
      addressComponents: [
        { longText: "17", shortText: "17", types: ["street_number"] },
        { longText: "Jesenského", shortText: "Jesenského", types: ["route"] },
        { longText: "Staré Mesto", shortText: "Staré Mesto", types: ["sublocality_level_1"] },
        { longText: "Košice", shortText: "Košice", types: ["locality"] },
        { longText: "Košický kraj", shortText: "Košický kraj", types: ["administrative_area_level_1"] },
        { longText: "040 01", shortText: "040 01", types: ["postal_code"] },
        { longText: "Slovensko", shortText: "SK", types: ["country"] },
      ],
    }],
  };
  const candidates = await searchGooglePlacesText({
    query: "AbovZOOveterina Slovensko",
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].address?.street, "Jesenského");
  assert.equal(candidates[0].address?.houseNumber, "17");
  assert.equal(candidates[0].address?.postalCode, "040 01");
  assert.equal(candidates[0].address?.locality, "Košice");
  assert.equal(candidates[0].address?.sublocality, "Staré Mesto");
  assert.equal(candidates[0].address?.region, "Košický kraj");
  assert.equal(candidates[0].address?.countryCode, "SK");
});

test("GOOGLE-PLACE-DISCOVERY uses saved profile fields only as hints and confirms Google as provider", () => {
  assert.match(geoRouteSource, /action === "discover-google-place"/);
  assert.match(geoRouteSource, /discoverGoogleTargetPlaces\(source\)/);
  assert.match(targetDiscoverySource, /discoverGoogleDirectoryPlaces\(source, apiKey\)/);
  assert.match(googleDiscoverySource, /source\.label, source\.address, source\.street, source\.houseNumber, source\.postalCode, source\.city, source\.district, source\.region/);
  assert.match(geoRouteSource, /action === "confirm-google-place"/);
  assert.match(geoRouteSource, /updateManagedDirectoryProfileFromGooglePlace/);
  assert.match(geoRouteSource, /applyGooglePlaceResolution/);
  assert.doesNotMatch(geoRouteSource.slice(
    geoRouteSource.indexOf('action === "confirm-google-place"'),
    geoRouteSource.indexOf('action === "preview"'),
  ), /setManualGeoCoordinates/);
  assert.match(storeSource, /address: place\.formattedAddress/);
  assert.match(storeSource, /confirmServiceAddress: true/);
  assert.match(geoSource, /Adresa a presný bod boli potvrdené konkrétnym Google Place/);
});

test("GOOGLE-PLACE-DISCOVERY admin is Google-first with address fallback", () => {
  const ui = geoUiSource + "\n" + googlePickerSource;
  assert.match(ui, /Nájsť profil v Google Maps/);
  assert.match(ui, /Použiť toto miesto/);
  assert.match(geoUiSource, /Fallback: nájsť podľa adresy/);
  assert.match(geoUiSource, /Google Maps \/ Google Place/);
  assert.doesNotMatch(googlePickerSource, /setManualGeoCoordinates|manual marker/i);
});
