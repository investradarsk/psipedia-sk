import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

register("./admin-events-loader.mjs", import.meta.url);

const {
  enrichDirectoryProposalWithExactAddress,
} = await import("../lib/data-automation-directory-address-enrichment.ts");
const {
  resolveGeoapifyDirectoryLocality,
} = await import("../lib/directory-address-provider.ts");
const {
  createCanonicalDraft,
} = await import("../lib/canonical-draft-service.ts");
const {
  mapAutomationRecordToDraftInput,
} = await import("../lib/data-automation-draft-mapper.ts");

function geoResult(overrides = {}) {
  return {
    latitude: 48.705,
    longitude: 21.258,
    country: "Slovensko",
    countryCode: "SK",
    region: "Košický kraj",
    district: "Košice IV",
    city: "Košice",
    suburb: "Juh",
    cityDistrict: "Juh",
    street: "Polská",
    housenumber: "6",
    postcode: "040 01",
    formatted: "Polská 6, 040 01 Košice, Slovensko",
    addressLine1: "Polská 6",
    addressLine2: "040 01 Košice",
    resultType: "building",
    confidence: 0.99,
    cityConfidence: 0.99,
    streetConfidence: 0.99,
    buildingConfidence: 0.99,
    matchType: "full_match",
    provider: "geoapify",
    provenance: "OpenStreetMap",
    sourceLicense: "ODbL",
    providerResultId: "geo-ko4-polska-6",
    ...overrides,
  };
}

function geocoder(resultsForQuery) {
  const calls = [];
  return {
    calls,
    isConfigured: () => true,
    geocodeExact: async (request) => {
      calls.push(request.query);
      return typeof resultsForQuery === "function" ? resultsForQuery(request.query) : resultsForQuery;
    },
    geocodeApproximate: async () => [],
  };
}

test("Geoapify locality maps Košice district evidence into canonical city district", () => {
  assert.deepEqual(resolveGeoapifyDirectoryLocality(geoResult()), {
    region: "Košický kraj",
    district: "Košice IV",
    city: "Košice - Juh",
  });
});

test("DIRECTORY address enrichment verifies existing page evidence before Tavily lookup", async () => {
  const provider = geocoder([geoResult()]);
  let searches = 0;
  const enriched = await enrichDirectoryProposalWithExactAddress({
    proposed: {
      name: "Psia škola",
      category: "treneri",
      address: "Polská 6, 040 01 Košice",
      street: "Polská",
      houseNumber: "6",
      postalCode: "040 01",
      city: "Košice",
    },
    name: "Psia škola",
    sourceUrl: "https://example.sk/kontakt",
    geocoder: provider,
    addressSearch: async () => {
      searches += 1;
      return [];
    },
  });

  assert.equal(searches, 0);
  assert.equal(provider.calls.length, 1);
  assert.equal(enriched.verified?.district, "Košice IV");
  assert.equal(enriched.proposed.region, "Košický kraj");
  assert.equal(enriched.proposed.district, "Košice IV");
  assert.equal(enriched.proposed.city, "Košice - Juh");
  assert.equal(enriched.proposed.postalCode, "040 01");
  assert.equal(enriched.proposed.street, "Polská");
  assert.equal(enriched.proposed.houseNumber, "6");
  assert.equal(enriched.proposed.serviceAddressConfirmation, "CONFIRMED_SERVICE_LOCATION");
});

test("DIRECTORY address enrichment makes at most one bounded Tavily lookup when page evidence is insufficient", async () => {
  const provider = geocoder((query) => query.includes("Polská 6") ? [geoResult()] : []);
  let searches = 0;
  const enriched = await enrichDirectoryProposalWithExactAddress({
    proposed: {
      name: "Psia škola",
      category: "treneri",
      description: "Výcvik psov v Košiciach.",
    },
    name: "Psia škola",
    sourceUrl: "https://example.sk",
    geocoder: provider,
    addressSearch: async () => {
      searches += 1;
      return [{
        url: "https://example.sk/kontakt",
        title: "Kontakt",
        snippet: "Adresa: Polská 6, 040 01 Košice.",
        rank: 1,
      }];
    },
  });

  assert.equal(searches, 1);
  assert.equal(enriched.usedAddressSearch, true);
  assert.equal(enriched.verified?.city, "Košice - Juh");
  assert.equal(enriched.proposed.serviceAddressConfirmation, "CONFIRMED_SERVICE_LOCATION");
});

test("DIRECTORY address enrichment fails closed when Geoapify exact candidates are ambiguous", async () => {
  const provider = geocoder([
    geoResult(),
    geoResult({
      latitude: 48.72,
      longitude: 21.28,
      providerResultId: "other-building",
    }),
  ]);
  const proposed = {
    name: "Psia škola",
    category: "treneri",
    address: "Polská 6, 040 01 Košice",
    street: "Polská",
    houseNumber: "6",
    postalCode: "040 01",
    city: "Košice",
  };
  const enriched = await enrichDirectoryProposalWithExactAddress({
    proposed,
    name: "Psia škola",
    sourceUrl: "https://example.sk",
    geocoder: provider,
  });

  assert.equal(enriched.verified, null);
  assert.notEqual(enriched.proposed.serviceAddressConfirmation, "CONFIRMED_SERVICE_LOCATION");
});

test("canonical DIRECTORY draft trusts only the explicit verified-address channel", async () => {
  const database = {
    prepare() {
      return {
        bind() {
          return { first: async () => ({ id: 1817 }) };
        },
      };
    },
  };

  const base = {
    entityType: "DIRECTORY",
    proposed: {
      name: "Psia škola",
      category: "treneri",
      region: "Košický kraj",
      district: "Košice IV",
      city: "Košice - Juh",
      street: "Polská",
      houseNumber: "6",
      postalCode: "040 01",
      addressFormat: "STREET",
      serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    },
    sourceUrl: "https://example.sk",
    findingType: "NEW_ENTITY",
    createdAt: "2026-09-28T19:00:00.000Z",
  };

  const unverified = await createCanonicalDraft(
    mapAutomationRecordToDraftInput(base),
    { actor: "automation@psipedia.sk", createdAt: base.createdAt },
    database,
  );
  assert.equal(unverified.after.serviceAddressConfirmation, "LEGACY_UNCONFIRMED");

  const verified = await createCanonicalDraft(
    mapAutomationRecordToDraftInput({
      ...base,
      verifiedDirectoryAddress: {
        region: "Košický kraj",
        district: "Košice IV",
        city: "Košice - Juh",
        postalCode: "040 01",
        street: "Polská",
        houseNumber: "6",
        addressFormat: "STREET",
      },
    }),
    { actor: "automation@psipedia.sk", createdAt: base.createdAt },
    database,
  );
  assert.equal(verified.after.status, "draft");
  assert.equal(verified.after.serviceAddressConfirmation, "CONFIRMED_SERVICE_LOCATION");
  assert.equal(verified.after.address, "Polská 6, 040 01 Košice - Juh");
}
