import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("canonical public form primitives preserve browser-native control semantics", () => {
  const src = read("components/public-visual-system/public-form-controls.tsx");
  const css = read("components/public-visual-system/public-form-controls.module.css");
  const index = read("components/public-visual-system/index.ts");
  for (const symbol of [
    "PublicFormField",
    "PublicTextInput",
    "PublicSelect",
    "PublicTextarea",
    "PublicChoice",
  ]) {
    assert.ok(src.includes("export function " + symbol + "("), symbol + " must exist");
    assert.ok(index.includes(symbol), symbol + " must be exported");
  }
  for (const code of [
    "<label className=",
    "<input {...props} type={type}",
    "<select {...props}",
    "<textarea {...props}",
  ])
    assert.ok(src.replace(/\s+/g, " ").includes(code), code);
  assert.ok(css.includes("min-height: var(--ps-control-min-height, 44px)"));
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("forced-colors: active"));
  assert.doesNotMatch(src, /"use client"|onSubmit|window\.|localStorage|fetch\(/);
});

test("search page delegates GET and hidden scope to shared public hero", () => {
  const page = read("app/hladat/page.tsx");
  const universal = read("components/public-visual-system/universal-page-hero.tsx");
  const search = read("components/home-portal-search.tsx");
  for (const fragment of [
    '<PublicFormField label="Typ výsledku">',
    '<PublicSelect name="typ" defaultValue={activeTypeFilter}>',
    '<PublicFormField label="Lokalita">',
    "searchPortal(query",
    "<UniversalPageHero",
    "searchDefaultValue={query}",
    'name: "sekcia", value: section',
    'name: "podsekcia", value: subsection',
  ]) assert.ok(page.includes(fragment), "missing preserved search contract: " + fragment);
  assert.match(universal, /<HomePortalSearch/);
  assert.match(universal, /searchHidden/);
  assert.match(search, /<form action=\{action\} method="get"/);
  assert.match(search, /data-public-search-ui="main"/);
});
