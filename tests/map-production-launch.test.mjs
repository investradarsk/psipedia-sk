import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { defaultNavigationItems } from "../lib/navigation.ts";
import { applyPublicMapLaunchGate } from "../lib/navigation-store.ts";
import { hasGoogleMapsConsent } from "../lib/google-maps-consent.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("map navigation is deny-by-default and appears once after services when enabled", () => {
  const off = applyPublicMapLaunchGate(defaultNavigationItems, false);
  assert.equal(off.some((item) => item.href === "/mapa"), false);
  const on = applyPublicMapLaunchGate(defaultNavigationItems, true);
  const serviceIndex = on.findIndex((item) => item.href === "/adresar");
  assert.equal(on[serviceIndex + 1]?.href, "/mapa");
  assert.equal(on.filter((item) => item.href === "/mapa").length, 1);
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
