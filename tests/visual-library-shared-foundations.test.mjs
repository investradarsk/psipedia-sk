import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  verifiedSharedFoundationForGroup,
  ownerGroupsShareFoundation,
} from "../lib/visual-library-shared-foundations.ts";

const read = (path) => readFileSync(path,"utf8");

test("article cards are a real shared grid/featured React component with two distinct visual previews", () => {
  const samples = read("components/admin-component-visual-preview.tsx");
  const extra = read("components/admin-visual-library-extra-previews.tsx");
  const catalog = read("components/admin-visual-library-visual-catalog.tsx");
  const card = read("components/article-card.tsx");
  const tabs = read("components/portal-section-tabs.tsx");
  assert.match(card, /export function ArticleCard/);
  assert.match(card, /ArticleCardVariant = "featured" \| "grid" \| "compact"/);
  assert.match(samples, /id: "article-card-grid", path: "components\/article-card.tsx"/);
  assert.match(samples, /id: "article-card-featured", path: "components\/article-card.tsx"/);
  assert.match(samples, /id: "portal-section-tabs", path: "components\/portal-section-tabs.tsx"/);
  assert.match(extra, /<ArticleCard article=\{sampleArticle\} variant="grid"/);
  assert.match(extra, /variant="featured" showFavorite=\{false\}/);
  assert.match(extra, /<PortalSectionTabs section=\{sampleSection\}/);
  assert.match(catalog, /"article-card-featured": "article-card-grid"/);
  assert.match(catalog, /"subcategory-compact": "subcategory-landing"/);
  assert.match(tabs, /<PublicSubcategoryNavigator/);
});

test("only source-verified shared navigation foundations are linked, wrappers keep their own behavior", () => {
  const groups = [
    "subcategory-landing","help-category-nav","directory-category-navigation","portal-section-tabs",
  ];
  for (const id of groups) {
    const item = verifiedSharedFoundationForGroup(id);
    assert.equal(item.base, "PublicSubcategoryNavigator");
    assert.equal(item.basePath, "components/public-visual-system/public-subcategory-navigator.tsx");
    assert.ok(read(item.sourcePath).includes("PublicSubcategoryNavigator"));
  }
  assert.equal(verifiedSharedFoundationForGroup("subcategory-landing").relation, "direct-renderer");
  for (const id of groups.slice(1)) {
    assert.equal(verifiedSharedFoundationForGroup(id).relation,"purpose-specific-wrapper");
    assert.ok(verifiedSharedFoundationForGroup(id).distinction.length > 20);
  }
  assert.equal(ownerGroupsShareFoundation("help-category-nav","portal-section-tabs"),true);
  assert.equal(ownerGroupsShareFoundation("directory-category-navigation","subcategory-landing"),true);
  assert.equal(ownerGroupsShareFoundation("help-category-nav","event-list"),false);
  assert.equal(verifiedSharedFoundationForGroup("__proto__"),null);
});

test("owner sees reusable navigation source and no wrapper is auto-deleted", () => {
  const catalog=read("components/admin-visual-library-visual-catalog.tsx");
  const suggestions=read("lib/visual-library-owner-suggestions.ts");
  assert.match(catalog, /verifiedSharedFoundationForGroup\(chosen\.id\)/);
  assert.match(catalog, /Spoločný základ navigácie/);
  assert.match(catalog, /Spoločný základ neznamená, že možno zmazať ich vlastné funkcionality/);
  assert.doesNotMatch(catalog, /DELETE FROM|method:\s*"(POST|PATCH|DELETE)"/);
  assert.doesNotMatch(suggestions, /ownerGroupsShareFoundation\(a\.id, b\.id\)/);
});
