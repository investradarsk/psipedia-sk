import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [pageSource, editorSource] = await Promise.all([
  readFile(new URL("../app/admin/navigacia/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/admin-navigation-editor.tsx", import.meta.url), "utf8"),
]);

test("admin navigation derives automatic submenu candidates from portal sections", () => {
  assert.match(pageSource, /automaticSubmenuSlugs = new Set\(\["steniatka", "starostlivost", "aktivity"\]\)/);
  assert.match(pageSource, /portalSections/);
  assert.match(pageSource, /section\.subpages/);
  assert.match(pageSource, /subpage\.visible !== false/);
  assert.match(editorSource, /managedChildren\.length === 0 \? \(automaticChildren\[getRootSlug\(root\.href\)\] \?\? \[\]\) : \[\]/);
  assert.match(editorSource, /Automaticky zo sekcie/);
  assert.match(editorSource, /Len na čítanie · neukladá sa/);
});

test("ordinary admin save serializes managed items only", () => {
  assert.match(editorSource, /body: JSON\.stringify\(\{ items \}\)/);
  assert.doesNotMatch(editorSource, /JSON\.stringify\(\{[^}]*automaticChildren/);
});
