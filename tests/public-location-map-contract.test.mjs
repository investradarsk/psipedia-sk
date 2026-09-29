import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("PUBLIC-MAPS-1 reusable detail map reuses renderer, consent and MAP-UX coordinate actions", async () => {
  const [component, renderer, ui, consent] = await Promise.all([
    read("components/map/public-location-map.tsx"),
    read("components/map/google-map-renderer.tsx"),
    read("lib/map-public-ui.ts"),
    read("lib/google-maps-consent.ts"),
  ]);
  assert.match(component, /<GoogleMapRenderer/);
  assert.match(component, /GOOGLE_MAPS_CONSENT_KEY/);
  assert.match(component, /hasGoogleMapsConsent/);
  assert.match(component, /setGoogleMapsConsent/);
  assert.match(component, /Mapa/);
  assert.match(component, /Satelit/);
  assert.match(component, /buildGoogleMapsPlaceUrl\(selected\.latitude, selected\.longitude, selected\.googlePlaceId\)/);
  assert.match(component, /buildGoogleMapsDirectionsUrl\(selected\.latitude, selected\.longitude, selected\.googlePlaceId\)/);
  assert.match(component, /!isApproximateMapItem\(selected\)/);
  assert.match(component, /Približná poloha/);
  assert.match(component, />Navigovať</);
  assert.doesNotMatch(component, /fetch\(|\/api\/map|Geoapify|Places|Geocoder/i);
  assert.match(renderer, /let googleLoaderPromise/);
  assert.match(renderer, /script\[data-psipedia-google-maps\]/);
  assert.match(renderer, /if \(!containerRef\.current \|\| mapRef\.current\) return/);
  assert.match(renderer, /mapRef\.current\.setMapTypeId\(mapType\)/);
  assert.match(renderer, /fitBounds/);
  assert.match(renderer, /ariaLabel/);
  assert.match(ui, /detailMapCommandForItems/);
  assert.match(ui, /type: "fit"/);
  assert.match(consent, /psipedia-google-maps-consent/);
});

test("MAP-UX-1E map type switching separates presentation idle from user intent", async () => {
  const renderer = await read("components/map/google-map-renderer.tsx");
  assert.match(renderer, /mapPresentationBaselineFromMap\(mapRef\.current\)/);
  assert.match(renderer, /beginMapTypeIdleSuppression\(mapTypeIdleSuppressionRef\.current, mapType, baseline\)/);
  assert.match(renderer, /mapRef\.current\.setMapTypeId\(mapType\)/);
  assert.match(renderer, /map\.addListener\("maptypeid_changed"/);
  assert.match(renderer, /const runtimeMapType = map\.getMapTypeId\?\.\(\) \?\? null/);
  assert.match(renderer, /confirmMapTypeChange\(mapTypeIdleSuppressionRef\.current, runtimeMapType\)/);
  assert.match(renderer, /map\.addListener\("dragstart"/);
  assert.doesNotMatch(renderer, /map\.addListener\("zoom_changed"/);
  assert.match(renderer, /onPointerDownCapture=\{\(\) => \{/);
  assert.match(renderer, /traceMapDebug\("renderer:user-pointer"/);
  assert.match(renderer, /onWheelCapture=\{\(\) => \{/);
  assert.match(renderer, /traceMapDebug\("renderer:user-wheel"/);
  assert.match(renderer, /onKeyDownCapture=\{\(\) => \{/);
  assert.match(renderer, /traceMapDebug\("renderer:user-key"/);
  assert.match(renderer, /cancelMapTypeIdleSuppression\(mapTypeIdleSuppressionRef\.current\)/);
  assert.match(renderer, /map\.getMapTypeId\?\.\(\)/);
  assert.match(renderer, /onViewportChangeRef\.current\(next\)/);
  assert.doesNotMatch(renderer, /sameViewport|mapTypeSwitchViewportRef/);
  assert.doesNotMatch(renderer, /bbox[^\n]*epsilon|setTimeout\([^)]*setMapTypeId|debounce/i);
});

test("PUBLIC-MAPS-1 detail map is consent-gated and no Google script is injected by the reusable component", async () => {
  const [component, renderer] = await Promise.all([
    read("components/map/public-location-map.tsx"),
    read("components/map/google-map-renderer.tsx"),
  ]);
  assert.match(component, /const waitingForConsent = rendererAvailable && !consentGranted/);
  assert.match(component, /Google Maps čaká na tvoje povolenie/);
  assert.match(component, /Interaktívna mapa momentálne nie je dostupná/);
  assert.match(component, /\{waitingForConsent \? \(/);
  assert.match(component, /Povoliť Google Maps/);
  assert.doesNotMatch(component, /document\.createElement\(["']script["']\)/);
  assert.match(renderer, /!rendererEnabled \|\| !consentGranted \|\| configMissing/);
  assert.match(renderer, /document\.createElement\("script"\)/);
});

test("PUBLIC-MAPS-1 canonical detail routes use scoped server GEO reads and degrade on read failure", async () => {
  const [directory, organization, portal, query] = await Promise.all([
    read("app/adresar/[category]/[slug]/page.tsx"),
    read("app/organizacie/[slug]/page.tsx"),
    read("app/[section]/[slug]/page.tsx"),
    read("lib/map-query.ts"),
  ]);
  for (const route of [directory, organization, portal]) {
    assert.match(route, /getPublicMapItemsForEntity/);
    assert.match(route, /\.catch\(\(error\) =>/);
    assert.match(route, /return \{ items: \[\] \}/);
    assert.doesNotMatch(route, /fetch\([^)]*\/api\/map/);
  }
  assert.match(directory, /entityType: "DIRECTORY_PROFILE"/);
  assert.match(organization, /entityType: "ORGANIZATION"/);
  assert.match(portal, /entityType: "MANAGED_EVENT"/);
  assert.match(query, /d\.id = \?/);
  assert.match(query, /o\.id = \?/);
  assert.match(query, /e\.id = \?/);
  assert.match(query, /GEO_PUBLIC_WHERE/);
  assert.match(query, /isPublicMapCandidate\(candidate, today\)/);
  assert.match(query, /mapCandidateToItem/);
});

test("PUBLIC-MAPS-1 directory map suppresses legacy text navigation only when approved GEO exists", async () => {
  const detail = await read("components/directory-profile-detail.tsx");
  assert.match(detail, /const hasEmbeddedMap = Boolean\(publicMap\?\.items\.length\)/);
  assert.match(detail, /!hasEmbeddedMap && presentation\.navigationUrl/);
  assert.match(detail, /title="Kde nás nájdete"/);
});

test("PUBLIC-MAPS-1 organization supports multi-location exact/approximate semantics", async () => {
  const [component, query] = await Promise.all([
    read("components/map/public-location-map.tsx"),
    read("lib/map-query.ts"),
  ]);
  assert.match(component, /items\.length > 1/);
  assert.match(component, /Verejné lokality organizácie/);
  assert.match(component, /SERVICE_AREA/);
  assert.match(component, /aria-pressed=\{selected\?\.id === item\.id\}/);
  assert.match(query, /l\.role AS location_role/);
  assert.match(query, /publicDisplayLocation/);
});

test("PUBLIC-MAPS-1 event map is optional and never geocodes venue/address text", async () => {
  const [eventDetail, route, query] = await Promise.all([
    read("components/event-detail.tsx"),
    read("app/[section]/[slug]/page.tsx"),
    read("lib/map-query.ts"),
  ]);
  assert.match(eventDetail, /title="Miesto podujatia"/);
  assert.match(eventDetail, /publicMap\?\.items\.length/);
  assert.match(query, /e\.cancelled = 0/);
  assert.match(query, /e\.region <> 'Online'/);
  assert.doesNotMatch(eventDetail + route, /Geocoder|Geoapify|Places/i);
});

test("PUBLIC-MAPS-1 CSP is narrowly route-scoped to map-capable public detail families", async () => {
  const worker = await read("worker/index.ts");
  assert.match(worker, /isGoogleMapsPublicRoute/);
  assert.match(worker, /pathname === "\/mapa"/);
  assert.match(worker, /\^\\\/adresar\\\/\[\^\/\]\+\\\/\[\^\/\]\+/);
  assert.match(worker, /\^\\\/organizacie\\\/\[\^\/\]\+/);
  assert.match(worker, /\^\\\/podujatia\\\/\[\^\/\]\+/);
  assert.match(worker, /Content-Security-Policy/);
  assert.doesNotMatch(worker, /default-src\s+\*/);
  assert.doesNotMatch(worker, /script-src[^"\n;]*\s\*\s/);
});

test("PUBLIC-MAPS-1 stays read/presentation-only with no schema or provider write path", async () => {
  const [query, component, runtime, directory, organization, portal] = await Promise.all([
    read("lib/map-query.ts"),
    read("components/map/public-location-map.tsx"),
    read("lib/public-map-runtime.ts"),
    read("app/adresar/[category]/[slug]/page.tsx"),
    read("app/organizacie/[slug]/page.tsx"),
    read("app/[section]/[slug]/page.tsx"),
  ]);
  const sources = query + component + runtime + directory + organization + portal;
  assert.doesNotMatch(sources, /INSERT INTO geo_points|UPDATE geo_points|DELETE FROM geo_points/i);
  assert.doesNotMatch(component + directory + organization + portal, /geoapify\.com\/v|GEOAPIFY_API_KEY|geocode/i);
  assert.doesNotMatch(component, /\/api\/map/);
});
