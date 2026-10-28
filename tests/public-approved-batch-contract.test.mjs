import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("directory overview loads five real published profiles per category, never the first mixed page", () => {
  const page = read("components/directory-page.tsx");
  const store = read("lib/directory-store.ts");
  assert.match(page, /getDirectoryCategoryPreviews\(5\)/);
  assert.match(page, /!active && filters\.page === 1/);
  assert.match(page, /Object\.keys\(filters\.facets \?\? \{\}\)\.length === 0/);
  assert.match(page, /data-directory-category-previews/);
  assert.match(page, /<DirectoryCard profile=\{profile\}/);
  assert.match(page, /directoryCategoryHref\(category\)/);
  assert.match(page, /<DirectoryResults/);
  assert.match(store, /export async function getDirectoryCategoryPreviews/);
  assert.match(store, /WHERE status = 'published' AND category = \?/);
  assert.match(store, /LIMIT \?/);
  assert.match(store, /database\.batch\(statements\)/);
});

test("article previews use one shared component in archive, homepage and all editorial sections", () => {
  const browser = read("components/article-browser.tsx");
  const home = read("components/article-card.tsx");
  const hub = read("components/editorial-section.tsx");
  const item = read("components/article-list-item.tsx");
  const css = read("components/public-visual-system/public-visual-system.module.css");
  assert.match(browser, /<ArticleListItem article=\{article\}/);
  assert.match(home, /ArticleListItem/);
  assert.match(hub, /SectionContentList/);
  assert.match(item, /PublicArticleListItem/);
  assert.match(css, /\.articleListTopic \{[\s\S]*?color: var\(--brand-accent-strong/);
});

test("profile layouts use one compact two-column services control and accessible single headings", () => {
  const profile = read("components/directory-profile-detail.tsx");
  const list = read("components/directory-services-list.tsx");
  assert.match(profile, /<DirectoryServicesList services=\{presentation\.services\}/);
  assert.match(profile, /compactHeading/);
  assert.match(list, /slice\(0, 10\)/);
  assert.match(list, /Math\.min\(5/);
  assert.match(list, /aria-expanded=\{expanded\}/);
});
