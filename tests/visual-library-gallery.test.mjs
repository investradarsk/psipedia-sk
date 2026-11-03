import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = (name) => readFileSync(path.join(root, name), "utf8");

test("all real component preview samples have stable unique identifiers and render cases", () => {
  const previews = source("components/admin-component-visual-preview.tsx");
  const samples = [...previews.matchAll(/^\s*\{ id: "([^"]+)", path: "([^"]+)", family: "([^"]+)"/gm)];
  const ids = samples.map((match) => match[1]);
  assert.ok(ids.length >= 30, "The owner gallery must expose the existing broad preview inventory");
  assert.equal(new Set(ids).size, ids.length, "Preview IDs are unique");
  assert.ok(samples.every((match) => match[2].startsWith("components/")));
  assert.ok(samples.every((match) => ["banner", "cta", "hero", "filter", "category", "card", "other"].includes(match[3])));
  for (const id of ids) {
    assert.ok(previews.includes('case "' + id + '":'), "Missing actual preview for " + id);
  }
});

test("owner gallery uses real components and distinguishes candidates from verified URL uses", () => {
  const gallery = source("components/admin-visual-library-gallery.tsx");
  const library = source("components/admin-visual-library.tsx");
  assert.match(gallery, /<AdminComponentVisualPreview id=\{chosen\.sample\.id\}/);
  assert.match(gallery, /publicRegistryRouteHref\(route\)/);
  assert.match(gallery, /Samotný import nepotvrdzuje/);
  assert.match(gallery, /inert>/);
  assert.doesNotMatch(gallery, /fetch\(|method: "POST"|method: "PUT"/);
  assert.match(library, /\["galeria", "Všetky náhľady"\]/);
  assert.match(library, /category === "galeria"/);
  for (const family of ["banner", "hero", "cta", "card"]) {
    if (family === "card") assert.match(library, /category === "karty" \? "card"/);
    else if (family === "banner") assert.match(library, /fixedFamily="banner"/);
    else assert.match(gallery, new RegExp('id: "' + family + '"'));
  }
});

test("the editor and publication authorization remain separate from the read-only preview gallery", () => {
  const library = source("components/admin-visual-library.tsx");
  const editor = source("components/admin-visual-library-editor.tsx");
  assert.match(library, /<AdminVisualLibraryEditor/);
  assert.match(editor, /draft\.scope === "one"/);
  assert.match(editor, /knownUses === 1/);
  assert.match(editor, /Mobilné texty aj farby ostanú pôvodné/);
});


test("route audit enumerates all public page entries without fabricating dynamic profile URLs", () => {
  const generator = source("scripts/generate-component-registry.mjs");
  const coverage = source("components/admin-visual-library-coverage.tsx");
  const audit = source("components/admin-visual-library-route-audit.tsx");
  assert.match(generator, /routeEntries: routes\.map/);
  assert.match(generator, /source: file/);
  assert.match(generator, /dynamic: \/\\\[/);
  assert.match(coverage, /<AdminVisualLibraryRouteAudit registry=\{registry\}/);
  assert.match(audit, /publicRegistryRouteHref\(selected\.route\)/);
  assert.match(audit, /route\.area === "public"/);
  assert.match(audit, /Samotný import|Tranzitívna závislosť/);
  assert.doesNotMatch(audit, /fetch\(|method: "PUT"|method: "POST"/);
});


test("main owner gallery lists missing previews from the real public source registry", () => {
  const gallery = source("components/admin-visual-library-gallery.tsx");
  const missing = source("components/admin-visual-library-missing-previews.tsx");
  const coverage = source("components/admin-visual-library-coverage.tsx");
  assert.match(gallery, /<AdminVisualLibraryFullInventory registry=\{registry\}/);
  assert.match(missing, /item\.area !== "admin"/);
  assert.match(missing, /!withPreview\.has\(item\.path\)/);
  assert.match(missing, /item\.family \?\? "other"/);
  assert.match(missing, /Verejn|verejn|šablón|šablóny/);
  assert.match(missing, /publicRegistryRouteHref\(route\)/);
  assert.match(coverage, /family\?: "banner" \| "hero"/);
  assert.doesNotMatch(missing, /fetch\(|method: "PUT"|method: "POST"/);
});

test("route audit integrates authoritative pinned URL evidence without matching dynamic slugs", () => {
  const route = source("components/admin-visual-library-route-audit.tsx");
  const coverage = source("components/admin-visual-library-coverage.tsx");
  assert.match(route, /collectPinnedStaticRoutePlacements/);
  assert.match(route, /route\.pinned\.length === 0/);
  assert.match(route, /selected\.pinned\.map/);
  assert.match(route, /use\.anchorId \? "#" \+ use\.anchorId/);
  assert.match(coverage, /<AdminVisualLibraryRouteAudit registry=\{registry\} examples=\{examples\}/);
});


test("seven additional public domain card previews are real components with admin-only fictional fixtures", () => {
  const previews = source("components/admin-component-visual-preview.tsx");
  const fixtures = source("components/admin-visual-library-profile-previews.tsx");
  const additions = [
    ["breed-card", "components/breed-card.tsx", "BreedCard"],
    ["directory-card", "components/directory-card.tsx", "DirectoryCard"],
    ["event-list", "components/event-card.tsx", "EventCard"],
    ["event-grid", "components/event-card.tsx", "EventCard"],
    ["help-card", "components/help-card.tsx", "HelpCard"],
    ["help-resolved", "components/help-card.tsx", "HelpCard"],
    ["related-breed-list", "components/related-entity-list.tsx", "RelatedBreedList"],
  ];
  const defs = [...previews.matchAll(/^\s*\{ id: "([^"]+)", path: "([^"]+)", family: "([^"]+)"/gm)];
  assert.ok(defs.length >= 44, "Existing 35 samples plus nine new real component variants");
  for (const [id, path, component] of additions) {
    assert.ok(defs.some((match) => match[1] === id && match[2] === path && match[3] === "card"));
    assert.ok(previews.includes('case "' + id + '":'));
    assert.match(fixtures, new RegExp("<" + component + "\\b"));
  }
  assert.match(fixtures, /AdminProfileComponentPreview/);
  assert.match(fixtures, /Ukážkové/);
  assert.match(fixtures, /PublicDirectoryProfile/);
  assert.match(fixtures, /PublicEventCard/);
  assert.match(fixtures, /PublicHelpCard/);
  assert.match(fixtures, /BreedAtlasCard/);
  assert.doesNotMatch(fixtures, /fetch\(|getPublished|listPublished|\.prepare\(|useEffect\(/);
});


test("shared footer and directory category navigation have actual inert admin previews", () => {
  const previews = source("components/admin-component-visual-preview.tsx");
  const fixtures = source("components/admin-visual-library-profile-previews.tsx");
  for (const [id, file, component] of [
    ["directory-category-navigation", "components/directory-category-navigation.tsx", "DirectoryCategoryNavigation"],
    ["site-footer", "components/site-footer.tsx", "SiteFooter"],
  ]) {
    assert.ok(previews.includes('id: "' + id + '", path: "' + file + '"'));
    assert.ok(previews.includes('case "' + id + '":'));
    assert.ok(fixtures.includes("<" + component));
  }
  assert.match(fixtures, /SiteFooter/);
  assert.match(fixtures, /DirectoryCategoryNavigation/);
});


test("seven safe new preview variants never import server-only feature flags into the client", () => {
  const registry = source("components/admin-component-visual-preview.tsx");
  const detail = source("components/admin-visual-library-detail-previews.tsx");
  const profiles = source("components/admin-visual-library-profile-previews.tsx");
  const samples = [...registry.matchAll(/^\s*\{ id: "([^"]+)", path: "([^"]+)", family: "([^"]+)"/gm)];
  assert.equal(samples.length, 84,
    "79 earlier previews plus 5 further true public component examples");
  assert.equal(new Set(samples.map((s) => s[1])).size, samples.length,
    "Every visual sample requires a unique stable identifier");
  for(const [id,path] of [
    ["directory-services-short","components/directory-services-list.tsx"],
    ["directory-services-expanded","components/directory-services-list.tsx"],
    ["event-listing-filtered","components/event-listing-results.tsx"],
    ["event-listing-empty","components/event-listing-results.tsx"],
    ["breed-section-nav","components/breed-section-nav.tsx"],
    ["help-urgent","components/help-card.tsx"],
    ["event-cancelled","components/event-card.tsx"],
  ]){
    assert.ok(samples.some(s=>s[1]===id && s[2]===path), "Registered "+id);
    assert.ok(registry.includes('case "'+id+'":'), "Rendered "+id);
  }
  assert.match(detail, /<DirectoryServicesList services=/);
  assert.match(detail, /<EventListingResults/);
  assert.match(profiles, /<BreedSectionNav/);
  assert.match(profiles, /case "help-urgent":/);
  assert.match(profiles, /case "event-cancelled":/);
  assert.doesNotMatch(detail, /ProfileReviewSection|submission-feature-flags|cloudflare:workers/);
  assert.doesNotMatch(registry, /ProfileReviewSection|submission-feature-flags|cloudflare:workers/);
  assert.doesNotMatch(detail, /fetch\(|getPublished|listPublished|\.prepare\(/);
});


test("final owner dashboard displays truthful registry coverage and direct navigation", () => {
  const ui = source("components/admin-visual-library.tsx");
  const css = source("components/admin-visual-library.module.css");
  assert.match(ui, /className=\{styles\.coverageSummary\}/);
  assert.match(ui, /adminComponentPreviewSamples\.length/);
  assert.match(ui, /publicSourceComponents\.filter\(\(item\) => previewPaths\.has\(item\.path\)\)/);
  assert.match(ui, /registry\.routeEntries\?\.filter\(\(item\) => item\.area === "public"\)/);
  assert.match(ui, /unavailableRegistry \? "—"/);
  assert.match(ui, /Ukážka|Náhľad je ukážka/);
  for(const [tab, family] of [
    ["filtre", "filter"], ["navigacia", "category"], ["ostatne", "other"]
  ]){
    assert.match(ui,new RegExp('\\["'+tab+'",'));
    assert.ok(ui.includes('category === "'+tab+'" ? ('), "Category branch "+tab);
    assert.match(ui,new RegExp('fixedFamily="'+family+'"'));
  }
  assert.match(css,/\.coverageSummary\{/);
  assert.match(css,/@media\(max-width:840px\)/);
  assert.doesNotMatch(ui,/updateVisual|publishVisualDraft|method: "POST"/);
});
