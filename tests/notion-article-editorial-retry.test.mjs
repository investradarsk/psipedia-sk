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
function setup({ enabled = true } = {}) {
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
  const plan = {
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
  let unsafeRemoteChange = false;
  const db = {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async first() {
              calls.push(["sql-first", sql]);
              if (sql.includes("SELECT notion_page_id, article_id, content_hash")) return { ...mapping };
              if (sql.includes("SELECT status, updated_at FROM managed_articles"))
                return { status: article.status, updated_at: article.updatedAt };
              if (sql.includes("SELECT * FROM article_notion_editorial_outbox")) return journal.deleted ? null : { ...journal };
              throw Error("Unexpected SELECT: " + sql);
            },
            async run() {
              calls.push(["sql-run", sql]);
              if (sql.startsWith("UPDATE article_notion_sync SET")) {
                mapping.content_hash = args[0];
                return { meta: { changes: 1 } };
              }
              if (sql.startsWith("DELETE FROM article_notion_editorial_outbox")) {
                journal.deleted = true; return { meta: { changes: 1 } };
              }
              throw Error("Unexpected DML: " + sql);
            },
          };
        },
      };
    },
  };
  const fetchMock = async (endpoint, options = {}) => {
    const url = new URL(endpoint);
    const method = options.method ?? "GET";
    calls.push([method, url.pathname]);
    if (url.pathname === "/v1/pages/" + pageId) {
      if (method === "GET") return Response.json(structuredClone(notion));
      const props = JSON.parse(options.body).properties;
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
    set unsafeRemoteChange(v) { unsafeRemoteChange = v; },
    planner, fetchMock };
}
async function loadWriter(h) {
  const source = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  const dependencies = {
    "@/lib/article-store": {},
    "@/lib/article-blocks": {},
    "@/lib/article-promo": {},
    "@/lib/editorial-content": { EDITORIAL_RICH_TEXT_VERSION: 1 },
    "@/lib/portal": {},
    "@/lib/article-subsection-taxonomy": {},
    "@/config/public-site": { SITE_URL: "https://psipedia.sk" },
    "@/lib/notion-article-content-plan": h.planner,
  };
  runInNewContext(compiled, {
    exports, module: { exports },
    require(name) {
      if (!(name in dependencies)) throw Error("Unexpected import: " + name);
      return dependencies[name];
    },
    fetch: h.fetchMock, Response, Request, Headers, URL, URLSearchParams,
    TextEncoder, crypto, Date, JSON, console,
  }, { timeout: 1500 });
  return exports.writeBackDraftArticleContentToNotion;
}
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
  assert.equal(h.notion.properties["Sync stav"], undefined);
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
    /NOTION_EDITORIAL_BLOCK_IDENTITY_CONFLICT/,
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
    /NOTION_EDITORIAL_BLOCK_ORDER_CONFLICT/,
  );
  assert.equal(h.calls.filter(([verb]) => verb === "PATCH").length, 0);
  assert.equal(h.mapping.content_hash, "baseline-hash");
});
