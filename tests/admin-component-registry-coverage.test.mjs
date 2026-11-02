import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("every explicitly mapped preview has a unique ID and a real component file", () => {
  const source = read("components/admin-component-visual-preview.tsx");
  const sampleDefs = [...source.matchAll(/\{ id: "([^"]+)", path: "([^"]+)", family: "([^"]+)"/g)];
  assert.ok(sampleDefs.length >= 35, "Expected the original and expanded samples");
  const ids = sampleDefs.map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, "Preview IDs must be unique");
  for (const match of sampleDefs) {
    assert.ok(fs.existsSync(path.join(root, match[2])), "Missing component file: " + match[2]);
    assert.match(source, new RegExp('case "' + match[1] + '":'), "Missing real renderer for " + match[1]);
  }
});

test("the registry exposes honest per-component preview coverage, filtering and all results", () => {
  const ui = read("components/admin-component-registry.tsx");
  assert.match(ui, /previewPaths = useMemo/);
  assert.match(ui, /previewCount/);
  assert.match(ui, /Bez náhľadu/);
  assert.match(ui, /previewStatus === "missing"/);
  assert.match(ui, /showAll \? items : items\.slice\(0, 100\)/);
  assert.match(ui, /Zobraziť všetkých/);
  assert.match(ui, /adminComponentPreviewSamples\.filter\(sample => sample\.path === component\.path\)/);
});

test("expensive visual components render only after expansion inside inert preview area", () => {
  const ui = read("components/admin-component-registry.tsx");
  assert.match(ui, /expanded && \(/);
  assert.match(ui, /onToggle=\{\(event\) => setExpanded\(event\.currentTarget\.open\)\}/);
  assert.match(ui, /inert aria-hidden="true"/);
  const page = read("app/admin/komponenty/page.tsx");
  assert.match(page, /requireAdminPageUser\("\/admin\/komponenty"\)/);
});
