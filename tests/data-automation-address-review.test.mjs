import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import test from "node:test";

register("./admin-events-loader.mjs", import.meta.url);

const {
  verifyAutomationAddressReviewSelection,
  verifyExternalDirectoryAddressEvidenceBestEffort,
} = await import("../lib/directory-address-provider.ts");

function result(patch = {}) {
  return {
    latitude: 48.385,
    longitude: 18.401,
    country: "Slovakia",
    countryCode: "SK",
    region: "Nitriansky kraj",
    district: "Zlaté Moravce",
    city: "Zlaté Moravce",
    street: "Župná",
    housenumber: "12",
    postcode: "95301",
    formatted: "Župná 12, 953 01 Zlaté Moravce, Slovensko",
    addressLine1: "Župná 12",
    addressLine2: "953 01 Zlaté Moravce, Slovensko",
    resultType: "building",
    confidence: 0.99,
    cityConfidence: 0.99,
    streetConfidence: 0.99,
    buildingConfidence: 0.99,
    matchType: "full_match",
    provider: "geoapify",
    provenance: "Geoapify Geocoding API",
    sourceLicense: "OpenStreetMap contributors",
    providerResultId: "place-1",
    ...patch,
  };
}

function provider(results, configured = true) {
  return {
    name: "mock",
    isConfigured: () => configured,
    geocodeExact: async () => results,
    geocodeApproximate: async () => [],
  };
}

test("actionable ambiguity exposes only bounded strict exact review candidates", async () => {
  const verification = await verifyExternalDirectoryAddressEvidenceBestEffort({
    evidence: "Župná 12, 953 01 Zlaté Moravce",
    provider: provider([
      result(),
      result({
        providerResultId: "place-2",
        latitude: 48.389,
        longitude: 18.407,
        formatted: "Župná 12, 953 01 Zlaté Moravce, Slovensko – budova B",
      }),
    ]),
  });

  assert.equal(verification.status, "NEEDS_REVIEW");
  assert.equal(verification.verified, null);
  assert.equal(verification.reviewReason, "MULTIPLE_EXACT_CANDIDATES");
  assert.equal(verification.reviewCandidates.length, 2);
  assert.deepEqual(
    Object.keys(verification.reviewCandidates[0]).sort(),
    [
      "addressFormat", "city", "district", "formattedAddress", "houseNumber", "latitude",
      "longitude", "postalCode", "provider", "providerResultId", "region", "street",
    ].sort(),
  );
});

test("no safe candidate and unavailable provider do not become actionable review cases", async () => {
  const none = await verifyExternalDirectoryAddressEvidenceBestEffort({
    evidence: "neúplná adresa",
    provider: provider([]),
  });
  assert.equal(none.status, "NEEDS_REVIEW");
  assert.equal(none.reviewReason, null);
  assert.deepEqual(none.reviewCandidates, []);

  const down = await verifyExternalDirectoryAddressEvidenceBestEffort({
    evidence: "Župná 12, 953 01 Zlaté Moravce",
    provider: provider([], false),
  });
  assert.equal(down.reviewReason, null);
  assert.deepEqual(down.reviewCandidates, []);
});

test("selection revalidation trusts stored semantics, not provider id alone", async () => {
  const selected = {
    provider: "geoapify",
    providerResultId: "stale-place-id",
    formattedAddress: "Župná 12, 953 01 Zlaté Moravce",
    region: "Nitriansky kraj",
    district: "Zlaté Moravce",
    city: "Zlaté Moravce",
    postalCode: "953 01",
    street: "Župná",
    houseNumber: "12",
    addressFormat: "STREET",
    latitude: 48.385,
    longitude: 18.401,
  };

  const verified = await verifyAutomationAddressReviewSelection({
    candidate: selected,
    provider: provider([result({ providerResultId: "fresh-place-id" })]),
  });
  assert.equal(verified.houseNumber, "12");
  assert.equal(verified.providerResult.providerResultId, "fresh-place-id");

  await assert.rejects(
    verifyAutomationAddressReviewSelection({
      candidate: selected,
      provider: provider([result({ housenumber: "13", providerResultId: "fresh-different" })]),
    }),
    /automation_address_review_revalidation_changed/,
  );
});

test("review persistence and apply path preserve the product safety invariants", async () => {
  const [migration, store, resolver, route, direct, queue, detail] = await Promise.all([
    readFile(new URL("../drizzle/0093_automation_address_review.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/data-automation-address-review-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/data-automation-address-review.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/automation-address-reviews/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/data-automation-direct-entity.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/automatizacie/adresy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/admin-automation-address-review.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(migration, /automation_address_review_cases/);
  assert.match(migration, /fingerprint_unique/);
  assert.match(migration, /'OPEN','RESOLVED','DISMISSED','STALE'/);
  assert.match(store, /ON CONFLICT\(fingerprint\) DO UPDATE SET[\s\S]*last_detected_at/);
  assert.doesNotMatch(store, /ON CONFLICT\(fingerprint\)[\s\S]{0,240}status='OPEN'/);
  assert.match(store, /candidates\.length < 2/);
  assert.match(store, /slice\(0, 5\)/);

  assert.match(direct, /withoutAmbiguousDirectoryAddress/);
  assert.match(direct, /upsertAutomationAddressReviewCase/);
  assert.match(resolver, /verifyAutomationAddressReviewSelection/);
  assert.match(resolver, /sameAddressSnapshot/);
  assert.match(resolver, /manualOverride/);
  assert.match(resolver, /buildManagedDirectoryProfileUpdateStatement/);
  assert.match(resolver, /buildDirectoryGeoInvalidationForAddressReviewStatement/);
  assert.match(resolver, /db\.batch/);
  assert.match(resolver, /applyGeocoderResolution/);

  assert.match(route, /requireAdminMutation/);
  assert.match(route, /content-type/);
  assert.doesNotMatch(route, /body\.(?:latitude|longitude|street|houseNumber|postalCode)/);

  assert.match(queue, /Adresy na kontrolu/);
  assert.match(queue, /Veterinári/);
  assert.match(queue, /Psie služby/);
  assert.match(detail, /type="radio"/);
  assert.match(detail, /Potvrdiť vybranú adresu/);
  assert.match(detail, /Žiadna z možností nesedí/);
  assert.match(detail, /Otvoriť profil/);
  assert.doesNotMatch(detail, /confidence 0\./);
});
