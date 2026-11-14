import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const removed = "components/admin-deferred-details.tsx";
const identifier = "Admin" + "DeferredDetails";
const importPath = "admin-" + "deferred-details";

function sourceFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const location = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
      results.push(...sourceFiles(location));
    } else if (/\.(?:ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
      results.push(location);
    }
  }
  return results;
}

test("step 17: remove only verified unreferenced deferred details wrapper", () => {
  assert.equal(existsSync(path.join(root, removed)), false);
  for (const directory of ["app", "components", "lib", "scripts", "workers"]) {
    for (const file of sourceFiles(path.join(root, directory))) {
      const text = readFileSync(file, "utf8");
      assert.equal(text.includes(identifier), false, `identifier imported in ${file}`);
      assert.equal(text.includes(importPath), false, `file path referenced in ${file}`);
    }
  }
});

test("step 17: service worker and budget guard files are kept as external entry points", () => {
  assert.equal(existsSync(path.join(root, "public/sw.js")), true);
  assert.equal(existsSync(path.join(root, "ops/google-places-budget-guard/index.js")), true);
});

test("step 17: reference to existing exact-run audit is documented without claiming re-scan", () => {
  const doc = readFileSync(path.join(root, "docs/audits/admin-ui-unification-step17.md"), "utf8");
  assert.match(doc, /43628661039/);
  assert.match(doc, /32/);
  assert.match(doc, /440/);
  assert.match(doc, /192/);
  assert.match(doc, /#1368/);
  assert.match(doc, /#1369/);
});
