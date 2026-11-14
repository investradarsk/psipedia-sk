import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("step 6: shell stays compact and protects fixed menu space on phones", () => {
  const shell = read("components/admin-shell.module.css");
  const source = read("components/admin-shell.tsx");
  assert.match(shell, /\.workspacePage \{ min-width: 0;/);
  assert.match(shell, /\.topbarSticky \{ min-width: 0; \}/);
  assert.match(shell, /\.topbarActions > \* \{ flex-shrink: 0; \}/);
  assert.match(shell, /\.topbarSticky \{ min-height: 60px; padding: 8px 64px 8px 12px; \}/);
  assert.match(shell, /@media \(max-width: 420px\)[\s\S]*?\.mobileBrand > span \{ display: none; \}/);
  assert.match(shell, /@media \(max-width: 1100px\)[\s\S]*?\.account \{ display: none; \}/);
  assert.match(source, /<AdminStickyMetrics \/>/);
  assert.match(source, /<AdminQuickNavigation \/>/);
  assert.match(source, /<AdminTourButton \/>/);
  assert.match(source, /data-admin-topbar/);
  assert.doesNotMatch(shell, /overflow-x:\s*hidden/);
});

test("step 6: safe-area drawer sizes against its content box rather than vw", () => {
  const css = read("components/admin-navigation.module.css");
  const nav = read("components/admin-navigation.tsx");
  assert.match(css, /\.backdrop\s*\{[\s\S]*?box-sizing: border-box/);
  assert.match(css, /\.drawer\s*\{[\s\S]*?width: min\(390px, 100%\)/);
  assert.match(css, /\.drawer\s*\{[\s\S]*?max-height: 100%/);
  assert.match(css, /\.mobileGroup > div\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.mobileGroup a\s*\{[\s\S]*?overflow-wrap: anywhere/);
  assert.match(css, /\.desktopGroup a \{ min-height: 44px; padding: 6px 8px; \}/);
  assert.match(nav, /aria-modal="true"/);
  assert.match(nav, /aria-expanded=\{open\}/);
  assert.match(nav, /document\.body\.style\.overflow = "hidden"/);
  assert.match(nav, /event\.key === "Escape"/);
  assert.match(nav, /onMouseDown=\{closeDrawer\}/);
  assert.doesNotMatch(css, /width: calc\(100vw - 20px\)/);
});

test("step 6: mobile header buttons have the same 44px touch target", () => {
  const search = read("components/admin-quick-navigation.module.css");
  const tour = read("components/admin-tour-button.module.css");
  const nav = read("components/admin-navigation.module.css");
  assert.match(search, /min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(search, /\.trigger \{ width: 44px; min-width: 44px; padding: 6px; \}/);
  assert.match(tour, /min-height: var\(--admin-ui-control-height, 44px\)/);
  assert.match(tour, /\.button \{ min-width: 44px; padding-inline: 0; \}/);
  assert.match(nav, /\.menuButton \{ min-width: 44px; min-height: 44px;/);
  assert.match(nav, /\.menuButton:focus-visible/);
});

test("step 6: real Playwright suite verifies all responsive widths and collision bounds", () => {
  const e2e = read("tests/e2e/admin-ia-2.spec.ts");
  assert.match(e2e, /step 6: compact topbar, drawer and navigation remain collision-free/);
  for (const w of [320, 375, 390, 430, 768, 1440]) assert.match(e2e, new RegExp("\\b" + w + "\\b"));
  assert.match(e2e, /document\.documentElement\.scrollWidth/);
  assert.match(e2e, /getByTestId\("admin-notification-bell"\)/);
  assert.match(e2e, /await page\.keyboard\.press\("Escape"\)/);
  assert.match(e2e, /await page\.screenshot\(\{/);
});
