import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { adminNavigationItems } from "../lib/admin-navigation.ts";

globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {};
const quality = await import("../lib/data-quality-store.ts");

function d1Fixture({ withMedia = true, failLookups = false } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT,
      website_url TEXT,
      image_url TEXT,
      image_key TEXT,
      online INTEGER,
      city TEXT,
      district TEXT,
      region TEXT,
      service_address_confirmation TEXT,
      source_data_json TEXT
    );
    CREATE TABLE managed_events (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL
    );
  `);

  const insertProfile = sqlite.prepare(`
    INSERT INTO directory_profiles (
      id, slug, name, category, status, description, website_url, image_url, image_key,
      online, city, district, region, service_address_confirmation, source_data_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (let id = 1; id <= 1200; id += 1) {
    insertProfile.run(
      id,
      `profile-${id}`,
      `Profil ${String(id).padStart(4, "0")}`,
      "veterinari",
      "published",
      id % 7 === 0 ? "" : "Popis",
      "https://example.test",
      id % 11 === 0 ? null : "https://example.test/image.jpg",
      null,
      0,
      "Nitra",
      "Nitra",
      "Nitriansky kraj",
      "CONFIRMED_SERVICE_LOCATION",
      id % 37 === 0 ? "{invalid-json" : "{}",
    );
  }

  const insertEvent = sqlite.prepare("INSERT INTO managed_events (id, title, slug) VALUES (?, ?, ?)");
  for (let id = 1; id <= 20; id += 1) insertEvent.run(id, `Podujatie ${id}`, `event-${id}`);

  if (withMedia) {
    sqlite.exec(`
      CREATE TABLE media_source_monitors (
        id INTEGER PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        source_page_url TEXT,
        source_image_url TEXT,
        source_content_hash TEXT,
        active_image_key TEXT,
        status TEXT NOT NULL,
        candidate_image_url TEXT,
        candidate_image_key TEXT,
        candidate_content_hash TEXT,
        last_http_status INTEGER,
        last_checked_at TEXT,
        issue_started_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const insertMonitor = sqlite.prepare(`
      INSERT INTO media_source_monitors (
        id, entity_type, entity_id, source_page_url, source_image_url, source_content_hash,
        active_image_key, status, candidate_image_url, candidate_image_key,
        candidate_content_hash, last_http_status, last_checked_at, issue_started_at,
        last_error, created_at, updated_at
      ) VALUES (?, 'DIRECTORY_PROFILE', ?, ?, ?, NULL, NULL, 'CANDIDATE', ?, ?, NULL, 200, ?, ?, ?, ?, ?)
    `);
    for (let id = 1; id <= 250; id += 1) {
      const timestamp = new Date(Date.UTC(2026, 8, 29, 20, 0, id % 60)).toISOString();
      insertMonitor.run(
        id,
        id,
        "https://example.test",
        "https://example.test/source.jpg",
        "https://example.test/candidate.jpg",
        `candidates/directory/${id}/image.webp`,
        timestamp,
        timestamp,
        "fixture-internal-detail-must-not-be-rendered",
        timestamp,
        timestamp,
      );
    }
  }

  const metrics = { maxBindings: 0, queryCount: 0 };
  const db = {
    prepare(sql) {
      metrics.queryCount += 1;
      let args = [];
      return {
        bind(...values) {
          args = values;
          metrics.maxBindings = Math.max(metrics.maxBindings, values.length);
          if (values.length > quality.DATA_QUALITY_D1_MAX_BOUND_PARAMS) {
            throw new Error(`D1 binding limit exceeded: ${values.length}`);
          }
          return this;
        },
        async first() {
          if (failLookups && /WHERE id IN\s*\(/i.test(sql)) throw new Error("simulated lookup failure with SQL details");
          return sqlite.prepare(sql).get(...args) ?? null;
        },
        async all() {
          if (failLookups && /WHERE id IN\s*\(/i.test(sql)) throw new Error("simulated lookup failure with SQL details");
          return { results: sqlite.prepare(sql).all(...args) };
        },
        async run() {
          if (failLookups && /WHERE id IN\s*\(/i.test(sql)) throw new Error("simulated lookup failure with SQL details");
          return sqlite.prepare(sql).run(...args);
        },
      };
    },
  };
  return { db, metrics, close: () => sqlite.close() };
}

function useDb(db) {
  globalThis.__CLOUDFLARE_WORKERS_ENV__.DB = db;
}

test("data quality stays bounded with thousands of profiles and 250 media issues", async () => {
  const fixture = d1Fixture();
  useDb(fixture.db);
  const first = await quality.loadDataQualityDashboard({ profilePage: 1, mediaPage: 1 });
  const second = await quality.loadDataQualityDashboard({ profilePage: 2, mediaPage: 2 });

  assert.equal(first.availability.status, "OK");
  assert.equal(first.summary.totalProfiles, 1200);
  assert.equal(first.summary.profilesWithIssues, 1200);
  assert.equal(first.profilePagination.totalItems, 1200);
  assert.equal(first.profilePagination.totalPages, 24);
  assert.equal(first.profiles.length, quality.DATA_QUALITY_PROFILE_PAGE_SIZE);
  assert.equal(second.profiles.length, quality.DATA_QUALITY_PROFILE_PAGE_SIZE);
  assert.equal(new Set([...first.profiles, ...second.profiles].map((item) => item.id)).size, 100);

  assert.equal(first.summary.mediaIssues, 250);
  assert.equal(first.mediaPagination.totalItems, 250);
  assert.equal(first.mediaPagination.totalPages, 5);
  assert.equal(first.media.length, quality.DATA_QUALITY_MEDIA_PAGE_SIZE);
  assert.equal(second.media.length, quality.DATA_QUALITY_MEDIA_PAGE_SIZE);
  assert.ok(fixture.metrics.maxBindings <= quality.DATA_QUALITY_D1_MAX_BOUND_PARAMS);
  fixture.close();
});

test("current profile quality resolutions suppress legitimate missing fields and expire after 12 months", async () => {
  const fixture = d1Fixture();
  useDb(fixture.db);
  const now = new Date().toISOString();
  const currentQuality = JSON.stringify({
    _psipedia_quality_phone_status: "NOT_PUBLIC",
    _psipedia_quality_phone_checked_at: now,
    _psipedia_quality_email_status: "NOT_FOUND",
    _psipedia_quality_email_checked_at: now,
  });
  await fixture.db.prepare("UPDATE directory_profiles SET source_data_json = ? WHERE id = 1").bind(currentQuality).run();

  const current = await quality.loadDataQualityDashboard();
  assert.equal(current.summary.profilesWithIssues, 1199);
  assert.equal(current.summary.missingPhone, 1199);
  assert.equal(current.summary.missingEmail, 1199);

  const staleQuality = JSON.stringify({
    _psipedia_quality_phone_status: "NOT_PUBLIC",
    _psipedia_quality_phone_checked_at: "2000-01-01T00:00:00.000Z",
    _psipedia_quality_email_status: "NOT_FOUND",
    _psipedia_quality_email_checked_at: "2000-01-01T00:00:00.000Z",
  });
  await fixture.db.prepare("UPDATE directory_profiles SET source_data_json = ? WHERE id = 1").bind(staleQuality).run();

  const stale = await quality.loadDataQualityDashboard();
  assert.equal(stale.summary.profilesWithIssues, 1200);
  assert.equal(stale.summary.missingPhone, 1200);
  assert.equal(stale.summary.missingEmail, 1200);
  fixture.close();
});

test("data quality filters narrow profiles and media without changing facet summaries", async () => {
  const fixture = d1Fixture();
  useDb(fixture.db);

  const filtered = await quality.loadDataQualityDashboard({
    category: "veterinari",
    issue: "image",
    profileStatus: "published",
    priority: "important",
    query: "Profil 0011",
    region: "Nitriansky kraj",
    district: "Nitra",
    mediaStatus: "error",
  });

  assert.equal(filtered.summary.totalProfiles, 1);
  assert.equal(filtered.summary.profilesWithIssues, 1);
  assert.equal(filtered.profilePagination.totalItems, 1);
  assert.equal(filtered.profiles.length, 1);
  assert.equal(filtered.profiles[0].id, 11);
  assert.equal(filtered.profiles[0].priority, "important");
  assert.ok(filtered.profiles[0].issues.some((issue) => issue.key === "image"));
  assert.deepEqual(filtered.regionOptions, ["Nitriansky kraj"]);
  assert.deepEqual(filtered.districtOptions, ["Nitra"]);

  assert.equal(filtered.summary.mediaIssues, 250);
  assert.equal(filtered.mediaPagination.totalItems, 0);
  assert.equal(filtered.media.length, 0);
  fixture.close();
});

test("data quality surfaces reviewable contact suggestions from existing automation sources", async () => {
  const fixture = d1Fixture();
  useDb(fixture.db);
  await fixture.db.prepare(`CREATE TABLE automation_update_suggestions (
    id INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    canonical_entity_id INTEGER NOT NULL,
    suggestion_type TEXT NOT NULL,
    before_json TEXT NOT NULL,
    proposed_json TEXT NOT NULL,
    diff_json TEXT NOT NULL,
    external_source_url TEXT,
    last_detected_at TEXT NOT NULL,
    status TEXT NOT NULL
  )`).run();
  await fixture.db.prepare(`CREATE TABLE automation_sources (
    id INTEGER PRIMARY KEY,
    label TEXT
  )`).run();
  await fixture.db.prepare(`CREATE TABLE automation_findings (
    id INTEGER PRIMARY KEY,
    entity_type TEXT NOT NULL,
    canonical_entity_id INTEGER NOT NULL,
    finding_type TEXT NOT NULL,
    before_json TEXT NOT NULL,
    proposed_json TEXT NOT NULL,
    diff_json TEXT NOT NULL,
    source_url TEXT,
    source_id INTEGER,
    last_detected_at TEXT NOT NULL,
    review_status TEXT NOT NULL
  )`).run();
  await fixture.db.prepare(`INSERT INTO automation_update_suggestions (
    id, entity_type, canonical_entity_id, suggestion_type, before_json, proposed_json,
    diff_json, external_source_url, last_detected_at, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    1,
    "DIRECTORY",
    1,
    "POSSIBLE_UPDATE",
    "{}",
    JSON.stringify({ public_phone: "+421 900 123 456" }),
    JSON.stringify({ public_phone: { before: "", after: "+421 900 123 456" } }),
    "https://example.test/kontakt",
    "2026-09-30T12:00:00.000Z",
    "OPEN",
  ).run();

  const result = await quality.loadDataQualityDashboard({ query: "Profil 0001" });
  assert.equal(result.sections.suggestions.status, "OK");
  assert.equal(result.profiles.length, 1);
  assert.equal(result.profiles[0].suggestions.length, 1);
  assert.deepEqual(result.profiles[0].suggestions[0], {
    origin: "DIRECT_ENTITY",
    suggestionId: 1,
    field: "publicPhone",
    issueKey: "phone",
    label: "Telefón",
    proposed: "+421 900 123 456",
    sourceUrl: "https://example.test/kontakt",
    sourceLabel: "example.test",
    detectedAt: "2026-09-30T12:00:00.000Z",
    canonicalUpdatedAt: "",
    proposedValueHash: result.profiles[0].suggestions[0].proposedValueHash,
  });
  assert.match(result.profiles[0].suggestions[0].proposedValueHash, /^[a-f0-9]{64}$/);
  fixture.close();
});

test("entity lookup deduplicates and chunks more than 100 IDs under the D1 binding ceiling", async () => {
  const fixture = d1Fixture();
  useDb(fixture.db);
  const monitors = Array.from({ length: 250 }, (_, index) => {
    const id = index + 1;
    return {
      id,
      entityType: "DIRECTORY_PROFILE",
      entityId: id,
      sourcePageUrl: null,
      sourceImageUrl: null,
      sourceContentHash: null,
      activeImageKey: null,
      status: "CANDIDATE",
      candidateImageUrl: null,
      candidateImageKey: null,
      candidateContentHash: null,
      lastHttpStatus: null,
      lastCheckedAt: null,
      issueStartedAt: null,
      lastError: null,
      createdAt: "2026-09-29T20:00:00.000Z",
      updatedAt: "2026-09-29T20:00:00.000Z",
    };
  });
  monitors.push(...monitors.slice(0, 25));

  const items = await quality.resolveDataQualityMediaItems(fixture.db, monitors);
  assert.equal(items.length, 275);
  assert.equal(items[0].label, "Profil 0001");
  assert.equal(fixture.metrics.maxBindings, quality.DATA_QUALITY_LOOKUP_CHUNK_SIZE);
  assert.ok(quality.DATA_QUALITY_LOOKUP_CHUNK_SIZE < quality.DATA_QUALITY_D1_MAX_BOUND_PARAMS);
  fixture.close();
});

test("missing optional media schema becomes PARTIAL instead of a false successful zero", async () => {
  const fixture = d1Fixture({ withMedia: false });
  useDb(fixture.db);
  const result = await quality.loadDataQualityDashboard();

  assert.equal(result.availability.status, "PARTIAL");
  assert.equal(result.sections.profiles.status, "OK");
  assert.equal(result.sections.media.status, "UNAVAILABLE");
  assert.equal(result.sections.lookups.status, "UNAVAILABLE");
  assert.equal(result.summary.profilesWithIssues, 1200);
  assert.equal(result.summary.mediaIssues, null);
  assert.equal(result.monitorReady, false);
  assert.ok(result.availability.errorRefs.length >= 1);
  fixture.close();
});

test("lookup failure preserves media issues with safe fallback labels", async () => {
  const fixture = d1Fixture({ failLookups: true });
  useDb(fixture.db);
  const result = await quality.loadDataQualityDashboard();

  assert.equal(result.availability.status, "PARTIAL");
  assert.equal(result.sections.profiles.status, "OK");
  assert.equal(result.sections.media.status, "OK");
  assert.equal(result.sections.lookups.status, "UNAVAILABLE");
  assert.equal(result.summary.mediaIssues, 250);
  assert.equal(result.media.length, quality.DATA_QUALITY_MEDIA_PAGE_SIZE);
  assert.equal(result.media[0].label.startsWith("Profil #"), true);
  fixture.close();
});

test("quality UI never renders raw monitor errors, SQL or stack traces", () => {
  const component = readFileSync(new URL("../components/admin-data-quality-dashboard.tsx", import.meta.url), "utf8");
  const reliability = readFileSync(new URL("../lib/admin-automation-reliability.ts", import.meta.url), "utf8");
  assert.doesNotMatch(component, /monitor\.lastError/);
  assert.doesNotMatch(component, /stack/i);
  assert.match(component, /Nájdené zo zdrojov/);
  assert.match(component, /Prevziať/);
  assert.match(component, /automation-update-suggestions/);
  assert.match(component, /Referencia:/);
  assert.match(reliability, /errorType:/);
  assert.doesNotMatch(reliability, /errorMessage|error\.message|String\(error\)/);
});

test("quality auth runs before protected data loading and pagination preserves query state in UI", () => {
  const page = readFileSync(new URL("../app/admin/kvalita/page.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/admin-data-quality-dashboard.tsx", import.meta.url), "utf8");
  assert.ok(page.indexOf("requireAdminPageUser") < page.indexOf("loadDataQualityDashboard"));
  assert.match(page, /profilePage: positivePage\(params\.page\)/);
  assert.match(page, /mediaPage: positivePage\(params\.mediaPage\)/);
  assert.match(component, /new URLSearchParams\(searchParams\.toString\(\)\)/);
  assert.match(component, /query\.set\(key, String\(value\)\)/);
});

test("all primary admin navigation routes exist and retain page-level admin auth", () => {
  for (const item of adminNavigationItems) {
    const route = item.href === "/admin" ? "app/admin/page.tsx" : `app${item.href}/page.tsx`;
    const url = new URL("../" + route, import.meta.url);
    assert.equal(existsSync(url), true, route);
    const source = readFileSync(url, "utf8");
    assert.match(source, /requireAdminPageUser\(/, `${route} must authenticate before protected reads`);
  }
});

test("representative admin detail and not-found entry points still exist", () => {
  for (const route of [
    "app/admin/clanky/[id]/page.tsx",
    "app/admin/plemena/[id]/page.tsx",
    "app/admin/adresar/[id]/page.tsx",
    "app/admin/organizacie/[id]/page.tsx",
    "app/admin/podujatia/[id]/page.tsx",
    "app/admin/adopcie/[id]/page.tsx",
    "app/admin/pomoc/[id]/page.tsx",
    "app/admin/stratene-najdene/[id]/page.tsx",
    "app/admin/recenzie-profilov/[id]/page.tsx",
    "app/admin/partners/accounts/[id]/page.tsx",
  ]) {
    assert.equal(existsSync(new URL("../" + route, import.meta.url)), true, route);
  }
});
