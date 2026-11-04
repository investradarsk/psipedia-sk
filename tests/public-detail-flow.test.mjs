import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(
  readFileSync("components/detail-primitives/detail-primitives.tsx", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText;
const compiledModule = { exports: {} };
new Function("require", "exports", compiled)(
  (name) =>
    name === "@/components/public-heading"
      ? { PublicHeading: ({ as = "h2", role, ...props }) => React.createElement(as, props) }
      : name.endsWith(".css")
        ? { default: new Proxy({}, { get: (_, key) => String(key) }) }
        : require(name),
  compiledModule.exports,
);
const { PublicDetailFlow } = compiledModule.exports;

test("long main text cannot create sidebar rows; blocks render once and retain their narrow-screen order", () => {
  const html = renderToStaticMarkup(
    React.createElement(PublicDetailFlow, {
      blocks: [
        {
          key: "intro",
          column: "main",
          content: React.createElement("p", null, "Long text. ".repeat(100)),
        },
        {
          key: "contact",
          column: "aside",
          content: React.createElement("a", { href: "tel:123" }, "Contact"),
        },
        { key: "services", column: "main", content: React.createElement("p", null, "Services") },
        { key: "hours", column: "aside", content: null },
        { key: "map", column: "aside", content: React.createElement("p", null, "Map") },
      ],
    }),
  );
  assert.equal((html.match(/data-detail-block="contact"/g) || []).length, 1);
  assert.doesNotMatch(html, /data-detail-block="hours"/);
  assert.match(html, /--detail-mobile-order:1[^>]*data-detail-block="contact"/);
  assert.match(html, /--detail-mobile-order:2[^>]*data-detail-block="services"/);
  assert.match(
    html,
    /data-detail-block="intro"[\s\S]*data-detail-block="services"[\s\S]*<div\s*class="flowColumn">[\s\S]*data-detail-block="contact"[\s\S]*data-detail-block="map"/,
  );
});
