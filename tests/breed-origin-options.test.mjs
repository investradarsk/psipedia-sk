import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync("components/breed-browser.tsx", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const exports = {};
const wrapper = ({ children }) => React.createElement("div", null, children);
new Function("require", "exports", compiled)((name) => {
  if (name === "react" || name === "react/jsx-runtime") return require(name);
  if (name === "@/lib/breed-browser-search")
    return {
      indexBreedSearch: (breeds) => breeds,
      filterIndexedBreeds: () => [],
      groupVisibleBreeds: () => [],
    };
  if (name === "@/lib/breed-atlas")
    return {
      breedAtlasHref: () => "/plemena",
      listFciSectionOptions: () => [],
      validFciSectionForGroup: () => "",
    };
  if (name === "next/link") return { default: wrapper };
  return new Proxy(
    {},
    {
      get: (_, key) =>
        key === "PublicSelect"
          ? ({ children, ...props }) => React.createElement("select", props, children)
          : wrapper,
    },
  );
}, exports);

test("origin choices retain the qualifiers that distinguish otherwise identical country labels", () => {
  const origins = [
    "Čína",
    "Čína (patronát Veľká Británia)",
    "Čína (patronát: Veľká Británia)",
    "Čína; patronát nad štandardom FCI má Veľká Británia.",
    "Tibet (Čína); patronát nad štandardom: FCI",
    "Tibet (Čína); patronát nad štandardom: Veľká Británia",
    "Tibet (Čína); patronát Veľká Británia",
    "Tibet (Čína); rozvoj plemena v Číne, patronát Veľká Británia",
  ];
  const selected = origins[3];
  const html = renderToStaticMarkup(
    React.createElement(exports.BreedBrowser, {
      breeds: origins.map((origin, id) => ({ origin, id })),
      groups: [],
      initialFilters: { query: "", fciGroup: "", fciSection: "", origin: selected },
    }),
  );
  const options = [...html.matchAll(/<option value="([^"]+)"([^>]*)>([^<]+)<\/option>/g)].filter(
    (match) => origins.includes(match[1]),
  );
  assert.equal(options.length, origins.length, html);
  assert.equal(new Set(options.map((match) => match[3])).size, origins.length);
  for (const [, value, , label] of options) assert.equal(label, value);
  assert.match(options.find((match) => match[1] === selected)[2], /selected/);
});
