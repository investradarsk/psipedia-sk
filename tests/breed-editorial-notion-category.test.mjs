import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const store = read("lib/article-store.ts");
const notion = read("lib/notion-article-sync.ts");
const atlas = read("app/plemena/page.tsx");
const browser = read("components/article-browser.tsx");
const admin = read("components/admin-article-editor.tsx");
const routes = read("lib/article-category-routes.ts");

test("Plemená is a distinct editorial category without creating a conflicting article route", () => {
  assert.match(store, /ARTICLE_CATEGORIES = \[[^\]]*"Plemená"/);
  assert.match(notion, /notionCategory === "Plemená"/);
  assert.match(notion, /category: "Plemená", portalSection: "clanky", portalSubpage: null/);
  assert.match(routes, /Plemená: "\/plemena#clanky-o-plemenach"/);
  assert.match(admin, /<option>Plemená<\/option>/);
  assert.match(browser, /"Plemená"/);
  assert.match(atlas, /category: "Plemená", limit: 12/);
  assert.match(atlas, /id="clanky-o-plemenach"/);
});

test("Notion breed relation is mapped by verified IDs, never by title", () => {
  assert.match(notion, /propertyRecord\(page, "Prepojené plemená"\)/);
  assert.match(notion, /resolveNotionArticleBreedIds\(database, page, existing\?\.relatedBreedIds\)/);
  assert.match(notion, /FROM breed_notion_sync WHERE lower\(replace\(notion_page_id/);
  assert.match(notion, /FROM breed_notion_workcopy_links WHERE lower\(replace\(work_notion_page_id/);
  assert.match(notion, /NOTION_ARTICLE_BREED_RELATION_TRUNCATED/);
  assert.match(notion, /relatedBreedIds: signedFields\?\.has\("relatedBreedIds"\)/);
});

test("existing published article URLs are permanently redirected after explicit reclassification", () => {
  const formerSection = read("app/[section]/[slug]/page.tsx");
  const formerArchive = read("app/clanky/[slug]/page.tsx");
  assert.match(formerSection, /canonical !== `\/\$\{section\}\/\$\{slug\}`\) permanentRedirect\(canonical\)/);
  assert.match(formerArchive, /canonical !== `\/clanky\/\$\{slug\}`\) permanentRedirect\(canonical\)/);
});
