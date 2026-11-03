import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ownerKnownUsesForGroup } from "../lib/visual-library-owner-evidence.ts";

const read = (name) => readFileSync(name, "utf8");
const previews = read("components/admin-component-visual-preview.tsx");
const extra = read("components/admin-visual-library-extra-previews.tsx");
const catalog = read("components/admin-visual-library-visual-catalog.tsx");
const mockArticleUsage = { status: "unavailable", scannedArticles: 0, byKey: {} };

test("Help, breadcrumb and tab previews use actual public components with no production records", () => {
  for (const id of [
    "help-profile",
    "help-profile-urgent",
    "help-category-nav",
    "breadcrumbs",
    "section-tabs",
    "portal-section-tabs",
    "article-card-grid",
    "article-card-featured",
  ]) {
    assert.match(previews, new RegExp('id: "' + id + '"'));
    assert.match(extra, new RegExp('case "' + id + '"'));
  }
  for (const symbol of [
    "PublicHelpProfileCard", "PublicHelpCategoryNav", "PublicMediaFallback",
    "Breadcrumbs", "SectionTabs", "PortalSectionTabs", "ArticleCard",
  ]) {
    assert.match(extra, new RegExp('<' + symbol));
  }
  assert.match(extra, /Ilustračný obsah/);
  assert.doesNotMatch(extra, /DB\.prepare|cloudflare:workers|fetch\(|method:\s*"(PUT|POST|DELETE)"/);
});

test("urgency is a presentation variant, not a second canonical Help profile component", () => {
  assert.match(catalog, /"help-profile-urgent": "help-profile"/);
  assert.match(previews, /path: "components\/public-visual-system\/public-help-profile-card.tsx"/);
});

test("known Help root placements use real source-linked URLs, never invented profile slugs", () => {
  for (const [group, placement] of [
    ["help-profile", /Prehľadové karty/],
    ["help-category-nav", /Navigácia kategórií/],
    ["breadcrumbs", /Drobečková navigácia/],
  ]) {
    const result = ownerKnownUsesForGroup(group, [], [], mockArticleUsage);
    assert.equal(result.uses.length, 1);
    assert.equal(result.uses[0].url, "https://psipedia.sk/pomoc-psom");
    assert.match(result.uses[0].placement, placement);
    assert.equal(result.uses[0].evidence, "verified-in-code");
  }
  assert.equal(ownerKnownUsesForGroup("section-tabs", [], [], mockArticleUsage).uses.length, 0);
});
