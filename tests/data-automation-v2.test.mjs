import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fetchAutomationSourceRecords } from "../lib/data-automation-connectors.ts";
import {
  rssDiscoveryAdapter,
  sitemapDiscoveryAdapter,
  structuredDirectoryDiscovery,
} from "../lib/data-automation-discovery.ts";
import {
  skjExhibitionCalendarAdapter,
  svpsSheltersRegisterAdapter,
} from "../lib/data-automation-real-sources.ts";
import { parseAutomationSourceAdminInput } from "../lib/data-automation-source-admin.ts";
import { isSafeAutomationSourceUrl } from "../lib/data-automation.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const fixture = (name) => readFileSync(new URL("./fixtures/data-automation/" + name, import.meta.url), "utf8");

function source(overrides = {}) {
  return {
    id: 1,
    sourceKey: "fixture-source",
    label: "Fixture",
    entityType: "EVENT",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://example.com/feed",
    config: { htmlAdapterKey: "fixture" },
    enabled: true,
    cadenceMinutes: 360,
    throttleMs: 0,
    timeoutMs: 5000,
    retryMaxAttempts: 0,
    retryBackoffMs: 100,
    maxRecordsPerRun: 100,
    nextCheckAt: null,
    ...overrides,
  };
}

test("source input accepts bounded public HTTPS and rejects invalid/private/internal URLs", () => {
  const valid = parseAutomationSourceAdminInput({
    sourceKey: "skj-events",
    label: "SKJ events",
    entityType: "EVENT",
    connectorType: "CONTROLLED_HTML",
    sourceUrl: "https://skj.sk/sk/vystavy/kalendar/",
    cadenceMinutes: 360,
    throttleMs: 1000,
    timeoutMs: 8000,
    retryMaxAttempts: 2,
    retryBackoffMs: 1000,
    maxRecordsPerRun: 100,
    config: '{"htmlAdapterKey":"skj-exhibition-calendar"}',
  });
  assert.equal(valid.error, undefined);
  for (const url of [
    "http://example.com/feed",
    "https://127.0.0.1/feed",
    "https://10.0.0.1/feed",
    "https://192.168.1.2/feed",
    "https://localhost/feed",
    "https://service.internal/feed",
    "https://metadata.google.internal/computeMetadata/v1/",
  ]) {
    assert.equal(isSafeAutomationSourceUrl(url), false, url);
    const bad = parseAutomationSourceAdminInput({
      ...valid.value,
      sourceKey: "blocked-source",
      sourceUrl: url,
      config: {},
    });
    assert.ok(bad.error, url);
  }
});

test("SKJ controlled HTML fixture normalizes event records without browser automation", async () => {
  const rows = await skjExhibitionCalendarAdapter({
    html: fixture("skj-calendar.html"),
    source: source({
      sourceKey: "skj-exhibition-calendar",
      sourceUrl: "https://skj.sk/sk/vystavy/kalendar/",
      config: { htmlAdapterKey: "skj-exhibition-calendar" },
    }),
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].proposed.city, "Nitra");
  assert.equal(rows[0].proposed.startDate, "2026-09-26");
  assert.equal(rows[0].proposed.endDate, "2026-09-27");
  assert.match(String(rows[0].sourceUrl), /^https:\/\/skj\.sk\//);
});

test("SVPS controlled HTML fixture normalizes shelters and quarantine stations", async () => {
  const rows = await svpsSheltersRegisterAdapter({
    html: fixture("svps-shelters.html"),
    source: source({
      entityType: "ORGANIZATION",
      sourceKey: "svps-shelters-register",
      sourceUrl: "https://zoznamy.svps.sk/?Sekcia=46",
      config: { htmlAdapterKey: "svps-shelters-register" },
    }),
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].sourceRecordId, "SK U 001");
  assert.equal(rows[0].proposed.name, "Útulok Psia pomoc");
  assert.equal(rows[0].proposed.importKey, "svps:sk-u-001");
});

test("real controlled connector fixture respects max records and blocks redirects", async () => {
  let requestInit;
  const rows = await fetchAutomationSourceRecords(source({ maxRecordsPerRun: 1 }), {
    fetchImpl: async (_url, init) => {
      requestInit = init;
      return new Response(fixture("skj-calendar.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
    htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
  });
  assert.equal(rows.length, 1);
  assert.equal(requestInit.redirect, "error");
  assert.ok(requestInit.signal);
});

test("discovery emits deduplicated SOURCE_CANDIDATE records only", () => {
  const sitemap = sitemapDiscoveryAdapter({
    payload: "<urlset><url><loc>https://example.com/events</loc></url><url><loc>https://example.com/events</loc></url></urlset>",
    baseUrl: "https://example.com/sitemap.xml",
    entityType: "EVENT",
  });
  assert.equal(sitemap.length, 1);
  assert.equal(sitemap[0].candidateType, "SOURCE_CANDIDATE");

  const rss = rssDiscoveryAdapter({
    payload: "<rss><channel><item><link>https://example.com/shelter</link></item></channel></rss>",
    baseUrl: "https://example.com/feed.xml",
    entityType: "ORGANIZATION",
  });
  assert.equal(rss[0].candidateType, "SOURCE_CANDIDATE");

  const structured = structuredDirectoryDiscovery({
    payload: { items: [{ name: "A", url: "https://example.com/a" }] },
    recordsPath: "items",
    baseUrl: "https://example.com/api",
    entityType: "DIRECTORY",
  });
  assert.equal(structured[0].candidateType, "SOURCE_CANDIDATE");
});

test("discovery foundation has no Google/Bing scraper, browser automation, or TinyFish dependency", () => {
  const discovery = read("lib/data-automation-discovery.ts");
  assert.match(discovery, /AutomationSearchProvider/);
  assert.match(discovery, /automation_search_provider_not_configured/);
  assert.doesNotMatch(discovery, /tinyfish|google\.com\/search|bing\.com\/search|playwright|puppeteer/i);
});

test("test-source preview is structurally read-only and reports zero writes", () => {
  const preview = read("lib/data-automation-preview.ts");
  assert.doesNotMatch(preview, /recordAutomationObservation|upsertAutomationFinding|beginAutomationRun|finishAutomationRun/);
  assert.match(preview, /observations:\s*0,\s*findings:\s*0,\s*canonical:\s*0,\s*publications:\s*0/);
  assert.match(preview, /possibleMatches/);
  assert.match(preview, /newCandidates/);
  assert.match(preview, /possibleUpdates/);
});

test("source persistence enforces review gate and invalidates approval after safety-critical edits", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /sourceSafetySignature/);
  assert.match(store, /enabled=CASE WHEN \? THEN 0 ELSE enabled END/);
  assert.match(store, /review_status=CASE WHEN \? THEN 'PENDING' ELSE review_status END/);
  assert.match(store, /existing\.reviewStatus !== "APPROVED"/);
  assert.match(store, /automation_source_review_required/);
});

test("run now reuses production runner and blocks disabled sources", () => {
  const runner = read("lib/data-automation-runner.ts");
  const route = read("app/api/admin/automation-sources/[id]/run/route.ts");
  assert.match(runner, /runAutomationSourceNow/);
  assert.match(runner, /automation_source_disabled/);
  assert.match(runner, /return runSource\(source, options\)/);
  assert.match(route, /productionAutomationHtmlAdapters/);
  assert.match(route, /canonicalWrite:\s*false,\s*publication:\s*false/);
});

test("scheduler still respects enabled state and next-check cadence", () => {
  const store = read("lib/data-automation-store.ts");
  assert.match(store, /WHERE enabled = 1 AND \(next_check_at IS NULL OR next_check_at <= \?\)/);
  assert.match(store, /nextAutomationCheckAt/);
});

test("source failures remain visible in source observability", () => {
  const detail = read("components/admin-automation-source-detail.tsx");
  const store = read("lib/data-automation-source-store.ts");
  assert.match(detail, /Health error/);
  assert.match(detail, /lastErrorCode/);
  assert.match(store, /last_error_code/);
  assert.match(store, /error_count/);
});

test("candidate persistence dedupes canonical URL and approval creates only disabled pending source", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /ON CONFLICT\(canonical_url\) DO UPDATE/);
  assert.match(store, /candidateType:\s*"SOURCE_CANDIDATE"/);
  assert.match(store, /review_status/);
  assert.match(store, /'PENDING'/);
  assert.doesNotMatch(store, /INSERT INTO (managed_events|help_organizations|directory_profiles|adoption_dogs|lost_found_dog_reports|help_cases)/i);
});

test("all source mutations reuse admin auth, same-origin and JSON gate", () => {
  const helper = read("lib/admin-automation-api.ts");
  assert.match(helper, /getAdminApiUser\(\)/);
  assert.match(helper, /request\.headers\.get\("origin"\)/);
  assert.match(helper, /origin !== new URL\(request\.url\)\.origin/);
  assert.match(helper, /application\/json/);
  for (const path of [
    "app/api/admin/automation-sources/route.ts",
    "app/api/admin/automation-sources/[id]/route.ts",
    "app/api/admin/automation-sources/[id]/test/route.ts",
    "app/api/admin/automation-sources/[id]/run/route.ts",
    "app/api/admin/automation-source-candidates/[id]/route.ts",
  ]) {
    assert.match(read(path), /requireAutomationAdminMutation/);
  }
});

test("migration seeds only explicitly reviewed sources and never canonical records", () => {
  const migration = read("drizzle/0052_data_automation_sources_discovery.sql");
  assert.match(migration, /automation_source_candidates/);
  assert.match(migration, /skj-exhibition-calendar/);
  assert.match(migration, /svps-shelters-register/);
  assert.match(migration, /'APPROVED'/);
  assert.doesNotMatch(migration, /INSERT INTO (managed_events|help_organizations|directory_profiles|adoption_dogs|lost_found_dog_reports|help_cases)/i);
});

test("source management UI exposes required controls and NO AUTO-PUBLISH contract", () => {
  const manager = read("components/admin-automation-source-manager.tsx");
  const detail = read("components/admin-automation-source-detail.tsx");
  for (const phrase of [
    "Entity type", "Connector", "Source URL", "Cadence (min)", "Timeout (ms)",
    "Throttle (ms)", "Max records/run", "Mapping / config JSON",
  ]) assert.ok((manager + detail).includes(phrase), phrase);
  assert.match(detail, /Otestovať zdroj/);
  assert.match(detail, /Spustiť kontrolu teraz/);
  assert.match(detail, /NO AUTO-PUBLISH/);
  assert.match(manager, /SOURCE_CANDIDATE/);
});
