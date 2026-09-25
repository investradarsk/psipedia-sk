import { expect, test } from "@playwright/test";

function mapUrl(overrides: Record<string, string> = {}) {
  const params = new URLSearchParams({
    north: "50",
    south: "47",
    east: "23",
    west: "16",
    zoom: "12",
    ...overrides,
  });
  return `/api/map?${params.toString()}`;
}

test("public map API exposes only approved current canonical geo items", async ({ request }) => {
  const response = await request.get(mapUrl());
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.mode).toBe("items");

  const names = body.items.map((item: { name: string }) => item.name);
  expect(names).toContain("MAP E2E Veterina A");
  expect(names).toContain("MAP E2E Veterina B");
  expect(names).not.toContain("MAP E2E Chovateľská stanica");
  expect(names).toContain("MAP E2E Linked Organization");
  expect(names).toContain("MAP E2E Multi Site Org");
  expect(names).toContain("MAP E2E Budúca výstava");

  expect(names).not.toContain("MAP E2E Hidden venčenie");
  expect(names).not.toContain("MAP E2E Needs Review");
  expect(names).not.toContain("MAP E2E Stale");
  expect(names).not.toContain("MAP E2E Linked Directory");
  expect(names).not.toContain("MAP E2E Minulé podujatie");
  expect(names).not.toContain("MAP E2E Zrušené podujatie");

  // ADDRESS-1 is exact-only for DIRECTORY_PROFILE. The synthetic breeder fixture
  // intentionally remains APPROXIMATE_PUBLIC / MUNICIPALITY and must be excluded.
  const serviceArea = body.items.find(
    (item: { name: string; locationRole?: string }) =>
      item.name === "MAP E2E Multi Site Org" && item.locationRole === "SERVICE_AREA",
  );
  expect(serviceArea).toBeTruthy();
  expect(serviceArea.displayLocation).not.toContain("Neverejná service-area 8");

  const linked = body.items.find((item: { name: string }) => item.name === "MAP E2E Linked Organization");
  expect(linked.href).toBe("/organizacie/map-e2e-linked-organization");

  expect(body.items.filter((item: { name: string }) => item.name === "MAP E2E Multi Site Org")).toHaveLength(2);
  expect(body.items.filter((item: { latitude: number; longitude: number }) => item.latitude === 48.306 && item.longitude === 18.086)).toHaveLength(2);

  expect(body.meta.attribution).toContainEqual({ label: "Powered by Geoapify", url: "https://www.geoapify.com/" });
  expect(body.meta.attribution).toContainEqual({ label: "© OpenStreetMap contributors", url: "https://www.openstreetmap.org/copyright" });

  const serialized = JSON.stringify(body);
  for (const forbidden of [
    "source_fingerprint",
    "resolved_source_fingerprint",
    "normalized_query",
    "query_fingerprint",
    "last_error_code",
    "manual_updated_by",
    "Súkromná 77",
    "Neverejná service-area 8",
  ]) expect(serialized).not.toContain(forbidden);
});

test("map filters combine without escaping the viewport", async ({ request }) => {
  const response = await request.get(mapUrl({
    category: "services",
    subcategory: "veterinari",
    region: "Nitriansky kraj",
    district: "Nitra",
    city: "Nitra",
    search: "veterina",
  }));
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.mode).toBe("items");
  expect(body.items.map((item: { name: string }) => item.name)).toEqual([
    "MAP E2E Veterina A",
    "MAP E2E Veterina B",
  ]);

  const outside = await request.get(mapUrl({
    north: "49.0",
    south: "48.9",
    east: "17.2",
    west: "17.0",
    zoom: "12",
    search: "veterina",
  }));
  expect(outside.status()).toBe(200);
  const outsideBody = await outside.json();
  expect(outsideBody.mode).toBe("items");
  expect(outsideBody.items).toEqual([]);
});

test("event type/timing uses canonical current+upcoming lifecycle", async ({ request }) => {
  const response = await request.get(mapUrl({ category: "events", eventType: "Výstava" }));
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.items.map((item: { name: string }) => item.name)).toEqual(["MAP E2E Budúca výstava"]);
});

test("low zoom is aggregated and hard result limits are enforced", async ({ request }) => {
  const clusters = await request.get(mapUrl({ zoom: "7" }));
  expect(clusters.status()).toBe(200);
  const clusterBody = await clusters.json();
  expect(clusterBody.mode).toBe("clusters");
  expect(clusterBody.clusters.length).toBeLessThanOrEqual(250);

  const limited = await request.get(mapUrl({ category: "services", limit: "1" }));
  expect(limited.status()).toBe(200);
  const limitedBody = await limited.json();
  expect(limitedBody.mode).toBe("items");
  expect(limitedBody.items).toHaveLength(1);
  expect(limitedBody.meta.truncated).toBe(true);
});

test("invalid requests are 400 and zero result is 200", async ({ request }) => {
  const invalid = await request.get(mapUrl({ north: "oops" }));
  expect(invalid.status()).toBe(400);
  expect((await invalid.json()).error.code).toBe("MAP_INVALID_QUERY");

  const invalidEnum = await request.get(mapUrl({ category: "private" }));
  expect(invalidEnum.status()).toBe(400);

  const empty = await request.get(mapUrl({ category: "services", city: "Košice" }));
  expect(empty.status()).toBe(200);
  const body = await empty.json();
  expect(body.mode).toBe("items");
  expect(body.items).toEqual([]);
  expect(body.meta.count).toBe(0);
});
