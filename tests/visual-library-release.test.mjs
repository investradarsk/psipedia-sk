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
  assert.match(store, /published text is desktop-only/);
  assert.match(store, /return published\[id\] \?\? null/);
  assert.match(store, /validatePublication\(row\.banner_id, target\.variant, published, target\.url\)/);
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
  assert.match(banner, /desktopCopy/);
  assert.match(banner, /styles\.mobileCopy/);
  assert.match(banner, /styles\.desktopCopy/);
  assert.match(css, /@media \(min-width: 621px\)/);
  // Approved desktop-only copy is scoped to published banners at >=621px.
  assert.match(css, /\.magazine\[data-visual-library-desktop-published="true"\] \.mobileCopy\s*\{\s*display:\s*none;/);
  assert.match(css, /\.magazine\[data-visual-library-desktop-published="true"\] \.desktopCopy\s*\{\s*display:\s*inline;/);
  assert.match(home, /desktopCopy=\{homeProfileBannerColors\}/);
  assert.match(atlas, /desktopCopy=\{breedClubBannerColors\}/);
  assert.match(css, /var\(--ps-visual-desktop-button/);
  assert.match(home, /getPublishedDesktopBannerColorsBatch\(\["homepage:profil", "help:lost-found"\]\)/);
  assert.match(atlas, /getPublishedDesktopBannerColors\("plemena:kluby"\)/);
  assert.match(home, /desktopColors=\{homeProfileBannerColors\}/);
  assert.match(atlas, /desktopColors=\{breedClubBannerColors\}/);
  assert.match(editor, /Publikovať texty a farby na desktope/);
  assert.match(editor, /Vrátiť publikované texty a farby/);
  assert.doesNotMatch(editor, /window\.localStorage/);
});

test("0152 only additive draft table, protected manual workflow", () => {
  const sql=read("drizzle/0152_visual_library_banner_edits.sql");
  const wf=read(".github/workflows/production-d1-migrate.yml");
  const migrate=read("scripts/production-d1-migrate.mjs");
  assert.match(sql, /CREATE TABLE visual_library_banner_edits/);
  assert.doesNotMatch(sql, /\bDROP\b|\bALTER\b/i);
  assert.match(wf, /0152_visual_library_banner_edits\.sql/);
  assert.match(wf, /APPLY-0152-psipedia-sk-db/);
  assert.match(wf, /environment: production/);
  assert.doesNotMatch(wf, /^\s*(?:push|pull_request|schedule):/m);
  assert.match(migrate, /assertVisualLibrary0152Schema/);
});

test("desktop-only text is responsive inside the original semantic heading and CTA", () => {
  const component=read("components/public-visual-system/public-magazine-banner.tsx");
  const css=read("components/public-visual-system/public-magazine-banner.module.css");
  const home=read("components/home-editorial.tsx");
  const editor=read("components/admin-visual-library-editor.tsx");
  const store=read("lib/visual-library-edit-store.ts");
  // One heading and one CTA link, with viewport-specific text descendants.
  assert.equal((component.match(/<PublicHeading\b/g)||[]).length, 1);
  assert.match(component, /<PublicHeading role="section" as="h2" id=\{headingId\}>/);
  assert.equal((component.match(/<PublicActionLink\b/g)||[]).length, 1);
  assert.match(component, /<PublicActionLink\s+href=\{href\}\s+variant=\{actionVariant\}\s+className="button button--dark"/);
  assert.match(component, /<span className=\{styles\.mobileCopy\}>\{title\}<\/span>/);
  assert.match(component, /<span className=\{styles\.desktopCopy\}>\{desktopCopy\.title\}<\/span>/);
  assert.match(component, /<span className=\{styles\.mobileCopy\}>\{description\}<\/span>/);
  assert.match(component, /<span className=\{styles\.desktopCopy\}>\{desktopCopy\.description\}<\/span>/);
  assert.match(component, /<span className=\{styles\.mobileCopy\}>\{label\}<\/span>/);
  assert.match(component, /<span className=\{styles\.desktopCopy\}>\{desktopCopy\.ctaLabel\}<\/span>/);
  assert.match(css, /\.mobileCopy\s*\{\s*display:\s*inline;/);
  assert.match(css, /\.desktopCopy\s*\{\s*display:\s*none;/);
  assert.match(css, /@media \(min-width: 621px\)\s*\{/);
  assert.match(home, /desktopCopy=\{desktopCopy\}/);
  assert.match(store, /return published\[id\] \?\? null/);
  assert.match(editor, /draft\.scope === "one"/);
});

test("five independently anchored Help banners publish only desktop copy, never shared/mobile CSS", () => {
  const store = read("lib/visual-library-edit-store.ts");
  const overview = read("components/help-overview.tsx");
  const help = read("components/public-visual-system/public-help-banner.tsx");
  const photo = read("components/public-visual-system/public-photo-callout.tsx");
  for (const id of ["help:lost-found", "help:overview:0", "help:overview:2", "help:overview:4", "help:closing"]) {
    assert.ok(store.includes('"' + id + '": { url: "https://psipedia.sk/pomoc-psom", variant: 0 }'), id);
    assert.ok(overview.includes(id), id);
  }
  assert.match(overview, /getPublishedDesktopBannerColorsBatch\(helpBannerIds\)/);
  assert.match(overview, /desktopColors=\{published\} desktopCopy=\{published\}/);
  assert.match(help, /desktopColors=\{desktopColors\}/);
  assert.match(help, /desktopCopy=\{desktopCopy\}/);
  assert.match(photo, /desktopColors=\{desktopColors\}/);
  assert.match(photo, /desktopCopy=\{desktopCopy\}/);
  assert.match(store, /draft\.scope !== "one"/);
  assert.match(store, /acknowledgedUrl !== target\.url/);
});

test("publication or revert invalidates current POP cache without implying global purge", () => {
  const api = read("app/api/admin/visual-library/banners/route.ts");
  const cache = read("lib/public-html-cache.ts");
  const worker = read("worker/index.ts");
  const editor = read("components/admin-visual-library-editor.tsx");
  assert.match(api, /invalidateVersionedPublicHtmlCacheUrl\(url, workerVersion\)/);
  assert.match(api, /isExplicitAnonymousHtmlRoute\(url\.pathname\)/);
  assert.match(api, /refreshVisualPublicationCache\(publishTarget\.url\)/);
  assert.match(api, /cacheNotice/);
  assert.match(api, /V iných regiónoch/);
  assert.match(cache, /versionedPublicHtmlCacheUrl\(publicUrl, workerVersionId\)/);
  assert.match(worker, /PUBLIC_HTML_CACHE_TTL_SECONDS/);
  assert.match(editor, /result\.cacheNotice/);
  assert.equal((api.match(/requireAdminMutation\(request, \{ strictProvenance: true \}\)/g) || []).length, 2);
});

test("cross-site visual library includes source inventory but does not invent dynamic URLs", () => {
  const page = read("app/admin/komponenty/page.tsx");
  const library = read("components/admin-visual-library.tsx");
  const coverage = read("components/admin-visual-library-coverage.tsx");
  assert.match(page, /registry=\{registry/);
  assert.match(library, /Kde všade sa používa/);
  assert.match(library, /<AdminVisualLibraryCoverage/);
  assert.match(coverage, /registry\.components\.filter\(component => component\.area !== "admin"\)/);
  assert.match(coverage, /publicRegistryRouteHref\(route\)/);
  assert.match(coverage, /articleUsage\.byKey/);
  assert.match(coverage, /Konkrétne URL z nich nevymýšľame/);
  assert.match(coverage, /Statické prepojenie ešte neznamená/);
});
