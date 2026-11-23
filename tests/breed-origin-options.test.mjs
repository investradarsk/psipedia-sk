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
const effects = [];
const links = [];
const replacements = [];
const browserWindow = {
  location: { pathname: "/plemena", search: "", hash: "#clanky-o-plemenach" },
  history: { replaceState: (_state, _title, url) => replacements.push(url) },
};
new Function("require", "exports", "window", "document", compiled)(
  (name) => {
    if (name === "react") return { ...require(name), useEffect: (effect) => effects.push(effect) };
    if (name === "react" || name === "react/jsx-runtime") return require(name);
    if (name === "@/lib/breed-browser-search")
      return {
        indexBreedSearch: (breeds) => breeds,
        filterIndexedBreeds: (breeds) => breeds,
        groupVisibleBreeds: (breeds, groups) => groups.map((group) => ({ group, breeds })),
      };
    if (name === "@/lib/breed-atlas")
      return {
        breedAtlasHref: ({ query }) =>
          query ? "/plemena?q=" + encodeURIComponent(query) : "/plemena",
        listFciSectionOptions: () => [],
        validFciSectionForGroup: () => "",
      };
    if (name === "next/link")
      return {
        default: ({ children, ...props }) => {
          links.push(props);
          return React.createElement("a", { href: props.href }, children);
        },
      };
    return new Proxy(
      {},
      {
        get: (_, key) =>
          key === "PublicSelect"
            ? ({ children, ...props }) => React.createElement("select", props, children)
            : wrapper,
      },
    );
  },
  exports,
  browserWindow,
  { querySelector: () => null },
);

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

test("atlas filter URL synchronization preserves deep links and skips identical URLs", () => {
  function sync(query) {
    effects.length = 0;
    renderToStaticMarkup(
      React.createElement(exports.BreedBrowser, {
        breeds: [],
        groups: [],
        initialFilters: { query, fciGroup: "", fciSection: "", origin: "" },
      }),
    );
    effects.forEach((effect) => effect());
  }
  sync("");
  assert.deepEqual(replacements, []);
  sync("labrador");
  assert.deepEqual(replacements, ["/plemena?q=labrador#clanky-o-plemenach"]);
});

test("atlas group expansion intercepts plain clicks only", () => {
  links.length = 0;
  renderToStaticMarkup(
    React.createElement(exports.BreedBrowser, {
      breeds: Array.from({ length: 4 }, (_, index) => ({ slug: "breed-" + index, origin: "" })),
      groups: [{ number: 1, label: "Ovčiarske psy" }],
      initialFilters: { query: "", fciGroup: "", fciSection: "", origin: "" },
    }),
  );
  const link = links.find(({ onClick }) => onClick);
  assert.ok(link);
  for (const modifiers of [
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { altKey: true },
    { button: 1 },
  ]) {
    link.onClick({
      button: 0,
      ...modifiers,
      preventDefault: () => assert.fail("Native link action blocked"),
    });
  }
  let intercepted = false;
  link.onClick({
    button: 0,
    preventDefault: () => {
      intercepted = true;
    },
  });
  assert.ok(intercepted);
});
