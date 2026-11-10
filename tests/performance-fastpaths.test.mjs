import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Guard performance fast paths that must remain safe across future refactors.
const worker = readFileSync(new URL("../worker/index.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../components/site-header.tsx", import.meta.url), "utf8");
const nameDays = readFileSync(new URL("../lib/dog-name-day-store.ts", import.meta.url), "utf8");
const publicPartnerSession = readFileSync(new URL("../lib/public-partner-session.ts", import.meta.url), "utf8");
const directoryProfile = readFileSync(new URL("../app/adresar/[category]/[slug]/page.tsx", import.meta.url), "utf8");

test("admin access still verifies every JWT, but reuses JWK fetches and imported keys", () => {
  assert.match(worker, /const accessJwksLoads = new Map/);
  assert.match(worker, /const importedAccessKeys = new WeakMap/);
  assert.match(worker, /crypto\.subtle\.verify\("RSASSA-PKCS1-v1_5"/);
  assert.match(worker, /getImportedAccessKey\(jwk\)/);
  assert.match(worker, /accessJwksLoads\.delete\(cacheKey\)/);
  assert.match(worker, /importedAccessKeys\.delete\(jwk\)/);
  assert.match(worker, /ACCESS_JWKS_TTL_MS = 5 \* 60 \* 1000/);
});

test("public layout overlaps navigation and optional partner authentication", () => {
  assert.match(layout, /const navigationPromise = getNavigationItems\(\)/);
  assert.match(layout, /Promise\.all\(\[\s*navigationPromise,/);
  assert.match(layout, /partnerToken \? getPublicPartnerSession/);
});

test("name-day public lookup transfers only fields required for today's strip", () => {
  const start = nameDays.indexOf("export async function getPublishedDogNameDaysForDate");
  const end = nameDays.indexOf("export async function listDogNameDayRecords", start);
  const source = nameDays.slice(start, end);
  assert.match(source, /SELECT month, day, name, status/);
  assert.doesNotMatch(source, /SELECT id, month, day/);
  assert.match(source, /resolveDogNameDay\(date, result\.results\)/);
});

test("public header throttles today's name-day fetch, pauses hidden tabs, and handles date change", () => {
  assert.match(header, /lastDateKey === dateKey && now - lastSuccessfulFetch < 5 \* 60_000/);
  assert.match(header, /document\.visibilityState === "hidden"/);
  assert.match(header, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.match(header, /timeZone: "Europe\/Bratislava"/);
});

test("partner session is memoized for one React request, and directory detail overlaps D1 reads", () => {
  assert.match(publicPartnerSession, /cache\(async \(token: string\)/);
  assert.match(publicPartnerSession, /getPartnerSession\(\{ token \}\)/);
  assert.match(layout, /getPublicPartnerSession\(partnerToken\)/);
  assert.match(directoryProfile, /getPublicPartnerSession\(token\)/);
  assert.match(directoryProfile, /partnerIdentityPromise\.then/);
  assert.match(directoryProfile, /await Promise\.all\(\[/);
});
