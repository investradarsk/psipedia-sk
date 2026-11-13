import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("unified admin foundation loads after canonical workspace and form styles", () => {
  const layout = read("app/admin/layout.tsx");
  const workspace = layout.indexOf('import "./admin-workspace.css"');
  const forms = layout.indexOf('import "./admin-unified-forms.css"');
  const foundation = layout.indexOf('import "./admin-editorial-foundation.css"');

  assert.ok(workspace >= 0 && forms > workspace && foundation > forms);
});

test("editorial density extends existing admin form components, not public pages", () => {
  const styles = read("app/admin/admin-editorial-foundation.css");
  assert.match(styles, /\[data-admin-workspace\]/);
  assert.match(styles, /\[data-admin-form-system="v4"\]/);
  assert.match(styles, /\[data-admin-editor-section\]/);
  assert.match(styles, /--admin-ui-panel-padding/);
  assert.match(styles, /--admin-ui-field-radius/);
  assert.match(styles, /:not\(\[data-editor-layout="article"\]\)/);
  assert.doesNotMatch(styles, /overflow-x:\s*hidden/);
  assert.doesNotMatch(styles, /position:\s*(fixed|sticky)/);
});

test("shared style keeps iOS input legibility and accessible tap targets", () => {
  const styles = read("app/admin/admin-editorial-foundation.css");
  assert.match(styles, /min-height:\s*44px/);
  assert.match(styles, /font-size:\s*16px/);
  assert.match(styles, /:not\(\[type="file"\]\)/);
  assert.match(styles, /:not\(\[type="checkbox"\]\)/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /\[aria-invalid="true"\]/);
});
