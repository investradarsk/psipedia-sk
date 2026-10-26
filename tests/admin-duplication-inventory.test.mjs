import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PATTERNS, scanSource, inventory } from "../scripts/admin-duplication-inventory.mjs";

test("scanner locates native/shared signals with accurate line numbers", () => {
  const source = [
    "export function Demo() {",
    "  window.confirm('Confirm?');",
    "  return <><button type=\"button\">A</button><AdminActionButton>B</AdminActionButton>",
    "    <AdminPagination /><input type=\"file\" /><AdminModalDialog /></>;",
    "}",
  ].join("\n");
  const found = scanSource("components/admin-demo.tsx", source);
  const at = (pattern) => found.matches.filter((item) => item.pattern === pattern).map((item) => item.line);
  assert.deepEqual(at("nativeConfirm"), [2]);
  assert.deepEqual(at("rawButton"), [3]);
  assert.deepEqual(at("sharedButton"), [3]);
  assert.deepEqual(at("sharedPagination"), [4]);
  assert.deepEqual(at("nativeFileInput"), [4]);
  assert.deepEqual(at("sharedModal"), [4]);
  assert.ok(!PATTERNS.some(([name]) => name === "automaticDuplicationVerdict"));
  assert.deepEqual(scanSource("components/admin-empty.tsx", "export default null").matches, []);
});

test("inventory recursively scans admin inputs and never alters their contents", () => {
  const root = mkdtempSync(join(tmpdir(), "psipedia-admin-dup-"));
  try {
    mkdirSync(join(root, "components"), { recursive: true });
    mkdirSync(join(root, "app", "admin", "nested"), { recursive: true });
    const files = {
      "components/admin-sample.tsx": "<button>Save</button>\nwindow.confirm('Remove?');",
      "components/public-sample.tsx": "<button>Ignored</button>",
      "app/admin/nested/page.tsx": "<AdminPagination />",
      "app/admin/nested/client.tsx": "<AdminActionButton />",
    };
    for (const [path, content] of Object.entries(files)) writeFileSync(join(root, path), content);
    const result = inventory(root);
    assert.equal(result.scannedFiles, 3);
    const found = result.results.map(({ path }) => path).sort();
    assert.deepEqual(found, ["app/admin/nested/client.tsx", "app/admin/nested/page.tsx", "components/admin-sample.tsx"]);
    const count = name => result.summary.find(({ pattern }) => pattern === name)?.occurrences;
    assert.equal(count("nativeConfirm"), 1);
    assert.equal(count("sharedPagination"), 1);
    assert.equal(count("sharedButton"), 1);
    for (const [path, content] of Object.entries(files)) assert.equal(readFileSync(join(root, path), "utf8"), content);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
