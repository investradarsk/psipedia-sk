import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(new URL("../app/api/map/route.ts", import.meta.url), "utf8");
const query = readFileSync(new URL("../lib/map-query.ts", import.meta.url), "utf8");
const contract = readFileSync(new URL("../lib/map-contract.ts", import.meta.url), "utf8");

test("public map route is GET-only, public and thin", () => {
  assert.match(route, /export async function GET\(request: Request\)/);
  assert.doesNotMatch(route, /export async function POST|requireAdmin|requirePartner|session/i);
  assert.match(route, /parseMapQuery/);
  assert.match(route, /queryPublicMap/);
  assert.equal(existsSync(new URL("../app/mapa/page.tsx", import.meta.url)), false);
});

test("map API has bounded response, short isolated HTTP cache and HMAC-backed abuse guard", () => {
  assert.match(contract, /MAP_MAX_ITEMS = 500/);
  assert.match(contract, /MAP_MAX_CLUSTERS = 250/);
  assert.match(route, /s-maxage=\$\{MAP_CACHE_TTL_SECONDS\}/);
  assert.match(route, /stale-while-revalidate=\$\{MAP_CACHE_STALE_SECONDS\}/);
  assert.match(route, /deriveRateLimitKey\("public-map"/);
  assert.match(route, /createD1RateLimitStore/);
  assert.doesNotMatch(route, /public-html-cache|versionedPublicHtmlCache/i);
});

test("query layer whitelists DTO fields and never serializes raw geo internals", () => {
  assert.doesNotMatch(query, /SELECT\s+\*/i);
  assert.match(query, /public_visibility IN \('EXACT_PUBLIC', 'APPROXIMATE_PUBLIC'\)/);
  assert.match(query, /geocode_status = 'RESOLVED'/);
  assert.match(query, /source_fingerprint = g\.resolved_source_fingerprint/);
  assert.match(query, /d\.status = 'published'/);
  assert.match(query, /o\.status = 'PUBLISHED'/);
  assert.match(query, /e\.status = 'published'/);
  assert.match(query, /e\.cancelled = 0/);
  for (const forbidden of [
    "normalizedQuery:", "queryFingerprint:", "lastErrorCode:", "manualUpdatedBy:",
    "sourceFingerprint:", "resolvedSourceFingerprint:", "provider:",
  ]) assert.doesNotMatch(query.slice(query.indexOf("export function mapCandidateToItem")), new RegExp(forbidden));
});

test("approximate public serialization cannot export the source street", () => {
  const display = query.slice(query.indexOf("export function publicDisplayLocation"), query.indexOf("export function mapCandidateToItem"));
  assert.match(display, /EXACT_PUBLIC/);
  assert.match(display, /\[candidate\.city, candidate\.district, candidate\.region\]/);
});

test("geo unavailable is explicit and no fake empty-map fallback exists", () => {
  assert.match(route, /MAP_GEO_UNAVAILABLE/);
  assert.match(route, /status: 503/);
  assert.doesNotMatch(route, /MAP_GEO_UNAVAILABLE[\s\S]{0,400}status: 200/);
});
