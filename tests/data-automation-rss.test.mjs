import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseFeedDocument,
  rssDiscoveryAdapter,
  rssDiscoveryCandidates,
} from "../lib/data-automation-discovery.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("DISCOVERY-3B parses RSS 2.0 item semantics, CDATA and bounded metadata", () => {
  const parsed = parseFeedDocument(`<?xml version="1.0"?>
    <rss version="2.0"><channel><title>Feed</title>
      <item>
        <title><![CDATA[Žilinský <b>psí</b> deň]]></title>
        <link>https://example.sk/events/1?utm_source=feed</link>
        <guid isPermaLink="false">opaque-123</guid>
        <pubDate>Fri, 25 Sep 2026 10:00:00 GMT</pubDate>
        <description><![CDATA[<script>alert(1)</script><p>Bezpečný popis</p>]]></description>
        <category>Podujatia</category>
      </item>
    </channel></rss>`, "https://example.sk/feed.xml");
  assert.equal(parsed.feedType, "RSS");
  assert.equal(parsed.totalEntries, 1);
  assert.equal(parsed.entries[0].sourceUrl, "https://example.sk/events/1");
  assert.equal(parsed.entries[0].externalId, "opaque-123");
  assert.equal(parsed.entries[0].title, "Žilinský psí deň");
  assert.equal(parsed.entries[0].description, "Bezpečný popis");
  assert.equal(parsed.entries[0].publishedAt, "2026-09-25T10:00:00.000Z");
  assert.deepEqual(parsed.entries[0].categories, ["Podujatia"]);
});

test("DISCOVERY-3B RSS prefers link, only uses URL-like guid fallback and skips opaque guid", () => {
  const items = rssDiscoveryCandidates({
    payload: `<rss><channel>
      <item><link>https://example.sk/a</link><guid>https://example.sk/not-a</guid></item>
      <item><guid>https://example.sk/b</guid></item>
      <item><guid isPermaLink="false">https://example.sk/c</guid></item>
      <item><guid>uuid-opaque</guid></item>
    </channel></rss>`,
    baseUrl: "https://example.sk/feed.xml",
    entityType: "EVENT",
  });
  assert.deepEqual(items.candidates.map((item) => item.sourceUrl), [
    "https://example.sk/a",
    "https://example.sk/b",
  ]);
});

test("DISCOVERY-3B parses Atom namespaces, alternate link, id, published/updated and summary", () => {
  const parsed = parseFeedDocument(`<feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title>Český psí deň</title>
      <link rel="self" href="https://example.sk/api/entry/1"/>
      <link rel="alternate" href="https://example.sk/clanok/1"/>
      <id>tag:example.sk,2026:1</id>
      <published>2026-09-20T12:00:00+02:00</published>
      <updated>2026-09-21T13:00:00+02:00</updated>
      <summary><![CDATA[<p>Súhrn</p>]]></summary>
      <author><name>Autor</name></author>
      <category term="veda"/>
    </entry>
  </feed>`, "https://example.sk/atom.xml");
  assert.equal(parsed.feedType, "ATOM");
  assert.equal(parsed.entries[0].sourceUrl, "https://example.sk/clanok/1");
  assert.equal(parsed.entries[0].externalId, "tag:example.sk,2026:1");
  assert.equal(parsed.entries[0].publishedAt, "2026-09-20T10:00:00.000Z");
  assert.equal(parsed.entries[0].updatedAt, "2026-09-21T11:00:00.000Z");
  assert.equal(parsed.entries[0].description, "Súhrn");
  assert.equal(parsed.entries[0].author, "Autor");
  assert.deepEqual(parsed.entries[0].categories, ["veda"]);
});

test("DISCOVERY-3B Atom falls back to safe URL id only when links are unusable", () => {
  const parsed = parseFeedDocument(`<feed xmlns="http://www.w3.org/2005/Atom">
    <entry><id>https://example.sk/from-id</id></entry>
    <entry><id>tag:example.sk,2026:opaque</id></entry>
  </feed>`, "https://example.sk/atom.xml");
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].sourceUrl, "https://example.sk/from-id");
  assert.equal(parsed.invalidEntries, 1);
});

test("DISCOVERY-3B dedupes canonical URLs and enforces entry/candidate bounds", () => {
  const entries = Array.from({ length: 205 }, (_, index) =>
    `<item><link>https://example.sk/item/${index % 150}?utm_source=rss</link></item>`
  ).join("");
  const result = rssDiscoveryCandidates({
    payload: `<rss><channel>${entries}</channel></rss>`,
    baseUrl: "https://example.sk/feed.xml",
    entityType: "EVENT",
    maxEntries: 200,
    maxCandidates: 120,
  });
  assert.equal(result.candidates.length, 120);
  assert.ok(result.warnings.includes("feed_entry_limit"));
  assert.equal(new Set(result.candidates.map((item) => item.sourceUrl)).size, 120);
});

test("DISCOVERY-3B applies optional age window per item and marks far-future timestamps suspicious", () => {
  const result = rssDiscoveryCandidates({
    payload: `<rss><channel>
      <item><link>https://example.sk/old</link><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item>
      <item><link>https://example.sk/new</link><pubDate>Fri, 25 Sep 2026 00:00:00 GMT</pubDate></item>
      <item><link>https://example.sk/future</link><pubDate>Thu, 01 Oct 2026 00:00:00 GMT</pubDate></item>
    </channel></rss>`,
    baseUrl: "https://example.sk/feed.xml",
    entityType: "EVENT",
    maxEntryAgeDays: 365,
    now: new Date("2026-09-26T12:00:00Z"),
  });
  assert.deepEqual(result.candidates.map((item) => item.sourceUrl), [
    "https://example.sk/new",
    "https://example.sk/future",
  ]);
  assert.equal(result.candidates[1].metadata.suspiciousFutureTimestamp, true);
});

test("DISCOVERY-3B enforces URL policy/path filters without leaf-page fetch semantics", () => {
  const result = rssDiscoveryCandidates({
    payload: `<rss><channel>
      <item><link>https://example.sk/events/good</link></item>
      <item><link>https://other.sk/events/external</link></item>
      <item><link>https://example.sk/private/blocked</link></item>
      <item><link>javascript:alert(1)</link></item>
    </channel></rss>`,
    baseUrl: "https://example.sk/feed.xml",
    entityType: "EVENT",
    urlAllowed: (url) => new URL(url).hostname === "example.sk",
    pathIncludes: ["/events"],
    pathExcludes: ["/private"],
  });
  assert.deepEqual(result.candidates.map((item) => item.sourceUrl), ["https://example.sk/events/good"]);
  assert.ok(result.warnings.includes("feed_url_blocked"));
});

test("DISCOVERY-3B malformed root XML fails safely while malformed entries are isolated", () => {
  assert.throws(() => parseFeedDocument("<html>not a feed</html>", "https://example.sk/feed.xml"), /invalid_feed_xml/);
  const result = rssDiscoveryCandidates({
    payload: `<rss><channel>
      <item><guid>opaque</guid></item>
      <item><link>https://example.sk/ok</link></item>
    </channel></rss>`,
    baseUrl: "https://example.sk/feed.xml",
    entityType: "EVENT",
  });
  assert.equal(result.candidates.length, 1);
  assert.ok(result.warnings.includes("feed_invalid_entries"));
});

test("DISCOVERY-3B evidence context includes feed type, entry identity and URL", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /type:\$\{feedType\}/);
  assert.match(runner, /item:\$\{externalId\}/);
  assert.match(runner, /url:\$\{entryUrl\}/);
  assert.match(runner, /entryUrl/);
  const discovery = read("lib/data-automation-discovery.ts");
  assert.match(discovery, /publishedAt/);
  assert.match(discovery, /updatedAt/);
  assert.match(discovery, /entryIndex/);
});

test("DISCOVERY-3B preserves fetch bounds, redirect validation, lifecycle and governance", () => {
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /MAX_DISCOVERY_BYTES = 1_000_000/);
  assert.match(runner, /MAX_REDIRECT_HOPS = 3/);
  assert.match(runner, /timeoutMs/);
  assert.match(runner, /urlAllowed && !urlAllowed\(target\.toString\(\)\)/);
  assert.match(runner, /maxFeedEntries/);
  assert.match(runner, /maxEntryAgeDays/);
  assert.doesNotMatch(runner, /setAutomationSourceEnabled|INSERT INTO automation_sources/i);
  assert.doesNotMatch(runner, /INSERT INTO (managed_events|directory_profiles|help_organizations|adoption_dogs|lost_found_dog_reports)/i);
});

test("DISCOVERY-3B leaves legacy adapter bounded and does not regress non-RSS discovery contracts", () => {
  const items = rssDiscoveryAdapter({
    payload: `<rss><channel><item><link>https://example.sk/one</link></item></channel></rss>`,
    baseUrl: "https://example.sk/feed.xml",
    entityType: "EVENT",
  });
  assert.equal(items.length, 1);
  const runner = read("lib/data-automation-discovery-runner.ts");
  assert.match(runner, /discoverSitemapCandidates/);
  assert.match(runner, /root\.discoveryType === "SEARCH_PROVIDER"/);
  assert.match(runner, /structuredDirectoryDiscovery/);
});
