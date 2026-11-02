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
  assert.match(gallery, /<AdminVisualLibraryMissingPreviews registry=\{registry\}/);
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
  assert.ok(defs.length >= 42, "Existing 35 samples plus seven new real card variants");
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
  assert.doesNotMatch(fixtures, /fetch\\(|getPublished|listPublished|\\.prepare\\(|useEffect\\(/);
});
