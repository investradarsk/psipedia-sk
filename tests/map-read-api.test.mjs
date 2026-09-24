import assert from "node:assert/strict";
import test from "node:test";
import {
  MAP_MAX_ITEMS,
  MapQueryValidationError,
  bboxContains,
  mapClusterGridSize,
  mapResponseMode,
  parseMapQuery,
} from "../lib/map-contract.ts";
import {
  MapGeoUnavailableError,
  clusterMapItems,
  deduplicateLinkedOrganizationDirectory,
  isPublicMapCandidate,
  mapCandidateToItem,
  publicDisplayLocation,
  queryPublicMap,
} from "../lib/map-query.ts";

const NOW = new Date("2026-09-22T12:00:00.000Z");

function params(overrides = {}) {
  return new URLSearchParams({
    north: "50",
    south: "47",
    east: "23",
    west: "16",
    zoom: "12",
    ...overrides,
  });
}

function row(overrides = {}) {
  const value = {
    geo_point_id: 1,
    entity_type: "service",
    entity_id: 1,
    organization_location_id: null,
    linked_directory_profile_id: null,
    name: "Veterina Nitra",
    slug: "veterina-nitra",
    subcategory: "veterinari",
    latitude: 48.306,
    longitude: 18.086,
    precision: "EXACT",
    public_visibility: "EXACT_PUBLIC",
    geocode_status: "RESOLVED",
    source_fingerprint: "same",
    resolved_source_fingerprint: "same",
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    address: "Verejná 1",
    search_text: "",
    verified: 1,
    featured: 0,
    location_role: null,
    event_start_date: null,
    event_start_time: null,
    event_end_date: null,
    event_end_time: null,
    canonical_status: "published",
    archived_at: null,
    cancelled: 0,
    online: 0,
    provider: null,
    ...overrides,
  };
  if (!Object.prototype.hasOwnProperty.call(overrides, "search_text")) {
    value.search_text = `${value.name} ${value.city} ${value.district} ${value.region}`;
  }
  return value;
}

function fakeDb(seed = {}, schemaReady = true) {
  return {
    prepare(sql) {
      const statement = {
        bindings: [],
        bind(...bindings) {
          this.bindings = bindings;
          return this;
        },
        async first() {
          if (sql.includes("SELECT 1 FROM geo_points")) {
            if (!schemaReady) throw new Error("no such table: geo_points");
            return { ok: 1 };
          }
          return null;
        },
        async all() {
          if (sql.includes("JOIN directory_profiles")) return { results: seed.services ?? [] };
          if (sql.includes("JOIN organization_locations")) return { results: seed.organizations ?? [] };
          if (sql.includes("JOIN managed_events")) return { results: seed.events ?? [] };
          return { results: [] };
        },
      };
      return statement;
    },
  };
}

test("bbox/zoom validation supports antimeridian and rejects malformed values", () => {
  assert.equal(parseMapQuery(params()).zoom, 12);
  const crossing = parseMapQuery(params({ west: "170", east: "-170" }));
  assert.equal(bboxContains(crossing.bbox, 48, 179), true);
  assert.equal(bboxContains(crossing.bbox, 48, -179), true);
  assert.equal(bboxContains(crossing.bbox, 48, 0), false);
  assert.throws(() => parseMapQuery(params({ north: "NaN" })), MapQueryValidationError);
  assert.throws(() => parseMapQuery(params({ north: "47" })), /latitude/);
  assert.throws(() => parseMapQuery(params({ zoom: "22" })), /zoom/);
  assert.throws(() => parseMapQuery(params({ category: "secret" })), /category/);
  assert.throws(() => parseMapQuery(params({ search: "x" })), /at least 2/);
  assert.throws(() => parseMapQuery(params({ limit: String(MAP_MAX_ITEMS + 1) })), /limit/);
  assert.throws(() => parseMapQuery(params({ mystery: "1" })), /Unknown parameter/);
});

test("zoom and large viewport select deterministic aggregate mode", () => {
  const low = parseMapQuery(params({ zoom: "7" }));
  const high = parseMapQuery(params({ north: "49", south: "48", east: "19", west: "17", zoom: "12" }));
  assert.equal(mapResponseMode(low), "clusters");
  assert.equal(mapResponseMode(high), "items");
  assert.equal(mapClusterGridSize(6), 1);
  assert.equal(mapClusterGridSize(8), 0.5);
  assert.equal(mapClusterGridSize(10), 0.2);
  assert.equal(mapClusterGridSize(12), 0.1);
});

test("public eligibility is fail-closed for hidden, stale, review, failed, unpublished and stale fingerprints", () => {
  const candidate = {
    geoPointId: 1, entityType: "service", entityId: 1, organizationLocationId: null, linkedDirectoryProfileId: null,
    name: "A", slug: "a", subcategory: "veterinari", latitude: 48, longitude: 18, precision: "EXACT",
    publicVisibility: "EXACT_PUBLIC", geocodeStatus: "RESOLVED", sourceFingerprint: "a", resolvedSourceFingerprint: "a",
    city: "Nitra", district: "Nitra", region: "Nitriansky kraj", address: "A 1", searchText: "a",
    verified: false, featured: false, locationRole: null, eventStartDate: null, eventStartTime: null,
    eventEndDate: null, eventEndTime: null, canonicalStatus: "published", archivedAt: null,
    cancelled: false, online: false, provider: null,
  };
  assert.equal(isPublicMapCandidate(candidate, "2026-09-22"), true);
  for (const patch of [
    { publicVisibility: "HIDDEN" },
    { publicVisibility: null },
    { geocodeStatus: "STALE" },
    { geocodeStatus: "NEEDS_REVIEW" },
    { geocodeStatus: "FAILED" },
    { geocodeStatus: "PENDING" },
    { resolvedSourceFingerprint: "other" },
    { canonicalStatus: "draft" },
    { archivedAt: "2026-09-22T00:00:00Z" },
  ]) assert.equal(isPublicMapCandidate({ ...candidate, ...patch }, "2026-09-22"), false);
});

test("approximate public display never includes source street while exact may include approved address", () => {
  const base = { publicVisibility: "APPROXIMATE_PUBLIC", address: "Súkromná 99", city: "Nitra", district: "Nitra", region: "Nitriansky kraj" };
  assert.equal(publicDisplayLocation(base), "Nitra · Nitriansky kraj");
  assert.equal(publicDisplayLocation({ ...base, publicVisibility: "EXACT_PUBLIC" }), "Súkromná 99 · Nitra · Nitriansky kraj");
});

test("linked organization-directory dedup prefers organization only with explicit relationship and same marker", () => {
  const service = {
    geoPointId: 1, entityType: "service", entityId: 15, organizationLocationId: null, linkedDirectoryProfileId: null,
    latitude: 48.1, longitude: 18.1,
  };
  const organization = {
    geoPointId: 2, entityType: "organization", entityId: 9, organizationLocationId: 20, linkedDirectoryProfileId: 15,
    latitude: 48.1, longitude: 18.1,
  };
  const unrelated = { ...service, geoPointId: 3, entityId: 16 };
  assert.deepEqual(
    deduplicateLinkedOrganizationDirectory([service, organization, unrelated]).map((item) => item.geoPointId),
    [2, 3],
  );
  assert.deepEqual(
    deduplicateLinkedOrganizationDirectory([service, { ...organization, longitude: 18.2 }]).map((item) => item.geoPointId),
    [1, 2],
  );
});

test("shared physical coordinates remain separate MapItems and clusters only aggregate presentation", () => {
  const serviceA = mapCandidateToItem({
    geoPointId: 1, entityType: "service", entityId: 1, organizationLocationId: null, linkedDirectoryProfileId: null,
    name: "A", slug: "a", subcategory: "veterinari", latitude: 48.3, longitude: 18.1, precision: "EXACT",
    publicVisibility: "EXACT_PUBLIC", geocodeStatus: "RESOLVED", sourceFingerprint: "x", resolvedSourceFingerprint: "x",
    city: "Nitra", district: "Nitra", region: "Nitriansky kraj", address: "A", searchText: "a",
    verified: false, featured: false, locationRole: null, eventStartDate: null, eventStartTime: null,
    eventEndDate: null, eventEndTime: null, canonicalStatus: "published", archivedAt: null,
    cancelled: false, online: false, provider: null,
  });
  const serviceB = { ...serviceA, id: "service:2", entityId: 2, name: "B" };
  const clusters = clusterMapItems([serviceA, serviceB], 7);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].count, 2);
  assert.equal(clusters[0].categoryCounts.services, 2);
  assert.match(clusters[0].id, /^cluster:/);
});

test("seeded query layer combines filters, privacy, publication, event lifecycle and dedup", async () => {
  const services = [
    row({ geo_point_id: 1, entity_id: 1, name: "Veterina Nitra", slug: "vet-nitra" }),
    row({ geo_point_id: 2, entity_id: 2, name: "Hidden", slug: "hidden", public_visibility: "HIDDEN" }),
    row({ geo_point_id: 3, entity_id: 3, name: "Stale", slug: "stale", geocode_status: "STALE" }),
    row({ geo_point_id: 4, entity_id: 4, name: "Shared A", slug: "shared-a", latitude: 48.31, longitude: 18.09 }),
    row({ geo_point_id: 5, entity_id: 5, name: "Shared B", slug: "shared-b", latitude: 48.31, longitude: 18.09 }),
    row({ geo_point_id: 6, entity_id: 10, name: "Linked Directory", slug: "linked-directory", latitude: 48.32, longitude: 18.11 }),
    row({
      geo_point_id: 7, entity_id: 7, name: "Sensitive breeder", slug: "breeder", subcategory: "chovatelske-stanice",
      public_visibility: "APPROXIMATE_PUBLIC", precision: "MUNICIPALITY", address: "Neverejná 77",
    }),
  ];
  const organizations = [
    row({
      geo_point_id: 20, entity_type: "organization", entity_id: 100, organization_location_id: 501,
      linked_directory_profile_id: 10, name: "Linked Organization", slug: "linked-org", subcategory: "CIVIC_ASSOCIATION",
      latitude: 48.32, longitude: 18.11, location_role: "SITE", canonical_status: "PUBLISHED",
      verified: 0, featured: 0, online: 0,
    }),
    row({
      geo_point_id: 21, entity_type: "organization", entity_id: 101, organization_location_id: 502,
      name: "Service Area Org", slug: "area-org", subcategory: "RESCUE_ORGANIZATION",
      latitude: 48.35, longitude: 18.15, precision: "SERVICE_AREA", public_visibility: "APPROXIMATE_PUBLIC",
      location_role: "SERVICE_AREA", canonical_status: "PUBLISHED", verified: 0, featured: 0, online: 0,
    }),
  ];
  const events = [
    row({
      geo_point_id: 30, entity_type: "event", entity_id: 200, name: "Budúca výstava", slug: "future-show",
      subcategory: "Výstava", latitude: 48.4, longitude: 18.2, canonical_status: "published",
      event_start_date: "2030-10-01", event_start_time: "09:00", event_end_date: "2030-10-01",
      event_end_time: "16:00", verified: 0, featured: 0, online: 0,
    }),
    row({
      geo_point_id: 31, entity_type: "event", entity_id: 201, name: "Minulé podujatie", slug: "past",
      subcategory: "Výstava", latitude: 48.4, longitude: 18.2, canonical_status: "published",
      event_start_date: "2020-01-01", event_end_date: "2020-01-01", verified: 0, featured: 0, online: 0,
    }),
    row({
      geo_point_id: 32, entity_type: "event", entity_id: 202, name: "Zrušené podujatie", slug: "cancelled",
      subcategory: "Výstava", latitude: 48.4, longitude: 18.2, canonical_status: "published",
      event_start_date: "2030-01-01", event_end_date: "2030-01-01", cancelled: 1, verified: 0, featured: 0, online: 0,
    }),
  ];

  const result = await queryPublicMap(parseMapQuery(params()), fakeDb({ services, organizations, events }), NOW);
  assert.equal(result.mode, "items");
  const body = JSON.stringify(result);
  assert.match(body, /Veterina Nitra/);
  assert.match(body, /Sensitive breeder/);
  assert.doesNotMatch(body, /Neverejná 77/);
  assert.doesNotMatch(body, /Hidden/);
  assert.doesNotMatch(body, /Stale/);
  assert.doesNotMatch(body, /Linked Directory/);
  assert.match(body, /Linked Organization/);
  assert.match(body, /Shared A/);
  assert.match(body, /Shared B/);
  assert.match(body, /Budúca výstava/);
  assert.doesNotMatch(body, /Minulé podujatie/);
  assert.doesNotMatch(body, /Zrušené podujatie/);
  for (const forbidden of [
    "sourceFingerprint", "resolvedSourceFingerprint", "normalized_query", "query_fingerprint",
    "last_error_code", "manual_updated_by", "provider",
  ]) assert.equal(body.includes(forbidden), false, forbidden);

  const filtered = await queryPublicMap(
    parseMapQuery(params({ category: "services", subcategory: "veterinari", city: "Nitra", search: "Veterina" })),
    fakeDb({ services, organizations, events }),
    NOW,
  );
  assert.equal(filtered.mode, "items");
  assert.deepEqual(filtered.items.map((item) => item.name), ["Veterina Nitra"]);
});

test("nullable projected search text fails closed instead of crashing the public map query", async () => {
  const result = await queryPublicMap(
    parseMapQuery(params({ search: "nullable" })),
    fakeDb({
      events: [row({
        geo_point_id: 40,
        entity_type: "event",
        entity_id: 240,
        name: "Nullable event",
        slug: "nullable-event",
        subcategory: "Výstava",
        latitude: 48.4,
        longitude: 18.2,
        canonical_status: "published",
        event_start_date: "2030-10-01",
        event_end_date: "2030-10-01",
        search_text: null,
        verified: 0,
        featured: 0,
        online: 0,
      })],
    }),
    NOW,
  );
  assert.equal(result.mode, "items");
  assert.deepEqual(result.items, []);
});

test("low zoom singleton buckets preserve the existing public MapItem DTO", async () => {
  const result = await queryPublicMap(
    parseMapQuery(params({ zoom: "7" })),
    fakeDb({ services: [row({ name: "Singleton Vet", slug: "singleton-vet" })] }),
    NOW,
  );
  assert.equal(result.mode, "clusters");
  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].count, 1);
  assert.equal(result.clusters[0].singletonItem?.name, "Singleton Vet");
  assert.equal(result.clusters[0].singletonItem?.href, "/adresar/veterinari/singleton-vet");
  assert.equal(JSON.stringify(result.clusters[0].singletonItem).includes("sourceFingerprint"), false);
});

test("low zoom returns clusters instead of thousands of marker payloads", async () => {
  const services = Array.from({ length: 1200 }, (_, index) => row({
    geo_point_id: index + 1,
    entity_id: index + 1,
    name: `Service ${index}`,
    slug: `service-${index}`,
    latitude: 47.8 + (index % 40) * 0.04,
    longitude: 16.8 + (index % 50) * 0.08,
  }));
  const result = await queryPublicMap(parseMapQuery(params({ zoom: "7" })), fakeDb({ services }), NOW);
  assert.equal(result.mode, "clusters");
  assert.ok(result.clusters.length < services.length);
  assert.ok(result.clusters.length <= 250);
});

test("geo schema absence is an explicit 503-level service error contract", async () => {
  await assert.rejects(
    () => queryPublicMap(parseMapQuery(params()), fakeDb({}, false), NOW),
    (error) => error instanceof MapGeoUnavailableError && error.code === "MAP_GEO_UNAVAILABLE",
  );
});
