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

test("search page opts into shared controls without changing SSR GET actions or params", () => {
  const page = read("app/hladat/page.tsx");
  for (const fragment of [
    '<form action="/hladat" method="get" className={styles.filterForm}',
    '<PublicFormField label="Typ výsledku">',
    '<PublicSelect name="typ" defaultValue={activeTypeFilter}>',
    '<PublicFormField label="Lokalita">',
    "<PublicTextInput",
    'name="lokalita"',
    'name="q"',
    'name="sekcia"',
    'name="podsekcia"',
    "searchPortal(query",
  ])
    assert.ok(page.includes(fragment), "missing unchanged search contract: " + fragment);
});
