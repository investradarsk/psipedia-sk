import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("operations shell streams before the 15-source read without duplicate bell queries", () => {
  const source = read("app/admin/operations/page.tsx");
  const handler = source.slice(source.indexOf("export default async function AdminOperationsPage"));
  assert.match(handler, /const attentionPromise = loadAdminAttentionPage\(\{ filters, cursor \}\)/);
  assert.doesNotMatch(handler, /await loadAdminAttentionPage/);
  assert.match(handler, /attentionSummaryPromise = attentionPromise\.then\(toNotificationSummary\)/);
  assert.match(handler, /attentionSummaryPromise=\{attentionSummaryPromise\}/);
  assert.match(handler, /<Suspense fallback=/);
  assert.match(handler, /<AdminOperationsContent attentionPromise=\{attentionPromise\}/);
  assert.match(source, /async function AdminOperationsContent/);
  assert.match(source, /const attention = await attentionPromise/);
  assert.match(source, /id="centrum-pozornosti"/);
  assert.match(source, /<AdminAttentionQueue[\s\S]*?page=\{attention\}/);
  assert.doesNotMatch(handler, /loadExactAdminAttentionSummary/);
});

test("operations bell retains exact availability and unavailable source semantics", () => {
  const source = read("app/admin/operations/page.tsx");
  const projection = source.slice(source.indexOf("function toNotificationSummary"), source.indexOf("async function AdminOperationsContent"));
  assert.match(projection, /page\.summary\.active/);
  assert.match(projection, /page\.summary\.bySource/);
  assert.match(projection, /page\.availability === "PARTIAL"/);
  assert.match(projection, /page\.availability === "UNAVAILABLE"/);
  assert.match(projection, /source\.state === "UNAVAILABLE"/);
  assert.doesNotMatch(projection, /loadAdminAttentionPage/);
});

test("homepage activity links to canonical agendas without duplicating the notification inbox", () => {
  const source = read("components/admin-workspace-activity.tsx");
  const page = read("app/admin/page.tsx");
  const feed = read("lib/admin-workspace-feed.ts");
  assert.match(page, /loadAdminWorkspaceOverview/);
  assert.match(feed, /export async function loadAdminWorkspaceOverview/);
  assert.match(source, /Otvoriť pracovnú sekciu/);
  for (const path of ["/admin/operations", "/admin/kvalita", "/admin/mapy", "/admin/automatizacie-gemini", "/admin/facebook-obrazky"]) {
    assert.ok(source.includes(`href="${path}"`), path);
  }
  assert.doesNotMatch(source, /hiddenIds|refreshPending|shown\.map|Prečítané/);
});


test("nav offers immediate pending feedback without prefetching all D1 pages", () => {
  const nav = read("components/admin-navigation.tsx");
  const css = read("components/admin-navigation.module.css");
  const loading = read("app/admin/loading.tsx");
  assert.match(nav, /useLinkStatus/);
  assert.match(nav, /<NavigationPendingIndicator \/>/);
  assert.match(nav, /prefetch=\{false\}/);
  assert.match(nav, /onMouseEnter=\{\(\) => prefetchOnIntent\(item\.href\)\}/);
  assert.match(nav, /onFocus=\{\(\) => prefetchOnIntent\(item\.href\)\}/);
  assert.match(css, /\.navigationPendingIndicator\[data-pending="true"\]/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(loading, /AdminDataLoading label="Administrácia"/);
});

test("common D1-backed admin lists authenticate before starting reads, then stream into their shell", () => {
  const routes = [
    ["app/admin/clanky/page.tsx", "AdminArticlesPage"],
    ["app/admin/adresar/page.tsx", "AdminDirectoryPage"],
    ["app/admin/plemena/page.tsx", "AdminBreedsPage"],
    ["app/admin/podujatia/page.tsx", "AdminEventsPage"],
    ["app/admin/mapy/page.tsx", "AdminMapsPage"],
    ["app/admin/kvalita/page.tsx", "AdminDataQualityPage"],
    ["app/admin/facebook-obrazky/page.tsx", "FacebookImagesPage"],
    ["app/admin/operations/page.tsx", "AdminOperationsPage"],
  ];
  for (const [path, name] of routes) {
    const source = read(path);
    const handler = source.slice(source.indexOf("export default async function " + name));
    assert.ok(handler.indexOf("requireAdminPageUser(") >= 0, path);
    const readStart = handler.search(/const (?:dataPromise|breedsPromise|overviewPromise|attentionPromise) =/);
    assert.ok(readStart > handler.indexOf("await requireAdminPageUser("), path);
    assert.match(handler, /<AdminShell/);
    assert.match(handler, /<Suspense fallback=/);
    assert.match(handler, /<AdminDataLoading|Načítavajú sa upozornenia/);
    assert.doesNotMatch(handler, /await (?:getManagedDirectoryAdminPage|listManagedBreedSummaries|listManagedEventPage|loadMissingQualityDashboard|loadGeoAdminOperatorProfiles|listFacebookImagePosts|loadAdminAttentionPage)/);
  }
});
