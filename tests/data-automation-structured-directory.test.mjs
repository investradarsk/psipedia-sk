import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseStructuredDirectoryConfig,
  structuredDirectoryDiscovery,
  structuredDirectoryNextPageUrl,
  STRUCTURED_DIRECTORY_HARD_MAX_DETAIL_FETCHES,
  STRUCTURED_DIRECTORY_HARD_MAX_PAGES,
  STRUCTURED_DIRECTORY_HARD_MAX_ROWS,
} from "../lib/data-automation-discovery.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function htmlConfig(extra = {}) {
  return parseStructuredDirectoryConfig({
    format: "HTML",
    rowSelector: "div.card",
    fields: {
      name: ".name",
      detailUrl: { selector: "a.detail", attribute: "href" },
      externalId: { attribute: "data-id" },
      address: ".address",
      website: { selector: "a.website", attribute: "href" },
    },
    detailLinkField: "detailUrl",
    externalIdField: "externalId",
    maxRows: 100,
    ...extra,
  });
}

function jsonConfig(extra = {}) {
  return parseStructuredDirectoryConfig({
    format: "JSON",
    collectionPath: "data.results",
    fields: {
      name: "profile.name",
      detailUrl: "profile.detail",
      externalId: "id",
      city: "profile.city",
      description: "profile.description",
    },
    detailLinkField: "detailUrl",
    externalIdField: "externalId",
    maxRows: 100,
    ...extra,
  });
}

test("DISCOVERY-4A validates explicit HTML/JSON contracts and fails closed", () => {
  assert.equal(htmlConfig().format, "HTML");
  assert.equal(jsonConfig().format, "JSON");
  assert.throws(() => parseStructuredDirectoryConfig({ format: "XML", fields: {} }), /invalid_directory_config/);
  assert.throws(() => parseStructuredDirectoryConfig({ format: "HTML", fields: { detailUrl: "a" } }), /invalid_directory_config/);
  assert.throws(() => parseStructuredDirectoryConfig({
    format: "JSON",
    fields: { detailUrl: "url" },
    collectionPath: "data[0]",
  }), /invalid_directory_config/);
});

test("DISCOVERY-4A parses repeated HTML rows, relative links, external IDs and bounded evidence", () => {
  const longAddress = "A".repeat(900);
  const result = structuredDirectoryDiscovery({
    payload: `<section>
      <div class="card" data-id="vet-001">
        <span class="name">Veterina Žilina</span>
        <span class="address">${longAddress}</span>
        <a class="detail" href="/veterinar/123">Detail</a>
        <a class="website" href="https://clinic.example.org/?utm_source=dir">Web</a>
      </div>
      <div class="card" data-id="vet-002">
        <span class="name">Veterina Martin</span>
        <a class="detail" href="/veterinar/456">Detail</a>
      </div>
    </section>`,
    baseUrl: "https://directory.example.sk/list",
    entityType: "DIRECTORY",
    config: htmlConfig(),
    urlAllowed: (url) => new URL(url).hostname === "directory.example.sk",
  });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].sourceUrl, "https://directory.example.sk/veterinar/123");
  assert.equal(result.candidates[0].metadata.externalId, "vet-001");
  assert.equal(result.candidates[0].metadata.rowIdentityKind, "EXTERNAL_ID");
  assert.equal(result.candidates[0].metadata.address.length, 500);
  assert.equal(result.candidates[0].metadata.website, "https://clinic.example.org/");
  assert.equal(result.candidates[0].metadata.parserFormat, "HTML");
});

test("DISCOVERY-4A parses root and nested JSON collections deterministically", () => {
  const nested = structuredDirectoryDiscovery({
    payload: {
      data: {
        results: [
          { id: "org-1", profile: { name: "OZ Psík", detail: "/org/1", city: "Nitra", description: "Pomoc psom" } },
          { id: "org-2", profile: { name: "OZ Labka", detail: "/org/2", city: "Trnava" } },
        ],
      },
    },
    baseUrl: "https://registry.example.sk/api/list",
    entityType: "ORGANIZATION",
    config: jsonConfig(),
    urlAllowed: (url) => new URL(url).hostname === "registry.example.sk",
  });
  assert.deepEqual(nested.candidates.map((item) => item.sourceUrl), [
    "https://registry.example.sk/org/1",
    "https://registry.example.sk/org/2",
  ]);
  assert.equal(nested.candidates[0].metadata.city, "Nitra");

  const root = structuredDirectoryDiscovery({
    payload: [{ name: "One", url: "https://example.sk/one" }],
    baseUrl: "https://example.sk/api",
    entityType: "DIRECTORY",
    config: parseStructuredDirectoryConfig({
      format: "JSON",
      fields: { name: "name", detailUrl: "url" },
      maxRows: 100,
    }),
  });
  assert.equal(root.candidates.length, 1);
});

test("DISCOVERY-4A isolates malformed rows and safely skips rows without usable candidate URLs", () => {
  const result = structuredDirectoryDiscovery({
    payload: {
      data: {
        results: [
          { id: "bad", profile: { name: "No URL" } },
          { id: "unsafe", profile: { name: "Unsafe", detail: "http://127.0.0.1/private" } },
          { id: "ok", profile: { name: "OK", detail: "/ok" } },
        ],
      },
    },
    baseUrl: "https://registry.example.sk/api",
    entityType: "DIRECTORY",
    config: jsonConfig(),
    urlAllowed: (url) => new URL(url).hostname === "registry.example.sk",
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.stats.rowsSkipped, 2);
  assert.ok(result.warnings.includes("directory_rows_skipped"));
});

test("DISCOVERY-4A enforces row hard cap and generic maxCandidates", () => {
  const rows = Array.from({ length: 700 }, (_, index) => ({
    id: String(index),
    name: "Row " + index,
    url: "https://example.sk/item/" + index,
  }));
  const config = parseStructuredDirectoryConfig({
    format: "JSON",
    fields: { name: "name", detailUrl: "url", externalId: "id" },
    maxRows: 9999,
  });
  assert.equal(config.maxRows, STRUCTURED_DIRECTORY_HARD_MAX_ROWS);
  const result = structuredDirectoryDiscovery({
    payload: rows,
    baseUrl: "https://example.sk/api",
    entityType: "DIRECTORY",
    config,
    maxCandidates: 120,
  });
  assert.equal(result.candidates.length, 120);
  assert.ok(result.warnings.includes("directory_row_limit"));
});

test("DISCOVERY-4A pagination contract is bounded and resolves deterministic next links", () => {
  const nextConfig = htmlConfig({
    pagination: { nextLinkSelector: "a.next", maxPages: 999 },
  });
  assert.equal(nextConfig.pagination.maxPages, STRUCTURED_DIRECTORY_HARD_MAX_PAGES);
  assert.equal(
    structuredDirectoryNextPageUrl({
      payload: '<a class="next" href="/directory?page=2">Next</a>',
      currentUrl: "https://directory.example.sk/directory?page=1",
      config: nextConfig,
      nextPageNumber: 1,
    }),
    "https://directory.example.sk/directory?page=2",
  );

  const templateConfig = jsonConfig({
    pagination: { pageParamTemplate: "https://registry.example.sk/api?page={page}", maxPages: 3 },
  });
  assert.equal(
    structuredDirectoryNextPageUrl({
      payload: "{}",
      currentUrl: "https://registry.example.sk/api?page=1",
      config: templateConfig,
      nextPageNumber: 1,
    }),
    "https://registry.example.sk/api?page=2",
  );
  assert.equal(STRUCTURED_DIRECTORY_HARD_MAX_DETAIL_FETCHES, 50);
});

test("DISCOVERY-4A source-local external ID never changes candidate cross-source identity", () => {
  const source = read("lib/data-automation-source-store.ts");
  assert.match(source, /ON CONFLICT\(canonical_url,entity_type\)/);
  const discovery = read("lib/data-automation-discovery.ts");
  assert.match(discovery, /rowIdentityKind/);
  assert.match(discovery, /EXTERNAL_ID/);
  assert.doesNotMatch(discovery, /EXACT_SOURCE_ID|SAME_ENTITY/);
});

test("DISCOVERY-4A runner uses exact host policy, bounded pagination and stable row evidence context", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /parseStructuredDirectoryConfig/);
  assert.match(runner, /const maxPages = Math\.min\(directoryConfig\.pagination\?\.maxPages \?\? 1, 10\)/);
  assert.match(runner, /const visited = new Set<string>\(\)/);
  assert.match(runner, /directory_pagination_loop/);
  assert.match(runner, /host === rootHost \|\| allowed\.has\(host\)/);
  assert.match(runner, /root:\$\{root\.rootKey\}\|page:\$\{pageUrl\}\|row:\$\{rowIdentity\}/);
  assert.match(runner, /directory_detail_fetch_not_supported/);
});

test("DISCOVERY-4A preserves DISCOVERY-1A/1B governance and canonical-write boundaries", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  const store = read("lib/data-automation-source-store.ts");
  assert.match(runner, /upsertAutomationSourceCandidateEvidence/);
  assert.match(store, /last_seen_at=excluded\.last_seen_at/);
  assert.doesNotMatch(runner, /setAutomationSourceEnabled|INSERT INTO automation_sources/i);
  assert.doesNotMatch(runner, /INSERT INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
  assert.doesNotMatch(runner, /EXACT_SOURCE_ID|SAME_ENTITY/);
});

test("DISCOVERY-4A leaves Sitemap, RSS and Search Provider branches intact", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /discoverSitemapCandidates/);
  assert.match(runner, /root\.discoveryType === "RSS"/);
  assert.match(runner, /root\.discoveryType === "SEARCH_PROVIDER"/);
  assert.match(runner, /automationSearchBudgetPolicy/);
});
