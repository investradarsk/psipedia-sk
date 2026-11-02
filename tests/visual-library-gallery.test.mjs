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
