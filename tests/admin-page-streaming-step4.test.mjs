import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("slow list readers no longer prevent the shared Admin shell from rendering", () => {
  const checks = [
    ["app/admin/organizacie/page.tsx", "pagePromise", "OrganizationList"],
    ["app/admin/adopcie/page.tsx", "pagePromise", "AdoptionContent"],
    ["app/admin/stratene-najdene/page.tsx", "resultPromise", "LostFoundContent"],
    ["app/admin/pomoc-psom/page.tsx", "tablePromise", "HelpTable"],
  ];
  for (const [path, promise, panel] of checks) {
    const code = read(path);
    const handler = code.slice(code.indexOf("export default async function "));
    assert.match(handler, /await requireAdminPageUser\(/, path);
    assert.ok(handler.includes("const " + promise + " ="), path + " starts data read");
    assert.ok(handler.indexOf("<AdminShell") > handler.indexOf("const " + promise + " ="), path + " streams shell");
    assert.match(handler, /<Suspense fallback=\{<AdminDataLoading/, path);
    assert.ok(handler.includes("<" + panel + " "), path + " has async content boundary");
  }
});

test("optional review failures never masquerade as not reviewed", () => {
  const checks = [
    ["app/admin/organizacie/page.tsx", "components/admin-organization-publication-dashboard.tsx"],
    ["app/admin/adopcie/page.tsx", "components/admin-adoption-dashboard.tsx"],
    ["app/admin/stratene-najdene/page.tsx", "components/admin-lost-found-dashboard.tsx"],
  ];
  for (const [page, component] of checks) {
    const route = read(page);
    const dashboard = read(component);
    assert.match(route, /listReviewedAdminEntityIds[\s\S]*?\.catch\(\(\) => null\)/, page);
    assert.match(route, /role="alert"/, page);
    assert.match(dashboard, /reviewedIds === null \? null : new Set\(reviewedIds\)/, component);
    assert.match(dashboard, /Stav redakčnej kontroly nedostupný/, component);
  }
  assert.match(read("components/admin-lost-found-dashboard.tsx"), /counts \? tab\.count\(counts\) : "—"/);
});

test("organization editor data required for editing is never substituted by empty source on errors", () => {
  const page = read("app/admin/organizacie/[id]/page.tsx");
  const suggestions = read("components/admin-organization-suggestions.tsx");
  const primary = page.slice(page.indexOf("const [organization, locations] = await Promise.all"), page.indexOf("]);", page.indexOf("const [organization, locations] = await Promise.all")));
  for (const token of ["getOrganizationPublicationAdminById", "listOrganizationLocationsAdmin"])
    assert.ok(primary.includes(token));
  for (const optional of ["listOrganizationFundraisingMethodsAdmin", "getAdminEntityReview", "getCanonicalDraftDuplicateWarning", "listCanonicalAutomationUpdateSuggestions"])
    assert.ok(!primary.includes(optional), optional + " never blocks core editor");
  assert.match(page, /Fundraising sa nepodarilo načítať/);
  assert.match(page, /Stav redakčnej kontroly sa nepodarilo načítať/);
  assert.match(page, /automationSuggestionsPromise=\{suggestionsPromise\}/);
  assert.match(suggestions, /use\(promise\)/);
  assert.match(suggestions, /<Suspense fallback=/);
});

test("article topics and Notion warnings load separately from the primary lists", () => {
  const articles = read("app/admin/clanky/page.tsx");
  const dashboard = read("components/admin-dashboard.tsx");
  const operations = read("app/admin/operations/page.tsx");
  const reviews = read("app/admin/recenzie/page.tsx");
  assert.match(articles, /const dataPromise = listManagedArticleSummaries/);
  assert.match(articles, /const topicOptionsPromise = listArticleTopics/);
  assert.doesNotMatch(articles, /const dataPromise = Promise\.all/);
  assert.match(dashboard, /function SuspendedArticleTopics/);
  assert.match(dashboard, /const options = use\(promise\)/);
  assert.match(dashboard, /topicOptionsPromise \? \(/);
  assert.match(operations, /const attention = await attentionPromise/);
  assert.match(operations, /AdminNotionAlertsPanel promise=\{notionAlertsPromise\}/);
  assert.match(reviews, /<Suspense fallback=\{<AdminDataLoading label="Recenzie a testy"/);
});
