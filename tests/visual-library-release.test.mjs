import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = path => readFileSync(path,"utf8");

test("stage 7 uses an allowlisted persisted draft and explicit reviewed single URL", () => {
  const store=read("lib/visual-library-edit-store.ts");
  assert.match(store, /"homepage:profil": \{ url: "https:\/\/psipedia\.sk\/", variant: 0 \}/);
  assert.match(store, /"plemena:kluby": \{ url: "https:\/\/psipedia\.sk\/plemena", variant: 0 \}/);
  assert.match(store, /draft\.scope !== "one"/);
  assert.match(store, /acknowledgedUrl !== target\.url/);
  assert.match(store, /draft\.title !== original\.title/);
  assert.match(store, /draft\.description !== original\.description/);
  assert.match(store, /draft\.ctaLabel !== original\.ctaLabel/);
  assert.match(store, /published_revision IS \?/);
  assert.match(store, /ON CONFLICT\(banner_id,variant_index\) DO NOTHING/);
  assert.match(store, /revision=revision\+1/);
  assert.match(store, /published_json=\?/);
});

test("stage 7 protects admin writes with provenance and explicit confirmation", () => {
  const api=read("app/api/admin/visual-library/banners/route.ts");
  assert.match(api, /getAdminApiUser\(\)/);
  assert.equal((api.match(/requireAdminMutation\(request, \{ strictProvenance: true \}\)/g)||[]).length,2);
  assert.match(api, /acknowledged !== true/);
  assert.match(api, /confirmedUrl/);
  assert.match(api, /Cache-Control": "private, no-store"/);
});

test("stage 7 affects CSS only on approved desktop banners, not mobile layouts or text", () => {
  const banner=read("components/public-visual-system/public-magazine-banner.tsx");
  const css=read("components/public-visual-system/public-magazine-banner.module.css");
  const home=read("app/page.tsx");
  const atlas=read("app/plemena/page.tsx");
  const editor=read("components/admin-visual-library-editor.tsx");
  assert.match(banner, /data-visual-library-desktop-published/);
  assert.match(banner, /desktopColors/);
  assert.match(css, /@media \(min-width: 621px\)/);
  assert.match(css, /var\(--ps-visual-desktop-button/);
  assert.match(home, /getPublishedDesktopBannerColors\("homepage:profil"\)/);
  assert.match(atlas, /getPublishedDesktopBannerColors\("plemena:kluby"\)/);
  assert.match(home, /desktopColors=\{homeProfileBannerColors\}/);
  assert.match(atlas, /desktopColors=\{breedClubBannerColors\}/);
  assert.match(editor, /Publikovať desktopové farby/);
  assert.match(editor, /Vrátiť publikované farby/);
  assert.match(editor, /window\.localStorage/) === false; // avoid per-browser persistence
});

test("0151 only additive draft table, protected manual workflow", () => {
  const sql=read("drizzle/0151_visual_library_banner_edits.sql");
  const wf=read(".github/workflows/production-d1-migrate.yml");
  const migrate=read("scripts/production-d1-migrate.mjs");
  assert.match(sql, /CREATE TABLE visual_library_banner_edits/);
  assert.doesNotMatch(sql, /\bDROP\b|\bALTER\b/i);
  assert.match(wf, /0151_visual_library_banner_edits\.sql/);
  assert.match(migrate, /assertVisualLibrary0151Schema/);
});
