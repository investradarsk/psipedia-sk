import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { AutomationConnectorError, fetchAutomationSourceRecords } from "../lib/data-automation-connectors.ts";
import {
  rssDiscoveryAdapter,
  sitemapDiscoveryAdapter,
  structuredDirectoryDiscovery,
} from "../lib/data-automation-discovery.ts";
import {
  agilitySkEventsAdapter,
  parseZskSrCalendarTable,
  skjExhibitionCalendarAdapter,
  svpsSheltersRegisterAdapter,
  zskSrEventsAdapter,
} from "../lib/data-automation-real-sources.ts";
import { parseAutomationSourceAdminInput } from "../lib/data-automation-source-admin.ts";
import { isSafeAutomationSourceUrl } from "../lib/data-automation.ts";
import { selectEventClusterCandidate } from "../lib/data-automation-clustering.ts";

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

test("agility.sk controlled HTML fixture normalizes upcoming agility events", async () => {
  const rows = await agilitySkEventsAdapter({
    html: fixture("agility-sk-events.html"),
    source: source({
      sourceKey: "agility-sk-preteky",
      sourceUrl: "https://agility.sk/preteky",
      config: { htmlAdapterKey: "agility-sk-events", expectedMinRecords: 1 },
    }),
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].proposed.title, "AWC Fan 2026");
  assert.equal(rows[0].proposed.startDate, "2026-09-26");
  assert.equal(rows[0].proposed.endDate, "2026-09-27");
  assert.equal(rows[0].proposed.venue, "Kynologická hala RSDC");
  assert.equal(rows[0].proposed.city, "Pezinok");
  assert.equal(rows[0].proposed.organizer, "KYNOLOGICKÁ HALA RSDC, O.Z.");
  assert.match(String(rows[0].proposed.practicalInfo), /Povrch: umelá tráva/);
  assert.equal(rows[1].proposed.venue, "Cvičisko AK Kamzík");
  assert.equal(rows[1].proposed.city, undefined);
  assert.equal(rows[1].proposed.websiteUrl, "https://agilityportal.sk/sk/preteky/popradske-skusky-102026");
});


test("ZSK table parser keeps only evidenced fields and preserves status changes", () => {
  const rows = parseZskSrCalendarTable({
    html: fixture("zsk-sr-table-national.html"),
    sourceUrl: "https://suchno.sk/app_test/zsk_akcie.php?form=1&typ=2",
    category: "Národné akcie",
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].proposed.title, "O pohár KK Bodona Piešťany");
  assert.equal(rows[0].proposed.startDate, "2026-10-18");
  assert.equal(rows[0].proposed.endDate, undefined);
  assert.equal(rows[0].proposed.city, "Piešťany");
  assert.equal(rows[0].proposed.venue, "Piešťany");
  assert.equal(rows[0].proposed.eventType, "Preteky");
  assert.equal(rows[0].proposed.websiteUrl, "https://example.sk/propozicie/pohar-bodona");
  assert.equal(rows[0].proposed.registrationUrl, "https://example.sk/prihlaska/pohar-bodona");
  assert.equal(rows[0].proposed.organizer, undefined);
  assert.equal(rows[0].proposed.region, undefined);
  assert.equal(rows[0].proposed.district, undefined);

  assert.equal(rows[1].proposed.startDate, "2026-10-09");
  assert.equal(rows[1].proposed.endDate, "2026-10-11");

  assert.equal(rows[2].proposed.cancelled, true);
  assert.equal(rows[2].proposed.status, "CANCELLED");
  assert.equal(rows[2].proposed.city, undefined);
  assert.equal(rows[2].proposed.venue, "CANIS arena, Most pri Bratislave");
});

test("ZSK parser recognizes obedience, date changes, postponement and Slovak diacritics", () => {
  const rows = parseZskSrCalendarTable({
    html: fixture("zsk-sr-table-obedience.html"),
    sourceUrl: "https://suchno.sk/app_test/zsk_skusky.php?form=2&typ=3",
    category: "Skúšky obedience a Rally obedience",
  });
  assert.equal(rows.length, 3);
  assert.equal(rows[0].proposed.eventType, "Iné");
  assert.equal(rows[0].proposed.city, "Nitra");
  assert.match(String(rows[0].proposed.practicalInfo), /Ľubica Kováčová/);
  assert.equal(rows[1].proposed.status, "DATE_CHANGED");
  assert.equal(rows[2].proposed.status, "POSTPONED");
  assert.equal(rows[2].proposed.endDate, undefined);
});

test("ZSK adapter follows only the current iframe per supported category and dedupes one logical event", async () => {
  const calls = [];
  const fetchHtml = async (url) => {
    calls.push(url);
    if (url.includes("/kalendar/narodne-akcie")) {
      return { html: fixture("zsk-sr-category-national.html"), finalUrl: url };
    }
    if (url.includes("/kalendar/skusky-obedience-a-rally-obedience")) {
      return { html: fixture("zsk-sr-category-obedience.html"), finalUrl: url };
    }
    if (url.includes("/kalendar/sportove-kynologicke-akcie")) {
      return { html: fixture("zsk-sr-category-sport.html"), finalUrl: url };
    }
    if (url.includes("zsk_akcie.php")) {
      return { html: fixture("zsk-sr-table-national.html"), finalUrl: url };
    }
    if (url.includes("zsk_skusky.php")) {
      return { html: fixture("zsk-sr-table-obedience.html"), finalUrl: url };
    }
    if (url.includes("zsk_sport.php")) {
      return { html: fixture("zsk-sr-table-sport.html"), finalUrl: url };
    }
    throw new Error("unexpected ZSK fixture URL " + url);
  };
  const rows = await zskSrEventsAdapter({
    html: fixture("zsk-sr-calendar-root.html"),
    source: source({
      sourceKey: "zsk-sr-events",
      sourceUrl: "https://zsksr.sk/kalendar/",
      config: { htmlAdapterKey: "zsk-sr-events", expectedMinRecords: 1 },
    }),
    fetchHtml,
  });
  assert.equal(rows.length, 7);
  assert.equal(calls.length, 6);
  assert.equal(calls.some((url) => url.includes("1735686000")), false);
  assert.equal(rows.filter((row) => String(row.proposed.title).includes("O pohár KK Bodona")).length, 1);
  assert.ok(rows.every((row) => row.sourceRecordId.length <= 240));
});

test("ZSK connector nested HTML fetches reuse safe transport and remain bounded", async () => {
  const requests = [];
  const responseFor = (url) => {
    if (url === "https://zsksr.sk/kalendar") return fixture("zsk-sr-calendar-root.html");
    if (url.includes("/kalendar/narodne-akcie")) return fixture("zsk-sr-category-national.html");
    if (url.includes("/kalendar/skusky-obedience-a-rally-obedience")) return fixture("zsk-sr-category-obedience.html");
    if (url.includes("/kalendar/sportove-kynologicke-akcie")) return fixture("zsk-sr-category-sport.html");
    if (url.includes("zsk_akcie.php")) return fixture("zsk-sr-table-national.html");
    if (url.includes("zsk_skusky.php")) return fixture("zsk-sr-table-obedience.html");
    if (url.includes("zsk_sport.php")) return fixture("zsk-sr-table-sport.html");
    throw new Error("unexpected ZSK connector URL " + url);
  };
  const rows = await fetchAutomationSourceRecords(source({
    sourceKey: "zsk-sr-events",
    sourceUrl: "https://zsksr.sk/kalendar/",
    config: { htmlAdapterKey: "zsk-sr-events", expectedMinRecords: 1 },
    maxRecordsPerRun: 2,
  }), {
    fetchImpl: async (url) => {
      requests.push(String(url));
      return new Response(responseFor(String(url)), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
    htmlAdapters: { "zsk-sr-events": zskSrEventsAdapter },
  });
  assert.equal(rows.length, 2);
  assert.equal(requests.length, 7);
  assert.ok(requests.every((url) => url.startsWith("https://")));
});


test("ZSK observations reuse the existing EVENT clustering contract", () => {
  const [row] = parseZskSrCalendarTable({
    html: fixture("zsk-sr-table-national.html"),
    sourceUrl: "https://suchno.sk/app_test/zsk_akcie.php?form=1&typ=2",
    category: "Národné akcie",
  });
  const decision = selectEventClusterCandidate(row, [{
    id: 44,
    canonicalEntityId: 901,
    canonicalEntityKey: "event:901",
    fields: {
      title: "O pohár KK Bodona Piešťany",
      startDate: "2026-10-18",
      city: "Piešťany",
    },
  }]);
  assert.equal(decision.quality, "STRONG");
  assert.equal(decision.candidateId, 44);
  assert.equal(row.proposed.externalId, undefined);
});

test("ZSK source provisioning stays disabled, pending and authoritative only as evidence", () => {
  const migration = read("drizzle/0074_automation_zsk_event_source.sql");
  assert.match(migration, /'zsk-sr-events'/);
  assert.match(migration, /'https:\/\/zsksr\.sk\/kalendar\/'/);
  assert.match(migration, /'EVENT'/);
  assert.match(migration, /'CONTROLLED_HTML'/);
  assert.match(migration, /0,360,1500,10000,2,1500,200/);
  assert.match(migration, /'PENDING'/);
  assert.match(migration, /'OFFICIAL_CLUB_CALENDAR',90/);
  assert.doesNotMatch(migration, /INSERT INTO (managed_events|help_organizations|directory_profiles|adoption_dogs|lost_found_dog_reports|help_cases)/i);
  const adapters = read("lib/data-automation-real-sources.ts");
  assert.match(adapters, /"zsk-sr-events": zskSrEventsAdapter/);
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

test("real controlled connector fixture respects max records and uses inspected manual redirects", async () => {
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
  assert.equal(requestInit.redirect, "manual");
  assert.ok(requestInit.signal);
});

test("controlled connector safely follows public HTTPS redirects and reports the final URL", async () => {
  const requests = [];
  const responses = [];
  const rows = await fetchAutomationSourceRecords(source({ maxRecordsPerRun: 1 }), {
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (requests.length === 1) {
        return new Response("", {
          status: 302,
          headers: { location: "https://example.com/final" },
        });
      }
      return new Response(fixture("skj-calendar.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
    htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
    onResponse: (meta) => responses.push(meta),
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(requests, ["https://example.com/feed", "https://example.com/final"]);
  assert.equal(responses.at(-1).finalUrl, "https://example.com/final");
  assert.equal(responses.at(-1).redirectCount, 1);
});

test("redirect loop detection allows legitimate non-www to www redirects", async () => {
  const requests = [];
  const rows = await fetchAutomationSourceRecords(source({
    sourceUrl: "https://example.com/feed",
    maxRecordsPerRun: 1,
  }), {
    fetchImpl: async (url) => {
      requests.push(String(url));
      if (requests.length === 1) {
        return new Response("", {
          status: 301,
          headers: { location: "https://www.example.com/feed" },
        });
      }
      return new Response(fixture("skj-calendar.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
    htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(requests, ["https://example.com/feed", "https://www.example.com/feed"]);
});

test("redirect loop detection still blocks a real www/non-www cycle", async () => {
  const requests = [];
  await assert.rejects(
    fetchAutomationSourceRecords(source({
      sourceUrl: "https://example.com/feed",
      retryMaxAttempts: 0,
    }), {
      fetchImpl: async (url) => {
        requests.push(String(url));
        return new Response("", {
          status: 301,
          headers: {
            location: String(url).includes("www.")
              ? "https://example.com/feed"
              : "https://www.example.com/feed",
          },
        });
      },
      htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_redirect_loop",
  );
  assert.equal(requests.length, 2);
});

test("redirect targets are revalidated against SSRF policy", async () => {
  await assert.rejects(
    fetchAutomationSourceRecords(source(), {
      fetchImpl: async () => new Response("", {
        status: 302,
        headers: { location: "https://127.0.0.1/private" },
      }),
      htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_redirect_blocked",
  );
});

test("fetch failures expose safe timeout/network taxonomy without raw stack details", async () => {
  await assert.rejects(
    fetchAutomationSourceRecords(source({ retryMaxAttempts: 0 }), {
      fetchImpl: async () => {
        const error = new Error("The operation timed out");
        error.name = "TimeoutError";
        throw error;
      },
      htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_timeout",
  );
  await assert.rejects(
    fetchAutomationSourceRecords(source({ retryMaxAttempts: 0 }), {
      fetchImpl: async () => { throw new Error("getaddrinfo ENOTFOUND example.com"); },
      htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_dns_failed",
  );
});

test("HTTP errors preserve status taxonomy and retry only retry-safe statuses", async () => {
  let calls = 0;
  await assert.rejects(
    fetchAutomationSourceRecords(source({ retryMaxAttempts: 2 }), {
      fetchImpl: async () => {
        calls += 1;
        return new Response("forbidden", { status: 403 });
      },
      sleep: async () => {},
      htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_http_403",
  );
  assert.equal(calls, 1);

  calls = 0;
  const rows = await fetchAutomationSourceRecords(source({ retryMaxAttempts: 1, maxRecordsPerRun: 1 }), {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response("slow down", { status: 429 });
      return new Response(fixture("skj-calendar.html"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    },
    sleep: async () => {},
    htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
  });
  assert.equal(calls, 2);
  assert.equal(rows.length, 1);
});

test("source body size and content type are bounded before parsing", async () => {
  await assert.rejects(
    fetchAutomationSourceRecords(source(), {
      fetchImpl: async () => new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html", "content-length": "1000001" },
      }),
      htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_response_too_large",
  );

  await assert.rejects(
    fetchAutomationSourceRecords(source(), {
      fetchImpl: async () => new Response("not html", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
      htmlAdapters: { fixture: skjExhibitionCalendarAdapter },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "source_invalid_content_type",
  );
});

test("production adapters fail closed on parser exceptions and suspicious zero records", async () => {
  await assert.rejects(
    fetchAutomationSourceRecords(source(), {
      fetchImpl: async () => new Response("<html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      htmlAdapters: { fixture: () => { throw new Error("parser exploded"); } },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "adapter_parse_failed",
  );

  await assert.rejects(
    fetchAutomationSourceRecords(source({
      entityType: "ORGANIZATION",
      sourceKey: "svps-shelters-register",
      config: { htmlAdapterKey: "svps-shelters-register" },
    }), {
      fetchImpl: async () => new Response("<html><table></table></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
      htmlAdapters: { "svps-shelters-register": () => [] },
    }),
    (error) => error instanceof AutomationConnectorError && error.code === "adapter_no_records",
  );
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
  assert.match(preview, /finalUrl/);
  assert.match(preview, /redirectCount/);
  assert.match(preview, /timingMs/);
});

test("source persistence enforces review gate and invalidates approval after safety-critical edits", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /sourceSafetySignature/);
  assert.match(store, /enabled=CASE WHEN \? THEN 0 ELSE enabled END/);
  assert.match(store, /review_status=CASE WHEN \? THEN 'PENDING' ELSE review_status END/);
  assert.match(store, /existing\.reviewStatus !== "APPROVED"/);
  assert.match(store, /automation_source_review_required/);
});

test("run now reuses production runner and blocks disabled or unapproved sources", () => {
  const runner = read("lib/data-automation-runner.ts");
  const route = read("app/api/admin/automation-sources/[id]/run/route.ts");
  assert.match(runner, /runAutomationSourceNow/);
  assert.match(runner, /automation_source_disabled/);
  assert.match(runner, /automation_source_review_required/);
  assert.match(runner, /source\.reviewStatus !== "APPROVED"/);
  assert.match(runner, /return runSource\(source, options\)/);
  assert.match(route, /productionAutomationHtmlAdapters/);
  assert.match(route, /canonicalWrite:\s*false,\s*publication:\s*false/);
});

test("scheduler still respects enabled state and next-check cadence", () => {
  const store = read("lib/data-automation-store.ts");
  assert.match(store, /WHERE enabled = 1 AND review_status = 'APPROVED' AND \(next_check_at IS NULL OR next_check_at <= \?\)/);
  assert.match(store, /nextAutomationCheckAt/);
});

test("source error lifecycle resolves recovery and superseded error signatures without deleting history", () => {
  const store = read("lib/data-automation-store.ts");
  const runner = read("lib/data-automation-runner.ts");
  assert.match(store, /SOURCE_ERROR_REPLACED/);
  assert.match(store, /SOURCE_RECOVERED/);
  assert.match(store, /review_status IN \('NEW','IN_REVIEW','SUPPRESSED'\)/);
  assert.match(runner, /resolveOtherAutomationSourceErrors/);
  assert.match(runner, /newDataFindings/);
  assert.match(runner, /sourceErrors/);
});

test("source failures remain visible in source observability", () => {
  const detail = read("components/admin-automation-source-detail.tsx");
  const store = read("lib/data-automation-source-store.ts");
  assert.match(detail, /Posledná chyba/);
  assert.match(detail, /lastErrorCode/);
  assert.match(store, /last_error_code/);
  assert.match(store, /error_count/);
});

test("candidate persistence dedupes canonical URL and approval creates only disabled pending source", () => {
  const store = read("lib/data-automation-source-store.ts");
  assert.match(store, /ON CONFLICT\(canonical_url,entity_type\) DO UPDATE/);
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
  assert.match(detail, /nič sa automaticky nezverejní/);
  assert.match(manager, /Čaká na tvoje rozhodnutie/);
  assert.match(manager, /Pridať medzi zdroje/);
});
