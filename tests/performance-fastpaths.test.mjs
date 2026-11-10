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

test("breed redirects deduplicate D1 lookups with a short bounded isolate cache", () => {
  assert.match(worker, /BREED_REDIRECT_CACHE_TTL_MS = 15_000/);
  assert.match(worker, /BREED_REDIRECT_CACHE_MAX_ENTRIES = 400/);
  assert.match(worker, /cachedCanonicalBreedRedirect\(env\.DB,breedMatch\[1\]\)/);
  assert.match(worker, /breedRedirectCache\.delete\(slug\)/);
  assert.match(worker, /canonicalBreedRedirect\(database, slug\)/);
});

const fs = readFileSync;
const uiSources = {
  footer: fs(new URL("../components/site-footer.tsx", import.meta.url), "utf8"),
  articles: fs(new URL("../components/public-visual-system/public-article-card.tsx", import.meta.url), "utf8"),
  home: fs(new URL("../components/home-editorial.tsx", import.meta.url), "utf8"),
  categories: fs(new URL("../components/admin-directory-module-nav.tsx", import.meta.url), "utf8"),
  dashboard: fs(new URL("../components/admin-workspace-dashboard.tsx", import.meta.url), "utf8"),
  events: fs(new URL("../components/admin-event-dashboard.tsx", import.meta.url), "utf8"),
  help: fs(new URL("../components/admin-help-dashboard.tsx", import.meta.url), "utf8"),
  breeds: fs(new URL("../components/admin-breed-dashboard.tsx", import.meta.url), "utf8"),
};

test("long public lists and admin tables do not trigger speculative RSC prefetches", () => {
  for (const [name, source] of Object.entries(uiSources)) {
    const links = [...source.matchAll(/<Link\b[^>]*>/gs)].map((match) => match[0]);
    assert.ok(links.length > 0, name + ": expected navigational links");
    for (const link of links) {
      assert.match(link, /\bprefetch=\{false\}/, name + ": no automatic prefetch for large link collections");
    }
  }
});
