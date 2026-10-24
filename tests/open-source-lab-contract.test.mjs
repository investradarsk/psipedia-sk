import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const lab = new URL("../examples/open-source-lab/", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL("package.json", lab), "utf8"));
const app = fs.readFileSync(new URL("src/App.jsx", lab), "utf8");
const workflow = fs.readFileSync(new URL("../.github/workflows/open-source-seo-suite.yml", import.meta.url), "utf8");
const rootPkg = JSON.parse(fs.readFileSync(new URL("package.json", root), "utf8"));
const rootLock = JSON.parse(fs.readFileSync(new URL("package-lock.json", root), "utf8"));

const integrations = {
  "@radix-ui/react-dialog": /from "@radix-ui\/react-dialog"/,
  "@tanstack/react-table": /from "@tanstack\/react-table"/,
  "@tanstack/react-virtual": /from "@tanstack\/react-virtual"/,
  "zod": /from "zod"/,
  "react-dropzone": /from "react-dropzone"/,
  "@dnd-kit/core": /from "@dnd-kit\/core"/,
  "react-hook-form": /from "react-hook-form"/,
  "fuse.js": /from "fuse.js"/,
  "lucide-react": /from "lucide-react"/,
  "lexical": /from "@lexical\/react\/LexicalComposer"/,
};
test("all ten approved GitHub projects are actually exercised in the isolated React pilot", () => {
  for (const [name, importPattern] of Object.entries(integrations)) {
    assert.equal(typeof pkg.dependencies[name], "string", name + " missing from pilot");
    assert.match(app, importPattern, name + " missing from the app");
  }
  assert.match(app, /useVirtualizer\(/);
  assert.match(app, /useReactTable\(/);
  assert.match(app, /useDropzone\(/);
  assert.match(app, /DndContext/);
  assert.match(app, /LexicalComposer/);
  assert.match(app, /z\.object\(/);
});
test("pilot is isolated and does not perturb the production npm ci contract", () => {
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, "module");
  assert.equal(pkg.dependencies.react, rootPkg.dependencies.react);
  assert.equal(pkg.dependencies["react-dom"], rootPkg.dependencies["react-dom"]);
  assert.deepEqual(rootLock.packages[""].dependencies, rootPkg.dependencies);
  assert.deepEqual(rootLock.packages[""].devDependencies, rootPkg.devDependencies);
  for (const name of Object.keys(integrations)) {
    assert.equal(Object.hasOwn(rootPkg.dependencies, name), false, "Never silently inject pilot deps into production");
  }
  assert.doesNotMatch(app, /fetch\(|\b(localStorage|indexedDB)\b|\/api\//);
});
test("external website probes never run automatically on a pull request", () => {
  assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' && inputs\.live_seo/);
  assert.match(workflow, /--workers=1 --max-reqs-per-sec=1/);
  assert.match(workflow, /--concurrency 1 --timeout/);
  assert.match(workflow, /sha256sum -c -/);
  assert.doesNotMatch(workflow, /permissions:\s*\n\s*contents: write/);
});
