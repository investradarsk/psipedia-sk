import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIRECTORY_SEMANTIC_KIND,
  directoryCandidateKeys,
  directoryObservationSemanticKind,
  selectDirectoryClusterCandidate,
} from "../lib/data-automation-directory-matching.ts";

function record(proposed, overrides = {}) {
  return {
    sourceRecordId: overrides.sourceRecordId ?? "directory-source-1",
    sourceUrl: overrides.sourceUrl ?? null,
    sourceTimestamp: null,
    rawRecord: proposed,
    proposed,
  };
}

function candidate(id, fields = {}, keys = [], canonicalEntityId = null) {
  return {
    id,
    semanticKind: DIRECTORY_SEMANTIC_KIND,
    canonicalEntityId,
    canonicalEntityKey: canonicalEntityId ? `directory:${canonicalEntityId}` : null,
    fields,
    keys,
  };
}

const category = "veterinari";

test("G2 semantic gate accepts facility profiles and blocks PERSON, LEGAL_ENTITY and UNKNOWN", () => {
  assert.equal(directoryObservationSemanticKind(record({ semanticKind: "FACILITY_OR_SERVICE_PROFILE" })), DIRECTORY_SEMANTIC_KIND);
  assert.equal(directoryObservationSemanticKind(record({ semanticKind: "PERSON" })), "PERSON");
  assert.equal(directoryObservationSemanticKind(record({ semanticKind: "LEGAL_ENTITY" })), "LEGAL_ENTITY");
  assert.equal(directoryObservationSemanticKind(record({})), "UNKNOWN");

  for (const semanticKind of ["PERSON", "LEGAL_ENTITY", "UNKNOWN"]) {
    const decision = selectDirectoryClusterCandidate(
      record({
        semanticKind,
        category,
        name: "Veterina Nitra",
        city: "Nitra",
        street: "Mostná",
        houseNumber: "1",
      }),
      [candidate(1, {
        category,
        name: "veterina nitra",
        municipality: "nitra",
        street: "mostná",
        houseNumber: "1",
      })],
    );
    assert.equal(decision.quality, "NONE");
    assert.equal(decision.semanticCompatible, false);
    assert.equal(decision.candidateId, null);
  }
});

test("G2 EXACT supports verified canonical linkage", () => {
  const decision = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      canonicalEntityId: 42,
      name: "Veterina Nitra",
    }),
    [candidate(7, { category, name: "veterina nitra" }, [], 42)],
  );
  assert.equal(decision.quality, "EXACT");
  assert.equal(decision.candidateId, 7);
  assert.equal(decision.reason, "verified_canonical_linkage");
});

test("G2 namespaced official facility registry id can be EXACT, generic externalId cannot", () => {
  const registryKey = { keyType: "REGISTRY_ID", namespace: "svps", normalizedValue: "vet-42" };
  const official = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      facilityRegistryNamespace: "SVPS",
      facilityRegistryId: "VET-42",
    }),
    [candidate(8, { category }, [registryKey])],
    { allowRegistryExact: true },
  );
  assert.equal(official.quality, "EXACT");
  assert.equal(official.reason, "official_namespaced_facility_registry_id");

  const generic = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      externalId: "VET-42",
      sourceRecordId: "VET-42",
    }),
    [candidate(8, { category }, [registryKey])],
    { allowRegistryExact: true },
  );
  assert.equal(generic.quality, "NONE");
});

test("G2 candidate keys include only namespaced registry ids and normalized supported identities", () => {
  const keys = directoryCandidateKeys(record({
    semanticKind: DIRECTORY_SEMANTIC_KIND,
    name: " Klinika Žilina ",
    city: "Žilina",
    phone: "0903 123 456",
    email: "INFO@EXAMPLE.SK",
    website: "https://www.example.sk/kontakt",
    ico: " 12345678 ",
    registryId: "42",
  }));
  assert.equal(keys.some((key) => key.keyType === "REGISTRY_ID"), false);
  assert.equal(keys.some((key) => key.keyType === "ICO" && key.normalizedValue === "12345678"), true);
  assert.equal(keys.some((key) => key.keyType === "PHONE" && key.normalizedValue === "+421903123456"), true);
  assert.equal(keys.some((key) => key.keyType === "EMAIL" && key.normalizedValue === "info@example.sk"), true);
  assert.equal(keys.some((key) => key.keyType === "DOMAIN" && key.normalizedValue === "example.sk"), true);
});

test("G2 STRONG A requires exact name, component-aware service address and category", () => {
  const decision = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      name: "Veterina Nitra",
      city: "Nitra",
      street: "Mostná",
      houseNumber: "12/A",
      postalCode: "949 01",
    }),
    [candidate(10, {
      category,
      name: "veterina nitra",
      municipality: "nitra",
      street: "mostná",
      houseNumber: "12/a",
      postalCode: "94901",
    })],
  );
  assert.equal(decision.quality, "STRONG");
  assert.equal(decision.reason, "exact_name_service_address_category");
});

test("G2 exact address never collapses same-city profiles with different house numbers", () => {
  const decision = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      name: "Veterina Nitra",
      city: "Nitra",
      street: "Mostná",
      houseNumber: "12",
    }),
    [candidate(11, {
      category,
      name: "veterina nitra",
      municipality: "nitra",
      street: "mostná",
      houseNumber: "14",
    })],
  );
  assert.equal(decision.quality, "POSSIBLE");
  assert.equal(decision.candidateId, null);
  assert.deepEqual(decision.conflicts, ["service_address"]);
});

test("G2 incomplete address remains conservative", () => {
  const decision = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      name: "Veterina Nitra",
      city: "Nitra",
    }),
    [candidate(12, {
      category,
      name: "veterina nitra",
      municipality: "nitra",
    })],
  );
  assert.equal(decision.quality, "POSSIBLE");
  assert.equal(decision.candidateId, null);
});

test("G2 STRONG B requires name, municipality, category and two independent contacts", () => {
  const decision = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      name: "Veterina Nitra",
      city: "Nitra",
      phone: "+421903123456",
      email: "info@vetnitra.sk",
      website: "https://vetnitra.sk",
    }),
    [candidate(13, {
      category,
      name: "veterina nitra",
      municipality: "nitra",
      phone: "+421903123456",
      email: "info@vetnitra.sk",
      domain: "vetnitra.sk",
    })],
  );
  assert.equal(decision.quality, "STRONG");
  assert.equal(decision.reason, "exact_name_municipality_two_contacts_category");
});

test("G2 ambiguous equally strong branches become POSSIBLE instead of auto merge", () => {
  const input = record({
    semanticKind: DIRECTORY_SEMANTIC_KIND,
    category,
    name: "VetPlus",
    city: "Bratislava",
    phone: "+421212345678",
    email: "info@vetplus.sk",
  });
  const fields = {
    category,
    name: "vetplus",
    municipality: "bratislava",
    phone: "+421212345678",
    email: "info@vetplus.sk",
  };
  const decision = selectDirectoryClusterCandidate(input, [candidate(20, fields), candidate(21, fields)]);
  assert.equal(decision.quality, "POSSIBLE");
  assert.equal(decision.ambiguity, true);
  assert.deepEqual(decision.possibleCandidateIds, [20, 21]);
});

test("G2 IČO alone is POSSIBLE branch evidence, never same-facility EXACT", () => {
  const icoKey = { keyType: "ICO", namespace: "", normalizedValue: "12345678" };
  const decision = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      ico: "12345678",
      name: "VetPlus Petržalka",
      city: "Bratislava",
    }),
    [candidate(30, {
      category,
      name: "vetplus ruzinov",
      municipality: "bratislava",
    }, [icoKey])],
  );
  assert.equal(decision.quality, "POSSIBLE");
  assert.equal(decision.reason, "shared_ico_requires_branch_identity_review");
});

test("G2 shared domain or phone alone never creates EXACT facility identity", () => {
  const byDomain = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      name: "Branch A",
      city: "Nitra",
      website: "https://example.sk",
    }),
    [candidate(40, {
      category,
      name: "branch b",
      municipality: "trnava",
      domain: "example.sk",
    })],
  );
  assert.equal(byDomain.quality, "POSSIBLE");

  const byPhone = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category,
      name: "Branch A",
      city: "Nitra",
      phone: "+421903123456",
    }),
    [candidate(41, {
      category,
      name: "branch b",
      municipality: "nitra",
      phone: "+421903123456",
    })],
  );
  assert.equal(byPhone.quality, "POSSIBLE");
});

test("G2 category conflict blocks automatic matching even with identical name/address", () => {
  const decision = selectDirectoryClusterCandidate(
    record({
      semanticKind: DIRECTORY_SEMANTIC_KIND,
      category: "veterinari",
      name: "Happy Dog",
      city: "Nitra",
      street: "Hlavná",
      houseNumber: "1",
    }),
    [candidate(50, {
      category: "psie-hotely",
      name: "happy dog",
      municipality: "nitra",
      street: "hlavná",
      houseNumber: "1",
    })],
  );
  assert.equal(decision.quality, "POSSIBLE");
  assert.equal(decision.candidateId, null);
  assert.deepEqual(decision.conflicts, ["category"]);
});

test("G2 PERSON != FACILITY regressions block person license, phone and shared address", () => {
  const facility = candidate(60, {
    category,
    name: "klinika neo",
    municipality: "nitra",
    street: "hlavná",
    houseNumber: "8",
    phone: "+421903111222",
  }, [{ keyType: "REGISTRY_ID", namespace: "svps", normalizedValue: "clinic-60" }]);

  for (const proposed of [
    {
      semanticKind: "PERSON",
      category,
      name: "MVDr. Ján Novák",
      facilityRegistryNamespace: "SVPS",
      facilityRegistryId: "clinic-60",
    },
    {
      semanticKind: "PERSON",
      category,
      name: "MVDr. Ján Novák",
      phone: "+421903111222",
    },
    {
      semanticKind: "PERSON",
      category,
      name: "MVDr. Ján Novák",
      city: "Nitra",
      street: "Hlavná",
      houseNumber: "8",
    },
  ]) {
    const decision = selectDirectoryClusterCandidate(record(proposed), [facility], { allowRegistryExact: true });
    assert.equal(decision.quality, "NONE");
    assert.equal(decision.semanticCompatible, false);
  }
});

test("G2 resolver implementation is indexed, bounded, facility-only and canonical-safe", () => {
  const clustering = readFileSync(new URL("../lib/data-automation-directory-clustering.ts", import.meta.url), "utf8");
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  assert.match(clustering, /FROM automation_entity_candidate_keys k/);
  assert.match(clustering, /k\.entity_type='DIRECTORY' AND k\.semantic_kind=\?/);
  assert.match(clustering, /LIMIT \?/);
  assert.match(clustering, /const highTypes = new Set.*REGISTRY_ID.*PHONE.*EMAIL.*DOMAIN.*ICO/s);
  assert.doesNotMatch(clustering, /FROM automation_entity_clusters WHERE entity_type='DIRECTORY'.*ORDER BY.*LIMIT 250/s);
  assert.match(clustering, /VALUES \('DIRECTORY',\?,\?,\?\)/);
  assert.match(clustering, /DIRECTORY_SEMANTIC_KIND/);
  assert.doesNotMatch(clustering, /INSERT INTO directory_profiles|UPDATE directory_profiles|DELETE FROM directory_profiles/i);
  assert.match(runner, /!isDirectoryFacilityObservation\(record\)/);
});

test("G2 high-impact conflict handling preserves preferred evidence instead of silent overwrite", () => {
  const clustering = readFileSync(new URL("../lib/data-automation-directory-clustering.ts", import.meta.url), "utf8");
  for (const field of [
    "name",
    "category",
    "municipality",
    "street",
    "houseNumber",
    "phone",
    "domain",
    "registryId",
    "active",
    "status",
  ]) assert.match(clustering, new RegExp(`"${field}"`));
  assert.match(clustering, /existingPreferred/);
  assert.match(clustering, /status='OPEN'/);
  assert.match(clustering, /impact=\?/);
});

test("G2 adds no migration and leaves ORGANIZATION matcher ownership outside this PR", () => {
  const clustering = readFileSync(new URL("../lib/data-automation-clustering.ts", import.meta.url), "utf8");
  assert.match(clustering, /DIRECTORY_ENTITY_RESOLUTION_STRATEGY/);
  assert.match(clustering, /entityType: "DIRECTORY",\s*matcherImplemented: true/s);
  assert.match(clustering, /function foundationOnlyStrategy\(entityType: "ORGANIZATION"\)/);
  assert.match(clustering, /if \(entityType === "ORGANIZATION"\) return foundationOnlyStrategy\(entityType\)/);
});
