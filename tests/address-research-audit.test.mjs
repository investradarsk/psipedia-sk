import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADDRESS_RESEARCH_AUDIT_BATCH_SIZE,
  auditAddressResearchBatch,
  summarizeAddressResearchAudit,
} from "../lib/directory-address-research-audit.ts";

const researchedAddress = {
  region: "Nitriansky kraj",
  district: "Nitra",
  city: "Nitra",
  postalCode: "949 01",
  street: "Štefánikova",
  houseNumber: "12",
  addressFormat: "STREET",
};

const baseProfile = {
  id: 123,
  slug: "abc-vet",
  name: "ABC Vet",
  category: "veterinari",
  excerpt: "",
  description: "",
  services: [],
  qualifications: [],
  city: "Nitra",
  district: "Nitra",
  region: "Nitriansky kraj",
  address: "",
  postalCode: "949 01",
  street: "Štefánikova",
  houseNumber: "12",
  addressFormat: "STREET",
  serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
  formattedServiceAddress: null,
  online: false,
  priceNote: "",
  websiteUrl: null,
  imageUrl: null,
  verified: false,
  featured: false,
  updatedAt: "2026-09-27T18:00:00.000Z",
  importData: null,
  seo: {},
  status: "published",
  internalEmail: null,
  imageKey: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  publishedAt: "2026-01-01T00:00:00.000Z",
  archivedAt: null,
  createdBy: "seed",
  updatedBy: "seed",
};

const record = {
  profileId: 123,
  psipediaUrl: "https://psipedia.sk/adresar/veterinari/abc-vet",
  category: "veterinari",
  name: "ABC Vet",
  researchAction: "KEEP",
  researchConfidence: "MEDIUM",
  sourceUrl: "https://example.sk/kontakt",
  researchedAddress,
};

function dataset(item = record) {
  return { schemaVersion: 1, dataset: { label: "Audit test" }, profiles: [item] };
}

function deps(profile = baseProfile, extras = {}) {
  return {
    getById: async () => profile,
    getByCategorySlug: async () => profile,
    ...extras,
  };
}

test("current COMPLETE+CONFIRMED + same -> ALREADY_COMPLETE_SAME", async () => {
  const out = await auditAddressResearchBatch(dataset(), deps());
  assert.equal(out.items[0].decision, "ALREADY_COMPLETE_SAME");
});

test("same structured + LEGACY_UNCONFIRMED -> NEEDS_CONFIRMATION_ONLY", async () => {
  const out = await auditAddressResearchBatch(dataset(), deps({ ...baseProfile, serviceAddressConfirmation: "LEGACY_UNCONFIRMED" }));
  assert.equal(out.items[0].decision, "NEEDS_CONFIRMATION_ONLY");
});

test("current incomplete -> NEEDS_FILL", async () => {
  const out = await auditAddressResearchBatch(dataset(), deps({ ...baseProfile, houseNumber: "" }));
  assert.equal(out.items[0].decision, "NEEDS_FILL");
});

test("current missing -> NEEDS_FILL", async () => {
  const out = await auditAddressResearchBatch(dataset(), deps({ ...baseProfile, region: "", district: "", city: "", postalCode: "", street: "", houseNumber: "", addressFormat: "", serviceAddressConfirmation: "LEGACY_UNCONFIRMED" }));
  assert.equal(out.items[0].decision, "NEEDS_FILL");
});

test("complete confirmed different -> CURRENT_DIFFERS", async () => {
  const out = await auditAddressResearchBatch(dataset(), deps({ ...baseProfile, street: "Mostná", houseNumber: "1" }));
  assert.equal(out.items[0].decision, "CURRENT_DIFFERS");
});

test("invalid locality/postal/format -> CURRENT_INVALID", async () => {
  for (const profile of [
    { ...baseProfile, city: "Neexistujúca Obec XYZ" },
    { ...baseProfile, postalCode: "abc" },
    { ...baseProfile, addressFormat: "MUNICIPALITY_NUMBER", street: "Štefánikova" },
  ]) {
    const out = await auditAddressResearchBatch(dataset(), deps(profile));
    assert.equal(out.items[0].decision, "CURRENT_INVALID");
  }
});

test("archived -> ARCHIVED", async () => {
  const out = await auditAddressResearchBatch(dataset(), deps({ ...baseProfile, status: "archived", archivedAt: "2026-09-27T00:00:00.000Z" }));
  assert.equal(out.items[0].decision, "ARCHIVED");
});

test("missing profileId resolves only by exact category+slug", async () => {
  let slugCalls = 0;
  const out = await auditAddressResearchBatch(dataset({ ...record, profileId: null }), deps(baseProfile, {
    getById: async () => { throw new Error("ID lookup must not run"); },
    getByCategorySlug: async (category, slug) => {
      slugCalls++;
      assert.equal(category, "veterinari");
      assert.equal(slug, "abc-vet");
      return baseProfile;
    },
  }));
  assert.equal(slugCalls, 1);
  assert.equal(out.items[0].decision, "ALREADY_COMPLETE_SAME");
});

test("URL category mismatch -> IDENTITY_MISMATCH without fallback", async () => {
  let reads = 0;
  const out = await auditAddressResearchBatch(dataset({ ...record, psipediaUrl: "https://psipedia.sk/adresar/treneri/abc-vet" }), deps(baseProfile, {
    getById: async () => { reads++; return baseProfile; },
  }));
  assert.equal(reads, 0);
  assert.equal(out.items[0].decision, "IDENTITY_MISMATCH");
});

test("fuzzy name must not resolve another profile", async () => {
  const out = await auditAddressResearchBatch(dataset({ ...record, profileId: null, name: "ABC Vet podobný názov" }), deps());
  assert.equal(out.items[0].decision, "IDENTITY_MISMATCH");
});

test("invalid research structured address -> INVALID_RESEARCH", async () => {
  const out = await auditAddressResearchBatch(dataset({ ...record, researchedAddress: { ...researchedAddress, houseNumber: "" } }), deps());
  assert.equal(out.items[0].decision, "INVALID_RESEARCH");
});

test("audit source has zero writes and zero provider calls", () => {
  const source = readFileSync(new URL("../lib/directory-address-research-audit.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /updateManagedDirectoryProfile|withVerifiedDirectoryAddress|applyVerifiedDirectoryAddressGeo|reconcileGeoAfterSourceMutation/);
  assert.doesNotMatch(source, /Geoapify|Google Places|Tavily|verifyDirectoryCanonicalAddress|directory-address-provider/);
  assert.doesNotMatch(source, /\bUPDATE\b|\bINSERT\b|\bDELETE\b/i);
});

test("479-style dataset batches at 100", () => {
  assert.equal(ADDRESS_RESEARCH_AUDIT_BATCH_SIZE, 100);
  assert.equal(Math.ceil(479 / ADDRESS_RESEARCH_AUDIT_BATCH_SIZE), 5);
});

test("aggregate counters and NEEDS_CANONICAL_ACTION are correct", () => {
  const decisions = ["ALREADY_COMPLETE_SAME", "NEEDS_CONFIRMATION_ONLY", "NEEDS_FILL", "CURRENT_INVALID", "CURRENT_DIFFERS"];
  const items = decisions.map((decision, index) => ({ decision, resolvedProfileId: index + 1 }));
  const summary = summarizeAddressResearchAudit(items);
  assert.equal(summary.TOTAL, 5);
  assert.equal(summary.RESOLVED, 5);
  assert.equal(summary.NEEDS_CANONICAL_ACTION, 3);
  assert.equal(summary.CURRENT_DIFFERS, 1);
});

test("audit API route is admin-only, no-store, and contains no mutation guard/apply", () => {
  const source = readFileSync(new URL("../app/api/admin/address-research-import/audit/route.ts", import.meta.url), "utf8");
  assert.match(source, /getAdminApiUser/);
  assert.match(source, /private, no-store/);
  assert.doesNotMatch(source, /requireAdminMutation|applyAddressResearchBatch|updateManagedDirectoryProfile/);
});
