import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("../app/api/admin/articles/[id]/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ status = "draft", target = "published", changed = false, writerFails = false, mapping = true, enabled = true } = {}) {
  const original = {
    id: 7, slug: "clanok", status, updatedAt: "v1", publishedAt: null,
    sections: [{ title: "Pôvodná sekcia" }],
    sources: [{ url: "https://example.org" }],
    blocks: [{ type: "paragraph", text: "Pôvodný blok" }],
    topics: [{ id: 5 }], imageKey: "article/original.webp",
    ogImageKey: "article/original.webp", seoTitle: "Pôvodné SEO",
    imageDisplay: "auto", imageFocusX: 50, imageFocusY: 50, portalSection: "zdravie",
    portalSubpage: "prevencia",
  };
  const saved = { ...original, status: target, updatedAt: "v2", publishedAt: target === "published" ? "2026-10-14T12:00:00Z" : null };
  const calls = [];
  const DB = {
    prepare(query) {
      calls.push(["mapping-query", query]);
      return { bind(id) {
        assert.equal(id, 7);
        return { async first() { return mapping ? { notion_page_id: "page-1" } : null; } };
      } };
    },
  };
  const env = { DB, NOTION_ARTICLE_SYNC_ENABLED: enabled ? "true" : "false" };
  let stored = { ...original };
  let blocked = changed;
  const classes = {
    ArticleRescheduleConflictError: class ArticleRescheduleConflictError extends Error {},
    ArticleUpdateConflictError: class ArticleUpdateConflictError extends Error {},
  };
  const services = {
    "cloudflare:workers": { env },
    "@/lib/article-store": {
      ...classes,
      async getManagedArticleById() { calls.push(["read"]); return stored; },
      async updateManagedArticle(id, payload, actor, before, guard) {
        calls.push(["update", payload, guard]);
        assert.equal(id, 7);
        assert.equal(guard.updatedAt, "v1");
        if (blocked) throw new classes.ArticleUpdateConflictError("conflict");
        stored = { ...saved, sections: payload.sections, sources: payload.sources, blocks: payload.blocks ?? original.blocks,
          seoTitle: payload.seoTitle ?? original.seoTitle, imageKey: payload.imageKey ?? original.imageKey,
          ogImageKey: payload.ogImageKey ?? original.ogImageKey, topics: original.topics };
        return stored;
      },
      isArticleSlugConflict() { return false; },
    },
    "@/lib/admin-auth": { async getAdminApiUser() { return { email: "editor@example.org" }; }, unauthorizedAdminResponse() { return new Response(null, { status: 401 }); } },
    "@/lib/article-blocks": { articleBlockImageKeys() { return []; } },
    "@/lib/article-media-key-preservation": { orphanedArticleMediaKeys() { return []; } },
    "@/lib/article-content-qa": { isArticlePublishIntegrityError() { return false; } },
    "@/lib/notion-article-sync": {
      async writeBackPublishedArticleToNotion(args) {
        calls.push(["writeback", args]);
        assert.equal(args.database, DB);
        assert.equal(args.bindings, env);
        assert.equal(args.article, stored);
        if (!enabled) return { linked: false, updated: false, reason: "disabled" };
        const link = await DB.prepare("SELECT notion_page_id FROM article_notion_sync WHERE article_id = ? LIMIT 1").bind(7).first();
        if (!link) return { linked: false, updated: false, reason: "not-linked" };
        if (writerFails) throw new Error("NOTION_SECRET_TOKEN_must_never_be_logged");
        calls.push(["notion-patch", link.notion_page_id]);
        return { linked: true, updated: true };
      },
    },
  };
  const logs = [];
  const module = { exports: {} };
  runInNewContext(compiled, {
    module, exports: module.exports, require(name) {
      if (!(name in services)) throw new Error("Unknown import: " + name);
      return services[name];
    },
    Response, Request, console: { error(...args) { logs.push(args); } },
  }, { filename: "article-admin-route.cjs" });
  return {
    calls, logs, original,
    async put({ expectedUpdatedAt = "v1", patch = {} } = {}) {
      const req = new Request("https://test.local/api/admin/articles/7", {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: target, expectedUpdatedAt, ...patch }),
      });
      const response = await module.exports.PUT(req, { params: Promise.resolve({ id: "7" }) });
      return { status: response.status, body: await response.json(), stored };
    },
  };
}

for (const initial of ["draft", "scheduled"]) {
  test(initial + " to published writes canonical D1 first and Notion second", async () => {
    const h = harness({ status: initial });
    const result = await h.put();
    assert.equal(result.status, 200);
    assert.equal(result.stored.status, "published");
    assert.deepEqual(h.calls.filter(([kind]) => kind === "update" || kind === "writeback").map(([kind]) => kind), ["update", "writeback"]);
  });
}

test("already published edit never repeats publication writeback", async () => {
  const h = harness({ status: "published" });
  assert.equal((await h.put()).status, 200);
  assert.equal(h.calls.filter(([kind]) => kind === "writeback").length, 0);
});

test("a stale optimistic version returns HTTP 409 before D1 UPDATE and Notion writeback", async () => {
  const h = harness();
  const result = await h.put({ expectedUpdatedAt: "stale" });
  assert.equal(result.status, 409);
  assert.equal(h.calls.some(([kind]) => kind === "update" || kind === "writeback"), false);
});

test("a concurrent D1 compare-and-swap conflict returns 409 and never writes Notion", async () => {
  const h = harness({ changed: true });
  const result = await h.put();
  assert.equal(result.status, 409);
  assert.equal(h.calls.some(([kind]) => kind === "writeback"), false);
});

test("Notion API error leaves D1 published, HTTP 200, and sanitized logging", async () => {
  const h = harness({ writerFails: true });
  const result = await h.put();
  assert.equal(result.status, 200);
  assert.equal(result.stored.status, "published");
  assert.equal(h.logs.length, 1);
  assert.equal(h.logs[0][0], "notion_article_publish_writeback_failed");
  assert.doesNotMatch(JSON.stringify(h.logs), /NOTION_SECRET_TOKEN/);
});

test("unlinked article remains published and does not patch Notion", async () => {
  const h = harness({ mapping: false });
  assert.equal((await h.put()).status, 200);
  assert.equal(h.calls.filter(([kind]) => kind === "notion-patch").length, 0);
});

test("disabled Notion sync remains published and skips remote patch", async () => {
  const h = harness({ enabled: false });
  assert.equal((await h.put()).status, 200);
  assert.equal(h.calls.filter(([kind]) => kind === "notion-patch").length, 0);
});

test("publishing with omitted content preserves blocks, SEO, topics and R2 references", async () => {
  const h = harness();
  const { stored, status } = await h.put();
  assert.equal(status, 200);
  assert.deepEqual(stored.sections, h.original.sections);
  assert.deepEqual(stored.sources, h.original.sources);
  assert.deepEqual(stored.blocks, h.original.blocks);
  assert.deepEqual(stored.topics, h.original.topics);
  assert.equal(stored.seoTitle, h.original.seoTitle);
  assert.equal(stored.imageKey, h.original.imageKey);
  assert.equal(stored.ogImageKey, h.original.ogImageKey);
});
