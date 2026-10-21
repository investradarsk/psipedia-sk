import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("canonical public form primitives preserve browser-native control semantics", () => {
  const src = read("components/public-visual-system/public-form-controls.tsx");
  const css = read("components/public-visual-system/public-form-controls.module.css");
  const index = read("components/public-visual-system/index.ts");
  for (const symbol of ["PublicFormField", "PublicTextInput", "PublicSelect", "PublicTextarea", "PublicChoice"]) {
    assert.match(src, new RegExp("export function " + symbol + "\\("), symbol);
    assert.match(index, new RegExp("\\b" + symbol + "\\b"), symbol);
  }
  assert.match(src, /<label className=/);
  assert.match(src, /<input \\{\\.\\.\\.props\\} type=\\{type\\}/);
  assert.match(src, /<select \\{\\.\\.\\.props\\}/);
  assert.match(src, /<textarea \\{\\.\\.\\.props\\}/);
  assert.match(css, /min-height: var\\(--ps-control-min-height, 44px\\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /forced-colors: active/);
  assert.doesNotMatch(src, /"use client"|onSubmit|window\\.|localStorage|fetch\\(/);
});

test("search page opts into shared public controls without changing SSR GET actions, parameters and results", () => {
  const page = read("app/hladat/page.tsx");
  assert.match(page, /<form action="\\/hladat" method="get" className=\\{styles\\.filterForm\\}/);
  assert.match(page, /<PublicFormField label="Typ výsledku">/);
  assert.match(page, /<PublicSelect name="typ" defaultValue=\\{activeTypeFilter\\}>/);
  assert.match(page, /<PublicFormField label="Lokalita">/);
  assert.match(page, /<PublicTextInput[\\s\\S]*?name="lokalita"/);
  assert.match(page, /name="q"/);
  assert.match(page, /name="sekcia"/);
  assert.match(page, /name="podsekcia"/);
  assert.match(page, /searchPortal\\(query/);
});
