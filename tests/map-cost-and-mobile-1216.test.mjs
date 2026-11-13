import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const detail = source("components/map/public-location-map.tsx");
const renderer = source("components/map/google-map-renderer.tsx");
const experience = source("components/map/map-experience.tsx");
const picker = source("components/admin-google-place-picker.tsx");
const dashboard = source("components/admin-geo-operator-dashboard.tsx");
const bulk = source("lib/google-place-bulk.ts");
const adminGeo = source("components/admin-geo-location.tsx");
const consent = source("components/map/map-consent-state.tsx");

test("detail maps load the Google SDK only after an explicit click, consent and viewport proximity", () => {
  assert.match(detail, /const showRenderer = consentGranted && rendererAvailable && mapActivated/);
  assert.match(detail, /const \[mapActivated, setMapActivated\] = useState\(false\)/);
  assert.match(detail, /alreadyGranted=\{consentGranted\}/);
  assert.match(detail, /setMapActivated\(true\)/);
  assert.match(detail, /const mountRenderer = showRenderer && mapNearViewport/);
  assert.match(detail, /new IntersectionObserver/);
  assert.match(detail, /rootMargin: "240px"/);
  assert.match(detail, /lazy\(async \(\) =>/);
  assert.match(detail, /<Suspense fallback=/);
  assert.match(detail, /Mapa sa načíta pri zobrazení/);
});

test("detail gestures are cooperative while the interactive full map keeps its original greedy default", () => {
  assert.match(renderer, /gestureHandling = "greedy"/);
  assert.match(renderer, /gestureHandling,/);
  assert.match(renderer, /center: initialViewportRef\.current\.center/);
  assert.match(renderer, /zoom: initialViewportRef\.current\.zoom/);
  assert.match(detail, /gestureHandling="cooperative"/);
  assert.match(experience, /<GoogleMapRenderer/);
});

test("paid Places searches cannot be double-submitted before React disables the button", () => {
  assert.match(picker, /const requestInFlight = useRef\(false\)/);
  assert.equal((picker.match(/if \(requestInFlight\.current\) return;/g) ?? []).length, 2);
  assert.equal((picker.match(/requestInFlight\.current = false;/g) ?? []).length, 2);
  assert.match(picker, /action: "discover-google-place"/);
  assert.match(picker, /action: "confirm-google-place"/);
});

test("bulk never reassigns any pre-existing Google Place ID even with stale fingerprints", () => {
  const existing = bulk.indexOf("const googlePlaceId =");
  const skip = bulk.indexOf('if (googlePlaceId) {', existing);
  const discovery = bulk.indexOf("const candidates = await discoverGoogleDirectoryPlaces(source);", existing);
  assert.ok(existing >= 0 && skip > existing && discovery > skip);
  assert.match(bulk.slice(skip, discovery), /Prípadnú zmenu over ručne/);
  assert.match(bulk, /freshPoint\?\.manualOverride/);
});

test("the admin discloses worst-case paid requests without removing the manual bulk controls", () => {
  assert.match(dashboard, /data-google-bulk-cost-notice/);
  assert.match(dashboard, /až 4 platené vyhľadávania Places/);
  assert.match(dashboard, /až 400 volaní/);
  assert.match(dashboard, /action: "select-targets"/);
  assert.match(dashboard, /onClick=\{\(\) => void runBulk\(\)\}/);
});


test("budget guard: stored consent never auto-loads the Google renderer, including on admin profiles", () => {
  assert.match(experience, /const \[mapActivated, setMapActivated\] = useState\(false\)/);
  assert.match(experience, /effectiveRendererEnabled && googleMapsConsent && mapActivated/);
  assert.match(experience, /alreadyGranted=\{googleMapsConsent\}/);
  assert.match(experience, /setMapActivated\(true\)/);
  assert.match(consent, /alreadyGranted \? "Zobraziť Google mapu"/);
  assert.match(adminGeo, /const mapVisible = visibleMapTarget === endpoint/);
  assert.match(adminGeo, /mapVisible \? \(/);
  assert.match(adminGeo, /onClick=\{\(\) => setVisibleMapTarget\(endpoint\)\}/);
});
