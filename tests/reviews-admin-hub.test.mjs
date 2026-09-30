import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("reviews admin hub centralizes existing canonical workflows", () => {
  const page = read("app/admin/recenzie/page.tsx");
  const hub = read("components/admin-reviews-hub.tsx");
  assert.match(page, /requireAdminPageUser\("\/admin\/recenzie"\)/);
  assert.match(page, /listManagedArticleSummaries\(\{ portalSection: "recenzie", pageSize: 1 \}\)/);
  assert.match(page, /listProfileReviewsAdmin\(\{ status: "PENDING_REVIEW", pageSize: 1 \}\)/);
  assert.match(page, /Promise\.allSettled/);
  assert.match(hub, /href="\/admin\/novy\?sekcia=recenzie"/);
  assert.match(hub, /href="\/admin\/clanky\?section=recenzie"/);
  assert.match(hub, /href="\/admin\/recenzie-profilov"/);
  assert.match(hub, /href="\/admin\/sekcie\?sekcia=recenzie"/);
});

test("reviews admin hub exposes e-shops as a future phase instead of fake CRUD", () => {
  const hub = read("components/admin-reviews-hub.tsx");
  assert.match(hub, /E-shopy/);
  assert.match(hub, /Ďalšia fáza/);
  assert.match(hub, /samostatné profily a ich hodnotiaci model ešte nie sú implementované/);
  assert.match(hub, /Žiadne falošné profily ani hviezdičky/);
});

test("reviews admin hub is discoverable from admin navigation and dashboard", () => {
  const navigation = read("lib/admin-navigation.ts");
  const dashboard = read("components/admin-workspace-dashboard.tsx");
  assert.match(navigation, /Recenzie a testy", href: "\/admin\/recenzie"/);
  assert.match(dashboard, /href="\/admin\/recenzie">Recenzie a testy/);
});

test("review category action deep-links and opens the recenzie section editor", () => {
  const page = read("app/admin/sekcie/page.tsx");
  const editor = read("components/admin-section-editor.tsx");
  assert.match(page, /searchParams: Promise<\{ sekcia\?: string \| string\[\] \}>/);
  assert.match(page, /initialOpenSlug=\{initialOpenSlug\}/);
  assert.match(editor, /initialOpenSlug\?: string/);
  assert.match(editor, /section\.slug === initialOpenSlug/);
  assert.match(editor, /useState\(initialOpenSlug \?\? ""\)/);
});

test("reviews admin hub requires no database migration or duplicate review store", () => {
  const hub = read("components/admin-reviews-hub.tsx");
  const page = read("app/admin/recenzie/page.tsx");
  assert.doesNotMatch(hub + page, /CREATE TABLE|ALTER TABLE|INSERT INTO/);
  assert.match(hub, /Každá karta vedie do existujúceho canonical modulu/);
});
