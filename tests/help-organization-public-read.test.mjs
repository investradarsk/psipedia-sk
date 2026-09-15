import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getPublicOrganizationBySlug,
  getPublicOrganizationCompositionBySlug,
} from "../lib/help-organization-store.ts";

const storeSource = readFileSync(new URL("../lib/help-organization-store.ts", import.meta.url), "utf8");

function organization(overrides = {}) {
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
    public_email: "info@example.sk",
    public_phone: "+421900000000",
    website_url: "https://example.sk",
    facebook_url: "https://facebook.com/example",
    instagram_url: "https://instagram.com/example",
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    country_code: "SK",
    image_url: "https://example.sk/image.jpg",
    source_url: "https://example.sk/source",
    published_at: "2026-09-01T10:00:00.000Z",
    last_verified_at: "2026-09-10T10:00:00.000Z",
    archived_at: null,
    updated_at: "2026-09-11T10:00:00.000Z",
    directory_profile_id: null,
    import_key: "secret-import-key",
    source_data_json: '{"raw":"private provenance"}',
    created_by: "internal@example.sk",
    updated_by: "editor@example.sk",
    image_key: "private/object-key",
    ...overrides,
  };
}

function directory(overrides = {}) {
  return {
    id: 10,
    name: "Psia nádej",
    slug: "psia-nadej-directory",
    category: "UTULOK",
    status: "published",
    archived_at: null,
    internal_email: "internal-directory@example.sk",
    ...overrides,
  };
}

function adoption(overrides = {}) {
  return {
    id: 100,
    name: "Ben",
    slug: "ben",
    status: "ACTIVE",
    organization_id: 1,
    organization_name: "Psia nádej",
    organization_slug: "old-snapshot-slug",
    city: "Nitra",
    main_image: null,
    published_at: "2026-09-12T10:00:00.000Z",
    updated_at: "2026-09-12T10:00:00.000Z",
    ...overrides,
  };
}

function createDatabase({ organizations = [], directories = [], adoptions = [] } = {}) {
  const queries = [];
  const database = {
    queries,
    prepare(sql) {
      const call = { sql, bindings: [] };
      queries.push(call);
      const statement = {
        bind(...values) {
          call.bindings = values;
          return statement;
        },
        async first() {
          if (sql.includes("FROM help_organizations o")) {
            let rows = organizations.filter((row) => row.slug === call.bindings[0]);
            if (sql.includes("o.status = 'PUBLISHED'")) rows = rows.filter((row) => row.status === "PUBLISHED");
            if (sql.includes("o.published_at IS NOT NULL")) rows = rows.filter((row) => row.published_at !== null);
            if (sql.includes("o.archived_at IS NULL")) rows = rows.filter((row) => row.archived_at === null);
            return rows[0] ?? null;
          }
          if (sql.includes("FROM directory_profiles p")) {
            let rows = directories.filter((row) => row.id === call.bindings[0]);
            if (sql.includes("p.status = 'published'")) rows = rows.filter((row) => row.status === "published");
            if (sql.includes("p.archived_at IS NULL")) rows = rows.filter((row) => row.archived_at === null);
            return rows[0] ?? null;
          }
          throw new Error(`Unexpected first() query: ${sql}`);
        },
        async all() {
          if (!sql.includes("FROM adoption_dogs d")) throw new Error(`Unexpected all() query: ${sql}`);
          const [organizationId, ...statuses] = call.bindings;
          let rows = adoptions;
          if (sql.includes("d.organization_id = ?")) {
            rows = rows.filter((row) => row.organization_id === organizationId);
          }
          if (sql.includes("d.status IN")) {
            rows = rows.filter((row) => statuses.includes(row.status));
          }
          if (sql.includes("COALESCE(d.published_at, d.updated_at) DESC, d.id DESC")) {
            rows = [...rows].sort((left, right) => {
              const leftDate = left.published_at ?? left.updated_at;
              const rightDate = right.published_at ?? right.updated_at;
              return rightDate.localeCompare(leftDate) || right.id - left.id;
            });
          }
          return { results: rows };
        },
        async run() {
          throw new Error("ORG-3A is read-only");
        },
      };
      return statement;
    },
  };
  return database;
}

test("public lifecycle predicate returns only consistent published organizations", async () => {
  const cases = [
    ["valid published", organization(), true],
    ["draft", organization({ status: "DRAFT" }), false],
    ["archived status", organization({ status: "ARCHIVED" }), false],
    ["published without published_at", organization({ published_at: null }), false],
    ["published but archived_at set", organization({ archived_at: "2026-09-14T10:00:00.000Z" }), false],
  ];
  for (const [label, row, expected] of cases) {
    const database = createDatabase({ organizations: [row] });
    const result = await getPublicOrganizationBySlug(row.slug, database);
    assert.equal(Boolean(result), expected, label);
  }

  const unknownDatabase = createDatabase({ organizations: [organization()] });
  assert.equal(await getPublicOrganizationBySlug("unknown-slug", unknownDatabase), null);
});

test("slug lookup is exact and canonical identity remains numeric organization.id", async () => {
  const database = createDatabase({
    organizations: [
      organization({ id: 7, name: "Rovnaký názov", slug: "alpha-rescue" }),
      organization({ id: 8, name: "Rovnaký názov", slug: "alpha-rescue-east" }),
    ],
  });
  assert.equal(await getPublicOrganizationBySlug("alpha", database), null);
  const exact = await getPublicOrganizationBySlug("alpha-rescue-east", database);
  assert.equal(exact?.id, 8);
  assert.equal(database.queries[1].bindings[0], "alpha-rescue-east");
});

test("public model is an explicit allowlist and omits internal/provenance fields", async () => {
  const database = createDatabase({ organizations: [organization()] });
  const result = await getPublicOrganizationBySlug("psia-nadej", database);
  assert.deepEqual(Object.keys(result).sort(), [
    "city", "countryCode", "description", "directory", "district", "facebookUrl", "id", "imageUrl",
    "instagramUrl", "lastVerifiedAt", "legalName", "name", "publicEmail", "publicPhone", "publishedAt",
    "region", "registrationNumber", "shortDescription", "slug", "sourceUrl", "type", "updatedAt", "websiteUrl",
  ].sort());
  for (const forbidden of ["importKey", "sourceDataJson", "createdBy", "updatedBy", "imageKey"]) {
    assert.equal(Object.hasOwn(result, forbidden), false, forbidden);
  }
  assert.doesNotMatch(storeSource, /source_data_json|import_key|created_by|updated_by|image_key/);
});

test("ORG-1 composition uses organization.id and includes only ACTIVE/RESERVED", async () => {
  const database = createDatabase({
    organizations: [organization({ id: 7, slug: "canonical-org" })],
    adoptions: [
      adoption({ id: 1, status: "ACTIVE", organization_id: 7, organization_name: "Wrong snapshot", organization_slug: "wrong" }),
      adoption({ id: 2, status: "RESERVED", organization_id: 7 }),
      adoption({ id: 3, status: "DRAFT", organization_id: 7 }),
      adoption({ id: 4, status: "ADOPTED", organization_id: 7 }),
      adoption({ id: 5, status: "ARCHIVED", organization_id: 7 }),
      adoption({ id: 6, status: "ACTIVE", organization_id: 99, organization_name: "Psia nádej", organization_slug: "canonical-org" }),
      adoption({ id: 7, status: "ACTIVE", organization_id: null, organization_name: "Psia nádej", organization_slug: "canonical-org" }),
    ],
  });
  const result = await getPublicOrganizationCompositionBySlug("canonical-org", database);
  assert.deepEqual(result?.adoptions.map((item) => item.id), [2, 1]);
  const adoptionQuery = database.queries.find((query) => query.sql.includes("FROM adoption_dogs d"));
  assert.deepEqual(adoptionQuery?.bindings, [7, "ACTIVE", "RESERVED"]);
  assert.match(adoptionQuery?.sql ?? "", /d\.organization_id = \?/);
  assert.doesNotMatch(adoptionQuery?.sql ?? "", /organization_name\s*=|organization_slug\s*=/);
});

test("Directory relation is optional, exact by directory_profile_id, and public-safe", async () => {
  const noRelationDb = createDatabase({ organizations: [organization({ directory_profile_id: null })] });
  const noRelation = await getPublicOrganizationBySlug("psia-nadej", noRelationDb);
  assert.equal(noRelation?.directory, null);
  assert.equal(noRelationDb.queries.length, 1);

  const publishedDb = createDatabase({
    organizations: [organization({ directory_profile_id: 10 })],
    directories: [directory()],
  });
  const published = await getPublicOrganizationBySlug("psia-nadej", publishedDb);
  assert.deepEqual(published?.directory, {
    id: 10,
    name: "Psia nádej",
    slug: "psia-nadej-directory",
    category: "UTULOK",
  });
  assert.equal(Object.hasOwn(published.directory, "internalEmail"), false);
  assert.equal(Object.hasOwn(published.directory, "internal_email"), false);
  assert.deepEqual(publishedDb.queries[1].bindings, [10]);

  const draftDb = createDatabase({
    organizations: [organization({ directory_profile_id: 10 })],
    directories: [directory({ status: "draft" })],
  });
  assert.equal((await getPublicOrganizationBySlug("psia-nadej", draftDb))?.directory, null);

  const archivedDb = createDatabase({
    organizations: [organization({ directory_profile_id: 10 })],
    directories: [directory({ archived_at: "2026-09-01T00:00:00.000Z" })],
  });
  assert.equal((await getPublicOrganizationBySlug("psia-nadej", archivedDb))?.directory, null);

  const missingDb = createDatabase({ organizations: [organization({ directory_profile_id: 404 })] });
  assert.equal((await getPublicOrganizationBySlug("psia-nadej", missingDb))?.directory, null);
});

test("composition has fixed query count and no N+1", async () => {
  const withoutDirectory = createDatabase({
    organizations: [organization({ id: 7, directory_profile_id: null })],
    adoptions: Array.from({ length: 20 }, (_, index) => adoption({ id: index + 1, organization_id: 7 })),
  });
  const first = await getPublicOrganizationCompositionBySlug("psia-nadej", withoutDirectory);
  assert.equal(first?.adoptions.length, 20);
  assert.equal(withoutDirectory.queries.length, 2, "organization + one adoption list query");

  const withDirectory = createDatabase({
    organizations: [organization({ id: 7, directory_profile_id: 10 })],
    directories: [directory()],
    adoptions: Array.from({ length: 20 }, (_, index) => adoption({ id: index + 1, organization_id: 7 })),
  });
  const second = await getPublicOrganizationCompositionBySlug("psia-nadej", withDirectory);
  assert.equal(second?.adoptions.length, 20);
  assert.equal(withDirectory.queries.length, 3, "organization + one adoption list + one Directory query");
});

test("legacy and fuzzy fallback paths are absent", () => {
  assert.doesNotMatch(storeSource, /help_cases/i);
  assert.doesNotMatch(storeSource, /\bLIKE\b|lower\s*\(|normalize|similarity|organization_name\s*=|organization_slug\s*=/i);
  assert.match(storeSource, /WHERE o\.slug = \? AND \$\{PUBLIC_ORGANIZATION_PREDICATE\}/);
  assert.match(storeSource, /listPublicAdoptionsByOrganizationId\(Number\(row\.id\), database\)/);
});
