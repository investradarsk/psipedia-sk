import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CONTENT_RELATION_MAX_ITEMS,
  buildArticleRelatedBreedsQuery,
  buildDirectoryRelatedBreedsQuery,
  listRelatedBreedsForArticle,
  listRelatedBreedsForDirectoryProfile,
} from "../lib/content-relations.ts";
import {
  ORGANIZATION_PUBLIC_ADOPTIONS_LIMIT,
  buildOrganizationPublicAdoptionsQuery,
} from "../lib/organization-adoption-store.ts";

function oneQueryDatabase(rows = []) {
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
            return { results: rows };
          },
        };
        return statement;
      },
    },
  };
}

test("article -> breed reader uses only the explicit relation and canonical public breed winners", () => {
  const now = new Date("2026-09-30T00:00:00.000Z");
  const query = buildArticleRelatedBreedsQuery("explicit-article", now, 4);
  assert.ok(query);
  assert.deepEqual(query.bindings, ["explicit-article", now.toISOString(), 4]);
  assert.match(query.sql, /JOIN breed_article_relations r ON r\.article_id = a\.id/);
  assert.match(query.sql, /JOIN managed_breeds b ON b\.id = r\.breed_id/);
  assert.match(query.sql, /a\.status = 'published'/);
  assert.match(query.sql, /a\.status = 'scheduled'/);
  assert.match(query.sql, /a\.published_at <= \?/);
  assert.match(query.sql, /COALESCE\(a\.noindex, 0\) = 0/);
  assert.match(query.sql, /a\.canonical_url/);
  assert.match(query.sql, /https:\/\/psipedia\.sk/);
  assert.match(query.sql, /b\.id IN \(/);
  assert.match(query.sql, /status = 'published'/);
  assert.match(query.sql, /SELECT DISTINCT/);
  assert.match(query.sql, /ORDER BY b\.fci_group ASC, b\.name COLLATE NOCASE ASC, b\.id ASC/);
  assert.match(query.sql, /LIMIT \?/);
});

test("directory -> breed reader excludes archived, noindex and non-canonical source profiles", () => {
  const query = buildDirectoryRelatedBreedsQuery(42, 4);
  assert.ok(query);
  assert.deepEqual(query.bindings, [42, 4]);
  assert.match(query.sql, /JOIN breed_directory_relations r ON r\.profile_id = d\.id/);
  assert.match(query.sql, /d\.status = 'published'/);
  assert.match(query.sql, /d\.archived_at IS NULL/);
  assert.match(query.sql, /json_extract/);
  assert.match(query.sql, /\$\.noindex/);
  assert.match(query.sql, /\$\.canonicalUrl/);
  assert.match(query.sql, /'\/adresar\/' \|\| d\.category \|\| '\/' \|\| d\.slug/);
  assert.match(query.sql, /SELECT DISTINCT/);
  assert.match(query.sql, /LIMIT \?/);
});

test("relation limits are bounded before query execution", () => {
  assert.equal(buildArticleRelatedBreedsQuery("article", new Date("2026-09-30T00:00:00.000Z"), 999)?.limit, CONTENT_RELATION_MAX_ITEMS);
  assert.equal(buildDirectoryRelatedBreedsQuery(42, 999)?.limit, CONTENT_RELATION_MAX_ITEMS);
  const adoption = buildOrganizationPublicAdoptionsQuery(42, 999);
  assert.equal(adoption?.limit, ORGANIZATION_PUBLIC_ADOPTIONS_LIMIT);
  assert.equal(adoption?.bindings.at(-1), ORGANIZATION_PUBLIC_ADOPTIONS_LIMIT);
  assert.match(adoption?.sql ?? "", /LIMIT \?/);
});

test("readers execute one bounded query, preserve canonical hrefs and return empty results cleanly", async () => {
  const row = {
    id: 7,
    slug: "labradorsky-retriever",
    name: "Labradorský retriever",
    image_url: null,
    fci_group: 8,
  };
  const articleDb = oneQueryDatabase([row]);
  const articleResult = await listRelatedBreedsForArticle("article", {
    database: articleDb.database,
    now: new Date("2026-09-30T00:00:00.000Z"),
  });
  assert.equal(articleDb.prepared.length, 1, "article relation must not create N+1 queries");
  assert.deepEqual(articleResult, [{
    id: 7,
    slug: "labradorsky-retriever",
    name: "Labradorský retriever",
    href: "/plemena/labradorsky-retriever",
    imageUrl: null,
    fciGroup: 8,
  }]);

  const directoryDb = oneQueryDatabase([]);
  const directoryResult = await listRelatedBreedsForDirectoryProfile(42, { database: directoryDb.database });
  assert.equal(directoryDb.prepared.length, 1, "directory relation must not create N+1 queries");
  assert.deepEqual(directoryResult, []);
});

test("invalid relation identities never query", async () => {
  const fake = oneQueryDatabase([]);
  assert.deepEqual(await listRelatedBreedsForArticle("", { database: fake.database }), []);
  assert.deepEqual(await listRelatedBreedsForDirectoryProfile(0, { database: fake.database }), []);
  assert.equal(fake.prepared.length, 0);
});

test("breed relation implementation removes self links, duplicate canonical identities and heuristic FCI fallback", async () => {
  const source = await readFile(new URL("../lib/breed-store.ts", import.meta.url), "utf8");
  assert.match(source, /b\.id<>\?/);
  assert.match(source, /GROUP BY b\.id/);
  assert.match(source, /breed\.relatedBreedIds\.length/);
  assert.match(source, /WHERE 0=1 LIMIT 4/);
  assert.doesNotMatch(source, /fci_group=\? AND \(\?='' OR fci_section_number=\?\)/);
  assert.match(source, /publicArticleRelationTargetSql\("a"\)/);
  assert.match(source, /publicDirectoryRelationTargetSql\("d"\)/);
  assert.doesNotMatch(source, /ORDER BY d\.featured DESC/, "explicit related entities must not inherit promoted/featured ordering");
  assert.match(source, /ORDER BY d\.name COLLATE NOCASE ASC,d\.id ASC/);
});

test("empty related collections render no box and detail routes fail open on relation errors", async () => {
  const [component, legacyArticleRoute, portalRoute, directoryRoute, breedRoute, organizationStore] = await Promise.all([
    readFile(new URL("../components/related-entity-list.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/clanky/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/adresar/[category]/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/plemena/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/help-organization-store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /if \(!breeds\.length\) return null/);
  for (const source of [legacyArticleRoute, portalRoute, directoryRoute, breedRoute]) {
    assert.match(source, /relations read failed|related article metadata read failed/);
    assert.match(source, /return \[\]|similarBreeds: \[\]/);
  }
  assert.match(organizationStore, /Public organization adoption relations read failed/);
  assert.match(organizationStore, /return \[\]/);
});

test("public article sanitization and event presentation hygiene remain in canonical detail routes", async () => {
  const [legacyArticleRoute, portalRoute] = await Promise.all([
    readFile(new URL("../app/clanky/[slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(legacyArticleRoute, /sanitizePublicArticleContent\(storedArticle\)/);
  assert.match(portalRoute, /sanitizePublicArticleContent\(storedArticle\)/);
  assert.match(portalRoute, /buildPublicEventPresentation\(storedEvent\)/);
});

test("event organizer remains text-only until a canonical organizer relation exists", async () => {
  const [schema, eventStore] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/event-store.ts", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /organizer:\s*text\("organizer"\)/);
  assert.doesNotMatch(eventStore, /organizer_id|organization_id/i);
});

test("articles expose explicit breed relations without inventing heuristic directory or Help links", async () => {
  const [relations, articleDetail] = await Promise.all([
    readFile(new URL("../lib/content-relations.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/article-detail.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(relations, /JOIN breed_article_relations r ON r\.article_id = a\.id/);
  assert.match(articleDetail, /<RelatedBreedList breeds=\{relatedBreeds\}/);
  assert.doesNotMatch(relations, /article_directory_relations|article_help_relations/);
});
