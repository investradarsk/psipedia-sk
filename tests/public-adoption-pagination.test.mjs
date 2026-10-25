import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("adoption catalog uses canonical accessible anchor pagination without changing URL policy", () => {
  const src = read("components/adoption-catalog.tsx");
  const pagination = read("components/public-visual-system/public-result-states.tsx");
  const css = read("components/adoption.module.css");

  for (const contract of [
    "<PublicPagination",
    'label="Stránkovanie adopcií"',
    "currentPage={pagination.page}",
    "totalPages={pagination.totalPages}",
    "adoptionCatalogHref(filters, { page: pagination.page - 1 })",
    "adoptionCatalogHref(filters, { page: pagination.page + 1 })",
    "showDisabledControls={false}",
  ]) assert.ok(src.includes(contract), "missing adoption pagination contract: " + contract);

  assert.ok(pagination.includes('rel="prev"'));
  assert.ok(pagination.includes('rel="next"'));
  assert.ok(pagination.includes('aria-current="page"'));
  assert.match(css, /\.pagination span,\s*\.pagination strong\s*\{\s*background:/);
  assert.doesNotMatch(src, /<nav className=\{styles\.pagination\}/);
});
