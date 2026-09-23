import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/mapa/page.tsx", import.meta.url), "utf8");
const experience = readFileSync(new URL("../components/map/map-experience.tsx", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../components/map/google-map-renderer.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../components/map/map-public.module.css", import.meta.url), "utf8");
const navigation = readFileSync(new URL("../lib/navigation.ts", import.meta.url), "utf8");
const rootLayout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const homePage = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const env = readFileSync(new URL("../config/runtime-env.ts", import.meta.url), "utf8");
const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");

test("canonical /mapa route exists with SSR copy, canonical metadata and no public-nav launch", () => {
  assert.equal(existsSync(new URL("../app/mapa/page.tsx", import.meta.url)), true);
  assert.match(page, /canonical: "\/mapa"/);
  assert.match(page, /<h1>Mapa Psipedie<\/h1>/);
  assert.match(page, /<MapExperience/);
  assert.doesNotMatch(navigation, /href:\s*"\/mapa"/);
});

test("Google is isolated to renderer and map experience consumes only /api/map", () => {
  assert.match(renderer, /maps\.googleapis\.com\/maps\/api\/js/);
  assert.match(renderer, /importLibrary\("maps"\)/);
  assert.match(renderer, /importLibrary\("marker"\)/);
  assert.match(renderer, /AdvancedMarkerElement/);
  assert.match(renderer, /gmpClickable:\s*true/);
  assert.match(renderer, /addEventListener\("gmp-click"/);
  assert.doesNotMatch(renderer + experience, /\b(?:Places|NearbySearch|Geocoder|Geoapify)\b/i);
  assert.match(experience, /buildMapApiUrl/);
  assert.doesNotMatch(experience, /fetch\(["']https?:\/\//);
  assert.doesNotMatch(rootLayout + homePage, /google-map-renderer|maps\.googleapis\.com/i);
});

test("one map instance survives filters and the renderer reconciles markers", () => {
  assert.match(renderer, /if \(!containerRef\.current \|\| mapRef\.current\) return/);
  assert.match(renderer, /__PSIPEDIA_MAP_INIT_COUNT__/);
  assert.match(renderer, /markersRef = useRef\(new Map/);
  assert.match(renderer, /nextKeys = new Set/);
  assert.doesNotMatch(experience, /key=\{.*filters/i);
});

test("client lifecycle is debounce + AbortController based and canonical href stays server-owned", () => {
  assert.match(experience, /MapRequestGate/);
  assert.match(experience, /scheduleMapRequest/);
  assert.match(experience, /signal: request\.signal/);
  assert.match(experience, /item\.href/);
  assert.doesNotMatch(experience, /\/adresar\/\$\{|\/podujatia\/\$\{|\/organizacie\/\$\{/);
});

test("mobile bottom sheet and filter dialog have explicit accessibility and overflow boundaries", () => {
  assert.match(experience, /role="dialog"/);
  assert.match(experience, /aria-modal="true"/);
  assert.match(experience, /event\.key === "Escape"/);
  assert.match(css, /390|100dvh|overflow-x:\s*hidden|data-sheet-state/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("map config is documented without committing a real browser key", () => {
  assert.match(env, /GOOGLE_MAPS_BROWSER_API_KEY/);
  assert.match(env, /GOOGLE_MAPS_MAP_ID/);
  assert.match(example, /GOOGLE_MAPS_BROWSER_API_KEY=\n/);
  assert.match(example, /GOOGLE_MAPS_MAP_ID=\n/);
  assert.doesNotMatch(example, /GOOGLE_MAPS_BROWSER_API_KEY=\S+/);
});

test("route-scoped CSP allows required Google families without a bare wildcard", () => {
  assert.match(worker, /url\.pathname === "\/mapa"/);
  assert.match(worker, /Content-Security-Policy/);
  assert.match(worker, /https:\/\/maps\.googleapis\.com/);
  assert.match(worker, /https:\/\/maps\.gstatic\.com/);
  assert.match(worker, /Permissions-Policy/);
  assert.doesNotMatch(worker, /script-src[^"\n;]*\s\*\s/);
  assert.doesNotMatch(worker, /default-src\s+\*/);
});
