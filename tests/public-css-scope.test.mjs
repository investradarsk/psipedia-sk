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


test("STEP 3: public root excludes legacy admin-only CSS; Admin retains it at its route boundary", () => {
  const root = read("app/layout.tsx");
  const admin = read("app/admin/layout.tsx");
  const globals = read("app/globals.css");
  const extracted = read("app/admin/admin-root-extracted.css");
  const hotfix = read("app/navigation-hotfix.css");
  assert.match(admin, /import "\.\/admin-root-extracted\.css";/);
  assert.match(admin, /import "\.\.\/navigation-hotfix\.css";/);
  assert.doesNotMatch(root, /admin-root-extracted\.css|navigation-hotfix\.css/);
  assert.ok(hotfix.includes(".admin-navigation-automatic"));
  assert.ok(globals.length <= 290_000, "Public CSS size budget regressed");
  assert.ok(extracted.length >= 50_000, "Admin-only stylesheet disappeared");
  for (const selector of [
    ".admin-subsection-row-header",
    ".admin-section-nav",
    ".admin-event-filters",
    ".admin-optional-settings",
    ".admin-navigation-preview",
    ".admin-import-summary-table",
  ]) {
    assert.ok(extracted.includes(selector), "Missing route-scoped admin selector: " + selector);
    assert.ok(!globals.includes(selector), "Admin-only selector leaked into public bundle: " + selector);
  }
  // Explicit mixed CSS remains in the public sheet until all its public
  // and admin consumers can be migrated together without a cascade change.
  for (const selector of [
    ".hero-card",
    ".cookie-consent",
    ".article-card-media",
    ".event-markdown",
    ".admin-relation-grid",
    ".admin-inquiry-body",
    ".admin-directory-flags",
  ]) assert.ok(globals.includes(selector), "Mixed or public rule was moved: " + selector);
});

test("STEP 3: extracted CSS has balanced blocks and only admin-prefixed style selectors", () => {
  const extracted = read("app/admin/admin-root-extracted.css").replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  let rules = 0;
  let headerStart = 0;
  let quote = "";
  for (let i = 0; i < extracted.length; i++) {
    const ch = extracted[i];
    if (quote) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === "{") {
      const header = extracted.slice(headerStart, i).trim();
      if (depth === 0 || header.startsWith("@media")) {
        if (header.startsWith("@media")) {
          assert.match(header, /^@media \(/);
        } else {
          assert.ok(header.split(",").every(selector => /^(?:\.admin[\w-]*|#admin[\w-]*|\[data-admin)/.test(selector.trim())), "Non-admin selector leaked: " + header);
          rules++;
        }
      } else if (depth === 1) {
        assert.ok(header.split(",").every(selector => /^(?:\.admin[\w-]*|#admin[\w-]*|\[data-admin)/.test(selector.trim())), "Non-admin media selector: " + header);
        rules++;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      assert.ok(depth >= 0, "Unmatched CSS closing brace");
      headerStart = i + 1;
    }
    if (ch === "{" && depth === 1) {
      headerStart = i + 1;
    }
  }
  assert.equal(depth, 0, "Unclosed CSS rule");
  assert.ok(rules >= 450, "Missing extracted admin rule coverage");
});
