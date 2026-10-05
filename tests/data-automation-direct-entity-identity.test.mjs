import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  evaluateDirectEntityIdentity,
  sanitizeDirectEntityUpdateProposal,
} from "../lib/data-automation-direct-identity.ts";
import { selectSafeAutomationMatch } from "../lib/data-automation-matching.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function directRecord({
  entityType = "DIRECTORY",
  sourceRecordId = "url:https://example.sk/",
  sourceUrl = "https://example.sk/",
  rawRecord = {},
  proposed = {},
} = {}) {
  return {
    sourceRecordId,
    sourceUrl,
    sourceTimestamp: null,
    rawRecord,
    proposed: entityType === "DIRECTORY"
      ? {
          name: "HappyVet",
          category: "veterinari",
          semanticKind: "FACILITY_OR_SERVICE_PROFILE",
          websiteUrl: sourceUrl,
          ...proposed,
        }
      : {
          name: "OZ Psia nádej",
          websiteUrl: sourceUrl,
          ...proposed,
        },
  };
}

function searchFallback(entityType, overrides = {}) {
  return directRecord({
    entityType,
    sourceRecordId: "search-url:https://example.sk/",
    rawRecord: {
      sourceUrl: "https://example.sk/",
      extractedName: entityType === "DIRECTORY" ? "HappyVet" : "OZ Psia nádej",
      identitySource: "SEARCH_RESULT_TITLE_FALLBACK",
      directEvidence: {
        fieldOrigins: {
          name: "SEARCH_PROVIDER",
          websiteUrl: "SEARCH_PROVIDER",
          ...(entityType === "DIRECTORY" ? { category: "DERIVED" } : {}),
        },
      },
      ...overrides.rawRecord,
    },
    proposed: {
      ...(entityType === "DIRECTORY"
        ? {
            name: "HappyVet",
            category: "veterinari",
            semanticKind: "FACILITY_OR_SERVICE_PROFILE",
            websiteUrl: "https://example.sk/",
          }
        : {
            name: "OZ Psia nádej",
            websiteUrl: "https://example.sk/",
            sourceUrl: "https://example.sk/",
          }),
      ...overrides.proposed,
    },
  });
}

function candidate(id, before = {}, overrides = {}) {
  return {
    id,
    key: overrides.key ?? `candidate:${id}`,
    before,
    sourceId: overrides.sourceId ?? null,
    sourceUrl: overrides.sourceUrl ?? null,
    websiteUrl: overrides.websiteUrl ?? before.websiteUrl ?? null,
    importKey: overrides.importKey ?? before.importKey ?? null,
    slug: overrides.slug ?? before.slug ?? null,
    name: overrides.name ?? before.name ?? null,
    category: overrides.category ?? before.category ?? null,
    city: overrides.city ?? before.city ?? null,
    region: overrides.region ?? before.region ?? null,
    registrationNumber: overrides.registrationNumber ?? before.registrationNumber ?? null,
    type: overrides.type ?? before.type ?? null,
    exactSourceIdentity: overrides.exactSourceIdentity ?? false,
  };
}

test("DIRECT identity gate classifies search title + URL as weak and insufficient", () => {
  const decision = evaluateDirectEntityIdentity({
    entityType: "DIRECTORY",
    record: searchFallback("DIRECTORY"),
  });
  assert.equal(decision.gate, "INSUFFICIENT");
  assert.equal(decision.canCreateDraft, false);
  assert.equal(decision.canUseNonProvenanceMatch, false);
  assert.equal(decision.weakIdentity, true);
  assert.ok(decision.evidenceClasses.includes("SEARCH_RESULT_FALLBACK"));
  assert.ok(decision.evidenceClasses.includes("WEAK_DERIVED_IDENTITY"));
});

test("search title + snippet from the same provider is still insufficient", () => {
  const record = searchFallback("DIRECTORY", {
    rawRecord: { searchSnippet: "Veterinárna ambulancia v Nitre, tel. 0903 111 222" },
  });
  const decision = evaluateDirectEntityIdentity({ entityType: "DIRECTORY", record });
  assert.equal(decision.gate, "INSUFFICIENT");
  assert.ok(decision.evidenceClasses.includes("SEARCH_SNIPPET"));
});

test("weak DIRECTORY seed becomes valid only after independent exact-address/contact corroboration", () => {
  const record = searchFallback("DIRECTORY", {
    rawRecord: {
      directEvidence: {
        fieldOrigins: {
          name: "SEARCH_PROVIDER",
          category: "DERIVED",
          websiteUrl: "SEARCH_PROVIDER",
          publicPhone: "FIRST_PARTY",
        },
      },
    },
    proposed: {
      city: "Nitra",
      street: "Mostná",
      houseNumber: "12",
      publicPhone: "+421903111222",
    },
  });
  const decision = evaluateDirectEntityIdentity({
    entityType: "DIRECTORY",
    record,
    verifiedDirectoryAddress: true,
  });
  assert.equal(decision.gate, "VALID_FOR_DRAFT");
  assert.ok(decision.evidenceClasses.includes("VERIFIED_SERVICE_ADDRESS"));
  assert.ok(decision.evidenceClasses.includes("OFFICIAL_CONTACT"));
});

test("explicit first-party structured DIRECTORY facility can pass the draft gate", () => {
  const record = directRecord({
    rawRecord: { schemaType: ["VeterinaryCare"] },
    proposed: { city: "Nitra" },
  });
  const decision = evaluateDirectEntityIdentity({ entityType: "DIRECTORY", record });
  assert.equal(decision.gate, "VALID_FOR_DRAFT");
  assert.ok(decision.evidenceClasses.includes("FIRST_PARTY_STRUCTURED"));
});

test("DIRECTORY same category + name + city alone is uncertain, never STRONG", () => {
  const record = directRecord({ proposed: { city: "Nitra" } });
  const match = selectSafeAutomationMatch({
    entityType: "DIRECTORY",
    record,
    candidates: [
      candidate(1, {
        name: "HappyVet",
        category: "veterinari",
        city: "Nitra",
      }),
    ],
  });
  assert.equal(match.quality, "UNCERTAIN");
  assert.equal(match.entityId, null);
});

test("DIRECTORY exact component-aware service address remains STRONG", () => {
  const record = directRecord({
    proposed: { city: "Nitra", street: "Mostná", houseNumber: "12" },
  });
  const match = selectSafeAutomationMatch({
    entityType: "DIRECTORY",
    record,
    candidates: [
      candidate(2, {
        name: "HappyVet",
        category: "veterinari",
        city: "Nitra",
        street: "Mostná",
        houseNumber: "12",
      }),
    ],
  });
  assert.equal(match.quality, "STRONG_IDENTITY");
  assert.equal(match.entityId, 2);
});

test("DIRECTORY name + municipality + two independent contacts remains STRONG", () => {
  const record = directRecord({
    proposed: {
      city: "Nitra",
      publicPhone: "+421903111222",
      publicEmail: "info@happyvet.sk",
    },
  });
  const match = selectSafeAutomationMatch({
    entityType: "DIRECTORY",
    record,
    candidates: [
      candidate(3, {
        name: "HappyVet",
        category: "veterinari",
        city: "Nitra",
        publicPhone: "+421903111222",
        publicEmail: "info@happyvet.sk",
      }),
    ],
  });
  assert.equal(match.quality, "STRONG_IDENTITY");
  assert.equal(match.entityId, 3);
});

test("shared DIRECTORY domain does not collapse distinct branches", () => {
  const record = directRecord({
    sourceUrl: "https://vetplus.sk/",
    proposed: {
      name: "VetPlus Nitra",
      city: "Nitra",
      websiteUrl: "https://vetplus.sk/",
    },
  });
  const match = selectSafeAutomationMatch({
    entityType: "DIRECTORY",
    record,
    candidates: [
      candidate(4, {
        name: "VetPlus Trnava",
        category: "veterinari",
        city: "Trnava",
        websiteUrl: "https://vetplus.sk/",
      }, { websiteUrl: "https://vetplus.sk/" }),
    ],
  });
  assert.notEqual(match.quality, "EXACT_CANONICAL_KEY");
  assert.notEqual(match.quality, "STRONG_IDENTITY");
});

test("shared DIRECTORY IČO with different branch identity is not EXACT", () => {
  const record = directRecord({
    proposed: {
      name: "VetPlus Nitra",
      city: "Nitra",
      street: "Hlavná",
      houseNumber: "1",
      ico: "12345678",
    },
  });
  const match = selectSafeAutomationMatch({
    entityType: "DIRECTORY",
    record,
    candidates: [
      candidate(5, {
        name: "VetPlus Trnava",
        category: "veterinari",
        city: "Trnava",
        street: "Hlavná",
        houseNumber: "2",
        ico: "12345678",
      }),
    ],
  });
  assert.notEqual(match.quality, "EXACT_CANONICAL_KEY");
  assert.notEqual(match.quality, "STRONG_IDENTITY");
});

test("ORGANIZATION search fallback is insufficient without trusted/first-party corroboration", () => {
  const decision = evaluateDirectEntityIdentity({
    entityType: "ORGANIZATION",
    record: searchFallback("ORGANIZATION"),
  });
  assert.equal(decision.gate, "INSUFFICIENT");
  assert.equal(decision.canCreateDraft, false);
});

test("ORGANIZATION official first-party profile with an organization signal is valid for draft", () => {
  const record = directRecord({
    entityType: "ORGANIZATION",
    rawRecord: { identitySource: "page_metadata" },
    proposed: { type: "CIVIC_ASSOCIATION" },
  });
  const decision = evaluateDirectEntityIdentity({ entityType: "ORGANIZATION", record });
  assert.equal(decision.gate, "VALID_FOR_DRAFT");
  assert.ok(decision.evidenceClasses.includes("FIRST_PARTY_PROFILE"));
});

test("trusted organization directory can corroborate a stable organization identity", () => {
  const record = directRecord({
    entityType: "ORGANIZATION",
    sourceRecordId: "psiadusa:oz-psia-nadej:nitra",
    sourceUrl: "https://www.psiadusa.sk/zoznam-utulkov/",
    proposed: {
      city: "Nitra",
      websiteUrl: "https://psianadej.example/",
    },
  });
  const decision = evaluateDirectEntityIdentity({ entityType: "ORGANIZATION", record });
  assert.equal(decision.gate, "VALID_FOR_DRAFT");
  assert.ok(decision.evidenceClasses.includes("TRUSTED_REGISTRY"));
});

test("ORGANIZATION name-derived/equal slug is candidate retrieval only, never EXACT identity", () => {
  const record = directRecord({
    entityType: "ORGANIZATION",
    proposed: { name: "OZ Psia nádej" },
  });
  const match = selectSafeAutomationMatch({
    entityType: "ORGANIZATION",
    record,
    candidates: [
      candidate(10, {
        name: "OZ Psia nádej",
        slug: "oz-psia-nadej",
      }, { slug: "oz-psia-nadej" }),
    ],
  });
  assert.equal(match.quality, "UNCERTAIN");
  assert.equal(match.entityId, null);
});

test("same ORGANIZATION name in different cities does not auto-match", () => {
  const record = directRecord({
    entityType: "ORGANIZATION",
    proposed: { name: "OZ Psia nádej", city: "Nitra", region: "Nitriansky kraj" },
  });
  const match = selectSafeAutomationMatch({
    entityType: "ORGANIZATION",
    record,
    candidates: [
      candidate(11, {
        name: "OZ Psia nádej",
        city: "Žilina",
        region: "Žilinský kraj",
      }),
    ],
  });
  assert.equal(match.quality, "UNCERTAIN");
});

test("unique normalized organization registration number is deterministic; duplicate exact signal is uncertain", () => {
  const record = directRecord({
    entityType: "ORGANIZATION",
    proposed: {
      registrationNumber: "12 345 678",
      type: "CIVIC_ASSOCIATION",
    },
  });
  const first = candidate(20, {
    name: "OZ Psia nádej",
    registrationNumber: "12345678",
    type: "CIVIC_ASSOCIATION",
  });
  const unique = selectSafeAutomationMatch({
    entityType: "ORGANIZATION",
    record,
    candidates: [first],
  });
  assert.equal(unique.quality, "EXACT_CANONICAL_KEY");
  assert.equal(unique.entityId, 20);

  const ambiguous = selectSafeAutomationMatch({
    entityType: "ORGANIZATION",
    record,
    candidates: [
      first,
      candidate(21, {
        name: "Psia nádej, o.z.",
        registrationNumber: "12345678",
        type: "CIVIC_ASSOCIATION",
      }),
    ],
  });
  assert.equal(ambiguous.quality, "UNCERTAIN");
  assert.equal(ambiguous.entityId, null);
});

test("explicit ORGANIZATION semantic conflict blocks automatic exact matching", () => {
  const record = directRecord({
    entityType: "ORGANIZATION",
    proposed: {
      type: "CIVIC_ASSOCIATION",
      websiteUrl: "https://same.example/",
    },
  });
  const match = selectSafeAutomationMatch({
    entityType: "ORGANIZATION",
    record,
    candidates: [
      candidate(30, {
        name: "OZ Psia nádej",
        type: "MUNICIPAL_ORGANIZATION",
        websiteUrl: "https://same.example/",
      }, {
        type: "MUNICIPAL_ORGANIZATION",
        websiteUrl: "https://same.example/",
      }),
    ],
  });
  assert.equal(match.quality, "NONE");
});

test("accepted direct provenance is exact only when it identifies one compatible canonical", () => {
  const record = directRecord({
    entityType: "ORGANIZATION",
    proposed: { type: "CIVIC_ASSOCIATION" },
  });
  const match = selectSafeAutomationMatch({
    entityType: "ORGANIZATION",
    record,
    candidates: [
      candidate(40, {
        name: "OZ Psia nádej",
        type: "CIVIC_ASSOCIATION",
      }, { exactSourceIdentity: true, type: "CIVIC_ASSOCIATION" }),
    ],
  });
  assert.equal(match.quality, "EXACT_SOURCE_ID");
  assert.equal(match.entityId, 40);
});

test("weak search evidence cannot propose identity-critical canonical updates", () => {
  const record = searchFallback("ORGANIZATION", {
    proposed: {
      name: "Nový názov zo search title",
      legalName: "Search Legal Name",
      registrationNumber: "12345678",
      type: "CIVIC_ASSOCIATION",
      publicPhone: "+421903111222",
    },
  });
  const sanitized = sanitizeDirectEntityUpdateProposal({
    record,
    proposed: {
      name: "Nový názov zo search title",
      legalName: "Search Legal Name",
      registrationNumber: "12345678",
      type: "CIVIC_ASSOCIATION",
      publicPhone: "+421903111222",
    },
  });
  assert.equal("name" in sanitized, false);
  assert.equal("legalName" in sanitized, false);
  assert.equal("registrationNumber" in sanitized, false);
  assert.equal("type" in sanitized, false);
  assert.equal("publicPhone" in sanitized, false);
});

test("refresh operational label is never promoted into search fallback identity", () => {
  const direct = read("lib/data-automation-direct-entity.ts");
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(direct, /searchCandidateTitle\?: string \| null/);
  assert.match(direct, /if \(!sourceUrl \|\| !searchCandidateTitle\) return null/);
  assert.doesNotMatch(direct, /searchResultFallbackName\(input\.label/);

  const refreshStart = runner.indexOf("async function runDirectEntityRefresh");
  const refreshEnd = runner.indexOf("export async function runDataAutomationDiscoverySweep", refreshStart);
  const refresh = runner.slice(refreshStart, refreshEnd);
  assert.match(refresh, /label: `refresh:\$\{candidate\.id\}`/);
  assert.match(refresh, /expectedCanonicalEntityId: candidate\.id/);
  assert.doesNotMatch(refresh, /searchCandidateTitle:/);
});

test("weak search fallback cannot reach draft creation or possible-duplicate draft", () => {
  const direct = read("lib/data-automation-direct-entity.ts");
  const gateIndex = direct.indexOf("evaluateDirectEntityIdentity");
  const draftGateIndex = direct.indexOf("if (!identityDecision.canCreateDraft) continue");
  const createIndex = direct.indexOf("createCanonicalDraft(", draftGateIndex);
  assert.ok(gateIndex >= 0);
  assert.ok(draftGateIndex > gateIndex);
  assert.ok(createIndex > draftGateIndex);
});

test("DIRECT matcher reuses G2 DIRECTORY contract rather than name+city STRONG", () => {
  const matching = read("lib/data-automation-matching.ts");
  assert.match(matching, /selectDirectoryClusterCandidate/);
  assert.match(matching, /selectSafeDirectoryMatch/);
  assert.doesNotMatch(
    matching,
    /entityType === "DIRECTORY"[\s\S]{0,300}sameIdentity\(proposed\.name[\s\S]{0,120}sameIdentity\(proposed\.city[\s\S]{0,80}STRONG_IDENTITY/,
  );
});

test("DIRECT_ENTITY identity hardening adds no migration and leaves dynamic gate separate", () => {
  const direct = read("lib/data-automation-direct-entity.ts");
  const identity = read("lib/data-automation-direct-identity.ts");
  assert.match(direct, /evaluateDirectEntityIdentity/);
  assert.doesNotMatch(identity, /validateDynamicAutomationIngestion|data-automation-dynamic-identity/);
});
