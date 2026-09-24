import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  buildGeoQuery,
  classifyGeoSource,
  geoFingerprintInput,
  isGeoRecordStale,
  normalizeGeoText,
  safeGeoErrorStatus,
  sourceGeoFingerprint,
} from "../lib/geo.ts";
import { buildStructuredExactAddress, chooseGeocoderResult, summarizeGeoDiagnosticResults } from "../lib/geo-service.ts";
import { GeoapifyGeocoder } from "../lib/geoapify-geocoder.ts";
import { GeocoderProviderError } from "../lib/geo-provider.ts";
import { isSafeAutoGeoCandidate, selectGeoCanaryCandidates, selectSafeUninitializedGeoCandidates } from "../lib/geo-operations.ts";

const migration = readFileSync(new URL("../drizzle/0064_geo_foundation.sql", import.meta.url), "utf8");
const geoStore = readFileSync(new URL("../lib/geo-store.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("../lib/geoapify-geocoder.ts", import.meta.url), "utf8");
const operations = readFileSync(new URL("../lib/geo-operations.ts", import.meta.url), "utf8");
const operationsApi = readFileSync(new URL("../app/api/admin/geo/operations/route.ts", import.meta.url), "utf8");
const geoAdminApi = readFileSync(new URL("../app/api/admin/geo/[targetType]/[id]/route.ts", import.meta.url), "utf8");
const geoAdminComponent = readFileSync(new URL("../components/admin-geo-location.tsx", import.meta.url), "utf8");
const geoOperationsComponent = readFileSync(new URL("../components/admin-geo-operations.tsx", import.meta.url), "utf8");
const inventory = readFileSync(new URL("../scripts/geo-production-inventory.sql", import.meta.url), "utf8");
const publicMapRoute = readFileSync(new URL("../app/api/map/route.ts", import.meta.url), "utf8");
const publicMapQuery = readFileSync(new URL("../lib/map-query.ts", import.meta.url), "utf8");

test("migration is additive with physical FKs, exactly-one-target integrity and partial uniques", () => {
  assert.match(migration, /CREATE TABLE geo_points/);
  assert.match(migration, /directory_profile_id INTEGER REFERENCES directory_profiles\(id\) ON DELETE CASCADE/);
  assert.match(migration, /organization_location_id INTEGER REFERENCES organization_locations\(id\) ON DELETE CASCADE/);
  assert.match(migration, /managed_event_id INTEGER REFERENCES managed_events\(id\) ON DELETE CASCADE/);
  assert.match(migration, /target_type = 'DIRECTORY_PROFILE'/);
  assert.match(migration, /target_type = 'ORGANIZATION_LOCATION'/);
  assert.match(migration, /target_type = 'MANAGED_EVENT'/);
  assert.match(migration, /CREATE UNIQUE INDEX geo_points_directory_unique/);
  assert.match(migration, /CREATE UNIQUE INDEX geo_points_organization_location_unique/);
  assert.match(migration, /CREATE UNIQUE INDEX geo_points_event_unique/);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+geo_points/i);
});


test("SQLite enforces target, privacy, manual and cascade invariants at runtime", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY);");
  db.exec("CREATE TABLE organization_locations (id INTEGER PRIMARY KEY);");
  db.exec("CREATE TABLE managed_events (id INTEGER PRIMARY KEY);");
  db.exec(migration);
  db.exec("INSERT INTO directory_profiles(id) VALUES (1),(2);");
  db.exec("INSERT INTO organization_locations(id) VALUES (1);");
  db.exec("INSERT INTO managed_events(id) VALUES (1);");

  const insert = db.prepare("INSERT INTO geo_points (target_type,directory_profile_id,source_fingerprint,geocode_status,created_at,updated_at) VALUES (?,?,?,?,?,?)");
  insert.run("DIRECTORY_PROFILE", 1, "fp-1", "PENDING", "2026-09-22T00:00:00Z", "2026-09-22T00:00:00Z");

  assert.throws(() => insert.run("DIRECTORY_PROFILE", 1, "fp-dup", "PENDING", "2026-09-22T00:00:00Z", "2026-09-22T00:00:00Z"));
  assert.throws(() => db.prepare("INSERT INTO geo_points (target_type,directory_profile_id,managed_event_id,source_fingerprint,geocode_status,created_at,updated_at) VALUES ('DIRECTORY_PROFILE',2,1,'bad','PENDING','x','x')").run());
  assert.throws(() => db.prepare("INSERT INTO geo_points (target_type,directory_profile_id,public_visibility,public_precision,latitude,longitude,source_fingerprint,geocode_status,created_at,updated_at) VALUES ('DIRECTORY_PROFILE',2,'HIDDEN','MUNICIPALITY',48,18,'bad','PENDING','x','x')").run());
  assert.throws(() => db.prepare("INSERT INTO geo_points (target_type,directory_profile_id,public_visibility,source_fingerprint,geocode_status,created_at,updated_at) VALUES ('DIRECTORY_PROFILE',2,'INVALID','bad','PENDING','x','x')").run());
  assert.throws(() => db.prepare("INSERT INTO geo_points (target_type,directory_profile_id,public_visibility,public_precision,latitude,longitude,manual_override,source_fingerprint,geocode_status,created_at,updated_at) VALUES ('DIRECTORY_PROFILE',2,'APPROXIMATE_PUBLIC','MUNICIPALITY',48,18,1,'bad','RESOLVED','x','x')").run());

  db.exec("DELETE FROM directory_profiles WHERE id=1");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM geo_points WHERE directory_profile_id=1").get().count, 0);
  db.close();
});

test("database checks enforce public enum contracts and block hidden/unclassified coordinates", () => {
  for (const value of ["EXACT_PUBLIC", "APPROXIMATE_PUBLIC", "HIDDEN"]) assert.match(migration, new RegExp(value));
  for (const value of ["EXACT", "NEIGHBORHOOD", "MUNICIPALITY", "SERVICE_AREA", "APPROXIMATE"]) assert.match(migration, new RegExp(value));
  for (const value of ["PENDING", "RESOLVED", "NEEDS_REVIEW", "FAILED", "STALE", "SKIPPED"]) assert.match(migration, new RegExp(value));
  for (const value of ["GEOCODER", "LOCALITY", "MANUAL", "SOURCE_COORDINATES"]) assert.match(migration, new RegExp(value));
  assert.match(migration, /public_visibility IS NOT NULL OR \(latitude IS NULL AND longitude IS NULL\)/);
  assert.match(migration, /public_visibility <> 'HIDDEN' OR \(latitude IS NULL AND longitude IS NULL\)/);
  assert.match(migration, /geocode_status <> 'RESOLVED'/);
  assert.match(migration, /manual_override = 0/);
});

test("normalization is deterministic, whitespace-safe and preserves Slovak diacritics", () => {
  assert.equal(normalizeGeoText("  Žilina\t  - Hájik  "), "žilina - hájik");
  assert.equal(normalizeGeoText("Kosice"), "kosice");
  assert.notEqual(normalizeGeoText("Košice"), normalizeGeoText("Kosice"));
});

test("sensitive directory types never auto-escalate to exact", () => {
  for (const category of ["chovatelske-stanice", "chovatelske-kluby", "treneri", "vencenie", "kynologicke-kluby"]) {
    const result = classifyGeoSource({
      targetType: "DIRECTORY_PROFILE", targetId: 1, label: category, category,
      address: "Súkromná 12", city: "Nitra", district: "Nitra", region: "Nitriansky kraj", countryCode: "SK",
    });
    assert.equal(result.proposedVisibility, "APPROXIMATE_PUBLIC", category);
    assert.notEqual(result.proposedPrecision, "EXACT", category);
  }
});

test("public business exact candidates still require privacy confirmation", () => {
  const result = classifyGeoSource({
    targetType: "DIRECTORY_PROFILE", targetId: 1, label: "Veterina", category: "veterinari",
    address: "Hlavná 1", city: "Nitra", region: "Nitriansky kraj", countryCode: "SK",
  });
  assert.equal(result.proposedVisibility, "EXACT_PUBLIC");
  assert.equal(result.requiresReview, true);
  assert.equal(result.reasonCode, "PRIVACY_CLASSIFICATION_MISSING");
});

test("organization role defaults are conservative", () => {
  const legal = classifyGeoSource({
    targetType: "ORGANIZATION_LOCATION", targetId: 1, label: "Sídlo", locationRole: "LEGAL_SEAT",
    address: "Súkromná 1", city: "Nitra", countryCode: "SK",
  });
  const service = classifyGeoSource({
    targetType: "ORGANIZATION_LOCATION", targetId: 2, label: "Pôsobnosť", locationRole: "SERVICE_AREA",
    address: "Súkromná 1", city: "Nitra", countryCode: "SK",
  });
  assert.equal(legal.proposedVisibility, null);
  assert.equal(legal.requiresReview, true);
  assert.equal(service.proposedVisibility, "APPROXIMATE_PUBLIC");
  assert.equal(service.proposedPrecision, "SERVICE_AREA");
});

test("online events are skipped and city-only events stay approximate", () => {
  assert.equal(classifyGeoSource({
    targetType: "MANAGED_EVENT", targetId: 1, label: "Online", city: "Online", region: "Online",
  }).proposedVisibility, "HIDDEN");
  const cityOnly = classifyGeoSource({
    targetType: "MANAGED_EVENT", targetId: 2, label: "Event", city: "Banská Bystrica", region: "Banskobystrický kraj",
  });
  assert.equal(cityOnly.proposedVisibility, "APPROXIMATE_PUBLIC");
  assert.equal(cityOnly.proposedPrecision, "MUNICIPALITY");
});

test("directory online sentinels never become geocodable public markers", () => {
  const onlineOnly = {
    targetType: "DIRECTORY_PROFILE", targetId: 582, label: "Klub", category: "chovatelske-kluby",
    address: "", city: "Online", region: "Slovensko", countryCode: "SK", online: true,
  };
  const hidden = classifyGeoSource(onlineOnly);
  assert.equal(hidden.proposedVisibility, "HIDDEN");
  assert.equal(hidden.proposedPrecision, null);
  assert.equal(hidden.requiresReview, false);
  assert.equal(hidden.reasonCode, "ONLINE_ONLY");
  assert.equal(buildGeoQuery(onlineOnly, hidden.proposedVisibility, hidden.proposedPrecision), null);

  const conflicting = classifyGeoSource({
    ...onlineOnly, address: "Hlavná 1", city: "Online", online: false,
  });
  assert.equal(conflicting.proposedVisibility, null);
  assert.equal(conflicting.requiresReview, true);
  assert.equal(conflicting.reasonCode, "CONFLICTING_GEO");

  const hybrid = classifyGeoSource({
    ...onlineOnly, city: "Nitra", region: "Nitriansky kraj", online: true,
  });
  assert.equal(hybrid.proposedVisibility, "APPROXIMATE_PUBLIC");
  assert.equal(hybrid.proposedPrecision, "MUNICIPALITY");
});

test("safe rollout initialization excludes review-blocked, hidden and non-geocodable candidates", () => {
  const base = {
    targetType: "MANAGED_EVENT", targetId: 1, label: "Event", category: null, locationRole: null,
    city: "Nitra", district: null, region: "Nitriansky kraj", proposedPrecision: "MUNICIPALITY",
    reasonCode: null, sourceFingerprint: "fp", alreadyInitialized: false,
  };
  assert.equal(isSafeAutoGeoCandidate({
    ...base, proposedVisibility: "APPROXIMATE_PUBLIC", requiresReview: false, normalizedQuery: "Nitra, Slovakia",
  }), true);
  assert.equal(isSafeAutoGeoCandidate({
    ...base, proposedVisibility: "EXACT_PUBLIC", proposedPrecision: "EXACT", requiresReview: true, normalizedQuery: "Hlavná 1, Nitra, Slovakia",
  }), false);
  assert.equal(isSafeAutoGeoCandidate({
    ...base, proposedVisibility: "HIDDEN", requiresReview: false, normalizedQuery: null,
  }), false);
  assert.equal(isSafeAutoGeoCandidate({
    ...base, proposedVisibility: null, requiresReview: true, normalizedQuery: null,
  }), false);
});

test("subsequent SAFE initialization skips already initialized Batch 1 rows before applying the limit", () => {
  const base = {
    targetType: "MANAGED_EVENT", label: "Event", category: null, locationRole: null,
    city: "Nitra", district: null, region: "Nitriansky kraj",
    proposedVisibility: "APPROXIMATE_PUBLIC", proposedPrecision: "MUNICIPALITY",
    requiresReview: false, reasonCode: null, normalizedQuery: "Nitra, Nitriansky kraj, Slovakia",
    sourceFingerprint: "fp",
  };
  const items = [
    ...Array.from({ length: 20 }, (_, index) => ({ ...base, targetId: 47 + index, alreadyInitialized: true })),
    ...Array.from({ length: 25 }, (_, index) => ({ ...base, targetId: 67 + index, alreadyInitialized: false })),
    { ...base, targetId: 200, alreadyInitialized: false, requiresReview: true, proposedVisibility: "EXACT_PUBLIC", proposedPrecision: "EXACT" },
  ];
  const selection = selectSafeUninitializedGeoCandidates(items, 20);
  assert.equal(selection.alreadyInitializedSkipped, 20);
  assert.equal(selection.eligible.length, 25);
  assert.deepEqual(selection.selected.map((item) => item.targetId), Array.from({ length: 20 }, (_, index) => 67 + index));
  assert.equal(selection.selected.some((item) => item.alreadyInitialized), false);
});

test("canary selector never sends review-blocked or hidden candidates and prefers target diversity", () => {
  const base = {
    label: "x", category: null, locationRole: null, city: "Nitra", district: null, region: "Nitriansky kraj",
    proposedPrecision: "MUNICIPALITY", reasonCode: null, sourceFingerprint: "fp", alreadyInitialized: false,
  };
  const items = [
    { ...base, targetType: "DIRECTORY_PROFILE", targetId: 1, proposedVisibility: null, requiresReview: true, normalizedQuery: null },
    { ...base, targetType: "MANAGED_EVENT", targetId: 2, proposedVisibility: "EXACT_PUBLIC", proposedPrecision: "EXACT", requiresReview: true, normalizedQuery: "Hlavná 1, Nitra, Slovakia" },
    { ...base, targetType: "DIRECTORY_PROFILE", targetId: 3, proposedVisibility: "HIDDEN", requiresReview: false, normalizedQuery: null },
    { ...base, targetType: "DIRECTORY_PROFILE", targetId: 4, proposedVisibility: "APPROXIMATE_PUBLIC", requiresReview: false, normalizedQuery: "Nitra, Slovakia" },
    { ...base, targetType: "MANAGED_EVENT", targetId: 5, proposedVisibility: "APPROXIMATE_PUBLIC", requiresReview: false, normalizedQuery: "Trnava, Slovakia" },
    { ...base, targetType: "DIRECTORY_PROFILE", targetId: 6, proposedVisibility: "APPROXIMATE_PUBLIC", requiresReview: false, normalizedQuery: "Žilina, Slovakia" },
  ];
  const selection = selectGeoCanaryCandidates(items, 2);
  assert.deepEqual(selection.selected.map((item) => [item.targetType, item.targetId]), [
    ["DIRECTORY_PROFILE", 4],
    ["MANAGED_EVENT", 5],
  ]);
  assert.equal(selection.eligible.length, 3);
  assert.equal(selection.selected.some((item) => item.requiresReview), false);
});

test("approximate queries cannot leak the private street address", () => {
  const source = {
    targetType: "DIRECTORY_PROFILE", targetId: 1, label: "Tréner", category: "treneri",
    address: "TAJNÁ ULICA 999", city: "Nitra", district: "Nitra", region: "Nitriansky kraj", countryCode: "SK",
  };
  const query = buildGeoQuery(source, "APPROXIMATE_PUBLIC", "MUNICIPALITY");
  assert.ok(query);
  assert.doesNotMatch(query, /TAJNÁ|999/i);
  assert.match(query, /Nitra/);
  const exact = buildGeoQuery(source, "EXACT_PUBLIC", "EXACT");
  assert.match(exact, /TAJNÁ ULICA 999/);
});

test("exact queries remove repeated locality text already embedded in the source address", () => {
  const fluffy = buildGeoQuery({
    targetType: "DIRECTORY_PROFILE",
    targetId: 1196,
    label: "Fluffy Pet Salon",
    category: "salony-a-sluzby",
    address: "Horná 26, 974 01 Banská Bystrica",
    city: "Banská Bystrica",
    district: "Banská Bystrica",
    region: "Banskobystrický kraj",
    countryCode: "SK",
  }, "EXACT_PUBLIC", "EXACT");
  assert.equal(
    fluffy,
    "Horná 26, 974 01 Banská Bystrica, Banskobystrický kraj, Slovakia",
  );

  const kosice = buildGeoQuery({
    targetType: "DIRECTORY_PROFILE",
    targetId: 360,
    label: "VET-MANDELÍK",
    category: "veterinari",
    address: "Ždiarska 21",
    city: "Košice – Nad jazerom",
    district: "Košice IV",
    region: "Košický kraj",
    countryCode: "SK",
  }, "EXACT_PUBLIC", "EXACT");
  assert.equal(
    kosice,
    "Ždiarska 21, Košice – Nad jazerom, Košice IV, Košický kraj, Slovakia",
  );
});

test("structured exact parsing is conservative and normalizes Slovak business addresses", () => {
  assert.deepEqual(buildStructuredExactAddress({
    targetType: "DIRECTORY_PROFILE",
    targetId: 360,
    label: "VET-MANDELÍK",
    category: "veterinari",
    address: "Ždiarska 21",
    city: "Košice – Nad jazerom",
    district: "Košice IV",
    region: "Košický kraj",
    countryCode: "SK",
  }), {
    street: "Ždiarska",
    housenumber: "21",
    city: "Košice",
    state: "Košický kraj",
    country: "Slovakia",
  });

  assert.deepEqual(buildStructuredExactAddress({
    targetType: "DIRECTORY_PROFILE",
    targetId: 1196,
    label: "Fluffy Pet Salon",
    category: "salony-a-sluzby",
    address: "Horná 26, 974 01 Banská Bystrica",
    city: "Banská Bystrica",
    district: "Banská Bystrica",
    region: "Banskobystrický kraj",
    countryCode: "SK",
  }), {
    street: "Horná",
    housenumber: "26",
    postcode: "974 01",
    city: "Banská Bystrica",
    state: "Banskobystrický kraj",
    country: "Slovakia",
  });

  assert.equal(buildStructuredExactAddress({
    targetType: "DIRECTORY_PROFILE",
    targetId: 1,
    label: "Unparseable",
    category: "veterinari",
    address: "Námestie bez čísla",
    city: "Nitra",
    countryCode: "SK",
  }), null);
});

test("source fingerprint changes only with location-relevant contract inputs", async () => {
  const source = {
    targetType: "DIRECTORY_PROFILE", targetId: 1, label: "Profil", category: "treneri",
    address: "Ulica 1", city: "Nitra", district: "Nitra", region: "Nitriansky kraj", countryCode: "SK",
  };
  const input = geoFingerprintInput(source, "APPROXIMATE_PUBLIC", "MUNICIPALITY");
  const a = await sourceGeoFingerprint(input);
  const whitespace = await sourceGeoFingerprint({ ...input, city: "  Nitra   " });
  const changed = await sourceGeoFingerprint({ ...input, city: "Trnava" });
  assert.equal(a, whitespace);
  assert.notEqual(a, changed);
  assert.equal(input.sourceAddress, null, "approximate source fingerprint must not depend on private street");
  assert.equal(isGeoRecordStale(changed, a), true);
  assert.equal(isGeoRecordStale(a, a), false);
});

test("retry state stays pending only for temporary provider failures before exhaustion", () => {
  assert.equal(safeGeoErrorStatus("RATE_LIMITED", 1), "PENDING");
  assert.equal(safeGeoErrorStatus("PROVIDER_ERROR", 2), "PENDING");
  assert.equal(safeGeoErrorStatus("PROVIDER_ERROR", 3), "FAILED");
  assert.equal(safeGeoErrorStatus("AMBIGUOUS", 1), "NEEDS_REVIEW");
  assert.equal(safeGeoErrorStatus("PRIVATE_HIDDEN", 1), "SKIPPED");
});

test("conservative result chooser rejects ambiguity, wrong country and low confidence", () => {
  const base = {
    latitude: 48.1486, longitude: 17.1077, country: "Slovakia", countryCode: "SK",
    region: "Bratislavský kraj", district: "Bratislava I", city: "Bratislava",
    resultType: "building", confidence: 0.99, cityConfidence: 0.99, streetConfidence: 0.99,
    buildingConfidence: 0.99, matchType: "full_match", provider: "test", provenance: "test",
    sourceLicense: "test", providerResultId: "1",
  };
  assert.equal(chooseGeocoderResult({ results: [base], sourceCity: "Bratislava", precision: "EXACT" }).errorCode, null);
  assert.equal(chooseGeocoderResult({ results: [{ ...base, countryCode: "CZ" }], sourceCity: "Bratislava", precision: "EXACT" }).errorCode, "NO_MATCH");
  assert.equal(chooseGeocoderResult({ results: [{ ...base, confidence: 0.4 }], sourceCity: "Bratislava", precision: "EXACT" }).errorCode, "LOW_CONFIDENCE");
  assert.equal(chooseGeocoderResult({
    results: [base, { ...base, providerResultId: "2", latitude: 48.2, longitude: 17.2, confidence: 0.98 }],
    sourceCity: "Bratislava", precision: "EXACT",
  }).errorCode, "AMBIGUOUS");
});


test("admin geocoder diagnostics expose bounded decision metadata without persisting provider candidates", () => {
  const candidates = summarizeGeoDiagnosticResults([
    {
      latitude: 48.1, longitude: 17.1, country: "Slovakia", countryCode: "SK",
      region: "Bratislavský kraj", district: "Bratislava I", city: "Bratislava",
      resultType: "building", confidence: 0.93, cityConfidence: 1, streetConfidence: 1,
      buildingConfidence: 0.7, matchType: "full_match", provider: "geoapify", provenance: "OSM",
      sourceLicense: "ODbL", providerResultId: "1",
    },
    {
      latitude: 48.2, longitude: 17.2, country: "Slovakia", countryCode: "SK",
      region: "Bratislavský kraj", district: "Bratislava I", city: "Bratislava",
      resultType: "street", confidence: 0.91, cityConfidence: 1, streetConfidence: 0.9,
      buildingConfidence: null, matchType: "match_by_building", provider: "geoapify", provenance: "OSM",
      sourceLicense: "ODbL", providerResultId: "2",
    },
  ]);
  assert.equal(candidates.length, 2);
  assert.deepEqual(Object.keys(candidates[0]).sort(), [
    "buildingConfidence", "city", "cityConfidence", "confidence", "countryCode",
    "district", "matchType", "region", "resultType", "streetConfidence",
  ].sort());
});

test("Geoapify adapter handles disabled, normalized success and 429 retryability with injected fetch", async () => {
  const disabled = new GeoapifyGeocoder({ apiKey: "" });
  assert.equal(disabled.isConfigured(), false);
  await assert.rejects(
    () => disabled.geocodeApproximate({ query: "Nitra, Slovakia", precision: "MUNICIPALITY", countryCode: "SK" }),
    (error) => error instanceof GeocoderProviderError && error.code === "DISABLED" && error.retryable === false,
  );

  const success = new GeoapifyGeocoder({
    apiKey: "test-key",
    fetchImpl: async () => new Response(JSON.stringify({
      results: [{
        lat: 48.3061, lon: 18.0764, country: "Slovakia", country_code: "sk",
        state: "Nitriansky kraj", county: "Nitra", city: "Nitra", result_type: "city", place_id: "fixture",
        rank: { confidence: 0.99, confidence_city_level: 0.99, match_type: "full_match" },
        datasource: { sourcename: "OpenStreetMap", attribution: "© OpenStreetMap contributors", license: "ODbL" },
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  const result = await success.geocodeApproximate({ query: "Nitra, Slovakia", precision: "MUNICIPALITY", countryCode: "SK" });
  assert.equal(result.length, 1);
  assert.equal(result[0].provider, "geoapify");
  assert.equal(result[0].countryCode, "SK");
  assert.match(result[0].sourceLicense, /OpenStreetMap|ODbL/);

  let structuredUrl = "";
  const structured = new GeoapifyGeocoder({
    apiKey: "test-key",
    fetchImpl: async (input) => {
      structuredUrl = String(input);
      return new Response(JSON.stringify({
        results: [{
          lat: 48.72, lon: 21.28, country: "Slovakia", country_code: "sk",
          state: "Košický kraj", city: "Košice", result_type: "building", place_id: "structured",
          rank: { confidence: 1, confidence_city_level: 1, confidence_street_level: 1, confidence_building_level: 1, match_type: "full_match" },
          datasource: { sourcename: "OpenStreetMap", attribution: "© OpenStreetMap contributors", license: "ODbL" },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  await structured.geocodeExact({
    query: "Ždiarska 21, Košice, Slovakia",
    precision: "EXACT",
    countryCode: "SK",
    structuredAddress: {
      housenumber: "21",
      street: "Ždiarska",
      city: "Košice",
      state: "Košický kraj",
      country: "Slovakia",
    },
  });
  const structuredParsed = new URL(structuredUrl);
  assert.equal(structuredParsed.searchParams.get("text"), null);
  assert.equal(structuredParsed.searchParams.get("housenumber"), "21");
  assert.equal(structuredParsed.searchParams.get("street"), "Ždiarska");
  assert.equal(structuredParsed.searchParams.get("city"), "Košice");
  assert.equal(structuredParsed.searchParams.get("state"), "Košický kraj");
  assert.equal(structuredParsed.searchParams.get("country"), "Slovakia");
  assert.equal(structuredParsed.searchParams.get("filter"), "countrycode:sk");

  const limited = new GeoapifyGeocoder({
    apiKey: "test-key",
    fetchImpl: async () => new Response("rate limited", { status: 429 }),
  });
  await assert.rejects(
    () => limited.geocodeExact({ query: "Hlavná 1, Nitra, Slovakia", precision: "EXACT", countryCode: "SK" }),
    (error) => error instanceof GeocoderProviderError && error.code === "RATE_LIMITED" && error.retryable === true,
  );
});

test("Geoapify adapter is server-only, bounded and normalizes provider failures", () => {
  assert.match(provider, /cloudflare:workers/);
  assert.match(provider, /GEOAPIFY_API_KEY/);
  assert.doesNotMatch(provider, /NEXT_PUBLIC/);
  assert.match(provider, /AbortController/);
  assert.match(provider, /response\.status === 429/);
  assert.match(provider, /RATE_LIMITED/);
  assert.match(provider, /limit", "5"/);
  assert.match(provider, /countrycode:/);
  assert.doesNotMatch(provider, /localStorage|window\./);
});

test("manual override is guarded against automatic overwrite and source changes preserve it", () => {
  assert.match(geoStore, /Automatic geocoder nesmie prepísať manual override/);
  assert.match(geoStore, /current\.manualOverride \? "MANUAL_REVIEW" : null/);
  assert.match(geoStore, /resolution_method='MANUAL'/);
  assert.match(geoStore, /manual_override=1/);
  assert.match(geoStore, /GEO_MANUAL_RESET/);
});

test("exact source changes revoke exact visibility until privacy is reviewed again", () => {
  assert.match(geoStore, /exactNeedsPrivacyReview = current\.publicVisibility === "EXACT_PUBLIC" && !current\.manualOverride/);
  assert.match(geoStore, /public_visibility=NULL, public_precision=NULL/);
  assert.match(geoStore, /geocode_status='NEEDS_REVIEW', last_error_code='PRIVACY_CLASSIFICATION_MISSING'/);
  assert.match(geoStore, /reasonCode: exactNeedsPrivacyReview/);
});

test("pre-migration deployment remains fail-safe when geo_points is not yet applied", () => {
  assert.match(geoStore, /SELECT 1 FROM geo_points LIMIT 1/);
  assert.match(geoAdminApi, /schemaReady/);
  assert.match(geoAdminApi, /Geo migrácia 0064 ešte nie je aplikovaná/);
  assert.match(geoAdminComponent, /!snapshot\.schemaReady/);
  assert.match(geoAdminComponent, /Canonical profil funguje ďalej bez geo operácií/);
});

test("bounded backfill UI shows live progress and executes one provider candidate per request", () => {
  assert.match(geoOperationsComponent, /Backfill prebieha:/);
  assert.match(geoOperationsComponent, /limit: 1/);
  assert.match(geoOperationsComponent, /for \(let index = 1; index <= total; index \+= 1\)/);
  assert.match(geoOperationsComponent, /setBackfillReport/);
  assert.match(geoOperationsComponent, /posledný request nemá potvrdený výsledok/i);
});

test("operations are bounded, scoped and full production backfill remains absent", () => {
  assert.match(operations, /Math\.min\(100/);
  assert.match(operations, /Math\.min\(10/);
  assert.match(operations, /Math\.min\(20/);
  assert.match(operations, /safeOnly/);
  assert.match(operations, /alreadyInitializedSkipped/);
  assert.match(operations, /selectSafeUninitializedGeoCandidates/);
  assert.match(operationsApi, /previewSafeGeoInitialization/);
  assert.match(geoOperationsComponent, /Nasledujúci SAFE batch preview/);
  assert.match(operationsApi, /confirm !== "INITIALIZE"/);
  assert.match(operationsApi, /confirm !== "CANARY"/);
  assert.match(operationsApi, /confirm !== "BACKFILL-CHUNK"/);
  assert.match(operationsApi, /Bounded backfill vyžaduje explicitný target type/);
  assert.match(operationsApi, /Safe-only initialization vyžaduje explicitný target type/);
  assert.match(operationsApi, /fullBackfillEnabled: false/);
  assert.match(geoOperationsComponent, /Inicializovať SAFE max\. 20/);
  assert.match(geoOperationsComponent, /Backfill max\. 5/);
  assert.match(geoOperationsComponent, /Vyber target/);
  assert.doesNotMatch(operations + operationsApi + geoOperationsComponent, /geocodeAll|geocode_everything|fullBackfill\s*=\s*true/i);
});

test("Gate A inventory is SELECT-only and never reads private lost/found storage", () => {
  const withoutComments = inventory.replace(/--.*$/gm, "");
  assert.doesNotMatch(withoutComments, /\b(?:INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP|CREATE)\b/i);
  assert.match(inventory, /lost_found_dog_reports/);
  assert.doesNotMatch(inventory, /FROM\s+lost_found_dog_private_details/i);
  assert.doesNotMatch(inventory, /private_latitude|private_longitude/i);
});

test("generic geo foundation never targets lost/found and MAP-1D keeps the public privacy boundary", () => {
  assert.doesNotMatch(migration, /lost_found/i);
  assert.doesNotMatch(geoStore, /lost_found_dog_private_details|private_latitude|private_longitude/i);
  assert.doesNotMatch(publicMapRoute + publicMapQuery, /lost_found_dog_private_details|private_latitude|private_longitude/i);
  assert.equal(existsSync(new URL("../app/mapa/page.tsx", import.meta.url)), true);
  assert.equal(existsSync(new URL("../app/api/map/route.ts", import.meta.url)), true);
});
