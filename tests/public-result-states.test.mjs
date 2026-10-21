import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("shared public feedback is semantic and public-scoped", () => {
  const src = read("components/public-visual-system/public-result-states.tsx");
  const css = read("components/public-visual-system/public-result-states.module.css");
  const index = read("components/public-visual-system/index.ts");
  for (const symbol of ["PublicEmptyState", "PublicPagination", "PublicNotice", "PublicFilterTag", "PublicLoadingState"]) {
    assert.match(src, new RegExp("export function " + symbol + "\\("));
    assert.match(index, new RegExp("\\b" + symbol + "\\b"));
  }
  assert.match(src, /role=\\{role\\}/);
  assert.match(src, /rel="prev"/);
  assert.match(src, /rel="next"/);
  assert.match(src, /aria-disabled="true"/);
  assert.match(src, /aria-live="polite"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.doesNotMatch(src, /"use client"|window\\.|localStorage|fetch\\(/);
});

test("directory retains canonical paging URLs and empty-state CTA", () => {
  const directory = read("components/directory-results.tsx");
  assert.match(directory, /<PublicEmptyState/);
  assert.match(directory, /role="status"/);
  assert.match(directory, /Zrušiť filtre/);
  assert.match(directory, /<PublicPagination/);
  assert.match(directory, /directoryPageHref\\(basePath, filters, result\\.page - 1\\)/);
  assert.match(directory, /directoryPageHref\\(basePath, filters, result\\.page \\+ 1\\)/);
  assert.match(directory, /result\\.profiles\\.map/);
});

test("events retain original URL form and paging while consuming common status/chip styles", () => {
  const event = read("components/event-listing-results.tsx");
  assert.match(event, /<PublicNotice role="alert" tone="error">\\{f\\.error\\}<\\/PublicNotice>/);
  assert.match(event, /<PublicFilterTag key=\\{i\\}>\\{value\\}<\\/PublicFilterTag>/);
  assert.match(event, /method="get"/);
  assert.match(event, /const pages =/);
  assert.match(event, /href\\(listing\\.page - 1\\)/);
});
