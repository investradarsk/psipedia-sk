import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  evaluateGooglePlaceCandidates,
  GOOGLE_PLACE_MATCH_DISTANCE_METERS,
} from "../lib/google-place-matching.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

const target = {
  targetId: 1,
  name: "Crystal Pets",
  city: "Hliník nad Hronom",
  postalCode: "966 01",
  canonicalAddress: "Železničná 2/75\n966 01 Hliník nad Hronom",
  latitude: 48.545,
  longitude: 18.783,
};

test("GOOGLE-PLACE-1B exact strong name+address+near coordinates => MATCH", () => {
  const result = evaluateGooglePlaceCandidates(target, [{
    id: "opaque-place-id-1",
    displayName: "Crystal Pets",
    formattedAddress: "Železničná 2/75, 966 01 Hliník nad Hronom, Slovensko",
    latitude: 48.5451,
    longitude: 18.7831,
  }]);
  assert.equal(result.decision, "MATCH");
  assert.ok(result.candidate.distanceMeters <= GOOGLE_PLACE_MATCH_DISTANCE_METERS);
});

test("GOOGLE-PLACE-1B different city / large distance never auto-matches", () => {
  const result = evaluateGooglePlaceCandidates(target, [{
    id: "opaque-place-id-2",
    displayName: "Crystal Pets",
    formattedAddress: "Hlavná 1, 811 01 Bratislava, Slovensko",
    latitude: 48.1486,
    longitude: 17.1077,
  }]);
  assert.notEqual(result.decision, "MATCH");
});

test("GOOGLE-PLACE-1B multiple plausible candidates => REVIEW", () => {
  const result = evaluateGooglePlaceCandidates(target, [
    {
      id: "opaque-place-id-a",
      displayName: "Crystal Pets",
      formattedAddress: "Železničná 2/75, 966 01 Hliník nad Hronom, Slovensko",
      latitude: 48.5451,
      longitude: 18.7831,
    },
    {
      id: "opaque-place-id-b",
      displayName: "Crystal Pets",
      formattedAddress: "Železničná 2/75, 966 01 Hliník nad Hronom, Slovensko",
      latitude: 48.5452,
      longitude: 18.7832,
    },
  ]);
  assert.equal(result.decision, "REVIEW");
});

test("GOOGLE-PLACE-1B zero candidates => NO_MATCH", () => {
  assert.equal(evaluateGooglePlaceCandidates(target, []).decision, "NO_MATCH");
});

test("GOOGLE-PLACE-1B provider is server-side, bounded, explicit FieldMask and no expensive fields", async () => {
  const provider = await read("lib/google-places-provider.ts");
  assert.match(provider, /https:\/\/places\.googleapis\.com\/v1\/places:searchText/);
  assert.match(provider, /GOOGLE_PLACES_API_KEY/);
  assert.match(provider, /X-Goog-Api-Key/);
  assert.match(provider, /X-Goog-FieldMask/);
  assert.match(provider, /places\.id,places\.displayName,places\.formattedAddress,places\.location/);
  assert.doesNotMatch(provider, /ratings|reviews|photos|openingHours|opening hours/i);
  assert.match(provider, /maxResultCount: 5/);
  assert.doesNotMatch(provider, /wildcard|FieldMask.*\*/i);
});

test("GOOGLE-PLACE-1B eligibility is COMPLETE confirmed exact DIRECTORY and fail-closed", async () => {
  const source = await read("lib/google-place-canary.ts");
  assert.match(source, /evaluateDirectoryServiceAddress/);
  assert.match(source, /evaluation\.state !== "COMPLETE"/);
  assert.match(source, /d\.status = 'published'/);
  assert.match(source, /d\.archived_at IS NULL/);
  assert.match(source, /d\.online = 0/);
  assert.match(source, /CONFIRMED_SERVICE_LOCATION/);
  assert.match(source, /g\.geocode_status = 'RESOLVED'/);
  assert.match(source, /g\.public_precision = 'EXACT'/);
  assert.match(source, /g\.source_fingerprint = g\.resolved_source_fingerprint/);
  assert.match(source, /geoSensitiveDirectoryCategory/);
});

test("GOOGLE-PLACE-1B query is canonical and deterministic", async () => {
  const source = await read("lib/google-place-canary.ts");
  assert.match(source, /target\.name, target\.street, target\.houseNumber, target\.postalCode, target\.city, "Slovensko"/);
});

test("GOOGLE-PLACE-1B preview does not write and apply writes only Place identity fields", async () => {
  const source = await read("lib/google-place-canary.ts");
  const previewSection = source.slice(source.indexOf("export async function previewGooglePlaceCanary"), source.indexOf("export async function applyGooglePlaceCanary"));
  assert.doesNotMatch(previewSection, /UPDATE geo_points|INSERT INTO|DELETE FROM/);

  const update = source.match(/UPDATE geo_points[\s\S]*?WHERE target_type = 'DIRECTORY_PROFILE'/)?.[0] ?? "";
  assert.match(update, /SET google_place_id = \?, google_place_source_fingerprint = \?, google_place_matched_at = \?/);
  assert.doesNotMatch(update, /latitude\s*=|longitude\s*=|provider\s*=|resolution_method\s*=|source_fingerprint\s*=/);
});

test("GOOGLE-PLACE-1B apply re-reads/reruns, blocks stale preview, and supports NO_OP", async () => {
  const source = await read("lib/google-place-canary.ts");
  assert.match(source, /includeCurrentGoogle: true/);
  assert.match(source, /target\.sourceFingerprint !== selection\.sourceFingerprint/);
  assert.match(source, /await previewOne\(target, key\)/);
  assert.match(source, /item\.previewFingerprint !== selection\.previewFingerprint/);
  assert.match(source, /noOp: target\.currentGooglePlaceId === item\.candidate\.id/);
  assert.match(source, /prepared\.filter\(\(entry\) => !entry\.noOp\)/);
});

test("GOOGLE-PLACE-1B provider failures happen before any write batch", async () => {
  const source = await read("lib/google-place-canary.ts");
  const apply = source.slice(source.indexOf("export async function applyGooglePlaceCanary"));
  assert.ok(apply.indexOf("await previewOne(target, key)") < apply.indexOf("await databaseHandle.batch"));
});

test("GOOGLE-PLACE-1B admin is operator-first, max 5, MATCH-only and explicit confirmation", async () => {
  const [component, route, page, tools] = await Promise.all([
    read("components/admin-google-places-canary.tsx"),
    read("app/api/admin/google-places/route.ts"),
    read("app/admin/nastroje/google-places/page.tsx"),
    read("app/admin/nastroje/page.tsx"),
  ]);
  assert.match(component, /GOOGLE-PLACE-CANARY/);
  assert.match(component, /item\.decision === "MATCH"/);
  assert.match(component, /Distance:/);
  assert.match(component, /Name match:/);
  assert.match(route, /GOOGLE_PLACE_CANARY_MAX/);
  assert.match(page, /Google Places — Place ID canary/);
  assert.match(tools, /\/admin\/nastroje\/google-places/);
});

test("GOOGLE-PLACE-1B has no migration, Tavily, cron or bulk rollout", async () => {
  const sources = (await Promise.all([
    read("lib/google-place-canary.ts"),
    read("lib/google-places-provider.ts"),
    read("app/api/admin/google-places/route.ts"),
  ])).join("\n");
  assert.doesNotMatch(sources, /TAVILY|tavily/);
  assert.doesNotMatch(sources, /cron|scheduled|process-all|1800/i);
});
