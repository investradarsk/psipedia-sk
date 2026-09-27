import test from "node:test";
import assert from "node:assert/strict";
import {
  ADDRESS_ENRICHMENT_DEFAULT_BATCH,
  ADDRESS_ENRICHMENT_MAX_BATCH,
  assessDirectoryAddressCandidate,
  boundedBatchSize,
  normalizeDirectoryIdentityHints,
  sourceTier,
} from "../lib/address-enrichment.ts";

const baseTarget = {
  id: 1,
  name: "Vet Centrum",
  category: "veterinari",
  status: "published",
  region: "Nitriansky kraj",
  district: "Zlaté Moravce",
  city: "Zlaté Moravce",
  postalCode: "",
  street: "",
  houseNumber: "",
  addressFormat: "",
  serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
  online: false,
  legacyAddress: "Hlavná 74, Zlaté Moravce",
  websiteUrl: "https://vet.example.sk",
  phone: "+421905123456",
  email: "info@vet.example.sk",
  updatedAt: "2026-09-27T00:00:00.000Z",
};

const baseCandidate = {
  targetType: "DIRECTORY_PROFILE",
  targetId: 1,
  evidence: {
    sourceId: 5,
    sourceUrl: "https://vet.example.sk/kontakt",
    sourceLabel: "Official contact",
    sourceRole: "UNKNOWN",
    authorityScore: 95,
    evidenceId: 11,
  },
  rawAddressText: "Hlavná 74, 953 01 Zlaté Moravce",
  region: "Nitriansky kraj",
  district: "Zlaté Moravce",
  city: "Zlaté Moravce",
  postalCode: "953 01",
  street: "Hlavná",
  houseNumber: "74",
  addressFormat: "STREET",
  entityMatchConfidence: "HIGH",
  entityMatchSignals: ["domain", "phone", "name", "city"],
  addressExtractionConfidence: 0.99,
  serviceLocationConfidence: 0.99,
  providerVerification: "VERIFIED_EXACT",
};

test("source ranking keeps official/high-authority first-party evidence in tier 1", () => {
  assert.equal(sourceTier(baseCandidate.evidence), 1);
  assert.equal(sourceTier({ sourceRole: "OFFICIAL_REGISTRY", authorityScore: 100 }), 2);
  assert.equal(sourceTier({ sourceRole: "SECONDARY_DIRECTORY", authorityScore: 80 }), 3);
  assert.equal(sourceTier({ sourceRole: "SEARCH_DISCOVERY", authorityScore: 100 }), 4);
});

test("AUTO_APPLY requires the complete high-confidence verified service-location gate", () => {
  const result = assessDirectoryAddressCandidate(baseTarget, baseCandidate);
  assert.equal(result.decision, "AUTO_APPLY");
  assert.equal(result.reason, "high_confidence_verified_service_location");
});

test("similar/uncertain identity is never auto-applied", () => {
  const result = assessDirectoryAddressCandidate(baseTarget, { ...baseCandidate, entityMatchConfidence: "MEDIUM" });
  assert.equal(result.decision, "REVIEW");
  assert.equal(result.reason, "entity_match_requires_review");
});

test("weak identity becomes NO_MATCH", () => {
  const result = assessDirectoryAddressCandidate(baseTarget, { ...baseCandidate, entityMatchConfidence: "LOW" });
  assert.equal(result.decision, "NO_MATCH");
  assert.equal(result.reason, "entity_identity_insufficient");
});

test("legal seat, multiple branches and privacy ambiguity all require review", () => {
  assert.equal(assessDirectoryAddressCandidate(baseTarget, { ...baseCandidate, legalSeatOnly: true }).decision, "REVIEW");
  assert.equal(assessDirectoryAddressCandidate(baseTarget, { ...baseCandidate, multipleCompetingAddresses: true }).decision, "REVIEW");
  assert.equal(assessDirectoryAddressCandidate(baseTarget, { ...baseCandidate, privacySensitive: true }).decision, "REVIEW");
});

test("invalid locality or incomplete canonical address cannot be applied", () => {
  assert.equal(
    assessDirectoryAddressCandidate(baseTarget, { ...baseCandidate, city: "Neexistujúca obec" }).reason,
    "invalid_locality",
  );
  assert.equal(
    assessDirectoryAddressCandidate(baseTarget, { ...baseCandidate, houseNumber: "" }).reason,
    "incomplete_canonical_parse",
  );
});

test("provider ambiguity reviews and provider rejection rejects", () => {
  assert.equal(
    assessDirectoryAddressCandidate(baseTarget, { ...baseCandidate, providerVerification: "AMBIGUOUS" }).decision,
    "REVIEW",
  );
  assert.equal(
    assessDirectoryAddressCandidate(baseTarget, { ...baseCandidate, providerVerification: "REJECTED" }).decision,
    "NO_MATCH",
  );
});

test("existing confirmed canonical data is protected from blind overwrite", () => {
  const protectedTarget = {
    ...baseTarget,
    postalCode: "953 01",
    street: "Hlavná",
    houseNumber: "74",
    addressFormat: "STREET",
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
  };
  const conflict = assessDirectoryAddressCandidate(protectedTarget, { ...baseCandidate, houseNumber: "76" });
  assert.equal(conflict.decision, "REVIEW");
  assert.equal(conflict.reason, "protected_canonical_conflict");

  const same = assessDirectoryAddressCandidate(protectedTarget, baseCandidate);
  assert.equal(same.decision, "AUTO_APPLY");
  assert.equal(same.protectedCanonical, true);
});

test("online-only physical enrichment is NO_MATCH", () => {
  const target = { ...baseTarget, online: true, legacyAddress: "", websiteUrl: "https://online.example" };
  const result = assessDirectoryAddressCandidate(target, baseCandidate);
  assert.equal(result.decision, "NO_MATCH");
  assert.equal(result.reason, "online_only");
});

test("preview batch is bounded and never defaults to bulk", () => {
  assert.equal(boundedBatchSize(undefined), ADDRESS_ENRICHMENT_DEFAULT_BATCH);
  assert.equal(boundedBatchSize(0), 1);
  assert.equal(boundedBatchSize(9999), ADDRESS_ENRICHMENT_MAX_BATCH);
});

test("identity hints normalize domain, phone, email, name and city", () => {
  const hints = normalizeDirectoryIdentityHints({
    name: "  Vet Centrum  ",
    domain: "https://www.vet.example.sk/kontakt",
    phone: "+421 905 123 456",
    email: " INFO@Vet.Example.sk ",
    city: " Zlaté Moravce ",
  });
  assert.equal(hints.name, "vet centrum");
  assert.equal(hints.domain, "vet.example.sk");
  assert.equal(hints.phone, "421905123456");
  assert.equal(hints.email, "info@vet.example.sk");
  assert.equal(hints.city, "zlaté moravce");
});
