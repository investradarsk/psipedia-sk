import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

async function compiledModule(path, services, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const cjsModule = { exports: {} };
  runInNewContext(compiled, {
    module: cjsModule, exports: cjsModule.exports,
    require(name) {
      if (!(name in services)) throw new Error("Unexpected import: " + name);
      return services[name];
    },
    console, Response, Request, Headers, URL, URLSearchParams, TextEncoder, crypto, ...globals,
  }, { filename: path });
  return cjsModule.exports;
}

const syncDependencies = {
  "@/lib/article-store": {},
  "@/lib/article-blocks": {},
  "@/lib/article-promo": {},
  "@/lib/editorial-content": { EDITORIAL_RICH_TEXT_VERSION: 1 },
  "@/lib/portal": { articleHref: ({ portalSection, slug }) => "/" + portalSection + "/" + slug },
  "@/lib/article-subsection-taxonomy": {},
  "@/config/public-site": { SITE_URL: "https://psipedia.sk" },
};

function publicationHarness({
  status = "scheduled",
  publishedAt = "2026-10-14T12:00:00.000Z",
  pageState = "Ready",
  send = true,
  mapped = true,
  enabled = true,
  apiDown = false,
  concurrentChange = false,
  alreadyPublished = false,
  remoteUrl = null,
} = {}) {
  const article = {
    id: 12, slug: "moj-clanok", portalSection: "zdravie",
    status, publishedAt, updatedAt: "version-1",
  };
  const url = "https://psipedia.sk/zdravie/moj-clanok";
  const remote = {
    id: "page-12",
    properties: {
      "Stav": { select: { name: alreadyPublished ? "Publikované" : pageState } },
      "Odoslať na Psipedia": { checkbox: send },
      "Dátum publikácie": { date: alreadyPublished ? { start: publishedAt } : null },
      "URL Psipedia": { url: remoteUrl ?? (alreadyPublished ? url : null) },
      "Sync stav": { select: { name: alreadyPublished ? "Synchronizované" : "Čaká na sync" } },
      "Sync chyba": { rich_text: [] },
    },
  };
  const calls = [];
  const current = {
    slug: article.slug, portal_section: article.portalSection,
    status, published_at: publishedAt, updated_at: "version-1",
  };
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          if (sql.startsWith("SELECT notion_page_id")) {
            return { async first() { calls.push(["mapping", ...values]); return mapped ? { notion_page_id: "page-12" } : null; } };
          }
          if (sql.startsWith("SELECT slug, portal_section")) {
            return { async first() { calls.push(["check-d1"]); return { ...current }; } };
          }
          if (sql.startsWith("UPDATE article_notion_sync SET last_synced_at")) {
            return { async run() { calls.push(["ack", ...values]); return { success: true }; } };
          }
          throw new Error("Unexpected SQL: " + sql);
        },
      };
    },
  };
  const bindings = { NOTION_ARTICLE_SYNC_ENABLED: enabled ? "true" : "false", NOTION_API_TOKEN: "local-test-token" };
  const fetchMock = async (endpoint, options = {}) => {
    if (apiDown) throw new Error("secret must never be logged");
    const method = options.method ?? "GET";
    calls.push([method, endpoint]);
    if (method === "GET") {
      if (concurrentChange) current.updated_at = "version-2";
      return new Response(JSON.stringify(remote), { status: 200, headers: { "content-type": "application/json" } });
    }
    assert.equal(method, "PATCH");
    const properties = JSON.parse(options.body).properties;
    Object.assign(remote.properties, properties);
    return new Response(JSON.stringify(remote), { status: 200 });
  };
  return {
    article, remote, calls, DB, bindings,
    async run(now = "2026-10-15T10:00:00.000Z") {
      const notionSync = await compiledModule("../lib/notion-article-sync.ts", syncDependencies, { fetch: fetchMock });
      return notionSync.writeBackPublishedArticleToNotion({ database: DB, bindings, article, now });
    },
  };
}

for (const status of ["scheduled", "published"]) {
  test(status + " publication updates Notion only once and acknowledges the mapping", async () => {
    const h = publicationHarness({ status });
    const first = await h.run();
    assert.equal(first.updated, true);
    assert.equal(h.remote.properties.Stav.select.name, "Publikované");
    assert.equal(h.remote.properties["Dátum publikácie"].date.start, h.article.publishedAt);
    assert.equal(h.remote.properties["URL Psipedia"].url, "https://psipedia.sk/zdravie/moj-clanok");
    assert.equal(h.calls.filter(([op]) => op === "PATCH").length, 1);
    const second = await h.run();
    assert.equal(second.updated, false);
    assert.equal(h.calls.filter(([op]) => op === "PATCH").length, 1);
    assert.equal(h.calls.filter(([op]) => op === "ack").length, 2);
  });
}

test("future schedule and draft remain private and never contact Notion", async () => {
  for (const data of [
    { status: "draft" },
    { status: "scheduled", publishedAt: "2026-10-30T00:00:00.000Z" },
  ]) {
    const h = publicationHarness(data);
    const result = await h.run();
    assert.equal(result.reason, "not-published");
    assert.equal(h.calls.length, 0);
  }
});

test("legacy published NULL or invalid published_at is deferred across hourly times without Notion traffic", async () => {
  for (const publishedAt of [null, "", "not-a-date"]) {
    for (const alreadyPublished of [false, true]) {
      const h = publicationHarness({ status: "published", publishedAt, alreadyPublished });
      for (const now of ["2026-10-15T10:00:00Z", "2026-10-15T11:00:00Z", "2026-10-15T12:00:00Z"]) {
        const result = await h.run(now);
        assert.equal(result.reason, "missing-publication-date");
        assert.equal(result.updated, false);
      }
      assert.deepEqual(h.calls, [], "must not look up a mapping, read/PATCH Notion or advance an acknowledgement");
    }
  }
});

test("unlinked or disabled publication never contacts Notion", async () => {
  const h1 = publicationHarness({ mapped: false });
  assert.equal((await h1.run()).reason, "not-linked");
  assert.equal(h1.calls.filter(([op]) => op === "GET").length, 0);
  const h2 = publicationHarness({ enabled: false });
  assert.equal((await h2.run()).reason, "disabled");
  assert.equal(h2.calls.length, 0);
});

test("Notion failure does not acknowledge and a later hourly run retries successfully", async () => {
  let fail = true;
  const h = publicationHarness();
  const original = h.run.bind(h);
  // Exercise transport failure and recovery using separate calls but the same D1 mapping.
  const services = await compiledModule("../lib/notion-article-sync.ts", syncDependencies, {
    fetch: async (...args) => fail
      ? Promise.reject(new Error("provider down"))
      : new Response(JSON.stringify({
        id: "page-12",
        properties: {
          "Stav": { select: { name: "Ready" } },
          "Odoslať na Psipedia": { checkbox: true },
        },
      }), { status: 200 }),
  });
  await assert.rejects(
    services.writeBackPublishedArticleToNotion({ database: h.DB, bindings: h.bindings, article: h.article }),
    /provider down/,
  );
  assert.equal(h.calls.filter(([op]) => op === "ack").length, 0);
  fail = false;
  const recovered = await original();
  assert.equal(recovered.updated, true);
});

test("manual revocation and Notion state conflicts fail closed", async () => {
  for (const options of [
    { pageState: "Draft" }, { send: false },
    { alreadyPublished: true, remoteUrl: "https://psipedia.sk/ine" },
  ]) {
    const h = publicationHarness(options);
    await assert.rejects(h.run(), /NOTION_PUBLICATION/);
    assert.equal(h.calls.filter(([op]) => op === "PATCH" || op === "ack").length, 0);
  }
});

test("concurrent D1 editor change is detected after remote GET and before PATCH", async () => {
  const h = publicationHarness({ concurrentChange: true });
  await assert.rejects(h.run(), /D1_PUBLICATION_CHANGED/);
  assert.equal(h.calls.filter(([op]) => op === "PATCH" || op === "ack").length, 0);
});

test("hourly candidate query follows public scheduled visibility and rotates failed attempts", async () => {
  const calls = [];
  const candidates = [
    { id: 11, slug: "due", portal_section: "zdravie", status: "scheduled", published_at: "2026-10-13T10:00:00Z", updated_at: "a1", notion_page_id: "n11", mapping_updated_at: "m1" },
    { id: 12, slug: "manual", portal_section: "novinky", status: "published", published_at: "2026-10-14T10:00:00Z", updated_at: "a2", notion_page_id: "n12", mapping_updated_at: "m2" },
  ];
  const DB = {
    prepare(sql) {
      calls.push(["sql", sql]);
      return {
        bind(...bound) {
          calls.push(["bind", ...bound]);
          if (sql.startsWith("SELECT a.id")) return { async all() { return { results: candidates }; } };
          if (sql.startsWith("UPDATE article_notion_sync SET updated_at")) return { async run() { calls.push(["failure-cursor"]); } };
          throw new Error("Unexpected SQL");
        },
      };
    },
  };
  const seen = [];
  const logs = [];
  const reconciliationModule = await compiledModule("../lib/article-publish-notion-reconciliation.ts", {
    "@/lib/notion-article-sync": {
      async writeBackPublishedArticleToNotion({ article }) {
        seen.push(article);
        if (article.id === 11) throw new Error("private_token_123");
        return { linked: true, updated: false };
      },
    },
  }, { console: { error(...args) { logs.push(args); } } });
  const summary = await reconciliationModule.runArticlePublishNotionReconciliation({
    database: DB, bindings: { NOTION_ARTICLE_SYNC_ENABLED: "true" },
    now: "2026-10-15T10:00:00Z", limit: 50,
  });
  assert.match(calls[0][1], /status = 'scheduled' AND a.published_at IS NOT NULL AND a.published_at <= \?/);
  assert.match(calls[0][1], /ORDER BY m.updated_at ASC/);
  assert.deepEqual(seen.map(row => row.id), [11, 12]);
  assert.deepEqual({ checked: summary.checked, failed: summary.failed, unchanged: summary.unchanged }, {
    checked: 2, failed: 1, unchanged: 1,
  });
  assert.equal(calls.filter(([op]) => op === "failure-cursor").length, 1);
  assert.doesNotMatch(JSON.stringify(logs), /private_token_123/);
});

test("two hourly reconciler runs skip legacy NULL published_at and avoid a duplicate Notion PATCH", async () => {
  const valid = publicationHarness({ status: "published", publishedAt: "2026-10-14T12:00:00.000Z" });
  const legacy = publicationHarness({ status: "published", publishedAt: null });
  const candidates = [
    { id: 12, slug: "moj-clanok", portal_section: "zdravie", status: "published",
      published_at: valid.article.publishedAt, updated_at: "version-1",
      notion_page_id: "page-12", mapping_updated_at: "m1" },
    { id: 13, slug: "stary-clanok", portal_section: "zdravie", status: "published",
      published_at: null, updated_at: "version-legacy",
      notion_page_id: "page-13", mapping_updated_at: "m2" },
  ];
  const queries = [];
  const db = {
    prepare(sql) {
      queries.push(sql);
      return {
        bind(...values) {
          if (sql.startsWith("SELECT a.id")) {
            assert.equal(values[1], 50);
            return {
              async all() {
                // Model the SQL predicate, not a prefiltered hardcoded result.
                const excludesNull = sql.includes("a.status = 'published' AND a.published_at IS NOT NULL");
                return { results: candidates.filter((row) => excludesNull || row.published_at !== null) };
              },
            };
          }
          throw new Error("Unexpected SQL: " + sql);
        },
      };
    },
  };
  const seen = [];
  const reconciliation = await compiledModule("../lib/article-publish-notion-reconciliation.ts", {
    "@/lib/notion-article-sync": {
      async writeBackPublishedArticleToNotion(args) {
        seen.push(args.article.id);
        if (args.article.id === 12) return valid.run(args.now);
        return legacy.run(args.now);
      },
    },
  });
  const first = await reconciliation.runArticlePublishNotionReconciliation({
    database: db, bindings: valid.bindings, now: "2026-10-15T10:00:00Z",
  });
  const second = await reconciliation.runArticlePublishNotionReconciliation({
    database: db, bindings: valid.bindings, now: "2026-10-15T11:00:00Z",
  });
  assert.deepEqual(seen, [12, 12], "legacy published NULL rows must not be selected");
  assert.match(queries[0], /a\\.status = 'published' AND a\\.published_at IS NOT NULL/);
  assert.equal(first.checked, 1);
  assert.equal(first.updated, 1);
  assert.equal(second.checked, 1);
  assert.equal(second.unchanged, 1);
  assert.equal(valid.calls.filter(([action]) => action === "PATCH").length, 1);
  assert.equal(legacy.calls.length, 0);
});

test("disabled hourly reconciliation executes no query", async () => {
  const mod = await compiledModule("../lib/article-publish-notion-reconciliation.ts", {
    "@/lib/notion-article-sync": { writeBackPublishedArticleToNotion() { throw new Error("should not run"); } },
  });
  const summary = await mod.runArticlePublishNotionReconciliation({
    database: { prepare() { throw new Error("should not query"); } },
    bindings: { NOTION_ARTICLE_SYNC_ENABLED: "false" },
  });
  assert.equal(summary.checked, 0);
  assert.equal(summary.enabled, false);
});
