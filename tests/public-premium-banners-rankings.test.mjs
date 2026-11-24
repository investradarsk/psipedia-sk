import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public V9 frame shares scoped foundation and keeps urgent surface separate", () => {
  const css = read("app/banner-visuals.css").split("/* V2-04")[1];
  assert.ok(css.includes(":root:not(:has([data-admin-workspace]))"));
  assert.match(css, /--ps-bnr-gradient: var\(--ps-premium-gradient\)/);
  assert.match(css, /--ps-bnr-kicker: var\(--ps-premium-kicker-on-dark\)/);
  assert.match(css, /\[data-banner-semantic="urgent"\]\s*\{\s*--ps-bnr-gradient: none/);
  assert.match(css, /font-family: var\(--ps-font-heading\)/);
  assert.match(css, /background: transparent/);
});
test("both rankings share V9 styling and retain real data and keyboard-operable windows", () => {
  const css = read("components/article-popularity-sidebar.module.css");
  const source = read("components/article-popularity-sidebar.tsx");
  assert.match(css, /background: var\(--ps-premium-gradient/);
  assert.match(css, /border-radius: var\(--ps-radius-media, 10px\)/);
  assert.match(css, /min-height: 44px/);
  assert.match(source, /popularity\[activeWindow\]\.slice\(0, 5\)/);
  for (const term of ["24h", "7d", "ArrowLeft", "ArrowRight", "qualifiedViews", "qualifiedReads", "item.href"]) {
    assert.ok(source.includes(term));
  }
  assert.match(read("components/directory-page.tsx"), /<ArticlePopularitySidebar/);
});
