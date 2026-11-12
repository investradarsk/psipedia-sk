import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// The production module imports TypeScript by its bundler-resolved path.
// Transpile both pure modules to data URLs so Node runs their actual logic
// without requiring Next/Cloudflare or a custom TypeScript path loader.
const load = async (path) => {
  const text = await readFile(new URL(path, import.meta.url), "utf8");
  return ts.transpileModule(text, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  }}).outputText;
};
const asUrl = (source) => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const schemaUrl = asUrl(await load("../lib/notion-article-seo-properties.ts"));
const writerSource = (await load("../lib/notion-article-seo-writeback.ts"))
  .replace(/from ["']\.\/notion-article-seo-properties["']/, 'from "' + schemaUrl + '"');
const {
  articleSeoChangedFields, planArticleSeoWriteback, verifyArticleSeoPatch,
  planArticleSeoIndependentWriteback, projectArticleSeoConfirmedBaseline,
} = await import(asUrl(writerSource));

const rich = (value) => ({ type: "rich_text", rich_text: value ? [
  { type: "text", plain_text: value, text: { content: value } },
] : [] });
const url = (value) => ({ type: "url", url: value || null });
const checked = (value) => ({ type: "checkbox", checkbox: value });
const page = (overrides = {}) => ({
  "SEO title": rich("Title"),
  "Meta description": rich("Meta"),
  "Hlavné kľúčové slovo": rich("dog"),
  "Canonical URL": url("https://psipedia.sk/clanky/old"),
  "Noindex": checked(true),
  "OG title": rich("OG Title"),
  "OG popis": rich("OG Description"),
  "OG obrázok": url("https://psipedia.sk/media/old.webp"),
  ...overrides,
});
const canonical = (overrides = {}) => ({
  seo: {
    title: "Title", description: "Meta", focusKeyword: "dog",
    canonicalUrl: "https://psipedia.sk/clanky/old",
    noindex: true, ogTitle: "OG Title", ogDescription: "OG Description",
    ogImage: "/media/old.webp",
    ...overrides,
  },
});
const plan = (before, after, properties = page()) =>
  planArticleSeoWriteback({ before, after, properties, siteUrl: "https://psipedia.sk" });

test("unchanged SEO produces an empty PATCH even when another article field changes", () => {
  const old = canonical();
  const next = { ...structuredClone(old), title: "Edited body title" };
  assert.deepEqual(articleSeoChangedFields(old, next), []);
  assert.deepEqual(plan(old, next).properties, {});
});

test("editing one field patches ONLY its canonical Notion property", () => {
  const old = canonical();
  const next = canonical({ description: "New Meta" });
  const current = plan(old, next);
  assert.deepEqual(current.changed, ["metaDescription"]);
  assert.deepEqual(Object.keys(current.properties), ["Meta description"]);
  assert.deepEqual(current.properties["Meta description"].rich_text.map(v => v.text.content), ["New Meta"]);
  verifyArticleSeoPatch(current, page(), "before");
  verifyArticleSeoPatch(current, page({ "Meta description": rich("New Meta") }), "after");
});

test("all eight updated SEO fields use exactly eight existing Notion columns", () => {
  const old = canonical();
  const next = canonical({
    title: "Updated title", description: "Updated meta", focusKeyword: "new dog",
    canonicalUrl: "https://psipedia.sk/clanky/new",
    noindex: false, ogTitle: "Updated OG", ogDescription: "Updated OG Desc",
    ogImage: "/media/new.webp",
  });
  const patch = plan(old, next);
  assert.deepEqual(Object.keys(patch.properties).sort(), [
    "SEO title", "Meta description", "Hlavné kľúčové slovo",
    "Canonical URL", "Noindex", "OG title", "OG popis", "OG obrázok",
  ].sort());
  assert.deepEqual(patch.properties["Noindex"], { checkbox: false });
  assert.deepEqual(patch.properties["OG obrázok"], {
    url: "https://psipedia.sk/media/new.webp",
  });
  assert.deepEqual(patch.properties["Canonical URL"], {
    url: "https://psipedia.sk/clanky/new",
  });
});

test("clearing one URL writes null without deleting an unrelated OG image", () => {
  const current = plan(canonical(), canonical({ canonicalUrl: "" }));
  assert.deepEqual(Object.keys(current.properties), ["Canonical URL"]);
  assert.deepEqual(current.properties["Canonical URL"], { url: null });
  assert.equal("OG obrázok" in current.properties, false);
});

test("completed retry skips fields whose Notion value already equals the desired value", () => {
  const current = plan(canonical(), canonical({ ogDescription: "New OG" }), page({
    "OG popis": rich("New OG"),
  }));
  assert.deepEqual(current.changed, ["ogDescription"]);
  assert.deepEqual(current.properties, {});
  verifyArticleSeoPatch(current, page({ "OG popis": rich("New OG") }), "after");
});

test("concurrent Notion edits are not overwritten", () => {
  assert.throws(() => plan(canonical(), canonical({ ogDescription: "Admin" }), page({
    "OG popis": rich("Changed in Notion"),
  })), /NOTION_ARTICLE_SEO_FIELD_CONFLICT/);
  const pre = plan(canonical(), canonical({ ogDescription: "Admin" }));
  assert.throws(() => verifyArticleSeoPatch(pre, page({ "OG popis": rich("Other") }), "before"),
    /NOTION_ARTICLE_SEO_FIELD_CONFLICT/);
  assert.throws(() => verifyArticleSeoPatch(pre, page(), "after"),
    /NOTION_ARTICLE_SEO_ECHO_MISMATCH/);
});

test("invalid schema or changed URL blocks the targeted operation before PATCH", () => {
  assert.throws(() => plan(canonical(), canonical({ noindex: false }), page({
    "Noindex": { type: "select", select: null },
  })), /NOTION_ARTICLE_SEO_TYPE_MISMATCH/);
  assert.throws(() => plan(canonical(), canonical({ ogImage: "javascript:alert(1)" })),
    /NOTION_ARTICLE_SEO_URL_INVALID/);
  assert.throws(() => plan(canonical(), canonical({ ogTitle: "New" }), page({
    "OG title": undefined,
  })), /NOTION_ARTICLE_SEO_PROPERTY_MISSING/);
});


test("Admin save route dispatches a SEO delta for drafts AND published articles", async () => {
  const route = await readFile(new URL("../app/api/admin/articles/[id]/route.ts", import.meta.url), "utf8");
  const sync = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");
  const planSource = await readFile(new URL("../lib/notion-article-content-plan.ts", import.meta.url), "utf8");
  assert.match(route, /articleSeoChangedFields\(before, article\)\.length > 0/);
  assert.match(route, /writeBackArticleSeoToNotion\(\{[\s\S]*?before, article/);
  assert.match(route, /writeBackDraftArticleContentToNotion/);
  assert.match(sync, /export async function writeBackArticleSeoToNotion/);
  assert.match(sync, /verifyArticleSeoPatch\(plan, latest\.properties \?\? \{\}, "before"\)/);
  assert.match(sync, /verifyArticleSeoPatch\(plan, verified\.properties \?\? \{\}, "after"\)/);
  assert.match(sync, /content_hash = \?[^\n]*notion_last_edited_time/);
  assert.match(sync, /seoFields: \[\]/);
  assert.match(planSource, /args\.seoFields === undefined \|\| args\.seoFields\.includes\(key\)/);
});

test("one conflicting SEO property does not prevent independently valid field updates", () => {
  const old = canonical();
  const next = canonical({ description: "Meta updated", ogDescription: "Edited in Admin" });
  const remote = page({ "OG popis": rich("Edited in Notion") });
  const outcome = planArticleSeoIndependentWriteback({
    before: old, after: next, properties: remote, siteUrl: "https://psipedia.sk",
  });
  assert.deepEqual(outcome.ready.map(entry => entry.field), ["metaDescription"]);
  assert.deepEqual(Object.keys(outcome.ready[0].plan.properties), ["Meta description"]);
  assert.deepEqual(outcome.failures, [{
    field: "ogDescription", code: "NOTION_ARTICLE_SEO_FIELD_CONFLICT",
  }]);
  verifyArticleSeoPatch(outcome.ready[0].plan, remote, "before");
  const baseline = projectArticleSeoConfirmedBaseline(
    { properties: remote }, { ogDescription: "OG Description" }, outcome.failures,
  );
  assert.equal(baseline.properties["OG popis"].rich_text[0].plain_text, "OG Description");
  assert.equal(baseline.properties["Meta description"].rich_text[0].plain_text, "Meta");
  assert.equal(remote["OG popis"].rich_text[0].plain_text, "Edited in Notion");
});

test("an invalid URL or missing remote field fails only that SEO field", () => {
  const before = canonical();
  const after = canonical({ title: "New SEO title", canonicalUrl: "invalid-url", focusKeyword: "updated" });
  const outcome = planArticleSeoIndependentWriteback({
    before, after, properties: page({ "Hlavné kľúčové slovo": undefined }),
    siteUrl: "https://psipedia.sk",
  });
  assert.deepEqual(outcome.ready.map(entry => entry.field), ["seoTitle"]);
  assert.deepEqual(outcome.failures, [
    { field: "focusKeyword", code: "NOTION_ARTICLE_SEO_PROPERTY_MISSING" },
    { field: "canonicalUrl", code: "NOTION_ARTICLE_SEO_URL_INVALID" },
  ]);
  assert.throws(() => projectArticleSeoConfirmedBaseline(
    { properties: page() }, null, outcome.failures,
  ), /NOTION_ARTICLE_SEO_REMOTE_CONFLICT/);
});

test("partial SEO sync cannot be reported as fully synchronized", async () => {
  const route = await readFile(new URL("../app/api/admin/articles/[id]/route.ts", import.meta.url), "utf8");
  const source = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");
  assert.match(route, /result\.reason === "partial"/);
  assert.match(source, /reason: "partial", failedFields: failures/);
  assert.match(source, /ARTICLE_SEO_WRITEBACK_PARTIAL/);
  assert.match(source, /if \(failures\.length\)/);
});
