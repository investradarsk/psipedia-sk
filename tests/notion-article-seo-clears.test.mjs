import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import {
  articleSeoFromNotion,
  articleSeoExplicitClears,
} from "../lib/notion-article-seo-properties.ts";

// Standalone Node test of the same TypeScript source used by Workers.
// Rewrite the pure module's relative import for Node's data URL loader.
const asUrl = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const compile = async path => ts.transpileModule(
  await readFile(new URL(path, import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const propsUrl = asUrl(await compile("../lib/notion-article-seo-properties.ts"));
const receipt = await import(asUrl((await compile("../lib/notion-article-seo-receipt.ts"))
  .replace(/from ["']\.\/notion-article-seo-properties["']/, 'from "' + propsUrl + '"')));
const { encodeArticleSeoReceipt, decodeArticleSeoReceipt, articleSeoRemoteValues } = receipt;

const hex = "a".repeat(64);
const rich = content => ({
  type: "rich_text", rich_text: content ? [
    { type: "text", text: { content }, plain_text: content },
  ] : [],
});
const remote = (overrides = {}) => ({properties: {
  "SEO title": rich("Old title"),
  "Meta description": rich("Old description"),
  "Hlavné kľúčové slovo": rich("dog"),
  "Canonical URL": { type: "url", url: "https://psipedia.sk/clanky/original" },
  "Noindex": { type: "checkbox", checkbox: true },
  "OG title": rich("OG title"),
  "OG popis": rich("OG description"),
  "OG obrázok": { type: "url", url: "https://psipedia.sk/media/hero.webp" },
  ...overrides,
}});
const old = () => ({seo: {
  title: "Old title", description: "Old description", focusKeyword: "dog",
  canonicalUrl: "https://psipedia.sk/clanky/original", noindex: true,
  ogTitle: "OG title", ogDescription: "OG description", ogImage: "/media/hero.webp",
}, ogImageKey: "hero.webp"});

test("old hash-only receipts remain readable but cannot authorize deleting old Admin SEO", () => {
  const legacy = decodeArticleSeoReceipt(hex);
  assert.equal(legacy.hash, hex);
  assert.equal(legacy.seo, null);
  const blank = remote({
    "SEO title": rich(""),
    "Noindex": { type: "checkbox", checkbox: false },
    "OG obrázok": { type: "url", url: null },
  });
  const values = articleSeoFromNotion(blank, old(), legacy.seo);
  assert.equal(values.seoTitle, "Old title");
  assert.equal(values.noindex, true);
  assert.equal(values.ogImageUrl, "/media/hero.webp");
});

test("the new receipt persists exact confirmed raw Notion values, not Admin fallbacks", () => {
  const baseline = remote();
  const saved = encodeArticleSeoReceipt(hex, baseline);
  assert.match(saved, /^seo2:/);
  const parsed = decodeArticleSeoReceipt(saved);
  assert.equal(parsed.hash, hex);
  assert.deepEqual(parsed.seo, articleSeoRemoteValues(baseline));
  assert.equal(parsed.seo.noindex, true);
  assert.equal(parsed.seo.ogImageUrl, "https://psipedia.sk/media/hero.webp");
});

test("a formerly nonempty Notion SEO text/URL can now be explicitly cleared", () => {
  const baseline = decodeArticleSeoReceipt(encodeArticleSeoReceipt(hex, remote())).seo;
  const cleared = remote({
    "SEO title": rich(""), "Canonical URL": { type: "url", url: null },
    "OG popis": rich(""), "OG obrázok": { type: "url", url: null },
  });
  const keys = articleSeoExplicitClears(cleared, baseline);
  assert.deepEqual([...keys].sort(), ["seoTitle", "canonicalUrl", "ogDescription", "ogImageUrl"].sort());
  const values = articleSeoFromNotion(cleared, old(), baseline);
  assert.equal(values.seoTitle, "");
  assert.equal(values.canonicalUrl, "");
  assert.equal(values.ogDescription, "");
  assert.equal(values.ogImageUrl, null);
  assert.equal(values.ogImageKey, null);
  assert.equal(values.metaDescription, "Old description");
});

test("Noindex true -> false overrides old Admin true, but legacy false stays non-destructive", () => {
  const baseline = articleSeoRemoteValues(remote());
  const unchecked = remote({ "Noindex": { type: "checkbox", checkbox: false } });
  assert.equal(articleSeoFromNotion(unchecked, old(), baseline).noindex, false);
  assert.equal(articleSeoFromNotion(unchecked, old()).noindex, true);
  // New baseline now records the false value; repeat reads keep it false.
  const after = decodeArticleSeoReceipt(encodeArticleSeoReceipt(hex, unchecked)).seo;
  const existing = old();
  existing.seo.noindex = false;
  assert.equal(articleSeoFromNotion(unchecked, existing, after).noindex, false);
});

test("unchanged historic blanks remain non-destructive after they get their first baseline", () => {
  const blank = remote({
    "OG obrázok": {type:"url", url:null},
    "SEO title": rich(""),
    "Noindex": {type:"checkbox", checkbox:false},
  });
  const prev = decodeArticleSeoReceipt(encodeArticleSeoReceipt(hex, blank)).seo;
  const actual = articleSeoFromNotion(blank, old(), prev);
  assert.equal(actual.seoTitle, "Old title");
  assert.equal(actual.noindex, true);
  assert.equal(actual.ogImageUrl, "/media/hero.webp");
});

test("missing remote property cannot be mistaken for an explicit deletion", () => {
  const initial = articleSeoRemoteValues(remote());
  const edited = remote();
  delete edited.properties["OG obrázok"];
  assert.equal(articleSeoExplicitClears(edited, initial).has("ogImageUrl"), false);
  assert.equal(articleSeoFromNotion(edited, old(), initial).ogImageKey, "hero.webp");
});

test("receipt corruption and changed Notion SEO types fail safely", () => {
  assert.throws(() => decodeArticleSeoReceipt("seo2:{oops"), /NOTION_ARTICLE_SEO_RECEIPT_INVALID/);
  assert.throws(() => encodeArticleSeoReceipt("not-a-real-sha", remote()),
    /NOTION_ARTICLE_SEO_RECEIPT_INVALID/);
  assert.throws(() => articleSeoRemoteValues(remote({
    "Noindex": {type: "select", select: {name:"No"}},
  })), /NOTION_ARTICLE_SEO_TYPE_MISMATCH/);
});

test("SEO receipt integration covers inbound, draft, and targeted writeback", async () => {
  const source = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");
  assert.match(source, /decodeArticleSeoReceipt\(mapping\.content_hash\)\.hash === contentHash/);
  assert.match(source, /encodeArticleSeoReceipt\(contentHash, page\)/);
  assert.match(source, /encodeArticleSeoReceipt\(hash, verified\)/);
  assert.match(source, /encodeArticleSeoReceipt\(finalHash, verifiedPage\)/);
  assert.match(source, /articleSeoExplicitClears\(page, previousSeo\)\.has\("ogImageUrl"\)/);
  assert.match(source, /notionPageToManagedArticleInput\(page, blocks, existing \?\? undefined, previousSeo\)/);
});
