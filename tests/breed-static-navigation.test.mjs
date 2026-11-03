import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = readFileSync("components/breed-section-nav.tsx", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
new Function("require", "exports", compiled)((name) => {
  if (name.endsWith(".css")) return { default: { nav: "nav" } };
  if (name === "@/components/page-system")
    return {
      SectionTabs: ({ children, label }) =>
        React.createElement("nav", { "aria-label": label }, children),
    };
  return require(name);
}, exports);

test("every breed tab remains a native anchor without client tracking or active-color changes", () => {
  const ids = ["prehlad", "vhodnost", "prakticke", "sporty", "fci", "uzitocne"];
  const html = renderToStaticMarkup(
    React.createElement(exports.BreedSectionNav, {
      items: ids.map((id) => ({ id, label: id })),
    }),
  );
  for (const id of ids) assert.ok(html.includes(`href="#${id}"`));
  assert.equal((html.match(/<a /g) || []).length, ids.length);
  assert.doesNotMatch(html, /aria-current|is-active/);
  assert.doesNotMatch(source, /useEffect|IntersectionObserver|onClick/);
  assert.equal(
    renderToStaticMarkup(React.createElement(exports.BreedSectionNav, { items: [] })),
    "",
  );
});
