import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE,
  ADDRESS_RESEARCH_IMPORT_CONFIRMATION,
  ADDRESS_RESEARCH_IMPORT_PROVIDER_CONCURRENCY,
  applyAddressResearchBatch,
  parseAddressResearchRecord,
  previewAddressResearchDataset,
  validateAddressResearchDataset,
} from "../lib/directory-address-research-import.ts";

const baseProfile = {
  id: 123,
  slug: "abc-vet",
  name: "ABC Vet",
  category: "veterinari",
  excerpt: "Dostatočne dlhý krátky popis profilu.",
  description: "Dostatočne dlhý detailný popis existujúceho profilu pre regression test.",
  services: ["Veterina"],
  qualifications: [],
  city: "Nitra",
  district: "Nitra",
  region: "Nitriansky kraj",
  address: "",
  postalCode: "",
  street: "",
  houseNumber: "",
  addressFormat: "",
  serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
  formattedServiceAddress: null,
  online: false,
  priceNote: "",
  websiteUrl: "https://example.sk",
  imageUrl: null,
  verified: true,
  featured: false,
  updatedAt: "2026-09-27T12:00:00.000Z",
  importData: { publicPhone: "0900000000" },
  seo: {},
  status: "published",
  internalEmail: "admin@example.sk",
  imageKey: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
  createdBy: "seed",
  updatedBy: "seed",
};

const proposed = {
  region: "Nitriansky kraj",
  district: "Nitra",
  city: "Nitra",
  postalCode: "949 01",
  street: "Štefánikova",
  houseNumber: "12",
  addressFormat: "STREET",
};

const baseRecord = {
  profileId: 123,
  category: "veterinari",
  name: "ABC Vet",
  action: "UPDATE",
  confidence: "HIGH",
  sourceUrl: "https://example.sk/kontakt",
  sourceType: "OFFICIAL_WEBSITE",
  sourceEvidence: "Prevádzka: Štefánikova 12",
  note: "",
  proposedAddress: proposed,
};

const verified = {
  ...proposed,
  providerResult: {
    provider: "GEOAPIFY",
    providerResultId: "place-1",
    formatted: "Štefánikova 12, Nitra",
    addressLine1: "Štefánikova 12",
    addressLine2: "949 01 Nitra",
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    countryCode: "SK",
    postcode: "949 01",
    street: "Štefánikova",
    housenumber: "12",
    latitude: 48.3,
    longitude: 18.1,
    resultType: "building",
    confidence: 1,
    cityConfidence: 1,
    streetConfidence: 1,
    buildingConfidence: 1,
  },
};

function dataset(record = baseRecord) {
  return { schemaVersion: 1, dataset: { label: "Test" }, profiles: [record] };
}

function deps(profile = baseProfile, extra = {}) {
  return {
    getProfile: async () => profile,
    verifyAddress: async () => verified,
    updateProfile: async (_id, payload) => ({
      ...profile,
      region: payload.region,
      district: payload.district,
      city: payload.city,
      postalCode: payload.postalCode,
      street: payload.street,
      houseNumber: payload.houseNumber,
      addressFormat: payload.addressFormat,
      serviceAddressConfirmation: payload.confirmServiceAddress ? "CONFIRMED_SERVICE_LOCATION" : profile.serviceAddressConfirmation,
      updatedAt: "2026-09-27T12:01:00.000Z",
    }),
    applyGeo: async () => ({ geocodeStatus: "RESOLVED", manualOverride: false }),
    requireProviderSchema: async () => undefined,
    ...extra,
  };
}

test("schemaVersion 1 + profiles is accepted", () => {
  assert.equal(validateAddressResearchDataset(dataset()).schemaVersion, 1);
});

test("duplicate profileId fails whole dataset", () => {
  assert.throws(() => validateAddressResearchDataset({ schemaVersion: 1, profiles: [baseRecord, baseRecord] }), /Duplicitný profileId/);
});

test("unknown action is INVALID at record level", () => {
  assert.equal(parseAddressResearchRecord({ ...baseRecord, action: "UPSERT" }).record, null);
});

test("unknown confidence is INVALID at record level", () => {
  assert.equal(parseAddressResearchRecord({ ...baseRecord, confidence: "CERTAIN" }).record, null);
});

test("HIGH UPDATE requires source URL", () => {
  assert.equal(parseAddressResearchRecord({ ...baseRecord, sourceUrl: "" }).record, null);
});

test("STREET without street is invalid", () => {
  const parsed = parseAddressResearchRecord({ ...baseRecord, proposedAddress: { ...proposed, street: "" } });
  assert.equal(parsed.record, null);
  assert.match(parsed.reason, /STREET_MISSING/);
});

test("MUNICIPALITY_NUMBER with street is invalid", () => {
  const parsed = parseAddressResearchRecord({ ...baseRecord, proposedAddress: { ...proposed, addressFormat: "MUNICIPALITY_NUMBER" } });
  assert.equal(parsed.record, null);
  assert.match(parsed.reason, /STREET_NOT_ALLOWED/);
});

test("invalid postal is invalid", () => {
  const parsed = parseAddressResearchRecord({ ...baseRecord, proposedAddress: { ...proposed, postalCode: "abc" } });
  assert.equal(parsed.record, null);
  assert.match(parsed.reason, /POSTAL_CODE_INVALID/);
});

test("invalid locality is invalid", () => {
  const parsed = parseAddressResearchRecord({ ...baseRecord, proposedAddress: { ...proposed, city: "Neexistujúca Obec XYZ" } });
  assert.equal(parsed.record, null);
  assert.match(parsed.reason, /LOCALITY_INVALID/);
});

test("HIGH FILL_MISSING exact provider becomes READY_FILL_MISSING", async () => {
  const result = await previewAddressResearchDataset(dataset({ ...baseRecord, action: "FILL_MISSING" }), deps());
  assert.equal(result.items[0].decision, "READY_FILL_MISSING");
});

test("HIGH UPDATE exact provider becomes READY_UPDATE", async () => {
  const result = await previewAddressResearchDataset(dataset(), deps());
  assert.equal(result.items[0].decision, "READY_UPDATE");
});

test("MEDIUM UPDATE is SKIPPED_CONFIDENCE and does not call provider", async () => {
  let calls = 0;
  const result = await previewAddressResearchDataset(dataset({ ...baseRecord, confidence: "MEDIUM" }), deps(baseProfile, { verifyAddress: async () => { calls++; return verified; } }));
  assert.equal(result.items[0].decision, "SKIPPED_CONFIDENCE");
  assert.equal(calls, 0);
});

test("LOW UPDATE is SKIPPED_CONFIDENCE", async () => {
  const result = await previewAddressResearchDataset(dataset({ ...baseRecord, confidence: "LOW" }), deps());
  assert.equal(result.items[0].decision, "SKIPPED_CONFIDENCE");
});

for (const action of ["REVIEW", "NOT_FOUND", "NO_PUBLIC_SERVICE_ADDRESS", "KEEP"]) {
  test(action + " is read-only", async () => {
    const result = await previewAddressResearchDataset(dataset({ ...baseRecord, action, proposedAddress: undefined }), deps());
    assert.equal(result.items[0].decision, action);
  });
}

test("missing profile is IDENTITY_MISMATCH", async () => {
  const result = await previewAddressResearchDataset(dataset(), deps(baseProfile, { getProfile: async () => null }));
  assert.equal(result.items[0].decision, "IDENTITY_MISMATCH");
});

test("category mismatch is IDENTITY_MISMATCH", async () => {
  const result = await previewAddressResearchDataset(dataset({ ...baseRecord, category: "treneri" }), deps());
  assert.equal(result.items[0].decision, "IDENTITY_MISMATCH");
});

test("name mismatch is IDENTITY_MISMATCH", async () => {
  const result = await previewAddressResearchDataset(dataset({ ...baseRecord, name: "Iná firma" }), deps());
  assert.equal(result.items[0].decision, "IDENTITY_MISMATCH");
});

test("archived profile is ARCHIVED", async () => {
  const result = await previewAddressResearchDataset(dataset(), deps({ ...baseProfile, status: "archived", archivedAt: "2026-09-27T00:00:00.000Z" }));
  assert.equal(result.items[0].decision, "ARCHIVED");
});

test("expectedCurrent mismatch is STALE_DATASET", async () => {
  const result = await previewAddressResearchDataset(dataset({
    ...baseRecord,
    expectedCurrent: { ...proposed, serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION" },
  }), deps());
  assert.equal(result.items[0].decision, "STALE_DATASET");
});

test("FILL_MISSING cannot replace a different complete confirmed address", async () => {
  const profile = {
    ...baseProfile,
    postalCode: "949 01",
    street: "Mostná",
    houseNumber: "1",
    addressFormat: "STREET",
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
  };
  const result = await previewAddressResearchDataset(dataset({ ...baseRecord, action: "FILL_MISSING" }), deps(profile));
  assert.equal(result.items[0].decision, "ACTION_CONFLICT");
});

test("proposed equal current becomes NO_CHANGE without provider call", async () => {
  let calls = 0;
  const profile = { ...baseProfile, ...proposed, serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION" };
  const result = await previewAddressResearchDataset(dataset(), deps(profile, { verifyAddress: async () => { calls++; return verified; } }));
  assert.equal(result.items[0].decision, "NO_CHANGE");
  assert.equal(calls, 0);
});

test("provider ambiguous blocks preview", async () => {
  const result = await previewAddressResearchDataset(dataset(), deps(baseProfile, { verifyAddress: async () => { throw new Error("Adresa je nejednoznačná."); } }));
  assert.equal(result.items[0].decision, "PROVIDER_AMBIGUOUS");
});

test("provider rejection blocks preview", async () => {
  const result = await previewAddressResearchDataset(dataset(), deps(baseProfile, { verifyAddress: async () => { throw new Error("Adresu sa nepodarilo jednoznačne overiť."); } }));
  assert.equal(result.items[0].decision, "PROVIDER_REJECTED");
});

test("provider transient error blocks preview", async () => {
  const result = await previewAddressResearchDataset(dataset(), deps(baseProfile, { verifyAddress: async () => { throw new Error("upstream timeout"); } }));
  assert.equal(result.items[0].decision, "PROVIDER_ERROR");
});

test("apply requires exact confirmation token", async () => {
  await assert.rejects(
    () => applyAddressResearchBatch({ records: [{ record: baseRecord, previewFingerprint: "x" }], confirmationToken: "WRONG", actorRef: "admin@example.sk" }, deps()),
    /confirmation token/,
  );
});

test("apply batch is bounded", () => {
  assert.equal(ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE, 20);
  assert.equal(ADDRESS_RESEARCH_IMPORT_PROVIDER_CONCURRENCY, 4);
});

test("stale preview blocks write", async () => {
  const preview = await previewAddressResearchDataset(dataset(), deps());
  let writes = 0;
  const changed = { ...baseProfile, updatedAt: "2026-09-27T13:00:00.000Z" };
  const result = await applyAddressResearchBatch({
    records: [{ record: baseRecord, previewFingerprint: preview.items[0].previewFingerprint }],
    confirmationToken: ADDRESS_RESEARCH_IMPORT_CONFIRMATION,
    actorRef: "admin@example.sk",
  }, deps(changed, { updateProfile: async () => { writes++; return changed; } }));
  assert.equal(result.results[0].result, "STALE_PREVIEW");
  assert.equal(writes, 0);
});

test("successful apply changes canonical address and calls GEO lifecycle", async () => {
  const preview = await previewAddressResearchDataset(dataset(), deps());
  let writtenPayload = null;
  let geoCalls = 0;
  const result = await applyAddressResearchBatch({
    records: [{ record: baseRecord, previewFingerprint: preview.items[0].previewFingerprint }],
    confirmationToken: ADDRESS_RESEARCH_IMPORT_CONFIRMATION,
    actorRef: "admin@example.sk",
  }, deps(baseProfile, {
    updateProfile: async (_id, payload) => {
      writtenPayload = payload;
      return { ...baseProfile, ...proposed, serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION", updatedAt: "later" };
    },
    applyGeo: async () => { geoCalls++; return { geocodeStatus: "RESOLVED", manualOverride: false }; },
  }));
  assert.equal(result.results[0].result, "UPDATED");
  assert.equal(writtenPayload.name, baseProfile.name);
  assert.equal(writtenPayload.slug, baseProfile.slug);
  assert.equal(writtenPayload.description, baseProfile.description);
  assert.equal(writtenPayload.verified, baseProfile.verified);
  assert.equal(writtenPayload.featured, baseProfile.featured);
  assert.equal(writtenPayload.online, baseProfile.online);
  assert.equal(writtenPayload.confirmServiceAddress, true);
  assert.equal(geoCalls, 1);
});

test("manual GEO override is delegated to shared lifecycle, not mutated directly by importer", () => {
  const source = readFileSync(new URL("../lib/directory-address-research-import.ts", import.meta.url), "utf8");
  assert.match(source, /applyVerifiedDirectoryAddressGeo/);
  assert.doesNotMatch(source, /UPDATE\s+geo_points/i);
  assert.doesNotMatch(source, /latitude\s*=|longitude\s*=/i);
});

test("second identical import is NO_CHANGE and does not write", async () => {
  const already = { ...baseProfile, ...proposed, serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION" };
  let writes = 0;
  const preview = await previewAddressResearchDataset(dataset(), deps(already, { updateProfile: async () => { writes++; return already; } }));
  assert.equal(preview.items[0].decision, "NO_CHANGE");
  assert.equal(writes, 0);
});

test("preview route is admin-only no-store and contains no canonical/GEO write SQL", () => {
  const route = readFileSync(new URL("../app/api/admin/address-research-import/preview/route.ts", import.meta.url), "utf8");
  assert.match(route, /getAdminApiUser/);
  assert.match(route, /private, no-store/);
  assert.doesNotMatch(route, /UPDATE\s+directory_profiles|INSERT\s+INTO\s+geo_points/i);
});

test("apply route uses admin mutation guard", () => {
  const route = readFileSync(new URL("../app/api/admin/address-research-import/apply/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireAdminMutation/);
  assert.match(route, /ADDRESS_RESEARCH_IMPORT_APPLY_BATCH_SIZE/);
});

test("UI accepts JSON and requires exact token", () => {
  const ui = readFileSync(new URL("../components/admin-address-research-import.tsx", import.meta.url), "utf8");
  assert.match(ui, /accept=".json,application\/json"/);
  assert.match(ui, /ADDRESS-RESEARCH-IMPORT/);
  assert.match(ui, /READY_UPDATE/);
  assert.match(ui, /READY_FILL_MISSING/);
  assert.match(ui, /Progress:/);
});

test("no migration and no direct Google Places/Tavily integration were added", () => {
  const source = readFileSync(new URL("../lib/directory-address-research-import.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /Tavily|google_place_id|Google Places/);
});
