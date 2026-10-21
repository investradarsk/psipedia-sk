import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  buildNotionEditorialPlan, EditorialSyncConflict,
  notionEditorialBlockShape, notionEditorialPropertyText,
} from "../lib/notion-article-content-plan.ts";

const rich = (value, bold = false) => value
  ? [{ type: "text", plain_text: value, text: { content: value },
    annotations: { bold, italic: false } }] : [];
const block = (id, type, value) => ({
  id, type, has_children: false, [type]: { rich_text: rich(value) },
});
const article = () => ({
  id: 11, status: "draft", title: "Názov článku", slug: "clanok",
  intro: "Dlhší úvodný odsek s dôležitými informáciami pre používateľa.",
  blocks: [
    { id: "notion-h", type: "h2", text: "Pôvodný nadpis" },
    { id: "notion-p", type: "text", content: "Pôvodný odsek." },
  ],
  seoTitle: "SEO názov", metaDescription: "Pôvodný SEO opis článku.",
  focusKeyword: "tréning", ogTitle: "SEO názov",
  ogDescription: "Pôvodný SEO opis článku.",
  image: null, imageAlt: "", imageCreditUrl: "",
});
const page = () => ({
  "Názov": { title: rich("Názov článku") },
  "SEO title": { rich_text: rich("SEO názov") },
  "Meta description": { rich_text: rich("Pôvodný SEO opis článku.") },
  "Hlavné kľúčové slovo": { rich_text: rich("tréning") },
  "Hlavný obrázok URL": { url: null },
  "Alt text obrázka": { rich_text: [] },
  "Zdroj obrázka": { url: null },
});
const originalBlocks = () => [
  block("intro", "paragraph", article().intro),
  block("h", "heading_2", "Pôvodný nadpis"),
  block("p", "paragraph", "Pôvodný odsek."),
];
const build = (a = article(), b = originalBlocks(), p = page()) =>
  buildNotionEditorialPlan({ article: a, remoteBlocks: b, pageProperties: p,
    siteUrl: "https://psipedia.sk" });

test("no-op is idempotent: text and SEO round-trip unchanged", () => {
  const result = build();
  assert.equal(result.blocks.length, 0);
  assert.deepEqual(result.properties, {});
});

test("Admin heading and paragraph edits preserve slot ordering and original Notion block identities", () => {
  const a = article();
  a.blocks[0].text = "Upravený nadpis";
  a.blocks[1].content = "Nový odsek.";
  const plan = build(a);
  assert.deepEqual(plan.blocks.map((b) => b.id), ["h", "p"]);
  assert.deepEqual(plan.blocks.map((b) => b.type), ["heading_2", "paragraph"]);
  assert.match(JSON.stringify(plan.blocks[0].payload), /Upravený nadpis/);
  assert.match(JSON.stringify(plan.blocks[1].payload), /Nový odsek/);
  assert.notEqual(plan.blocks[0].before, plan.blocks[0].after);
});

test("title, SEO, optional OG and explicit clearing are precise property PATCH changes", () => {
  const a = article();
  const p = page();
  p["OG title"] = { rich_text: rich("SEO názov") };
  p["OG description"] = { rich_text: rich("Pôvodný SEO opis článku.") };
  a.title = "Nový názov";
  a.metaDescription = "";
  a.ogDescription = "Nový OG opis";
  const plan = build(a, originalBlocks(), p);
  assert.deepEqual(Object.keys(plan.properties).sort(),
    ["Názov", "Meta description", "OG description"].sort());
  assert.deepEqual(plan.properties["Meta description"].rich_text, []);
  assert.equal(plan.propertyBefore["Názov"], "Názov článku");
  assert.equal(plan.propertyAfter["Názov"], "Nový názov");
});

test("formatting marks are transferred without stripping links or bold", () => {
  const a = article();
  a.blocks[1].richText = {
    version: 1, type: "doc", content: [{ type: "paragraph", content: [
      { type: "text", text: "Odkaz", marks: [{ type: "bold" },
        { type: "link", href: "https://example.org/" }] },
    ] }],
  };
  const plan = build(a);
  const node = plan.blocks.at(-1).payload.paragraph.rich_text[0];
  assert.equal(node.annotations.bold, true);
  assert.equal(node.text.link.url, "https://example.org/");
});

test("images retain HTTPS URLs and captions, without dropping alt metadata", () => {
  const a = article();
  a.blocks = [{ id: "i", type: "image", url: "/media/article.jpg",
    imageKey: "article.jpg", alt: "Labrador pri vode", caption: "Labrador pri vode" }];
  const b = [originalBlocks()[0], {
    id: "i", type: "image", image: {
      type: "external", external: { url: "https://psipedia.sk/media/old.jpg" },
      caption: rich("Labrador pri vode"),
    },
  }];
  const plan = build(a, b);
  assert.equal(plan.blocks.length, 1);
  assert.equal(plan.blocks[0].payload.image.external.url,
    "https://psipedia.sk/media/article.jpg");
});

test("same-slot supported list order can update; insert/delete and type reorder fail closed", () => {
  const a = article();
  a.blocks = [{ id: "l", type: "bullet-list", items: ["Druhý", "Prvý"] }];
  const b = [originalBlocks()[0], block("l1", "bulleted_list_item", "Prvý"),
    block("l2", "bulleted_list_item", "Druhý")];
  assert.deepEqual(build(a, b).blocks.map((op) => op.id), ["l1", "l2"]);
  a.blocks[0].items.push("Tretí");
  assert.throws(() => build(a, b), /UNSUPPORTED_BLOCK_INSERT_DELETE/);
  assert.throws(() => build(article(), [b[0], block("x", "quote", "x"), b[2]]),
    /UNSUPPORTED_BLOCK_REORDER_OR_TYPE/);
});

test("unsupported Notion children/marks and unsafe Admin blocks never disappear", () => {
  const unknown = originalBlocks();
  unknown[2] = { id: "x", type: "child_page", child_page: { title: "Sensitive" } };
  assert.throws(() => build(article(), unknown), EditorialSyncConflict);
  const withChildren = originalBlocks();
  withChildren[2].has_children = true;
  assert.throws(() => build(article(), withChildren), /UNSUPPORTED_NOTION_CHILDREN/);
  const a = article();
  a.blocks[1] = { id: "g", type: "gallery", images: [] };
  assert.throws(() => build(a), /UNSUPPORTED_ADMIN_BLOCK_gallery/);
  const underlined = originalBlocks();
  underlined[2].paragraph.rich_text[0].annotations.underline = true;
  assert.throws(() => build(article(), underlined), /UNSUPPORTED_NOTION_MARK/);
});

test("scheduled and published articles cannot enter editorial planner", () => {
  for (const status of ["published", "scheduled"]) {
    const a = article(); a.status = status;
    assert.throws(() => build(a), /NOT_A_DRAFT/);
  }
});

test("partial retries have stable preimage and target block fingerprints", () => {
  const a = article();
  a.blocks[0].text = "Po úprave";
  const plan = build(a);
  const op = plan.blocks[0];
  assert.equal(op.before, notionEditorialBlockShape(originalBlocks()[1]));
  const patched = { id: "h", type: "heading_2", heading_2: {
    rich_text: rich("Po úprave"),
  } };
  assert.equal(op.after, notionEditorialBlockShape(patched));
  assert.equal(notionEditorialPropertyText({ rich_text: rich("SEO názov") }, "rich_text"), "SEO názov");
});

test("source contracts: outbox, content gating, no-publish and post-commit integration", async () => {
  const [sync, route, migration] = await Promise.all([
    readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/admin/articles/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0138_article_editorial_outbox.sql", import.meta.url), "utf8"),
  ]);
  assert.match(sync, /NOTION_ARTICLE_CONTENT_WRITEBACK_ENABLED/);
  assert.match(sync, /article\.status !== "draft"/);
  assert.match(sync, /ADMIN_ARTICLE_REVISION_CONFLICT/);
  assert.match(sync, /NOTION_EDITORIAL_REMOTE_CONFLICT/);
  assert.match(sync, /NOTION_EDITORIAL_BLOCK_CONFLICT/);
  assert.match(sync, /NOTION_EDITORIAL_VERIFICATION_FAILED/);
  assert.match(sync, /INSERT OR IGNORE INTO article_notion_editorial_outbox/);
  assert.match(sync, /NOTION_EDITORIAL_WRITEBACK_PENDING/);
  assert.match(sync, /ADMIN_UNACKNOWLEDGED_EDITORIAL_REVISION/);
  assert.match(sync, /adminTime > receiptTime/);
  assert.match(migration, /article_id INTEGER NOT NULL UNIQUE/);
  assert.match(route, /writeBackDraftArticleContentToNotion/);
  assert.match(route, /before\.status === "draft" && article\.status === "draft"/);
  assert.match(route, /writeBackPublishedArticleToNotion/);
  assert.match(route, /notionEditorialWriteback = \{ status: "blocked", code \}/);
  assert.match(route, /return Response\.json\(\{ article, \.*\(notionEditorialWriteback/);
});


test("Notion property type drift cannot be mistaken for an empty SEO, title or URL field", () => {
  assert.throws(
    () => notionEditorialPropertyText({ type: "select", select: null }, "rich_text"),
    /NOTION_EDITORIAL_PROPERTY_TYPE_CONFLICT/,
  );
  assert.throws(
    () => notionEditorialPropertyText({ type: "rich_text", rich_text: null }, "rich_text"),
    /NOTION_EDITORIAL_PROPERTY_TYPE_CONFLICT/,
  );
  assert.throws(
    () => notionEditorialPropertyText({ type: "url", url: { address: "malformed" } }, "url"),
    /NOTION_EDITORIAL_PROPERTY_TYPE_CONFLICT/,
  );
  const p = page();
  p["SEO title"] = { type: "number", number: 42 };
  const a = article();
  a.seoTitle = "Changed by Admin";
  assert.throws(() => build(a, originalBlocks(), p), /NOTION_EDITORIAL_PROPERTY_TYPE_CONFLICT/);
  assert.equal(notionEditorialPropertyText({ type: "url", url: null }, "url"), "");
});

test("main image and SEO writeback preserve separate metadata without changing publication", () => {
  const a = article();
  a.image = "https://psipedia.sk/media/replaced.webp";
  a.imageAlt = "Pes na lúke";
  a.imageCreditUrl = "https://example.org/source";
  a.seoTitle = "Nový titul pre vyhľadávače";
  const plan = build(a);
  assert.equal(plan.properties["Hlavný obrázok URL"].url, a.image);
  assert.equal(plan.properties["Zdroj obrázka"].url, a.imageCreditUrl);
  assert.match(JSON.stringify(plan.properties["Alt text obrázka"]), /Pes na lúke/);
  assert.match(JSON.stringify(plan.properties["SEO title"]), /Nový titul/);
  assert.equal(Object.hasOwn(plan.properties, "Stav"), false);
  assert.equal(Object.hasOwn(plan.properties, "Psipedia ID"), false);
  assert.equal(Object.hasOwn(plan.properties, "Slug"), false);
  assert.equal(Object.hasOwn(plan.properties, "Kategória"), false);
});

test("malformed Notion rich text cannot become an empty paragraph", () => {
  const b = originalBlocks();
  b[2].paragraph.rich_text = { invalid: true };
  assert.throws(() => build(article(), b), /INVALID_REMOTE_RICH_TEXT/);
});

test("staged D1 0138 journal enforces foreign keys, single owner and CAS lease in SQLite", async () => {
  const sql = await readFile(new URL("../docs/proposals/0138_article_editorial_outbox_PENDING_0137.sql", import.meta.url), "utf8");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec("CREATE TABLE managed_articles (id INTEGER PRIMARY KEY);");
    db.exec("CREATE TABLE article_notion_sync (notion_page_id TEXT PRIMARY KEY, article_id INTEGER UNIQUE);");
    db.exec(sql);
    db.exec("INSERT INTO managed_articles (id) VALUES (11), (12);");
    db.exec("INSERT INTO article_notion_sync (notion_page_id, article_id) VALUES ('p11', 11), ('p12', 12);");
    const create = db.prepare("INSERT INTO article_notion_editorial_outbox (notion_page_id, article_id, article_updated_at, base_content_hash, operations_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
    create.run("p11", 11, "rev11", "hash", "{}", "2026-10-21T00:00:00.000Z", "2026-10-21T00:00:00.000Z");
    assert.throws(() => create.run("p12", 11, "rev11", "hash", "{}", "now", "now"), /UNIQUE/);
    const claim = db.prepare("UPDATE article_notion_editorial_outbox SET lease_owner = ?, lease_until = ? WHERE notion_page_id = ? AND (lease_owner IS NULL OR lease_until <= ?)");
    assert.equal(claim.run("worker-a", "2026-10-22T00:00:00.000Z", "p11", "2026-10-21T00:00:00.000Z").changes, 1);
    assert.equal(claim.run("worker-b", "2026-10-22T00:00:00.000Z", "p11", "2026-10-21T00:00:00.000Z").changes, 0);
    db.prepare("DELETE FROM article_notion_sync WHERE notion_page_id = ?").run("p11");
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM article_notion_editorial_outbox").get().n, 0);
  } finally {
    db.close();
  }
});
