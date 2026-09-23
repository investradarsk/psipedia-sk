import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { defaultNavigationItems } from "../lib/navigation.ts";
import { applyPublicMapLaunchGate } from "../lib/navigation-store.ts";
import { hasGoogleMapsConsent } from "../lib/google-maps-consent.ts";
import { publicMapLaunchEnabled } from "../config/runtime-env.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("map navigation is deny-by-default and appears once after services when enabled", () => {
  const off = applyPublicMapLaunchGate(defaultNavigationItems, false);
  assert.equal(off.some((item) => item.href === "/mapa"), false);
  const on = applyPublicMapLaunchGate(defaultNavigationItems, true);
  const serviceIndex = on.findIndex((item) => item.href === "/adresar");
  assert.equal(on[serviceIndex + 1]?.href, "/mapa");
  assert.equal(on.filter((item) => item.href === "/mapa").length, 1);
});

test("public launch gate requires flag, browser key and Map ID", () => {
  assert.equal(publicMapLaunchEnabled({}), false);
  assert.equal(publicMapLaunchEnabled({ PUBLIC_MAP_ENABLED: "1" }), false);
  assert.equal(publicMapLaunchEnabled({
    PUBLIC_MAP_ENABLED: "1",
    GOOGLE_MAPS_BROWSER_API_KEY: "browser-key",
  }), false);
  assert.equal(publicMapLaunchEnabled({
    PUBLIC_MAP_ENABLED: "1",
    GOOGLE_MAPS_BROWSER_API_KEY: "browser-key",
    GOOGLE_MAPS_MAP_ID: "map-id",
  }), true);
  assert.equal(publicMapLaunchEnabled({
    PUBLIC_MAP_ENABLED: "0",
    GOOGLE_MAPS_BROWSER_API_KEY: "browser-key",
    GOOGLE_MAPS_MAP_ID: "map-id",
  }), false);
});

test("Google Maps consent is explicit and deny-by-default", () => {
  assert.equal(hasGoogleMapsConsent(null), false);
  assert.equal(hasGoogleMapsConsent("denied"), false);
  assert.equal(hasGoogleMapsConsent("granted"), true);
});

test("renderer requires launch flag and consent before Google load", async () => {
  const renderer = await readFile(path.join(root, "components/map/google-map-renderer.tsx"), "utf8");
  const page = await readFile(path.join(root, "app/mapa/page.tsx"), "utf8");
  assert.match(renderer, /!launchEnabled \|\| !consentGranted \|\| configMissing/);
  assert.match(page, /PUBLIC_MAP_ENABLED/);
  assert.match(page, /publicMapEnabled \? process\.env\.GOOGLE_MAPS_BROWSER_API_KEY/);
});

test("readiness audit exposes only a read-only D1 execution path", async () => {
  const script = await readFile(path.join(root, "scripts/map-production-readiness.mjs"), "utf8");
  const workflow = await readFile(path.join(root, ".github/workflows/map-production-readiness.yml"), "utf8");
  assert.match(script, /Only read-only SQL is allowed/);
  assert.match(script, /"d1","execute"/);
  assert.doesNotMatch(script, /"d1","migrations","apply"/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /AUDIT-MAP-psipedia-sk-db/);
});

test("Geoapify-derived records expose both provider and OSM attribution", async () => {
  const query = await readFile(path.join(root, "lib/map-query.ts"), "utf8");
  assert.match(query, /Powered by Geoapify/);
  assert.match(query, /© OpenStreetMap contributors/);
  assert.match(query, /openstreetmap\.org\/copyright/);
});

test("map, cookie, privacy and terms surfaces disclose Google Maps", async () => {
  const sources = await Promise.all([
    readFile(path.join(root, "app/mapa/page.tsx"), "utf8"),
    readFile(path.join(root, "app/cookies/page.tsx"), "utf8"),
    readFile(path.join(root, "app/sukromie/page.tsx"), "utf8"),
    readFile(path.join(root, "app/podmienky-pouzivania/page.tsx"), "utf8"),
  ]);
  for (const source of sources) assert.match(source, /Google Maps/);
});


test("Geoapify credential is server-secret only", async () => {
  const runtimeEnv = await readFile(path.join(root, "config/runtime-env.ts"), "utf8");
  const example = await readFile(path.join(root, ".env.example"), "utf8");
  const geocoder = await readFile(path.join(root, "lib/geoapify-geocoder.ts"), "utf8");
  assert.match(runtimeEnv, /SECRET_ENV_NAMES[\s\S]*"GEOAPIFY_API_KEY"/);
  assert.doesNotMatch(runtimeEnv, /OPTIONAL_ENV_NAMES[\s\S]*"GEOAPIFY_API_KEY"[\s\S]*CI_ONLY_ENV_NAMES/);
  assert.match(example, /GEOAPIFY_API_KEY=\n/);
  assert.doesNotMatch(example, /NEXT_PUBLIC_GEOAPIFY/i);
  assert.doesNotMatch(geocoder, /NEXT_PUBLIC_GEOAPIFY|process\.env\.GEOAPIFY/i);
  assert.match(geocoder, /cloudflare:workers/);
});
