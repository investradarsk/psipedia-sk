import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared public feedback stays semantic and public-scoped", () => {
  const src = read("components/public-visual-system/public-result-states.tsx");
  const css = read("components/public-visual-system/public-result-states.module.css");
  const index = read("components/public-visual-system/index.ts");
  for (const symbol of [
    "PublicEmptyState",
    "PublicPagination",
    "PublicNotice",
    "PublicFilterTag",
    "PublicLoadingState",
  ]) {
    assert.ok(src.includes("export function " + symbol + "("), "missing " + symbol);
    assert.ok(index.includes(symbol), "not exported: " + symbol);
  }
  for (const contract of [
    "role={role}",
    'rel="prev"',
    'rel="next"',
    'aria-disabled="true"',
    'aria-live={appearance === "default" ? "polite" : undefined}',
  ]) {
    assert.ok(src.includes(contract), "missing accessibility contract " + contract);
  }
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
  assert.ok(css.includes("forced-colors: active"));
  assert.ok(
    src.includes("numberedPages.map((page, index)"),
    "numbered links use the common component",
  );
  assert.ok(src.includes('aria-current={page === currentPage ? "page" : undefined}'));
  assert.doesNotMatch(src, /"use client"|window\.|localStorage|fetch\(/);
});

test("directory retains canonical paging and empty-state CTA", () => {
  const directory = read("components/directory-results.tsx");
  for (const contract of [
    "<PublicEmptyState",
    'role="status"',
    "Zrušiť filtre",
    "<PublicPagination",
    "directoryPageHref(basePath, filters, result.page - 1)",
    "directoryPageHref(basePath, filters, result.page + 1)",
    "result.profiles.map",
  ])
    assert.ok(directory.includes(contract), "missing directory contract: " + contract);
});

test("events preserve URL form and paging while using common status/chip styles", () => {
  const event = read("components/event-listing-results.tsx");
  for (const contract of [
    '<PublicNotice role="alert" tone="error">{f.error}</PublicNotice>',
    "<PublicFilterTag key={key} href={clearOneHref(key)}",
    "data-public-active-filters",
    'method="get"',
    "const pages =",
    "href(listing.page - 1)",
    "<PublicPagination",
    "numberedPages={pages}",
    "pageHref={href}",
    "showDisabledControls={false}",
  ])
    assert.ok(
      event.replace(/\s+/g, "").includes(contract.replace(/\s+/g, "")),
      "missing event contract: " + contract,
    );
});
