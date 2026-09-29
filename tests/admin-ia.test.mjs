import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  adminNavigationGroups,
  adminNavigationItems,
  findActiveAdminNavigationItem,
  getAdminBreadcrumbs,
} from "../lib/admin-navigation.ts";
import { summarizeAdminAutomationReads } from "../lib/admin-automation-reliability.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin navigation has at most seven task-oriented groups and keeps all canonical agendas reachable", () => {
  assert.ok(adminNavigationGroups.length <= 7);
  assert.deepEqual(adminNavigationGroups.map((group) => group.label), [
    "Prehľad",
    "Obsah",
    "Služby a pomoc",
    "Komunita a partneri",
    "Automatizácie a kvalita",
    "Nastavenia a prevádzka",
  ]);

  const hrefs = adminNavigationItems.map((item) => item.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "primary admin navigation must not duplicate entries");
  for (const href of [
    "/admin",
    "/admin/operations",
    "/admin/clanky",
    "/admin/steniatka",
    "/admin/plemena",
    "/admin/sekcie",
    "/admin/meniny",
    "/admin/adresar",
    "/admin/organizacie",
    "/admin/podujatia",
    "/admin/pomoc",
    "/admin/adopcie",
    "/admin/stratene-najdene",
    "/admin/mapy",
    "/admin/recenzie-profilov",
    "/admin/tipy",
    "/admin/hodnotenia",
    "/admin/dopyty",
    "/admin/adresar/navrhy",
    "/admin/partners",
    "/admin/automatizacie",
    "/admin/kvalita",
    "/admin/nastroje",
    "/admin/nastavenia",
    "/admin/navigacia",
    "/admin/monetizacia",
    "/admin/pravne",
  ]) {
    assert.ok(hrefs.includes(href), `missing admin agenda ${href}`);
  }
});

test("active state uses the most specific top-level owner for detail and legacy routes", () => {
  const cases = [
    ["/admin", "/admin"],
    ["/admin/clanky/123", "/admin/clanky"],
    ["/admin/novy", "/admin/clanky"],
    ["/admin/adresar/42", "/admin/adresar"],
    ["/admin/adresar/navrhy", "/admin/adresar/navrhy"],
    ["/admin/partners/claims/claim-1", "/admin/partners"],
    ["/admin/operations", "/admin/operations"],
    ["/admin/operations/automation/42", "/admin/automatizacie"],
    ["/admin/operations/outreach/42", "/admin/nastroje"],
    ["/admin/operations/possible-matches/1/2", "/admin/nastroje"],
    ["/admin/operations/geo", "/admin/mapy"],
  ];
  for (const [pathname, href] of cases) {
    assert.equal(findActiveAdminNavigationItem(pathname)?.href, href, pathname);
  }
});

test("breadcrumbs point back to the canonical list and identify details", () => {
  assert.deepEqual(getAdminBreadcrumbs("/admin"), [
    { label: "Pracovný prehľad", href: "/admin", current: true },
  ]);

  const article = getAdminBreadcrumbs("/admin/clanky/15");
  assert.deepEqual(article.map((item) => item.href), ["/admin", "/admin/clanky", "/admin/clanky/15"]);
  assert.equal(article.at(-1)?.current, true);

  const partner = getAdminBreadcrumbs("/admin/partners/claims/abc");
  assert.deepEqual(partner.map((item) => item.href), ["/admin", "/admin/partners", "/admin/partners/claims/abc"]);

  const newArticle = getAdminBreadcrumbs("/admin/novy");
  assert.deepEqual(newArticle.map((item) => item.href), ["/admin", "/admin/clanky", "/admin/novy"]);
  assert.equal(newArticle.at(-1)?.label, "Nový záznam");
});

test("admin shell renders shared active navigation, breadcrumbs, sticky positioning and existing attention bell", () => {
  const shell = read("components/admin-shell.tsx");
  const shellCss = read("components/admin-shell.module.css");
  const navigation = read("components/admin-navigation.tsx");
  const navigationCss = read("components/admin-navigation.module.css");

  assert.match(shell, /<AdminNavigation stickyClassName={styles\.stickyNav} \/>/);
  assert.match(shell, /<AdminBreadcrumbs \/>/);
  assert.match(shell, /loadExactAdminAttentionSummary/);
  assert.match(shell, /href="\/admin\/operations"/);
  assert.match(shell, /activeCount > 99 \? "99\+" : activeCount/);
  assert.match(shellCss, /\.stickyNav\s*\{[^}]*position:\s*sticky;[^}]*top:\s*76px;/s);
  assert.match(shellCss, /@media \(max-width:\s*760px\)[\s\S]*\.stickyNav\s*\{[^}]*top:\s*68px;/);
  assert.match(shellCss, /scroll-margin-top:\s*178px/);
  assert.match(navigation, /aria-current=\{current \? "page" : undefined\}/);
  assert.match(navigation, /aria-label="Drobečková navigácia"/);
  assert.match(navigationCss, /a\[aria-current="page"\]/);
});

test("mobile admin navigation has Escape close, focus trap and focus return without a second back-to-top control", () => {
  const navigation = read("components/admin-navigation.tsx");
  const navigationCss = read("components/admin-navigation.module.css");
  const layout = read("app/layout.tsx");
  const backToTop = read("components/back-to-top.tsx");

  assert.match(navigation, /event\.key === "Escape"/);
  assert.match(navigation, /event\.key !== "Tab"/);
  assert.match(navigation, /triggerRef\.current\?\.focus\(\)/);
  assert.match(navigation, /aria-modal="true"/);
  assert.match(navigation, /aria-expanded=\{open\}/);
  assert.match(navigationCss, /@media \(max-width:\s*390px\)/);
  assert.match(navigationCss, /grid-template-columns:\s*1fr/);
  assert.match(layout, /<BackToTop \/>/);
  assert.match(backToTop, /aria-label="Späť hore"/);
  assert.doesNotMatch(navigation, /Späť hore/);
});

test("admin landing is the read-only workspace and old article filters redirect to the explicit list", () => {
  const landing = read("app/admin/page.tsx");
  const articles = read("app/admin/clanky/page.tsx");
  const articleDashboard = read("components/admin-dashboard.tsx");
  const articleEditor = read("components/admin-article-editor.tsx");

  assert.match(landing, /title="Pracovný prehľad"/);
  assert.match(landing, /loadExactAdminAttentionSummary\(\)/);
  assert.match(landing, /readAdminAutomationData/);
  assert.match(landing, /summarizeAdminAutomationReads/);
  assert.match(landing, /getAdminDataQualitySummary/);
  assert.doesNotMatch(landing, /listManagedArticleSummaries/);
  assert.match(landing, /redirect\(legacyHref\)/);
  for (const key of ["query", "q", "status", "section", "sort", "direction", "page", "pageSize"]) {
    assert.match(landing, new RegExp(`"${key}"`));
  }

  assert.match(articles, /requireAdminPageUser\("\/admin\/clanky"\)/);
  assert.match(articles, /listManagedArticleSummaries/);
  assert.match(articles, /listPath="\/admin\/clanky"/);
  assert.match(articleDashboard, /const routePath = fixedPortalSection \? "\/admin\/steniatka" : listPath;/);
  assert.match(articleEditor, /window\.location\.assign\("\/admin\/clanky"\)/);
});

test("dashboard uses bounded existing summaries and never treats unavailable data as a successful zero", () => {
  const landing = read("app/admin/page.tsx");
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  const store = read("lib/admin-dashboard-store.ts");
  const reliability = read("lib/admin-automation-reliability.ts");

  assert.match(landing, /loadExactAdminAttentionSummary/);
  assert.match(landing, /countOpenAutomationLifecycleSuggestions/);
  assert.match(store, /SELECT COUNT\(\*\) AS count[\s\S]*FROM directory_profiles/);
  assert.match(store, /SELECT COUNT\(\*\) AS count FROM media_source_monitors/);
  assert.doesNotMatch(landing, /loadDataQualityDashboard/);
  assert.match(dashboard, /status === "UNAVAILABLE" \|\| value === null[\s\S]*\? "—"/);
  assert.match(dashboard, /status === "PARTIAL"[\s\S]*\? `\$\{value\}\+`/);
  assert.match(reliability, /export async function readAdminAutomationData/);
  assert.match(reliability, /export function summarizeAdminAutomationReads/);
});


test("existing automation reliability contract distinguishes OK EMPTY PARTIAL and UNAVAILABLE", () => {
  const read = (key, status) => ({ key, status, data: 0, checkedAt: "2026-09-30T00:00:00.000Z", errorRef: status === "UNAVAILABLE" ? "AA-TEST" : null });
  assert.equal(summarizeAdminAutomationReads([]).status, "EMPTY");
  assert.equal(summarizeAdminAutomationReads([read("a", "EMPTY")]).status, "EMPTY");
  assert.equal(summarizeAdminAutomationReads([read("a", "OK"), read("b", "EMPTY")]).status, "OK");
  assert.equal(summarizeAdminAutomationReads([read("a", "OK"), read("b", "UNAVAILABLE")]).status, "PARTIAL");
  assert.equal(summarizeAdminAutomationReads([read("a", "UNAVAILABLE"), read("b", "UNAVAILABLE")]).status, "UNAVAILABLE");
});

test("dashboard count cards point to canonical filtered work queues", () => {
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  for (const pair of [
    ["AUTOMATION_ACTION", "/admin/operations?source=AUTOMATION_ACTION"],
    ["PARTNER_CLAIM_REVIEW", "/admin/operations?source=PARTNER_CLAIM_REVIEW"],
    ["MODERATION_SUBMISSION", "MODERATION_SUBMISSION"],
    ["PROFILE_REVIEW_MODERATION", "PROFILE_REVIEW_MODERATION"],
    ["NEWS_TIP", "NEWS_TIP"],
    ["DIRECTORY_CHANGE_REQUEST", "DIRECTORY_CHANGE_REQUEST"],
    ["DIRECTORY_INQUIRY", "DIRECTORY_INQUIRY"],
    ["ARTICLE_FEEDBACK", "ARTICLE_FEEDBACK"],
  ]) {
    assert.match(dashboard, new RegExp(pair[1].replace(/[?]/g, "\\?")));
  }
  assert.match(dashboard, /href="\/admin\/kvalita"/);
  assert.match(dashboard, /href="\/admin\/automatizacie\/zmeny-stavu"/);
});

test("all previous admin agendas and technical deep-link owners still exist", () => {
  for (const path of [
    "app/admin/adopcie/page.tsx",
    "app/admin/adresar/page.tsx",
    "app/admin/adresar/navrhy/page.tsx",
    "app/admin/automatizacie/page.tsx",
    "app/admin/dopyty/page.tsx",
    "app/admin/hodnotenia/page.tsx",
    "app/admin/import/page.tsx",
    "app/admin/kvalita/page.tsx",
    "app/admin/mapy/page.tsx",
    "app/admin/meniny/page.tsx",
    "app/admin/monetizacia/page.tsx",
    "app/admin/nastavenia/page.tsx",
    "app/admin/nastroje/page.tsx",
    "app/admin/navigacia/page.tsx",
    "app/admin/operations/page.tsx",
    "app/admin/operations/automation/page.tsx",
    "app/admin/operations/outreach/page.tsx",
    "app/admin/operations/possible-matches/page.tsx",
    "app/admin/organizacie/page.tsx",
    "app/admin/partners/page.tsx",
    "app/admin/plemena/page.tsx",
    "app/admin/podujatia/page.tsx",
    "app/admin/pomoc/page.tsx",
    "app/admin/pravne/page.tsx",
    "app/admin/recenzie-profilov/page.tsx",
    "app/admin/sekcie/page.tsx",
    "app/admin/steniatka/page.tsx",
    "app/admin/stratene-najdene/page.tsx",
    "app/admin/tipy/page.tsx",
  ]) {
    assert.equal(existsSync(new URL("../" + path, import.meta.url)), true, path);
  }
});

test("IA workstream adds no admin mutation API and does not alter auth boundaries", () => {
  const landing = read("app/admin/page.tsx");
  const articles = read("app/admin/clanky/page.tsx");
  assert.match(landing, /requireAdminPageUser\("\/admin"\)/);
  assert.match(articles, /requireAdminPageUser\("\/admin\/clanky"\)/);
  assert.doesNotMatch(landing + articles, /fetch\(|method=["'](?:post|put|patch|delete)["']/i);
  assert.equal(existsSync(new URL("../app/api/admin/admin-ia-2", import.meta.url)), false);
});
