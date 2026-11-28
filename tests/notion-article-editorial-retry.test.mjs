import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

function rich(value) {
  return value ? [{ type: "text", plain_text: value, text: { content: value } }] : [];
}
function node(id, type, value) {
  return { id, type, has_children: false, [type]: { rich_text: rich(value) } };
}
function fingerprint(block) {
  const records = block[block.type]?.rich_text ?? [];
  return JSON.stringify({ type: block.type, value: records.map(x => x.plain_text ?? x.text?.content ?? "").join("") });
}
function setup({ enabled = true, inactiveAtRead = null } = {}) {
  const pageId = "f2222222-2222-4222-8222-222222222222";
  const notion = {
    id: pageId,
    properties: {
      "Stav": { select: { name: "Ready" } },
      "Odoslať na Psipedia": { checkbox: true },
      "Psipedia ID": { rich_text: rich("123") },
      "Názov": { title: rich("Základný titul") },
      "Slug": { rich_text: rich("zakladny-titul") },
      "Kategória": { select: { name: "Výživa" } },
      "SEO title": { rich_text: rich("Old SEO") },
      "Meta description": { rich_text: rich("Toto je opis článku pre SEO výsledky.") },
      "Hlavné kľúčové slovo": { rich_text: rich("krmivo") },
      "Hlavný obrázok URL": { url: null },
      "Alt text obrázka": { rich_text: [] },
      "Zdroj obrázka": { url: null },
    },
  };
  const blocks = [
    node("intro", "paragraph", "Toto je veľmi dlhý úvod článku, ktorý obsahuje základné údaje."),
    node("heading-a", "heading_2", "Prvá kapitola"),
    node("paragraph-a", "paragraph", "Obsah prvej kapitoly."),
    node("heading-b", "heading_2", "Druhá kapitola"),
  ];
  const originalA = fingerprint(blocks[1]);
  const targetA = fingerprint(node("heading-a", "heading_2", "Upravená prvá kapitola"));
  const originalB = fingerprint(blocks[3]);
  const targetB = fingerprint(node("heading-b", "heading_2", "Upravená druhá kapitola"));
  const protectedPropertyNames = [
    "Psipedia ID", "Slug", "Kategória", "Typ obsahu",
    "Stav", "Odoslať na Psipedia", "Titulný obrázok",
  ];
  const plan = {
    pageGuard: JSON.stringify(protectedPropertyNames.map(name => [name, notion.properties[name] ?? null])),
    fullBlockOrder: blocks.map(block => block.id + ":" + block.type),
    blockSnapshots: blocks.map(block => ({ id: block.id, type: block.type, before: fingerprint(block) })),
    properties: { "SEO title": { rich_text: [{ type: "text", text: { content: "New SEO" } }] } },
    propertyBefore: { "SEO title": "Old SEO" },
    propertyAfter: { "SEO title": "New SEO" },
    blocks: [
      { id: "heading-a", type: "heading_2", before: originalA, after: targetA,
        payload: { heading_2: { rich_text: [{ type: "text", text: { content: "Upravená prvá kapitola" } }] } } },
      { id: "heading-b", type: "heading_2", before: originalB, after: targetB,
        payload: { heading_2: { rich_text: [{ type: "text", text: { content: "Upravená druhá kapitola" } }] } } },
    ],
  };
  const journal = {
    notion_page_id: pageId, article_id: 123, article_updated_at: "rev-100",
    base_content_hash: "baseline-hash", operations_json: JSON.stringify(plan),
  };
  const mapping = { notion_page_id: pageId, article_id: 123, content_hash: "baseline-hash" };
  const article = {
    id: 123, status: "draft", updatedAt: "rev-100",
    title: "Základný titul", slug: "zakladny-titul",
    intro: "Toto je veľmi dlhý úvod článku, ktorý obsahuje základné údaje.",
    blocks: [
      { id: "heading-a", type: "h2", text: "Upravená prvá kapitola" },
      { id: "paragraph-a", type: "text", content: "Obsah prvej kapitoly." },
      { id: "heading-b", type: "h2", text: "Upravená druhá kapitola" },
    ],
    seo: { title: "New SEO", description: "Toto je opis článku pre SEO výsledky.", focusKeyword: "krmivo" },
    image: null, imageAlt: null, imageCreditUrl: null,
  };
  const calls = [];
  let failSecond = true;
  let failFinalReceipt = false;
  let unsafeRemoteChange = false;
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              calls.push(["sql-first", sql]);
              if (sql.includes("SELECT notion_page_id, article_id, content_hash")) return { ...mapping };
              if (sql.includes("SELECT article_id, content_hash, last_synced_at")) return { ...mapping };
              if (sql.includes("SELECT breed_id FROM breed_notion_")) return null;
              if (sql.includes("SELECT status, updated_at FROM managed_articles"))
                return { status: article.status, updated_at: article.updatedAt };
              if (sql.includes("SELECT * FROM article_notion_editorial_outbox")) return journal.deleted ? null : { ...journal };
              throw Error("Unexpected SELECT: " + sql);
            },
            async run() {
              calls.push(["sql-run", sql]);
              if (sql.trimStart().startsWith("INSERT INTO article_notion_sync")) return { meta: { changes: 1 } };
              if (sql.startsWith("UPDATE article_notion_editorial_outbox SET lease_owner = ?")) {
                if (journal.deleted || (journal.lease_owner && journal.lease_until > args[5])) {
                  return { meta: { changes: 0 } };
                }
                journal.lease_owner = args[0];
                journal.lease_until = args[1];
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("UPDATE article_notion_editorial_outbox SET lease_until = ?")) {
                if (journal.deleted || journal.lease_owner !== args[4] || journal.lease_until <= args[5]) {
                  return { meta: { changes: 0 } };
                }
                journal.lease_until = args[0];
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("UPDATE article_notion_editorial_outbox SET lease_owner = NULL")) {
                if (!journal.deleted && journal.lease_owner === args[2]) {
                  journal.lease_owner = null; journal.lease_until = null;
                  return { meta: { changes: 1 } };
                }
                return { meta: { changes: 0 } };
              }
              if (sql.startsWith("UPDATE article_notion_sync SET")) {
                mapping.content_hash = args[0];
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("DELETE FROM article_notion_editorial_outbox")) {
                if (journal.lease_owner !== args[3]) return { meta: { changes: 0 } };
                journal.deleted = true; return { meta: { changes: 1 } };
              }
              throw Error("Unexpected DML: " + sql);
            },
          };
        },
        async first() {
          if (sql.includes("sqlite_master")) return null;
          throw Error("Unexpected SELECT: " + sql);
        },
      };
    },
  };
  let pageReads = 0;
  const fetchMock = async (endpoint, options = {}) => {
    const url = new URL(endpoint);
    const method = options.method ?? "GET";
    calls.push([method, url.pathname]);
    if (url.pathname === "/v1/data_sources/synthetic-articles/query" && method === "POST") {
      const { filter } = JSON.parse(options.body);
      return Response.json({ results: filter.or ? [structuredClone(notion)] : [], has_more: false });
    }
    if (url.pathname === "/v1/pages/" + pageId) {
      if (method === "GET") {
        pageReads++;
        if (inactiveAtRead?.read === pageReads) notion[inactiveAtRead.flag] = true;
        return Response.json(structuredClone(notion));
      }
      const props = JSON.parse(options.body).properties;
      if (failFinalReceipt && props["Sync stav"]?.select?.name === "Synchronizované") {
        return Response.json({ message: "synthetic acknowledgement failure" }, { status: 503 });
      }
      for (const [key, value] of Object.entries(props)) {
        const raw = { ...value };
        for (const type of ["title", "rich_text"]) {
          if (Array.isArray(raw[type])) {
            raw[type] = raw[type].map(x => ({
              ...x, plain_text: x.text?.content ?? x.plain_text ?? "",
            }));
          }
        }
        notion.properties[key] = raw;
      }
      return Response.json(structuredClone(notion));
    }
    if (url.pathname === "/v1/blocks/" + pageId + "/children") {
      return Response.json({ results: structuredClone(blocks), has_more: false });
    }
    if (url.pathname.startsWith("/v1/blocks/")) {
      const id = url.pathname.slice("/v1/blocks/".length);
      const block = blocks.find(x => x.id === id);
      if (!block) throw Error("Unknown block");
      if (method === "GET") {
        if (unsafeRemoteChange && id === "heading-b")
          block.heading_2.rich_text = rich("Nezávislá úprava v Notione");
        return Response.json(structuredClone(block));
      }
      if (id === "heading-b" && failSecond) {
        return Response.json({ message: "synthetic HTTP failure" }, { status: 503 });
      }
      const update = JSON.parse(options.body)[block.type];
      Object.assign(block[block.type], {
        ...update,
        rich_text: update.rich_text.map(x => ({
          ...x, plain_text: x.text?.content ?? x.plain_text ?? "",
        })),
      });
      return Response.json(structuredClone(block));
    }
    throw Error("Unexpected Notion route: " + url.pathname);
  };
  const bindings = {
    NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED: enabled ? "true" : "false",
    NOTION_ARTICLE_SYNC_ENABLED: "true", NOTION_API_TOKEN: "synthetic-token",
  };
  const planner = {
    buildNotionEditorialPlan({ remoteBlocks }) {
      assert.equal(remoteBlocks.length, 4);
      assert.equal(fingerprint(remoteBlocks[1]), targetA);
      assert.equal(fingerprint(remoteBlocks[3]), targetB);
      assert.equal(notion.properties["SEO title"].rich_text[0].text.content, "New SEO");
      return { properties: {}, blocks: [], propertyBefore: {}, propertyAfter: {} };
    },
    notionEditorialBlockShape: fingerprint,
    notionEditorialPropertyText(raw, type) {
      if (type === "url") return raw?.url ?? "";
      return (raw?.[type] ?? []).map(x => x.plain_text ?? x.text?.content ?? "").join("");
    },
  };
  return { db, article, calls, journal, mapping, bindings, notion, blocks,
    get failSecond() { return failSecond; },
    set failSecond(v) { failSecond = v; },
    set failFinalReceipt(v) { failFinalReceipt = v; },
    set unsafeRemoteChange(v) { unsafeRemoteChange = v; },
    planner, fetchMock };
}
async function loadWriter(h, overrides = {}, exportName = "writeBackDraftArticleContentToNotion") {
  const source = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const dependencies = {
    "./article-similarity-review.ts": { findSimilarArticles: async () => { throw Error("Unexpected similarity scan during editorial retry"); }, strongArticleDuplicate: () => null },
    "./notion-discovery-cursor.ts": { rotateNotionDiscovery: async () => { throw Error("Unexpected discovery during editorial retry"); }, mergeNotionDiscovery: (a,b) => [...a,...b] },
    "./notion-selective-property-patch": {sameNotionProperty:()=>false},
    "./notion-article-seo-properties": {
      ARTICLE_NOTION_SEO_PROPERTIES: { ogImageUrl: { name: "OG obrázok" } },
      articleSeoFromNotion: () => ({
        seoTitle: "Old SEO", metaDescription: "Toto je opis článku pre SEO výsledky.",
        focusKeyword: "krmivo", canonicalUrl: "", noindex: false,
        ogTitle: "Old SEO", ogDescription: "", ogImageUrl: null, ogImageKey: null,
      }),
      articleSeoExplicitClears: () => new Set(),
    },
    "./notion-article-seo-writeback": {
      articleSeoChangedFields: () => [],
      planArticleSeoWriteback: () => ({ changed: [], properties: {} }),
      verifyArticleSeoPatch: () => {},
    },
    "./notion-article-seo-receipt": {
      decodeArticleSeoReceipt: value => ({ hash: value, seo: null }),
      encodeArticleSeoReceipt: hash => hash,
    },
    "./admin-record-lifecycle": { notionPageMustSkipInboundSync: async () => false },
    "@/lib/article-effective-status": {
    effectiveArticleStatus(status, publishedAt, now = Date.now()) {
      if (status !== "scheduled" || !publishedAt) return status;
      const due = Date.parse(publishedAt);
      const clock = now instanceof Date ? now.getTime() : typeof now === "string" ? Date.parse(now) : now;
      return Number.isFinite(due) && Number.isFinite(clock) && due <= clock ? "published" : "scheduled";
    },
  },
    "@/lib/notion-field-authority": {readNotionFieldAuthorities:async()=>({})},
    "@/lib/notion-transfer-audit": {recordNotionTransfer:async()=>{}},
    "@/lib/article-store": {},
    "@/lib/article-blocks": {},
    "@/lib/public-editorial-guard": {
      hasCompletePublicPhotoCredit: () => false,
      isPhotoAttributionHeading: () => false,
      isPrivateEditorialArticleHeading: () => false,
      isNotionOnlySocialDraftHeading: () => false,
      isInternalArticleInstructionText: () => false,
      photoCreditFromNotionAttribution: () => "",
    },
    "@/lib/article-promo": {},
    "@/lib/notion-article-image-source": { notionArticleMainImageSource: () => ({ url: "", identity: "", fileIdentity: null, kind: "none" }) },
    "@/lib/notion-article-related-publication": { assertPublishedRelatedBlocks: async () => {} },
    "@/lib/editorial-content": { EDITORIAL_RICH_TEXT_VERSION: 1 },
    "@/lib/portal": {},
    "@/lib/article-subsection-taxonomy": {},
    "@/lib/notion-article-breed-placement": {
      isBreedArticlePlacementChange: () => false,
      isBreedArticleNotionChange: () => false,
      notionArticleBreedPlacement: () => null,
    },
    "@/config/public-site": { SITE_URL: "https://psipedia.sk" },
    "@/lib/notion-article-content-plan": h.planner,
    // The article module now uses the shared transport for retries. Keep
    // this behavioral test's mocked Notion HTTP state machine unchanged.
    "@/lib/notion-sync-shared": {
      notionRequest: async (_bindings, path, init = {}) => {
        const response = await h.fetchMock("https://api.notion.com/v1" + path, init);
        const body = await response.text();
        if (!response.ok) throw Error("Notion API " + response.status + ": " + body);
        return body ? JSON.parse(body) : {};
      },
    },
  };
  runInNewContext(compiled, {
    exports, module: { exports },
    require(name) {
      if (!(name in dependencies)) throw Error("Unexpected import: " + name);
      return { ...dependencies[name], ...overrides[name] };
    },
    fetch: h.fetchMock, Response, Request, Headers, URL, URLSearchParams,
    TextEncoder, crypto, Date, JSON, console,
  }, { timeout: 1500 });
  return exports[exportName];
}

for (const status of ["draft", "published"]) {
  test(`targeted Notion updates preserve unrelated fields on a ${status} article`, async () => {
    const h = setup();
    const pageId = h.notion.id;
    h.notion.parent = { type: "data_source_id", data_source_id: "synthetic-articles" };
    h.notion.properties.Stav.select.name = status === "published" ? "Publikované" : "Ready";
    h.notion.properties.Perex = { id: "opaque-perex", rich_text: rich("Samostatný redakčný perex článku.") };
    h.notion.properties["Meta description"].id = "opaque-seo";
    h.notion.properties["Prepojené plemená"] = {
      id: "opaque-breeds",
      relation: [{ id: "b2222222-2222-4222-8222-222222222222" }],
    };
    h.notion.properties["Zdroj obrázka"].url = "https://example.test/old-photo-source";
    const untouched = {
      takeaway: "Hlavná myšlienka uložená v Admine.",
      sources: [{ label: "Redakčný zdroj", url: "https://example.test/editorial-source" }],
      accent: "gold",
      imageCreditUrl: "https://example.test/verified-photo-source",
      imageAlt: "Titulná fotografia z Adminu",
      showUpdated: true,
    };
    const local = {
      ...h.article, ...untouched, status, category: "Výživa", portalSection: "starostlivost",
      portalSubpage: "vyziva", relatedBreedIds: [160],
      excerpt: "Pôvodný perex uložený v Admine.", image: "/original.webp", imageKey: "original.webp",
    };
    let stored = { ...local };
    const sweep = await loadWriter(h, {
      "./notion-article-seo-properties": {
        articleSeoFromNotion: (page) => ({
          metaDescription: page.properties["Meta description"].rich_text[0].plain_text,
        }),
        articleSeoSignedChangedFields: (_page, ids) =>
          new Set(ids.includes("opaque-seo") ? ["metaDescription"] : []),
      },
      "@/lib/article-store": {
        getManagedArticleById: async () => stored,
        updateManagedArticle: async (id, data) => {
          assert.equal(id, local.id);
          stored = { ...stored, ...data, seo: { description: data.metaDescription } };
          return stored;
        },
      },
      "@/lib/article-promo": { preserveArticlePromoBlocks: (_old, incoming) => incoming },
    }, "runNotionArticleSyncSweep");
    const send = (property, eventType = "page.properties_updated") => sweep({
      database: h.db, bindings: { ...h.bindings, NOTION_ARTICLES_DATA_SOURCE_ID: "synthetic-articles" },
      targetPageId: pageId, eventType, changedPropertyIds: [property],
    });
    assert.equal((await send("opaque-perex")).updated, 1);
    assert.equal(stored.excerpt, "Samostatný redakčný perex článku.");
    const assertUntouched = () => {
      for (const [key, value] of Object.entries(untouched)) {
        assert.deepEqual(stored[key], value, key);
      }
    };
    assertUntouched();
    assert.equal(stored.seo.description, local.seo.description);
    h.notion.properties["Meta description"].rich_text = rich("Samostatný upravený opis pre SEO.");
    assert.equal((await send("opaque-seo")).updated, 1);
    assert.equal(stored.excerpt, "Samostatný redakčný perex článku.");
    assert.equal(stored.seo.description, "Samostatný upravený opis pre SEO.");
    assertUntouched();
    h.notion.properties["Kredit fotografie"] = {
      id: "opaque-credit", rich_text: rich("Autor doplnený v Notione"),
    };
    assert.equal((await send("opaque-credit")).updated, 1);
    assert.equal(stored.imageCredit, "Autor doplnený v Notione");
    assertUntouched();
    h.blocks[0].paragraph.rich_text = rich("Úvod článku má teraz úplne iný obsah ako publikovaný perex.");
    assert.equal((await send("", "page.content_updated")).updated, 1);
    assert.equal(stored.excerpt, "Samostatný redakčný perex článku.");
    assert.equal(stored.intro, "Úvod článku má teraz úplne iný obsah ako publikovaný perex.");
    assertUntouched();
    h.notion.properties.Perex.rich_text = rich("");
    assert.equal((await send("opaque-perex")).failed, 1);
    assert.equal(stored.excerpt, "Samostatný redakčný perex článku.");
    assert.equal(stored.imageKey, local.imageKey);
    assert.deepEqual(stored.relatedBreedIds, [160]);
    assert.equal(h.calls.some(([method, sql]) =>
      method === "sql-first" && sql.includes("FROM breed_notion_")), false);

    assert.equal((await send("opaque-breeds")).failed, 1);
    assert.deepEqual(stored.relatedBreedIds, [160]);
    h.notion.properties["Prepojené plemená"].relation = [{ id: "invalid-id" }];
    assert.equal((await send("opaque-breeds")).failed, 1);
    assert.deepEqual(stored.relatedBreedIds, [160]);
    h.notion.properties["Prepojené plemená"].relation = [];
    assert.equal((await send("opaque-breeds")).updated, 1);
    assert.deepEqual(Array.from(stored.relatedBreedIds), []);
  });
}
test("regular Notion article sync retains draft fields maintained by the Admin editor", async () => {
  const h = setup();
  const untouched = {
    accent: "gold",
    author: "Redakčný autor",
    authorProfileId: 42,
    takeaway: "Hlavná myšlienka uložená v Admine.",
    takeawayRichText: { version: 1, content: [] },
    sources: [{ label: "Redakčný zdroj", url: "https://example.test/editorial-source" }],
    showUpdated: true,
    contentUpdatedAt: "2026-11-26T10:30:00.000Z",
  };
  const local = {
    ...h.article, ...untouched, updatedBy: "notion-sync@psipedia.sk",
    category: "Výživa", portalSection: "starostlivost", portalSubpage: "vyziva",
    excerpt: "Pôvodný perex uložený v Admine.", relatedBreedIds: [160],
  };
  let written;
  const sweep = await loadWriter(h, {
    "@/lib/article-store": {
      getManagedArticleById: async () => local,
      updateManagedArticle: async (_id, data) => {
        written = data;
        return local;
      },
    },
    "@/lib/article-promo": { preserveArticlePromoBlocks: (_old, incoming) => incoming },
  }, "runNotionArticleSyncSweep");
  h.notion.properties["Názov"].title = rich("Upravený titul v Notione");
  const result = await sweep({
    database: h.db, bindings: { ...h.bindings, NOTION_ARTICLES_DATA_SOURCE_ID: "synthetic-articles" },
  });
  assert.equal(result.updated, 1);
  assert.equal(written.title, "Upravený titul v Notione");
  assert.equal(written.excerpt, local.excerpt);
  for (const [key, value] of Object.entries(untouched)) assert.deepEqual(written[key], value, key);
});

test("regular Notion article sync retains attribution for the published Admin photo", async () => {
  const h = setup();
  h.notion.properties.Stav.select.name = "Publikované";
  h.notion.properties["Kredit fotografie"] = { rich_text: rich("Starý kredit v Notione") };
  h.notion.properties["Zdroj obrázka"].url = "https://example.test/old-photo-source";
  h.notion.properties["Názov"].title = rich("Upravený titul v Notione");
  const local = {
    ...h.article, status: "published", updatedBy: "notion-sync@psipedia.sk",
    category: "Výživa", portalSection: "starostlivost", portalSubpage: "vyziva",
    excerpt: "Pôvodný perex uložený v Admine.", relatedBreedIds: [160],
    image: "/admin-photo.webp", imageKey: "admin-photo.webp",
    imageCredit: "Overený autor fotografie",
    imageCreditUrl: "https://example.test/admin-photo-source",
  };
  let written;
  const sweep = await loadWriter(h, {
    "@/lib/article-store": {
      getManagedArticleById: async () => local,
      updateManagedArticle: async (_id, data) => {
        written = data;
        return local;
      },
    },
    "@/lib/article-promo": { preserveArticlePromoBlocks: (_old, incoming) => incoming },
  }, "runNotionArticleSyncSweep");
  const result = await sweep({
    database: h.db, bindings: { ...h.bindings, NOTION_ARTICLES_DATA_SOURCE_ID: "synthetic-articles" },
  });
  assert.equal(result.updated, 1);
  assert.equal(written.title, "Upravený titul v Notione");
  assert.equal(written.imageUrl, local.image);
  assert.equal(written.imageKey, local.imageKey);
  assert.equal(written.imageCredit, local.imageCredit);
  assert.equal(written.imageCreditUrl, local.imageCreditUrl);
});

test("disabled content writeback performs zero database or Notion I/O", async () => {
  const h = setup({ enabled: false });
  const writer = await loadWriter(h);
  const result = await writer({ database: h.db, bindings: h.bindings, article: h.article });
  assert.equal(result.linked, false);
  assert.equal(result.updated, false);
  assert.equal(result.reason, "disabled");
  assert.equal(h.calls.length, 0);
});

test("interrupted Notion block PATCH leaves outbox and retry resumes without rewriting successful blocks", async () => {
  const h = setup();
  const writer = await loadWriter(h);
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }), /Notion API 503/);
  assert.equal(h.journal.deleted, undefined);
  assert.equal(h.mapping.content_hash, "baseline-hash");
  assert.equal(h.notion.properties["SEO title"].rich_text[0].text.content, "New SEO");
  assert.equal(h.blocks[1].heading_2.rich_text[0].text.content, "Upravená prvá kapitola");
  assert.equal(h.blocks[3].heading_2.rich_text[0].text.content, "Druhá kapitola");
  const originalCount = h.calls.filter(x => x[0] === "PATCH" && x[1].endsWith("/heading-a")).length;
  h.failSecond = false;
  const outcome = await writer({ database: h.db, bindings: h.bindings, article: h.article });
  assert.equal(outcome.linked, true);
  assert.equal(outcome.updated, true);
  assert.equal(h.journal.deleted, true);
  assert.notEqual(h.mapping.content_hash, "baseline-hash");
  assert.equal(h.calls.filter(x => x[0] === "PATCH" && x[1].endsWith("/heading-a")).length, originalCount);
  assert.equal(h.blocks[3].heading_2.rich_text[0].text.content, "Upravená druhá kapitola");
  assert.equal(h.notion.properties["Sync stav"].select.name, "Synchronizované");
});

test("human edits to a remaining Notion block stop retry without false success", async () => {
  const h = setup();
  const writer = await loadWriter(h);
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }), /Notion API 503/);
  h.failSecond = false;
  h.unsafeRemoteChange = true;
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_EDITORIAL_BLOCK_CONFLICT/);
  assert.equal(h.journal.deleted, undefined);
  assert.equal(h.mapping.content_hash, "baseline-hash");
  assert.equal(h.notion.properties["Sync stav"].select.name, "Chyba");
});

test("updated Admin revision blocks retry even when remote changes already started", async () => {
  const h = setup();
  const writer = await loadWriter(h);
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }), /Notion API 503/);
  h.article.updatedAt = "rev-101";
  h.failSecond = false;
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_EDITORIAL_OUTBOX_CONFLICT/);
  assert.equal(h.journal.deleted, undefined);
});


test("Notion page with missing canonical Psipedia ID cannot receive editorial patches", async () => {
  const h = setup();
  delete h.notion.properties["Psipedia ID"];
  const writer = await loadWriter(h);
  await assert.rejects(
    writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_ARTICLE_IDENTITY_CONFLICT/,
  );
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0);
  assert.equal(h.journal.deleted, undefined);
  assert.equal(h.mapping.content_hash, "baseline-hash");
});

test("journal retry rejects an externally reassigned Notion page identity", async () => {
  const h = setup();
  const writer = await loadWriter(h);
  await assert.rejects(
    writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /Notion API 503/,
  );
  const previousPatches = h.calls.filter(([verb]) => verb === "PATCH").length;
  h.notion.properties["Psipedia ID"] = { rich_text: rich("999") };
  h.failSecond = false;
  await assert.rejects(
    writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_ARTICLE_IDENTITY_CONFLICT/,
  );
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, previousPatches);
  assert.equal(h.journal.deleted, undefined);
  assert.equal(h.mapping.content_hash, "baseline-hash");
});

test("initial, latest and verification reads each enforce immutable Notion canonical identity", async () => {
  const source = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");
  const writer = source.slice(source.indexOf("export async function writeBackDraftArticleContentToNotion("),
    source.indexOf("async function sha256(", source.indexOf("export async function writeBackDraftArticleContentToNotion(")));
  assert.equal((writer.match(/matchesEditorialIdentity\((page|latest|verifiedPage)\)/g) || []).length, 3);
  assert.match(writer, /value\.id === mapping\.notion_page_id/);
  assert.match(writer, /richTextProperty\(value, "Psipedia ID"\) === String\(article\.id\)/);
});


test("later-block Notion human conflict aborts before the first SEO or block PATCH", async () => {
  const h = setup();
  h.blocks[3].heading_2.rich_text = rich("Human modified the second heading");
  const writer = await loadWriter(h);
  await assert.rejects(
    writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_EDITORIAL_BLOCK_CONFLICT/,
  );
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0,
    "detect known later-block conflicts before any remote mutation");
  assert.equal(h.notion.properties["SEO title"].rich_text[0].text.content, "Old SEO");
  assert.equal(h.journal.deleted, undefined);
  assert.equal(h.mapping.content_hash, "baseline-hash");
});

test("deleted planned Notion block aborts before any remote patch", async () => {
  const h = setup();
  h.blocks.pop();
  const writer = await loadWriter(h);
  await assert.rejects(
    writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_EDITORIAL_STRUCTURE_CONFLICT/,
  );
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0);
  assert.equal(h.journal.deleted, undefined);
});


test("reordered planned blocks never trigger partial Notion writes", async () => {
  const h = setup();
  [h.blocks[1], h.blocks[3]] = [h.blocks[3], h.blocks[1]];
  const writer = await loadWriter(h);
  await assert.rejects(
    writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_EDITORIAL_STRUCTURE_CONFLICT/,
  );
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0);
  assert.equal(h.mapping.content_hash, "baseline-hash");
});


for (const flag of ["archived", "in_trash"]) {
  for (const [read, stage] of [[1, "initial lookup"], [2, "pre-mutation read"], [3, "final readback"]]) {
    test(`Notion ${flag} at ${stage} refuses writeback success and retains recovery journal`, async () => {
      const h = setup({ inactiveAtRead: { read, flag } });
      h.failSecond = false;
      const writer = await loadWriter(h);
      await assert.rejects(
        writer({ database: h.db, bindings: h.bindings, article: h.article }),
        /NOTION_ARTICLE_IDENTITY_CONFLICT/,
      );
      if (read < 3) {
        assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0,
          "a known withdrawn page must receive no remote mutation");
      }
      assert.equal(h.mapping.content_hash, "baseline-hash");
      if (read === 3) assert.equal(h.notion.properties["Sync stav"].select.name, "Chyba");
      else assert.equal(h.notion.properties["Sync stav"], undefined);
      assert.equal(h.journal.deleted, undefined,
        "a withdrawal during an attempt must not erase its recovery evidence");
    });
  }
}

test("concurrent worker cannot acquire an active writeback lease", async () => {
  const h = setup();
  h.journal.lease_owner = "another-writer";
  h.journal.lease_until = "9999-12-31T00:00:00.000Z";
  const writer = await loadWriter(h);
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_EDITORIAL_WRITEBACK_BUSY/);
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0);
  assert.equal(h.journal.deleted, undefined);
  assert.equal(h.mapping.content_hash, "baseline-hash");
});

test("expired writeback lease is claimable for idempotent crash recovery", async () => {
  const h = setup();
  h.journal.lease_owner = "crashed-writer";
  h.journal.lease_until = "2000-01-01T00:00:00.000Z";
  h.failSecond = false;
  const writer = await loadWriter(h);
  const result = await writer({ database: h.db, bindings: h.bindings, article: h.article });
  assert.equal(result.updated, true);
  assert.equal(h.journal.deleted, true);
});

test("metadata mutation by a Notion human blocks writeback before any PATCH", async () => {
  const h = setup();
  h.notion.properties["Slug"] = { rich_text: rich("human-edited-slug") };
  const writer = await loadWriter(h);
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_EDITORIAL_METADATA_CONFLICT/);
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0);
  assert.equal(h.mapping.content_hash, "baseline-hash");
  assert.equal(h.journal.deleted, undefined);
});

test("unplanned block content drift blocks writeback before first remote mutation", async () => {
  const h = setup();
  h.blocks[2].paragraph.rich_text = rich("Human changed an unplanned paragraph");
  const writer = await loadWriter(h);
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_EDITORIAL_BLOCK_CONFLICT/);
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0);
  assert.equal(h.mapping.content_hash, "baseline-hash");
});

test("unexpected inserted block must not be silently ignored on journal retry", async () => {
  const h = setup();
  h.blocks.push(node("added", "paragraph", "Human inserted a block"));
  const writer = await loadWriter(h);
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /NOTION_EDITORIAL_STRUCTURE_CONFLICT/);
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0);
});

test("failed final Notion acknowledgement retains journal and cannot claim SYNCED", async () => {
  const h = setup();
  h.failSecond = false;
  h.failFinalReceipt = true;
  const writer = await loadWriter(h);
  await assert.rejects(writer({ database: h.db, bindings: h.bindings, article: h.article }),
    /Notion API 503/);
  assert.equal(h.notion.properties["Sync stav"].select.name, "Chyba");
  assert.equal(h.journal.deleted, undefined);
  // After all content patches, the guarded local mapping may have the new
  // projection hash. The pending journal remains the authoritative receipt.
  assert.notEqual(h.mapping.content_hash, "baseline-hash");
  const firstBlockPatchCount = h.calls.filter(([verb, path]) =>
    verb === "PATCH" && path.endsWith("/heading-a")).length;
  h.failFinalReceipt = false;
  const outcome = await writer({ database: h.db, bindings: h.bindings, article: h.article });
  assert.equal(outcome.updated, true);
  assert.equal(h.journal.deleted, true);
  assert.equal(h.notion.properties["Sync stav"].select.name, "Synchronizované");
  assert.equal(h.calls.filter(([verb, path]) =>
    verb === "PATCH" && path.endsWith("/heading-a")).length, firstBlockPatchCount);
});
