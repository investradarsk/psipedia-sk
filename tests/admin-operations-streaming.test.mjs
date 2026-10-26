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

test("activity feed avoids hidden-tab polls, overlapping GETs and stale acknowledgement resets", () => {
  const source = read("components/admin-workspace-activity.tsx");
  assert.match(source, /refreshInFlight\.current\)return refreshInFlight\.current/);
  assert.match(source, /document\.visibilityState==="visible"&&navigator\.onLine/);
  assert.match(source, /document\.addEventListener\("visibilitychange",poll\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange",poll\)/);
  assert.match(source, /acknowledgedIds\.current\.add\(id\)/);
  assert.match(source, /acknowledgedIds\.current\.has\(item\.id\)/);
  assert.match(source, /window\.setInterval\(poll,60_000\)/);
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
    assert.ok(handler.indexOf("requireAdminPageUser(") < handler.indexOf("Promise"), path);
    assert.match(handler, /<AdminShell/);
    assert.match(handler, /<Suspense fallback=/);
    assert.match(handler, /<AdminDataLoading|Načítavajú sa upozornenia/);
    assert.doesNotMatch(handler, /await (?:getManagedDirectoryAdminPage|listManagedBreedSummaries|listManagedEventPage|loadMissingQualityDashboard|loadGeoAdminOperatorProfiles|listFacebookImagePosts|loadAdminAttentionPage)/);
  }
});
