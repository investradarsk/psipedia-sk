import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPuppyCoverageMatrix,
  classifyPuppyCoverage,
  requirePuppyCoverageArticleRows,
} from "../lib/puppy-coverage.ts";

const AREA = {
  slug: "prve-dni",
  label: "Prvé dni doma",
  description: "Režim a pokojný začiatok.",
};

function article(overrides = {}) {
  return {
    id: 1,
    slug: "prvy-clanok",
    title: "Prvý článok",
    portalSubpage: AREA.slug,
    status: "draft",
    ...overrides,
  };
}

test("published-only puppy coverage is COVERED", () => {
  const rows = buildPuppyCoverageMatrix([AREA], [article({ status: "published" })]);
  assert.equal(rows[0].status, "COVERED");
  assert.equal(rows[0].publishedCount, 1);
  assert.equal(rows[0].draftCount, 0);
  assert.equal(rows[0].totalCount, 1);
});

test("draft-only puppy coverage is PARTIAL", () => {
  const rows = buildPuppyCoverageMatrix([AREA], [article({ status: "draft" })]);
  assert.equal(rows[0].status, "PARTIAL");
  assert.equal(rows[0].draftCount, 1);
  assert.equal(rows[0].publishedCount, 0);
});

test("scheduled-only puppy coverage remains PARTIAL until publication", () => {
  const rows = buildPuppyCoverageMatrix([AREA], [article({ status: "scheduled" })]);
  assert.equal(rows[0].status, "PARTIAL");
  assert.equal(rows[0].scheduledCount, 1);
});

test("area without relevant articles is MISSING", () => {
  const rows = buildPuppyCoverageMatrix([AREA], [article({ portalSubpage: "socializacia" })]);
  assert.equal(rows[0].status, "MISSING");
  assert.equal(rows[0].totalCount, 0);
});

test("multiple relevant articles are counted deterministically and any published article makes coverage COVERED", () => {
  const articles = [
    article({ id: 1, status: "published" }),
    article({ id: 2, slug: "draft", title: "Draft", status: "draft" }),
    article({ id: 3, slug: "scheduled", title: "Naplánované", status: "scheduled" }),
  ];
  const rows = buildPuppyCoverageMatrix([AREA], articles);
  assert.equal(rows[0].status, "COVERED");
  assert.deepEqual(
    {
      total: rows[0].totalCount,
      published: rows[0].publishedCount,
      draft: rows[0].draftCount,
      scheduled: rows[0].scheduledCount,
    },
    { total: 3, published: 1, draft: 1, scheduled: 1 },
  );
  assert.deepEqual(rows[0].articles.map((item) => item.id), [1, 2, 3]);
});

test("safe empty state produces an empty matrix and classifier handles no articles", () => {
  assert.deepEqual(buildPuppyCoverageMatrix([], []), []);
  assert.equal(classifyPuppyCoverage([]), "MISSING");
});

test("linked non-coverage subpages are excluded from the matrix", () => {
  const linkedArea = { ...AREA, slug: "external", href: "/niekam" };
  assert.deepEqual(buildPuppyCoverageMatrix([linkedArea], []), []);
});

test("article SELECT failure is fail-closed and cannot become false MISSING coverage", async () => {
  await assert.rejects(
    async () => {
      const rows = await requirePuppyCoverageArticleRows(
        Promise.reject(new Error("D1 read unavailable")),
      );
      return buildPuppyCoverageMatrix([AREA], rows);
    },
    /Puppy coverage article SELECT failed: D1 read unavailable/,
  );
});
