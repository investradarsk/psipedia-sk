import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublishedOrganizationSitemapQuery,
  getPublicOrganizationCompositionBySlug,
  listPublishedOrganizationsForSitemap,
} from "../lib/help-organization-store.ts";
import {
  buildOrganizationSitemapEntries,
  isCanonicalOrganizationSlug,
} from "../lib/organization-sitemap.ts";

function row(overrides = {}) {
  return {
    id: 1,
    name: "Psia nádej",
    slug: "psia-nadej",
    legal_name: "Psia nádej, o.z.",
    registration_number: "12345678",
    type: "CIVIC_ASSOCIATION",
    status: "PUBLISHED",
    short_description: "Pomáhame psom.",
    description: "Bezpečný verejný opis.",
    public_email: null,
    public_phone: null,
    website_url: null,
    facebook_url: null,
    instagram_url: null,
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    country_code: "SK",
    image_url: null,
    source_url: null,
    published_at: "2026-09-01T10:00:00.000Z",
    last_verified_at: null,
    archived_at: null,
    updated_at: "2026-09-11T10:00:00.000Z",
    directory_profile_id: null,
    ...overrides,
  };
}

function createDatabase(rows = []) {
  return {
    prepare(sql) {
      const statement = {
        bindings: [],
        bind(...values) {
          statement.bindings = values;
          return statement;
        },
        async first() {
          if (!sql.includes("FROM help_organizations o")) throw new Error(`Unexpected first query: ${sql}`);
          let matches = rows.filter((item) => item.slug === statement.bindings[0]);
          if (sql.includes("o.status = 'PUBLISHED'")) matches = matches.filter((item) => item.status === "PUBLISHED");
          if (sql.includes("o.published_at IS NOT NULL")) matches = matches.filter((item) => item.published_at !== null);
          if (sql.includes("o.archived_at IS NULL")) matches = matches.filter((item) => item.archived_at === null);
          return matches[0] ?? null;
        },
        async all() {
          if (sql.includes("FROM help_organizations o")) {
            let matches = [...rows];
            if (sql.includes("o.status = 'PUBLISHED'")) matches = matches.filter((item) => item.status === "PUBLISHED");
            if (sql.includes("o.published_at IS NOT NULL")) matches = matches.filter((item) => item.published_at !== null);
            if (sql.includes("o.archived_at IS NULL")) matches = matches.filter((item) => item.archived_at === null);
            matches.sort((left, right) => left.slug.localeCompare(right.slug));
            return { results: matches };
          }
          if (sql.includes("FROM adoption_dogs d")) return { results: [] };
          throw new Error(`Unexpected all query: ${sql}`);
        },
        async run() {
          throw new Error("ORG-3D is read-only");
        },
      };
      return statement;
    },
  };
}

test("organization sitemap query reuses the fail-closed public lifecycle contract", async () => {
  const query = buildPublishedOrganizationSitemapQuery();
  assert.match(query, /o\.status = 'PUBLISHED'/);
  assert.match(query, /o\.published_at IS NOT NULL/);
  assert.match(query, /o\.archived_at IS NULL/);
  assert.doesNotMatch(query, /UPDATE|INSERT|DELETE/i);

  const database = createDatabase([
    row({ slug: "published" }),
    row({ slug: "draft", status: "DRAFT" }),
    row({ slug: "archived", status: "ARCHIVED" }),
    row({ slug: "published-but-archived", archived_at: "2026-09-12T00:00:00.000Z" }),
    row({ slug: "unpublished", published_at: null }),
  ]);
  assert.deepEqual(
    (await listPublishedOrganizationsForSitemap(database)).map((item) => item.slug),
    ["published"],
  );
});

test("organization sitemap includes canonical published slugs, deterministic persisted dates and no duplicates", () => {
  const items = [
    { slug: "psia-nadej", publishedAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-11T10:00:00.000Z" },
    { slug: "psia-nadej", publishedAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-11T10:00:00.000Z" },
    { slug: "druha-organizacia", publishedAt: "2026-09-12T10:00:00.000Z", updatedAt: "2026-09-10T10:00:00.000Z" },
  ];
  const entries = buildOrganizationSitemapEntries(items);

  assert.deepEqual(entries.map((entry) => entry.url), [
    "https://psipedia.sk/organizacie/psia-nadej",
    "https://psipedia.sk/organizacie/druha-organizacia",
  ]);
  assert.equal(entries[0].lastModified?.toISOString(), "2026-09-11T10:00:00.000Z");
  assert.equal(entries[1].lastModified?.toISOString(), "2026-09-12T10:00:00.000Z");
});

test("invalid or noncanonical organization slugs and invalid persisted dates are excluded", () => {
  for (const slug of ["", " Psia-nadej", "Psia-nadej", "psia--nadej", "psia_nadej", "psia/nadej", "život-je-pes"]) {
    assert.equal(isCanonicalOrganizationSlug(slug), false, slug);
  }
  assert.equal(isCanonicalOrganizationSlug("zivot-je-pes"), true);
  assert.deepEqual(buildOrganizationSitemapEntries([
    { slug: "bad slug", publishedAt: "2026-09-01T10:00:00.000Z", updatedAt: "2026-09-11T10:00:00.000Z" },
    { slug: "valid-slug", publishedAt: "not-a-date", updatedAt: "also-bad" },
  ]), []);
});

test("zero-adoption published organization remains a valid public composition", async () => {
  const database = createDatabase([row({ slug: "zero-adoptions" })]);
  const composition = await getPublicOrganizationCompositionBySlug("zero-adoptions", database);
  assert.equal(composition?.organization.slug, "zero-adoptions");
  assert.deepEqual(composition?.adoptions, []);
});
