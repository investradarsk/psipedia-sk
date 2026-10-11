import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("legacy admin selectors only load from the admin layout, not the public root CSS", () => {
  const globals = read("app/globals.css");
  const scoped = read("app/admin/admin-legacy-scoped.css");
  const rootLayout = read("app/layout.tsx");
  const adminLayout = read("app/admin/layout.tsx");

  for (const marker of [
    "/* Redakcia */",
    "/* ADMIN-BUTTONS-1: unified admin action controls */",
    "/* DATA-QUALITY-4: dense but usable quality workspace filters */",
    "/* DATA-QUALITY-5: inline canonical contact suggestions */",
    "/* ADMIN-QUALITY-UX-1: focused profile/media review workspace */",
  ]) {
    assert.ok(scoped.includes(marker), `Admin CSS missing ${marker}`);
    assert.ok(!globals.includes(marker), `Public CSS still ships ${marker}`);
  }

  assert.match(adminLayout, /import "\.\/admin-legacy-scoped\.css";[\s\S]*?import "\.\/admin-workspace\.css";/);
  assert.doesNotMatch(rootLayout, /admin-legacy-scoped\.css/);
  for (const selector of [".admin-root", ".admin-form-actions", ".admin-quality-filter-toolbar"]) {
    assert.ok(scoped.includes(selector), selector);
  }
  for (const selector of [".hero-card", ".cookie-consent", ".article-card-media", ".event-detail-layout"]) {
    assert.ok(globals.includes(selector), `Public ${selector} must not move`);
  }
  assert.match(globals, /^@import "tailwindcss";/);
  assert.ok(globals.length < 340_000, "The public stylesheet is unexpectedly large");
});

test("admin-only extracted CSS blocks preserve closed, balanced braces and no public style rules", () => {
  const css = read("app/admin/admin-legacy-scoped.css");
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  for (const ch of withoutComments) {
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    assert.ok(depth >= 0, "Unmatched admin CSS closing brace");
  }
  assert.equal(depth, 0, "Unclosed admin CSS rule");
  assert.doesNotMatch(css, /(^|\n)\s*(?:\.hero-card|\.cookie-consent|\.event-detail-layout|\.article-card-media)\b/);
});


test("desktop site header has no empty mobile-controls grid row", () => {
  const css = read("components/site-header.module.css");
  const header = read("components/site-header.tsx");
  assert.match(header, /className=\{styles\.mobileNavControls\}/);
  assert.match(css, /\.mobileNavControls\s*\{\s*display:\s*flex;/);
  assert.match(css, /@media \(min-width:\s*1200px\)\s*\{\s*\.mobileNavControls\s*\{\s*display:\s*none;/);
  assert.match(css, /\.masthead:global\(\.header-inner\)\s*\{\s*min-height:\s*60px;/);
});
