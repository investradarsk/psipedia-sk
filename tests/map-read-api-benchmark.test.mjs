import assert from "node:assert/strict";
import test from "node:test";
import { clusterMapItems } from "../lib/map-query.ts";

test("3k-point server clustering benchmark stays comfortably bounded", () => {
  const items = Array.from({ length: 3000 }, (_, index) => ({
    id: `service:${index + 1}`,
    entityType: "service",
    entityId: index + 1,
    name: `Service ${index + 1}`,
    category: "services",
    subcategory: "veterinari",
    href: `/adresar/veterinari/service-${index + 1}`,
    latitude: 47.7 + (index % 60) * 0.04,
    longitude: 16.8 + (index % 70) * 0.07,
    precision: "EXACT",
  }));
  const start = performance.now();
  const clusters = clusterMapItems(items, 7);
  const durationMs = performance.now() - start;
  console.log(`MAP_BENCHMARK points=3000 clusters=${clusters.length} duration_ms=${durationMs.toFixed(2)}`);
  assert.ok(clusters.length <= 250);
  assert.ok(durationMs < 2000, `clustering took ${durationMs.toFixed(2)}ms`);
});
