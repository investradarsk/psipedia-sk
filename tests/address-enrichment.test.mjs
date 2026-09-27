import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ADDRESS_ENRICHMENT_DEFAULT_BATCH,
  ADDRESS_ENRICHMENT_MAX_BATCH,
  ADDRESS_ENRICHMENT_CANARY_DEFAULT_TARGETS,
  ADDRESS_ENRICHMENT_CANARY_MAX_TARGETS,
  assessDirectoryAddressCandidate,
  boundedBatchSize,
  boundedCanarySize,
  normalizeDirectoryIdentityHints,
  sourceTier,
} from "../lib/address-enrichment.ts";
import {
  canonicalAddressShape,
  directoryCategoryMatches,
  extractOfficialAddress,
  searchReservationDiagnostic,
  selectAddressEnrichmentTargets,
  validateAddressCanarySelection,
} from "../lib/address-enrichment-canary.ts";

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
  assert.equal(hints.phone, "+421905123456");
  assert.equal(hints.email, "info@vet.example.sk");
  assert.equal(hints.city, "zlaté moravce");
});


test("live canary uses a separate hard max of five targets", () => {
  assert.equal(ADDRESS_ENRICHMENT_CANARY_DEFAULT_TARGETS, 3);
  assert.equal(ADDRESS_ENRICHMENT_CANARY_MAX_TARGETS, 5);
  assert.equal(boundedCanarySize(undefined), 3);
  assert.equal(boundedCanarySize(0), 1);
  assert.equal(boundedCanarySize(999), 5);
});

test("official-site extraction prefers JSON-LD PostalAddress", () => {
  const html = `<html><head><script type="application/ld+json">
    {"@context":"https://schema.org","@type":"VeterinaryCare","address":{"@type":"PostalAddress","streetAddress":"Hlavná 1892/74","postalCode":"95301","addressLocality":"Zlaté Moravce"}}
  </script></head><body>Kontakt</body></html>`;
  const found = extractOfficialAddress(html);
  assert.equal(found?.method, "JSON_LD_POSTAL_ADDRESS");
  assert.equal(found?.street, "Hlavná");
  assert.equal(found?.house, "1892/74");
  assert.equal(found?.postal, "953 01");
  assert.equal(found?.city, "Zlaté Moravce");
});

test("official-site extraction accepts a clearly labelled public contact address", () => {
  const html = "<html><body><h1>Vet Centrum</h1><p>Adresa: Hlavná 74, 953 01 Zlaté Moravce</p></body></html>";
  const found = extractOfficialAddress(html);
  assert.equal(found?.method, "LABELED_CONTACT_ADDRESS");
  assert.equal(found?.street, "Hlavná");
  assert.equal(found?.house, "74");
  assert.equal(found?.postal, "953 01");
});

test("explicit canary selection is bounded, unique and fingerprinted", () => {
  const fp = "a".repeat(64);
  assert.deepEqual(validateAddressCanarySelection([
    { targetId: 11, updatedAt: "2026-09-27T09:00:00.000Z", candidateFingerprint: fp },
  ]), [
    { targetId: 11, updatedAt: "2026-09-27T09:00:00.000Z", candidateFingerprint: fp },
  ]);
  assert.throws(() => validateAddressCanarySelection([
    { targetId: 11, updatedAt: "2026-09-27T09:00:00.000Z", candidateFingerprint: fp },
    { targetId: 11, updatedAt: "2026-09-27T09:00:00.000Z", candidateFingerprint: fp },
  ]), /Neplatný canary selection/);
  assert.throws(() => validateAddressCanarySelection(
    Array.from({ length: 6 }, (_, index) => ({
      targetId: index + 1,
      updatedAt: "2026-09-27T09:00:00.000Z",
      candidateFingerprint: fp,
    })),
  ), /1 až 5/);
});


test("canonical shape distinguishes STREET from MUNICIPALITY_NUMBER", () => {
  assert.deepEqual(canonicalAddressShape("Hlavná", "Zlaté Moravce"), {
    street: "Hlavná",
    addressFormat: "STREET",
  });
  assert.deepEqual(canonicalAddressShape("Zlaté Moravce", "Zlaté Moravce"), {
    street: "",
    addressFormat: "MUNICIPALITY_NUMBER",
  });
});


const readRepo = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("ADDRESS-ENRICH-2A deterministic DIRECTORY root matching covers production Tavily categories", () => {
  const migration = readRepo("drizzle/0089_automation_tavily_directory_roots.sql");
  const categories = ["veterinari", "salony-a-sluzby", "hotely-a-opatrovanie", "treneri", "fyzioterapia"];
  for (const category of categories) {
    assert.ok(migration.includes(`"directoryCategory":"${category}"`), category);
    assert.equal(directoryCategoryMatches(category, category), true);
    assert.equal(directoryCategoryMatches("  " + category.toUpperCase() + "  ", category), true);
  }
  assert.equal(directoryCategoryMatches("salony-a-sluzby", "veterinari"), false);
  assert.equal(directoryCategoryMatches("", "veterinari"), false);
  assert.equal(directoryCategoryMatches("veterinari", "eshopy"), false);
});

test("ADDRESS-ENRICH-2A maps reservation blockers without bypassing governance budgets", () => {
  assert.equal(searchReservationDiagnostic("DUPLICATE_OPERATION"), "SEARCH_DEDUP_BLOCKED");
  assert.equal(searchReservationDiagnostic("GLOBAL_BUDGET_EXHAUSTED"), "SEARCH_BUDGET_BLOCKED");
  assert.equal(searchReservationDiagnostic("CATEGORY_BUDGET_EXHAUSTED"), "SEARCH_BUDGET_BLOCKED");
  assert.equal(searchReservationDiagnostic("ROOT_BUDGET_EXHAUSTED"), "SEARCH_BUDGET_BLOCKED");
  assert.equal(searchReservationDiagnostic("unexpected"), "SEARCH_OTHER_BLOCKED");
});

test("ADDRESS-ENRICH-2A exposes the full required search diagnostic state vocabulary", () => {
  const source = readRepo("lib/address-enrichment-canary.ts");
  for (const state of [
    "TAVILY_NOT_CONFIGURED",
    "NO_SEARCH_ROOT",
    "SEARCH_COOLDOWN",
    "SEARCH_BUDGET_BLOCKED",
    "SEARCH_DEDUP_BLOCKED",
    "SEARCH_OTHER_BLOCKED",
    "SEARCH_CALLED_EMPTY",
    "SEARCH_CALLED_NO_IDENTITY_MATCH",
    "SEARCH_CALLED_MATCHED_URL",
    "SEARCH_SOURCE_FETCH_FAILED",
    "SEARCH_SOURCE_NO_ADDRESS",
    "SEARCH_RATE_LIMITED",
    "SEARCH_PROVIDER_ERROR",
    "FIRST_PARTY_NO_ADDRESS",
    "EXISTING_EVIDENCE_USED",
  ]) assert.ok(source.includes(state), state);
});

test("ADDRESS-ENRICH-2A keeps searchCalls as real provider calls and adds attempts/blocked separately", () => {
  const source = readRepo("lib/address-enrichment-canary.ts");
  assert.match(source, /if\(found\.called\)searchCalls\+\+/);
  assert.match(source, /searchAttempts\+=1/);
  assert.match(source, /searchBlocked\+=1/);
  assert.match(source, /searchCalls,searchAttempts,searchBlocked,providerCalls/);
});

test("ADDRESS-ENRICH-2A eligible first-party failure reaches Tavily search and distinguishes result outcomes", () => {
  const source = readRepo("lib/address-enrichment-canary.ts");
  assert.match(source, /if\(!c\)\{\s*searchAttempts\+=1/);
  assert.match(source, /const found=await tavilyUrl\(t,search,database\)/);
  assert.match(source, /const results=await p\.search\(request\)/);
  assert.match(source, /SEARCH_CALLED_EMPTY/);
  assert.match(source, /SEARCH_CALLED_NO_IDENTITY_MATCH/);
  assert.match(source, /SEARCH_CALLED_MATCHED_URL/);
});

test("ADDRESS-ENRICH-2A source fetch failures and no-address extraction remain diagnostic, not generic-only", () => {
  const source = readRepo("lib/address-enrichment-canary.ts");
  assert.match(source, /SEARCH_SOURCE_FETCH_FAILED/);
  assert.match(source, /SEARCH_SOURCE_NO_ADDRESS/);
  assert.match(source, /reason:stoppedByRateLimit\?"search_rate_limited":"no_usable_address"/);
});

test("ADDRESS-ENRICH-2A preview remains canonical/GEO write-free", () => {
  const route = readRepo("app/api/admin/address-enrichment/live-preview/route.ts");
  assert.match(route, /readOnly: true/);
  assert.match(route, /productionWrites: 0/);
  assert.match(route, /canonicalWrites: 0/);
  assert.match(route, /geoWrites: 0/);
  assert.doesNotMatch(route, /UPDATE\s+directory_profiles|INSERT\s+INTO\s+geo_points/i);
});

test("ADDRESS-ENRICH-2A UI exposes first-party and Tavily discovery diagnostics", () => {
  const ui = readRepo("components/admin-address-enrichment-canary.tsx");
  assert.match(ui, /Discovery \/ Search/);
  assert.match(ui, /First-party:/);
  assert.match(ui, /Tavily:/);
  assert.match(ui, /searchAttempts/);
  assert.match(ui, /searchBlocked/);
});


function directoryProfileRow(overrides = {}) {
  return {
    id: 1,
    name: "Profil",
    category: "veterinari",
    status: "published",
    region: "",
    district: "",
    city: "Nitra",
    postal_code: "",
    street: "",
    house_number: "",
    address_format: "",
    service_address_confirmation: "LEGACY_UNCONFIRMED",
    online: 0,
    address: "",
    website_url: "https://example.sk",
    source_data_json: "{}",
    updated_at: "2026-09-20T00:00:00.000Z",
    ...overrides,
  };
}

function rootAwareSelectionDb(profiles, categories) {
  return {
    prepare(sql) {
      if (sql.includes("FROM automation_discovery_roots")) {
        return {
          async all() {
            return {
              results: categories.map((category, index) => ({
                id: index + 1,
                root_key: "root-" + category,
                cadence_minutes: 10080,
                config_json: JSON.stringify({ provider: "tavily", directoryCategory: category }),
              })),
            };
          },
        };
      }
      if (sql.includes("FROM directory_profiles")) {
        return {
          bind(...binds) {
            return {
              async all() {
                if (sql.includes("id IN")) {
                  const ids = new Set(binds.map(Number));
                  return { results: profiles.filter((row) => ids.has(Number(row.id))) };
                }
                const limit = Number(binds.at(-1));
                const supported = new Set(binds.slice(0, -1).map((value) => String(value).trim().toLowerCase()));
                const results = profiles
                  .filter((row) => row.status !== "archived" && !row.online && supported.has(String(row.category).trim().toLowerCase()))
                  .sort((a, b) => {
                    const published = Number(a.status !== "published") - Number(b.status !== "published");
                    if (published) return published;
                    const website = Number(!String(a.website_url || "").trim()) - Number(!String(b.website_url || "").trim());
                    if (website) return website;
                    const updated = String(b.updated_at).localeCompare(String(a.updated_at));
                    return updated || Number(b.id) - Number(a.id);
                  })
                  .slice(0, limit);
                return { results };
              },
            };
          },
        };
      }
      throw new Error("Unexpected SQL: " + sql);
    },
  };
}

test("ADDRESS-ENRICH-2B automatic selection chooses only root-supported categories", async () => {
  const db = rootAwareSelectionDb([
    directoryProfileRow({ id: 1808, category: "drevovyroba", updated_at: "2026-09-27T10:00:00.000Z" }),
    directoryProfileRow({ id: 1807, category: "eshopy", updated_at: "2026-09-27T09:00:00.000Z" }),
    directoryProfileRow({ id: 1805, category: "fotografi", updated_at: "2026-09-27T08:00:00.000Z" }),
    directoryProfileRow({ id: 1700, category: "veterinari", updated_at: "2026-09-20T00:00:00.000Z" }),
  ], ["veterinari"]);
  const selection = await selectAddressEnrichmentTargets(3, db);
  assert.deepEqual(selection.items.map((item) => item.id), [1700]);
  assert.equal(selection.mode, "ROOT_AWARE_AUTOMATIC");
  assert.deepEqual(selection.rootEligibleCategories, ["veterinari"]);
  assert.equal(selection.diagnostic, null);
});

test("ADDRESS-ENRICH-2B preserves deterministic ordering across supported categories", async () => {
  const db = rootAwareSelectionDb([
    directoryProfileRow({ id: 10, category: "treneri", status: "draft", updated_at: "2026-09-27T12:00:00.000Z" }),
    directoryProfileRow({ id: 11, category: "veterinari", status: "published", website_url: "", updated_at: "2026-09-27T11:00:00.000Z" }),
    directoryProfileRow({ id: 12, category: "fyzioterapia", status: "published", website_url: "https://rehab.example", updated_at: "2026-09-20T00:00:00.000Z" }),
  ], ["veterinari", "treneri", "fyzioterapia"]);
  const selection = await selectAddressEnrichmentTargets(3, db);
  assert.deepEqual(selection.items.map((item) => item.id), [12, 11, 10]);
});

test("ADDRESS-ENRICH-2B unsupported newer target never displaces an older supported target", async () => {
  const db = rootAwareSelectionDb([
    directoryProfileRow({ id: 20, category: "misc", updated_at: "2026-09-27T12:00:00.000Z" }),
    directoryProfileRow({ id: 21, category: "salony-a-sluzby", updated_at: "2026-09-01T00:00:00.000Z" }),
  ], ["salony-a-sluzby"]);
  const selection = await selectAddressEnrichmentTargets(1, db);
  assert.deepEqual(selection.items.map((item) => item.id), [21]);
});

test("ADDRESS-ENRICH-2B explicit targetIds remain allowed outside root-supported categories", async () => {
  const db = rootAwareSelectionDb([
    directoryProfileRow({ id: 30, category: "fotografi" }),
  ], ["veterinari"]);
  const selection = await selectAddressEnrichmentTargets(3, db, [30]);
  assert.deepEqual(selection.items.map((item) => item.id), [30]);
  assert.equal(selection.mode, "EXPLICIT");
  assert.deepEqual(selection.rootEligibleCategories, []);
});

test("ADDRESS-ENRICH-2B automatic selection never fills remaining slots from unsupported categories", async () => {
  const db = rootAwareSelectionDb([
    directoryProfileRow({ id: 40, category: "veterinari" }),
    directoryProfileRow({ id: 41, category: "misc" }),
    directoryProfileRow({ id: 42, category: "eshopy" }),
  ], ["veterinari"]);
  const selection = await selectAddressEnrichmentTargets(3, db);
  assert.deepEqual(selection.items.map((item) => item.id), [40]);
});

test("ADDRESS-ENRICH-2B empty root-aware sample reports NO_ROOT_ELIGIBLE_TARGETS", async () => {
  const db = rootAwareSelectionDb([
    directoryProfileRow({ id: 50, category: "misc" }),
  ], ["veterinari"]);
  const selection = await selectAddressEnrichmentTargets(3, db);
  assert.equal(selection.items.length, 0);
  assert.equal(selection.diagnostic, "NO_ROOT_ELIGIBLE_TARGETS");
});

test("ADDRESS-ENRICH-2B uses discovery-root config as category source of truth and preserves canary invariants", () => {
  const source = readRepo("lib/address-enrichment-canary.ts");
  assert.match(source, /FROM automation_discovery_roots/);
  assert.match(source, /discovery_type='SEARCH_PROVIDER' AND entity_type='DIRECTORY'/);
  assert.match(source, /LOWER\(TRIM\(category\)\) IN/);
  assert.doesNotMatch(source, /\["veterinari",\s*"salony-a-sluzby"/);
  assert.match(source, /ADDRESS_ENRICHMENT_CANARY_MAX_TARGETS/);
  assert.match(source, /ADDRESS_ENRICHMENT_MAX_SEARCH_CALLS/);
  assert.match(source, /productionWrites:0 as const/);
});

test("ADDRESS-ENRICH-2B UI explains root-aware automatic selection and empty-sample diagnostic", () => {
  const ui = readRepo("components/admin-address-enrichment-canary.tsx");
  assert.match(ui, /Automatický výber používa iba kategórie s nakonfigurovaným Tavily search rootom/);
  assert.match(ui, /NO_ROOT_ELIGIBLE_TARGETS/);
});
