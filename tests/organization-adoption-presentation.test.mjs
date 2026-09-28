import assert from "node:assert/strict";
import test from "node:test";

import { getPublicOrganizationCompositionBySlug } from "../lib/help-organization-store.ts";

function organization(overrides = {}) {
  return {
    id: 7,
    name: "Psia nádej",
    slug: "psia-nadej",
    legal_name: "Psia nádej, o.z.",
    registration_number: null,
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
    published_at: "2026-09-16T10:00:00.000Z",
    last_verified_at: null,
    archived_at: null,
    updated_at: "2026-09-16T10:00:00.000Z",
    directory_profile_id: null,
    ...overrides,
  };
}

function adoption(overrides = {}) {
  return {
    id: 100,
    name: "Ben",
    slug: "ben",
    status: "ACTIVE",
    organization_id: 7,
    organization_name: "Historický snapshot názvu",
    organization_slug: "historicky-snapshot-slug",
    city: "",
    main_image: null,
    published_at: "2026-09-16T10:05:00.000Z",
    updated_at: "2026-09-16T10:05:00.000Z",
    ...overrides,
  };
}

function createDatabase({ organizations = [], locations = [], adoptions = [] } = {}) {
  const queries = [];
  return {
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
          if (!sql.includes("FROM help_organizations o")) {
            throw new Error(`Unexpected first() query: ${sql}`);
          }
          return organizations.find((row) =>
            row.slug === call.bindings[0]
            && row.status === "PUBLISHED"
            && row.published_at !== null
            && row.archived_at === null
          ) ?? null;
        },
        async all() {
          if (sql.includes("FROM organization_locations l")) {
            const [organizationId] = call.bindings;
            const results = locations
              .filter((row) => row.organization_id === organizationId)
              .toSorted((left, right) => left.sort_order - right.sort_order || left.id - right.id);
            return { results };
          }
          if (sql.includes("FROM organization_fundraising_methods f")) {
            return { results: [] };
          }
          if (!sql.includes("FROM adoption_dogs d")) {
            throw new Error(`Unexpected all() query: ${sql}`);
          }
          const [organizationId, ...statuses] = call.bindings;
          const results = adoptions
            .filter((row) => row.organization_id === organizationId && statuses.includes(row.status))
            .toSorted((left, right) => {
              const leftDate = left.published_at ?? left.updated_at;
              const rightDate = right.published_at ?? right.updated_at;
              return rightDate.localeCompare(leftDate) || right.id - left.id;
            });
          return { results };
        },
      };
      return statement;
    },
  };
}

test("published organization exposes only its explicit public adoptions and keeps optional presentation fields optional", async () => {
  const database = createDatabase({
    organizations: [organization()],
    adoptions: [
      adoption({ id: 101, name: "Luna", slug: "luna", status: "RESERVED", city: "", main_image: null, published_at: "2026-09-16T10:06:00.000Z" }),
      adoption({ id: 102, name: "Ben", slug: "ben", status: "ACTIVE", city: "Nitra", main_image: "/media/ben.webp" }),
      adoption({ id: 103, name: "Draft", slug: "draft", status: "DRAFT" }),
      adoption({ id: 104, name: "Cudzí", slug: "cudzi", status: "ACTIVE", organization_id: 99 }),
    ],
  });

  const composition = await getPublicOrganizationCompositionBySlug("psia-nadej", database);

  assert.ok(composition);
  assert.deepEqual(composition.adoptions.map((item) => [item.id, item.status]), [
    [101, "RESERVED"],
    [102, "ACTIVE"],
  ]);
  assert.equal(composition.adoptions[0].city, "");
  assert.equal(composition.adoptions[0].mainImage, null);
  assert.equal(database.queries.filter((query) => query.sql.includes("FROM adoption_dogs d")).length, 1);
  assert.equal(database.queries.filter((query) => query.sql.includes("FROM organization_locations l")).length, 1);
});

test("published organization with zero public adoptions remains a valid composition", async () => {
  const database = createDatabase({ organizations: [organization()], adoptions: [] });
  const composition = await getPublicOrganizationCompositionBySlug("psia-nadej", database);

  assert.ok(composition);
  assert.deepEqual(composition.adoptions, []);
  assert.equal(database.queries.length, 4, "organization read plus bounded location, adoption and fundraising relation reads");
});

test("draft, archived and unknown organizations fail closed before any adoption relation read", async () => {
  for (const [slug, row] of [
    ["draft-org", organization({ slug: "draft-org", status: "DRAFT", published_at: null })],
    ["archived-org", organization({ slug: "archived-org", status: "ARCHIVED", archived_at: "2026-09-16T11:00:00.000Z" })],
    ["unknown-org", null],
  ]) {
    const database = createDatabase({
      organizations: row ? [row] : [organization()],
      adoptions: [adoption({ organization_id: row?.id ?? 7 })],
    });
    assert.equal(await getPublicOrganizationCompositionBySlug(slug, database), null, slug);
    assert.equal(
      database.queries.some((query) => query.sql.includes("FROM adoption_dogs d")),
      false,
      `${slug} must not reach adoption relation reads`,
    );
    assert.equal(
      database.queries.some((query) => query.sql.includes("FROM organization_locations l")),
      false,
      `${slug} must not reach location relation reads`,
    );
    assert.equal(
      database.queries.some((query) => query.sql.includes("FROM organization_fundraising_methods f")),
      false,
      `${slug} must not reach fundraising relation reads`,
    );
  }
});
