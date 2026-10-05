import assert from "node:assert/strict";
import test from "node:test";
import { getPlatformProxy } from "wrangler";
import { ingestDirectEntityUrl } from "../lib/data-automation-direct-entity.ts";

const SOURCE_URL = "https://direct-happyvet.example/";
const WEAK_URL = "https://direct-weakvet.example/";
const NAME = "DIRECT E2E HappyVet Nitra";
const WEAK_NAME = "DIRECT E2E WeakVet";
const NOW = new Date("2026-10-05T18:30:00.000Z");

function veterinaryHtml() {
  const structured = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "VeterinaryCare",
    "@id": SOURCE_URL,
    name: NAME,
    url: SOURCE_URL,
    telephone: "+421903111222",
    email: "direct-e2e@happyvet.example",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Mostná 12",
      postalCode: "949 01",
      addressLocality: "Nitra",
      addressRegion: "Nitriansky kraj",
      addressCountry: "SK",
    },
  });
  return "<!doctype html><html><head><script type=\"application/ld+json\">"
    + structured
    + "</script></head><body><h1>"
    + NAME
    + "</h1></body></html>";
}

function fetchFor(url, html) {
  return async (input) => {
    const value = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
    const parsed = new URL(value);
    if (parsed.pathname === "/robots.txt") {
      return new Response("", { status: 404, headers: { "content-type": "text/plain" } });
    }
    assert.equal(parsed.origin + "/", url);
    return new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
}

test("DIRECT_ENTITY local D1 accepts corroborated first-party DIRECTORY, is idempotent, and rejects weak fallback/refresh label", async (t) => {
  const proxy = await getPlatformProxy({
    configPath: "dist/server/wrangler.json",
    persist: { path: ".wrangler/state/v3" },
  });
  t.after(async () => {
    await proxy.dispose();
  });

  const db = proxy.env.DB;
  assert.ok(db?.prepare, "local D1 DB binding must be available");

  const first = await ingestDirectEntityUrl({
    entityType: "DIRECTORY",
    sourceUrl: SOURCE_URL,
    label: "DIRECT first-party fixture",
    directoryCategory: "veterinari",
    database: db,
    fetchImpl: fetchFor(SOURCE_URL, veterinaryHtml()),
    now: NOW,
  });

  assert.equal(first.newEntities, 1);
  assert.equal(first.possibleDuplicates, 0);
  assert.equal(first.updateSuggestions, 0);
  assert.equal(first.canonicalEntityIds.length, 1);

  const canonicalId = first.canonicalEntityIds[0];
  const canonical = await db.prepare(
    "SELECT id,status,name,category,city,street,house_number,website_url FROM directory_profiles WHERE id=? LIMIT 1",
  ).bind(canonicalId).first();
  assert.equal(canonical?.status, "draft");
  assert.equal(canonical?.name, NAME);
  assert.equal(canonical?.category, "veterinari");
  assert.equal(canonical?.city, "Nitra");
  assert.equal(canonical?.street, "Mostná");
  assert.equal(canonical?.house_number, "12");
  assert.equal(canonical?.website_url, SOURCE_URL);

  const provenance = await db.prepare(
    "SELECT external_source_url,external_record_id,provenance_type FROM canonical_external_provenance WHERE entity_type='DIRECTORY' AND canonical_entity_id=?",
  ).bind(canonicalId).all();
  assert.equal(provenance.results.length, 1);
  assert.equal(provenance.results[0].external_source_url, SOURCE_URL);
  assert.match(String(provenance.results[0].external_record_id), /^url:/);

  const second = await ingestDirectEntityUrl({
    entityType: "DIRECTORY",
    sourceUrl: SOURCE_URL,
    label: "DIRECT repeated first-party fixture",
    directoryCategory: "veterinari",
    database: db,
    fetchImpl: fetchFor(SOURCE_URL, veterinaryHtml()),
    now: new Date("2026-10-05T18:31:00.000Z"),
  });

  assert.equal(second.newEntities, 0);
  assert.equal(second.possibleDuplicates, 0);
  assert.equal(second.existingCanonicalMatches, 1);
  assert.deepEqual(second.canonicalEntityIds, [canonicalId]);

  const canonicalCount = await db.prepare(
    "SELECT COUNT(*) AS count FROM directory_profiles WHERE name=?",
  ).bind(NAME).first();
  const provenanceCount = await db.prepare(
    "SELECT COUNT(*) AS count FROM canonical_external_provenance WHERE entity_type='DIRECTORY' AND canonical_entity_id=?",
  ).bind(canonicalId).first();
  assert.equal(Number(canonicalCount?.count ?? 0), 1);
  assert.equal(Number(provenanceCount?.count ?? 0), 1);

  const weak = await ingestDirectEntityUrl({
    entityType: "DIRECTORY",
    sourceUrl: WEAK_URL,
    label: "operational-discovery-label",
    searchCandidateTitle: WEAK_NAME,
    searchSnippet: "Veterinárna ambulancia v Nitre",
    directoryCategory: "veterinari",
    database: db,
    fetchImpl: fetchFor(WEAK_URL, "<html><body><p>generic page without explicit entity profile</p></body></html>"),
    now: new Date("2026-10-05T18:32:00.000Z"),
  });

  assert.equal(weak.newEntities, 0);
  assert.equal(weak.possibleDuplicates, 0);
  assert.equal(weak.existingCanonicalMatches, 0);
  assert.equal(weak.canonicalEntityIds.length, 0);

  const weakCanonical = await db.prepare(
    "SELECT COUNT(*) AS count FROM directory_profiles WHERE name=?",
  ).bind(WEAK_NAME).first();
  const weakProvenance = await db.prepare(
    "SELECT COUNT(*) AS count FROM canonical_external_provenance WHERE entity_type='DIRECTORY' AND external_source_url=?",
  ).bind(WEAK_URL).first();
  assert.equal(Number(weakCanonical?.count ?? 0), 0);
  assert.equal(Number(weakProvenance?.count ?? 0), 0);

  const refresh = await ingestDirectEntityUrl({
    entityType: "DIRECTORY",
    sourceUrl: WEAK_URL,
    label: "refresh:" + canonicalId,
    directoryCategory: "veterinari",
    database: db,
    fetchImpl: fetchFor(WEAK_URL, "<html><body><p>still no explicit profile</p></body></html>"),
    now: new Date("2026-10-05T18:33:00.000Z"),
    provenanceType: "DIRECT_ENTITY_REFRESH",
    expectedCanonicalEntityId: canonicalId,
  });

  assert.equal(refresh.fetchedRecords, 0);
  assert.equal(refresh.newEntities, 0);
  assert.equal(refresh.updateSuggestions, 0);

  const inventedRefreshName = await db.prepare(
    "SELECT COUNT(*) AS count FROM directory_profiles WHERE name=?",
  ).bind("refresh:" + canonicalId).first();
  assert.equal(Number(inventedRefreshName?.count ?? 0), 0);
});
