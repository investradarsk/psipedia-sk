import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("reviews workspace retains auth, canonical counts and independent failure handling", () => {
  const page = read("app/admin/recenzie/page.tsx");
  assert.match(page, /requireAdminPageUser\("\/admin\/recenzie"\)/);
  assert.match(page, /listManagedArticleSummaries\(\{ portalSection: "recenzie", pageSize: 1 \}\)/);
  assert.match(page, /listProfileReviewsAdmin\(\{ status: "PENDING_REVIEW", pageSize: 1 \}\)/);
  assert.match(page, /listProfileReviewsAdmin\(\{ status: "all", pageSize: 1 \}\)/);
  assert.match(page, /getManagedPortalSection\("recenzie"\)/);
  assert.match(page, /countManagedEshops\(\)/);
  assert.match(page, /Promise\.allSettled/);
  assert.match(page, /<Suspense fallback=/);
});

test("three compact workspaces preserve editor, moderation and e-shop routes", () => {
  const page = read("app/admin/recenzie/page.tsx");
  const hub = read("components/admin-reviews-hub.tsx");
  assert.match(page, /href="\/admin\/novy\?sekcia=recenzie"/);
  for (const [kind, title, href] of [
    ["editorial", "Redakčné testy", "/admin/clanky?section=recenzie"],
    ["profiles", "Používateľské recenzie", "/admin/recenzie-profilov"],
    ["eshops", "E-shopy", "/admin/recenzie/eshopy"],
  ]) {
    assert.ok(hub.includes('data-review-workspace="' + kind + '"'));
    assert.ok(hub.includes("<h3>" + title + "</h3>"));
    assert.ok(hub.includes('href="' + href + '"'));
  }
  assert.equal((hub.match(/<li className=\{styles\.row\}/g) ?? []).length, 3);
  assert.match(hub, /href="\/admin\/recenzie-profilov\?status=all"/);
  assert.match(hub, /href="\/recenzie\?typ=eshopy"/);
  assert.match(hub, /href="\/recenzie"/);
  assert.match(hub, /href="\/admin\/sekcie\?sekcia=recenzie"/);
  assert.doesNotMatch(hub, /cardGrid|className=\{styles\.card\}/);
});

test("counts and rating provenance stay separate even if a source fails", () => {
  const hub = read("components/admin-reviews-hub.tsx");
  for (const expression of ["articleCounts.total", "articleCounts.published", "pendingReviews", "totalReviews", "eshopCounts.total", "eshopCounts.published", "categoryCount"]) {
    assert.ok(hub.includes(expression));
  }
  assert.match(hub, /Počet je nedostupný/);
  assert.match(hub, /Čakajú na kontrolu/);
  assert.match(hub, /Články a produktové testy/);
  assert.match(hub, /Hodnotenia konkrétnych profilov/);
  assert.match(hub, /Samostatné profily obchodov/);
  for (const label of ["Doručenie", "Komunikácia", "Sortiment", "Ceny", "Celková skúsenosť"]) assert.ok(hub.includes(label));
  assert.match(hub, /Externé hodnotenia/);
});

test("accessible semantic navigation, details, keyboard focus and touch targets", () => {
  const hub = read("components/admin-reviews-hub.tsx");
  const css = read("components/admin-reviews-hub.module.css");
  assert.match(hub, /<nav aria-labelledby="reviews-workspaces-title">/);
  assert.match(hub, /<ul className=\{styles\.list\}>/);
  assert.match(hub, /<dl className=\{styles\.metrics\} aria-label=/);
  assert.match(hub, /<summary>Rozdiel medzi testami a hodnoteniami<\/summary>/);
  assert.match(hub, /rel="noopener noreferrer"/);
  assert.doesNotMatch(hub, /role="tab"/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\)/);
});

test("categories use the existing section editor and dashboard navigation", () => {
  const navigation = read("lib/admin-navigation.ts");
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  const page = read("app/admin/sekcie/page.tsx");
  const editor = read("components/admin-section-editor.tsx");
  assert.match(navigation, /Recenzie a testy", href: "\/admin\/recenzie"/);
  assert.match(dashboard, /href="\/admin\/recenzie">Recenzie a testy/);
  assert.match(page, /searchParams: Promise<\{ sekcia\?: string \| string\[\] \}>/);
  assert.match(page, /initialOpenSlug=\{initialOpenSlug\}/);
  assert.match(editor, /initialOpenSlug\?: string/);
  assert.match(editor, /section\.slug === initialOpenSlug/);
});

test("no duplicate review data store, migration or client-side editor", () => {
  const hub = read("components/admin-reviews-hub.tsx");
  const page = read("app/admin/recenzie/page.tsx");
  assert.doesNotMatch(hub + page, /CREATE TABLE|ALTER TABLE|INSERT INTO|fetch\(|use client/);
  assert.match(hub, /<details className=\{styles\.notes\}>/);
});
