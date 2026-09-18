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

function location(overrides = {}) {
  return {
    id: 50,
    organization_id: 1,
    role: "UNSPECIFIED",
    label: "",
    address: "Neverejná 1",
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    country_code: "SK",
    is_primary: 1,
    sort_order: 0,
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


function fundraising(overrides = {}) {
  return {
    id: 200,
    organization_id: 1,
    type: "DONATION_PAGE",
    label: "Podporte nás",
    url: "https://example.org/donate",
    value: null,
    instructions: "Bezpečná verejná inštrukcia.",
    beneficiary_identity: "Citlivý príjemca",
    ownership: "ORGANIZATION_OWNED",
    sort_order: 0,
    is_active: 1,
    verification_status: "VERIFIED",
    verification_expires_at: "2030-01-01T00:00:00.000Z",
    valid_until: "2030-01-01T00:00:00.000Z",
    archived_at: null,
    verified_by: "internal@example.org",
    version: 7,
    ...overrides,
  };
}

function createDatabase({ organizations = [], locations = [], directories = [], adoptions = [], fundraisings = [] } = {}) {
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
          if (sql.includes("FROM organization_locations l")) {
            let rows = locations.filter((row) => row.organization_id === call.bindings[0]);
            if (sql.includes("ORDER BY l.sort_order ASC, l.id ASC")) {
              rows = [...rows].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
            }
            return { results: rows };
          }
          if (sql.includes("FROM organization_fundraising_methods f")) {
            let rows = fundraisings.filter((row) => row.organization_id === call.bindings[0]);
            if (sql.includes("ORDER BY f.sort_order ASC, f.id ASC")) {
              rows = [...rows].sort((left, right) => left.sort_order - right.sort_order || left.id - right.id);
            }
            return { results: rows };
          }
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
          throw new Error("organization public reads are read-only");
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

test("canonical rename and slug change need no legacy shelter row or fallback", async () => {
  const database = createDatabase({
    organizations: [organization({ id: 77, name: "Nový canonical názov", slug: "novy-canonical-slug" })],
    locations: [location({ organization_id: 77 })],
  });

  const current = await getPublicOrganizationBySlug("novy-canonical-slug", database);
  assert.equal(current?.id, 77);
  assert.equal(current?.name, "Nový canonical názov");
  assert.equal(current?.slug, "novy-canonical-slug");
  assert.equal(await getPublicOrganizationBySlug("historicky-legacy-slug", database), null);
  assert.ok(database.queries.every((query) => !/help_cases/i.test(query.sql)));
});

test("public model is an explicit allowlist and omits internal/provenance and street-address fields", async () => {
  const database = createDatabase({ organizations: [organization()], locations: [location()] });
  const result = await getPublicOrganizationBySlug("psia-nadej", database);
  assert.deepEqual(Object.keys(result).sort(), [
    "city", "countryCode", "description", "directory", "district", "facebookUrl", "id", "imageUrl",
    "instagramUrl", "lastVerifiedAt", "legalName", "locations", "name", "publicEmail", "publicPhone", "publishedAt",
    "region", "registrationNumber", "shortDescription", "slug", "sourceUrl", "type", "updatedAt", "websiteUrl",
  ].sort());
  for (const forbidden of ["importKey", "sourceDataJson", "createdBy", "updatedBy", "imageKey", "address"]) {
    assert.equal(Object.hasOwn(result, forbidden), false, forbidden);
  }
  assert.deepEqual(Object.keys(result.locations[0]).sort(), [
    "city", "countryCode", "district", "id", "isPrimary", "label", "organizationId", "region", "role", "sortOrder",
  ].sort());
  assert.equal(Object.hasOwn(result.locations[0], "address"), false);
  assert.doesNotMatch(storeSource, /source_data_json|import_key|created_by|updated_by|image_key/);
});

test("child locations are deterministic and primary child drives legacy public location fields", async () => {
  const database = createDatabase({
    organizations: [organization({ city: "Legacy mesto", district: "Legacy okres", region: "Legacy kraj" })],
    locations: [
      location({ id: 62, role: "SITE", label: "Pobočka", city: "Druhé mesto", sort_order: 20, is_primary: 0 }),
      location({ id: 61, role: "SERVICE_AREA", label: "Pôsobnosť", city: "Primárne mesto", district: "Nový okres", region: "Nový kraj", sort_order: 10, is_primary: 1 }),
    ],
  });
  const result = await getPublicOrganizationBySlug("psia-nadej", database);
  assert.deepEqual(result?.locations.map((item) => item.id), [61, 62]);
  assert.equal(result?.locations[0].role, "SERVICE_AREA");
  assert.equal(result?.city, "Primárne mesto");
  assert.equal(result?.district, "Nový okres");
  assert.equal(result?.region, "Nový kraj");
});

test("legacy parent location is synthesized only when child rows do not exist", async () => {
  const database = createDatabase({ organizations: [organization()] });
  const result = await getPublicOrganizationBySlug("psia-nadej", database);
  assert.deepEqual(result?.locations, [{
    id: null,
    organizationId: 1,
    role: "UNSPECIFIED",
    label: "",
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    countryCode: "SK",
    isPrimary: true,
    sortOrder: 0,
  }]);
  assert.equal(result?.city, "Nitra");
});

test("ORG-1 composition uses organization.id and includes only ACTIVE/RESERVED", async () => {
  const database = createDatabase({
    organizations: [organization({ id: 7, slug: "canonical-org" })],
    locations: [location({ organization_id: 7 })],
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

test("composition adds only eligible fundraising methods through the canonical trust contract", async () => {
  const database = createDatabase({
    organizations: [organization({ id: 7, slug: "canonical-org" })],
    fundraisings: [
      fundraising({ id: 201, organization_id: 7, sort_order: 10, label: "Neskôr" }),
      fundraising({
        id: 202,
        organization_id: 7,
        type: "BANK_TRANSFER",
        label: "Účet",
        url: null,
        value: "GB82WEST12345698765432",
        sort_order: 0,
      }),
      fundraising({ id: 203, organization_id: 7, label: "Neaktívne", sort_order: 1, is_active: 0 }),
      fundraising({ id: 204, organization_id: 7, label: "Rejected", sort_order: 2, verification_status: "REJECTED" }),
      fundraising({
        id: 205,
        organization_id: 7,
        label: "Expirované",
        sort_order: 3,
        verification_expires_at: "2020-01-01T00:00:00.000Z",
      }),
    ],
  });

  const result = await getPublicOrganizationCompositionBySlug("canonical-org", database);
  assert.deepEqual(result?.fundraisingMethods.map((item) => item.id), [202, 201]);
  assert.deepEqual(Object.keys(result?.fundraisingMethods[0] ?? {}).sort(), [
    "id", "instructions", "label", "sortOrder", "type", "url", "value",
  ].sort());
  const serialized = JSON.stringify(result?.fundraisingMethods);
  assert.doesNotMatch(serialized, /Citlivý príjemca|internal@example\.org|beneficiary|verifiedBy|version/i);

  const fundraisingQuery = database.queries.find((query) => query.sql.includes("FROM organization_fundraising_methods f"));
  assert.deepEqual(fundraisingQuery?.bindings, [7]);
  assert.doesNotMatch(fundraisingQuery?.sql ?? "", /beneficiary_identity|verified_by|verification_source_url|version/i);
});

test("Directory relation is optional, exact by directory_profile_id, and public-safe", async () => {
  const noRelationDb = createDatabase({ organizations: [organization({ directory_profile_id: null })] });
  const noRelation = await getPublicOrganizationBySlug("psia-nadej", noRelationDb);
  assert.equal(noRelation?.directory, null);
  assert.equal(noRelationDb.queries.length, 2, "organization + one location query");

  const publishedDb = createDatabase({
    organizations: [organization({ directory_profile_id: 10 })],
    locations: [location()],
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
  const directoryQuery = publishedDb.queries.find((query) => query.sql.includes("FROM directory_profiles p"));
  assert.deepEqual(directoryQuery?.bindings, [10]);

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
    locations: Array.from({ length: 20 }, (_, index) => location({ id: index + 1, organization_id: 7, sort_order: index })),
    adoptions: Array.from({ length: 20 }, (_, index) => adoption({ id: index + 1, organization_id: 7 })),
  });
  const first = await getPublicOrganizationCompositionBySlug("psia-nadej", withoutDirectory);
  assert.equal(first?.adoptions.length, 20);
  assert.equal(first?.organization.locations.length, 20);
  assert.equal(withoutDirectory.queries.length, 4, "organization + location + adoption + fundraising queries");

  const withDirectory = createDatabase({
    organizations: [organization({ id: 7, directory_profile_id: 10 })],
    locations: Array.from({ length: 20 }, (_, index) => location({ id: index + 1, organization_id: 7, sort_order: index })),
    directories: [directory()],
    adoptions: Array.from({ length: 20 }, (_, index) => adoption({ id: index + 1, organization_id: 7 })),
  });
  const second = await getPublicOrganizationCompositionBySlug("psia-nadej", withDirectory);
  assert.equal(second?.adoptions.length, 20);
  assert.equal(second?.organization.locations.length, 20);
  assert.equal(withDirectory.queries.length, 5, "organization + location + adoption + Directory + fundraising queries");
});

test("legacy and fuzzy organization identity fallback paths remain absent", () => {
  assert.doesNotMatch(storeSource, /help_cases/i);
  assert.doesNotMatch(storeSource, /\bLIKE\b|lower\s*\(|normalize|similarity|organization_name\s*=|organization_slug\s*=/i);
  assert.match(storeSource, /WHERE o\.slug = \? AND \$\{PUBLIC_ORGANIZATION_PREDICATE\}/);
  assert.match(storeSource, /listPublicAdoptionsByOrganizationId\(Number\(row\.id\), database\)/);
});
