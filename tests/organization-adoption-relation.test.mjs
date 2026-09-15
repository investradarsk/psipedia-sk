import assert from "node:assert/strict";
import test from "node:test";
import {
  ORGANIZATION_PUBLIC_ADOPTIONS_ORDER,
  buildOrganizationPublicAdoptionsQuery,
  listPublicAdoptionsByOrganizationId,
} from "../lib/organization-adoption-store.ts";

const rows = [
  {
    id: 101, name: "Asta", slug: "asta", status: "ACTIVE", organization_id: 10,
    organization_name: "Rovnaké OZ", organization_slug: "historicky-slug", city: "Nitra", main_image: null,
    published_at: "2026-09-15T12:00:00.000Z", updated_at: "2026-09-15T12:00:00.000Z",
  },
  {
    id: 102, name: "Bady", slug: "bady", status: "RESERVED", organization_id: 10,
    organization_name: "Starý názov snapshotu", organization_slug: "stary-slug", city: "Nitra", main_image: null,
    published_at: "2026-09-14T12:00:00.000Z", updated_at: "2026-09-15T13:00:00.000Z",
  },
  {
    id: 103, name: "Ciro", slug: "ciro", status: "ACTIVE", organization_id: 20,
    organization_name: "Rovnaké OZ", organization_slug: "historicky-slug", city: "Nitra", main_image: null,
    published_at: "2026-09-16T12:00:00.000Z", updated_at: "2026-09-16T12:00:00.000Z",
  },
  {
    id: 104, name: "Dina", slug: "dina", status: "ACTIVE", organization_id: null,
    organization_name: "Rovnaké OZ", organization_slug: "historicky-slug", city: "Nitra", main_image: null,
    published_at: "2026-09-17T12:00:00.000Z", updated_at: "2026-09-17T12:00:00.000Z",
  },
  {
    id: 105, name: "Edo", slug: "edo", status: "DRAFT", organization_id: 10,
    organization_name: "Rovnaké OZ", organization_slug: "historicky-slug", city: "Nitra", main_image: null,
    published_at: null, updated_at: "2026-09-18T12:00:00.000Z",
  },
  {
    id: 106, name: "Fido", slug: "fido", status: "ADOPTED", organization_id: 10,
    organization_name: "Rovnaké OZ", organization_slug: "historicky-slug", city: "Nitra", main_image: null,
    published_at: "2026-09-13T12:00:00.000Z", updated_at: "2026-09-18T12:00:00.000Z",
  },
  {
    id: 107, name: "Goro", slug: "goro", status: "ARCHIVED", organization_id: 10,
    organization_name: "Rovnaké OZ", organization_slug: "historicky-slug", city: "Nitra", main_image: null,
    published_at: "2026-09-12T12:00:00.000Z", updated_at: "2026-09-19T12:00:00.000Z",
  },
];

function relationDatabase(sourceRows = rows) {
  const prepared = [];
  const bound = [];
  return {
    prepared,
    bound,
    database: {
      prepare(sql) {
        prepared.push(sql);
        let bindings = [];
        const statement = {
          bind(...values) {
            bindings = values;
            bound.push(values);
            return statement;
          },
          async all() {
            const [organizationId, ...publicStatuses] = bindings;
            const results = sourceRows
              .filter((row) => row.organization_id === organizationId && publicStatuses.includes(row.status))
              .toSorted((left, right) => {
                const leftDate = left.published_at ?? left.updated_at;
                const rightDate = right.published_at ?? right.updated_at;
                return rightDate.localeCompare(leftDate) || right.id - left.id;
              });
            return { results };
          },
          async first() { return null; },
          async run() { return {}; },
        };
        return statement;
      },
    },
  };
}

test("organization relation uses only canonical organization_id and public lifecycle states", async () => {
  const fake = relationDatabase();
  const result = await listPublicAdoptionsByOrganizationId(10, fake.database);

  assert.deepEqual(result.map((dog) => [dog.id, dog.status]), [[101, "ACTIVE"], [102, "RESERVED"]]);
  assert.equal(fake.prepared.length, 1, "relation read must stay a single query, not N+1");
  assert.deepEqual(fake.bound, [[10, "ACTIVE", "RESERVED"]]);

  const sql = fake.prepared[0];
  const relationPredicate = sql.split("WHERE")[1].split("ORDER BY")[0];
  assert.match(relationPredicate, /d\.organization_id = \?/);
  assert.match(relationPredicate, /d\.status IN \(\?, \?\)/);
  assert.doesNotMatch(relationPredicate, /organization_name|organization_slug/i);
  assert.doesNotMatch(sql, /help_cases/i);
  assert.match(sql, new RegExp(ORGANIZATION_PUBLIC_ADOPTIONS_ORDER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("same snapshot identity on another organization and NULL organization_id never create a relation", async () => {
  const fake = relationDatabase();
  const result = await listPublicAdoptionsByOrganizationId(10, fake.database);
  assert.deepEqual(result.map((dog) => dog.id), [101, 102]);
  assert.ok(!result.some((dog) => dog.id === 103), "same organization_name/slug on organization 20 must not match");
  assert.ok(!result.some((dog) => dog.id === 104), "NULL organization_id must not match any organization");
});

test("changing organization snapshot name or slug does not change canonical relation identity", async () => {
  const changedSnapshots = rows.map((row) => row.id === 101
    ? { ...row, organization_name: "Úplne nový názov", organization_slug: "uplne-novy-slug" }
    : row.id === 102
      ? { ...row, organization_name: "Iný snapshot", organization_slug: null }
      : row);
  const fake = relationDatabase(changedSnapshots);
  const result = await listPublicAdoptionsByOrganizationId(10, fake.database);
  assert.deepEqual(result.map((dog) => dog.id), [101, 102]);
  assert.equal(result[0].organizationName, "Úplne nový názov");
  assert.equal(result[0].organizationSlug, "uplne-novy-slug");
});

test("non-public lifecycle records are excluded while ACTIVE and RESERVED remain public", async () => {
  const fake = relationDatabase();
  const result = await listPublicAdoptionsByOrganizationId(10, fake.database);
  assert.deepEqual(new Set(result.map((dog) => dog.status)), new Set(["ACTIVE", "RESERVED"]));
  assert.ok(!result.some((dog) => ["DRAFT", "ADOPTED", "ARCHIVED"].includes(dog.status)));
});

test("invalid organization ids do not query the database", async () => {
  const fake = relationDatabase();
  assert.deepEqual(await listPublicAdoptionsByOrganizationId(0, fake.database), []);
  assert.deepEqual(await listPublicAdoptionsByOrganizationId(-1, fake.database), []);
  assert.deepEqual(await listPublicAdoptionsByOrganizationId(Number.NaN, fake.database), []);
  assert.equal(fake.prepared.length, 0);
  assert.equal(buildOrganizationPublicAdoptionsQuery(0), null);
});
