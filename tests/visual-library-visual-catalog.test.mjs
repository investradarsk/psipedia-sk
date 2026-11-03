import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8");
const catalog = read("components/admin-visual-library-visual-catalog.tsx");
const parent = read("components/admin-visual-library.tsx");
const preview = read("components/admin-component-visual-preview.tsx");

test("owner sees live component thumbnails first, not JSX/CSS technical files", () => {
  assert.match(parent, /useState<"prehlad"/);
  assert.match(parent, /"prehlad", "Vizuálny prehľad"/);
  assert.match(parent, /"register", "Technický register"/);
  assert.match(parent, /AdminVisualLibraryVisualCatalog/);
  assert.match(catalog, /visualCatalogGrid/);
  assert.match(catalog, /matches\.slice\(0, limit\)/);
  assert.match(catalog, /AdminComponentVisualPreview id=\{sample\.id\}/);
  assert.match(catalog, /AdminVisualLibraryFullInventory/);
  assert.match(catalog, /onCompare/);
});

test("known variants are grouped by exact component identity, never just the filename", () => {
  assert.match(catalog, /const VARIANT_OF/);
  assert.match(catalog, /"magazine-photo": "magazine"/);
  assert.match(catalog, /"event-grid": "event-list"/);
  assert.match(catalog, /"help-resolved": "help-card"/);
  assert.match(catalog, /result = new Map<string, Group>/);
  assert.match(catalog, /group\.samples\.push\(sample\)/);
  assert.doesNotMatch(catalog, /sources\.get\(sample\.path\)\?\.name \?\? sample\.id/);

  const ids = new Set([...preview.matchAll(/\{\s*id: "([^"]+)", path:/g)].map((match) => match[1]));
  const mapping = catalog.match(/const VARIANT_OF:[\s\S]*?= \{([\s\S]*?)\};/)?.[1] ?? "";
  const pairs = [...mapping.matchAll(/"([^"]+)": "([^"]+)"/g)];
  assert.ok(pairs.length > 5);
  for (const [, variant, root] of pairs) {
    assert.ok(ids.has(variant), "Missing variant in real samples: " + variant);
    assert.ok(ids.has(root), "Missing source component for variant: " + root);
    assert.notEqual(variant, root);
  }
});

test("candidate routes never claim to be verified render locations or auto-publish", () => {
  assert.match(catalog, /publicRegistryRouteHref/);
  assert.match(catalog, /Nie sú potvrdenými/);
  assert.match(catalog, /všetky komponenty/i.test(catalog) ? /všetky komponenty/i : /komponentov bez náhľadu/);
  assert.match(catalog, /Zatiaľ sa nič automaticky nespája, nemaže ani nepublikuje/);
  assert.doesNotMatch(catalog, /method:\s*"(POST|PUT|DELETE)"|cloudflare:workers|DB\.prepare/);
});
