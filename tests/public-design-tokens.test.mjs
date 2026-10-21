import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const css = read("app/design-system.css");
const globals = read("app/globals.css");
const originalBlob = "c6bab4bdd5258ac468eb4f3d88b77467748b317c";
const start = "  /* DS-1A SEMANTIC ALIASES START */\n";
const end = "  /* DS-1A SEMANTIC ALIASES END */\n";
const expected = new Map([
  ["--ps-color-text-primary", "--ink"],
  ["--ps-color-text-muted", "--muted"],
  ["--ps-color-action-primary", "--forest"],
  ["--ps-color-action-primary-hover", "--forest-dark"],
  ["--ps-color-action-primary-text", "--white"],
  ["--ps-color-canvas", "--cream"],
  ["--ps-color-surface", "--paper"],
  ["--ps-color-border-subtle", "--ps-border-soft"],
  ["--ps-form-control-min-height", "--ps-control-min-height"],
  ["--ps-shadow-surface", "--shadow-sm"],
]);
const originals = new Map([
  ["--ps-content-max", "1180px"],
  ["--ps-radius-control", "12px"],
  ["--ps-radius-filter", "18px"],
  ["--ps-radius-card", "22px"],
  ["--ps-radius-media", "0"],
  ["--ps-control-min-height", "44px"],
  ["--ps-card-padding", "26px"],
  ["--ps-heading-section", "clamp(2.2rem, 4vw, 3.75rem)"],
  ["--ps-border-soft", "rgba(23, 53, 43, 0.1)"],
  ["--ps-border-strong", "rgba(23, 75, 56, 0.18)"],
  ["--ps-surface", "var(--paper)"],
  ["--ps-surface-raised", "var(--white)"],
  ["--ps-space-section", "92px"],
  ["--ps-space-block", "32px"],
  ["--ps-space-stack", "20px"],
]);
const mobile = new Map([
  ["--ps-radius-card", "18px"],
  ["--ps-radius-media", "18px"],
  ["--ps-space-section", "64px"],
  ["--ps-space-block", "24px"],
  ["--ps-card-padding", "20px"],
  ["--ps-space-stack", "16px"],
]);

const gitBlobSha = (value) => createHash("sha1")
  .update("blob " + Buffer.byteLength(value, "utf8") + "\0")
  .update(value, "utf8")
  .digest("hex");

function declarations(text) {
  const result = new Map();
  for (const match of text.matchAll(/^\s*(--[\w-]+):\s*([^;{}\n]+);\s*$/gm)) {
    const definitions = result.get(match[1]) ?? [];
    definitions.push(match[2].trim());
    result.set(match[1], definitions);
  }
  return result;
}

function aliasBlock() {
  assert.equal(css.split(start).length, 2, "the START marker must occur once");
  assert.equal(css.split(end).length, 2, "the END marker must occur once");
  const a = css.indexOf(start);
  const b = css.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a && b < css.indexOf("\n}\n"), "aliases must stay in the original :root");
  return { content: css.slice(a + start.length, b), before: css.slice(0, a), after: css.slice(b + end.length) };
}

test("DS-1A original CSS is byte-identical after excluding the isolated DS-5 extension", () => {
  const block = aliasBlock();
  const ds5Start = "\n/* DS-5 PUBLIC CARDS, GRIDS & MEDIA START";
  const ds5End = "/* DS-5 PUBLIC CARDS, GRIDS & MEDIA END */\n";
  assert.equal(block.after.split(ds5Start).length, 2, "exactly one DS-5 extension is required");
  const extensionAt = block.after.indexOf(ds5Start);
  assert.ok(extensionAt >= 0 && block.after.endsWith(ds5End), "DS-5 may only be appended after original CSS");
  const originalAfter = block.after.slice(0, extensionAt);
  assert.equal(gitBlobSha(block.before + originalAfter), originalBlob);
  const lines = block.content.trimEnd().split("\n");
  assert.equal(lines.length, expected.size);
  for (const line of lines) assert.match(line, /^  --ps-[\w-]+: var\(--[\w-]+\);$/);
});

test("every new semantic alias is defined once and points to its exact approved existing source", () => {
  const block = declarations(aliasBlock().content);
  assert.deepEqual([...block.keys()].sort(), [...expected.keys()].sort());
  const all = declarations(css);
  const source = declarations(globals);
  for (const [name, value] of expected) {
    assert.deepEqual(block.get(name), ["var(" + value + ")"], name);
    assert.deepEqual(all.get(name), ["var(" + value + ")"], name + " duplicates");
    assert.ok(all.has(value) || source.has(value), name + " references missing source " + value);
    assert.ok(!source.has(name), name + " collides with globals.css");
  }
});

test("all alias dependency chains terminate without cycles", () => {
  const graph = new Map([...declarations(globals), ...declarations(css)].map(([name, values]) => [name, values[0]]));
  const resolve = (name, visiting = new Set()) => {
    assert.ok(graph.has(name), "missing variable " + name);
    assert.ok(!visiting.has(name), "cyclic variable alias at " + name);
    visiting.add(name);
    const next = [...graph.get(name).matchAll(/var\(\s*(--[\w-]+)/g)].map(x => x[1]);
    for (const token of next) resolve(token, new Set(visiting));
  };
  for (const name of expected.keys()) resolve(name);
});

test("all 15 original desktop tokens retain exact declarations", () => {
  const root = css.slice(0, css.indexOf("\n}\n") + 2);
  const definitions = declarations(root);
  for (const [name, value] of originals) assert.deepEqual(definitions.get(name), [value], name);
});

test("all six original 620px mobile overrides remain intact", () => {
  const match = css.match(/@media \(max-width: 620px\) \{\s*:root \{([\s\S]*?)\n  \}/);
  assert.ok(match, "620px root override missing");
  const found = declarations(match[1]);
  assert.deepEqual([...found.keys()].sort(), [...mobile.keys()].sort());
  for (const [key, value] of mobile) assert.deepEqual(found.get(key), [value], key);
});

test("root and admin import order remains the original contract", () => {
  const layout = read("app/layout.tsx");
  const imports = [...layout.matchAll(/import ["'](\.\/[^"']+\.css)["'];/g)].map(match => match[1]);
  assert.deepEqual(imports, [
    "./globals.css", "./design-system.css", "./breed-hero-safe-zone.css",
    "./navigation-loading.css", "./navigation-hotfix.css",
  ]);
  const admin = read("app/admin/layout.tsx");
  assert.ok(admin.indexOf('import "./admin-legacy-scoped.css";') < admin.indexOf('import "./admin-workspace.css";'));
  assert.match(admin, /data-admin-workspace/);
});

test("new aliases have no CSS consumers in public or admin modules during DS-1A", () => {
  const forbidden = new RegExp("var\\(\\s*(?:" + [...expected.keys()].join("|") + ")(?:\\s*[,)]|\\s*$)");
  const relevant = /\.(?:css|scss|sass)$/i;
  const checked = [];
  function walk(folder) {
    for (const item of readdirSync(new URL("../" + folder + "/", import.meta.url), { withFileTypes: true })) {
      const path = folder + "/" + item.name;
      if (item.isDirectory()) walk(path);
      else if (item.isFile() && relevant.test(item.name) && path !== "app/design-system.css") {
        checked.push(path);
        assert.doesNotMatch(read(path), forbidden, "unexpected alias usage in " + path);
      }
    }
  }
  walk("app");
  walk("components");
  assert.ok(checked.length > 0, "expected existing CSS consumers to scan");
});

test("original base token palette remains defined in globals.css", () => {
  const root = globals.slice(globals.indexOf(":root {"), globals.indexOf("\n}\n", globals.indexOf(":root {")));
  const base = declarations(root);
  const values = {
    "--ink": "#17352b", "--muted": "#52665d", "--forest": "#174b38",
    "--forest-dark": "#0f392a", "--white": "#fff", "--cream": "#f8f4eb",
    "--paper": "#fffdf8", "--shadow-sm": "0 8px 28px rgba(23, 53, 43, 0.08)",
  };
  for (const [name, value] of Object.entries(values)) assert.deepEqual(base.get(name), [value], name);
});
