import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("V2-03 navigation shares Premium tokens and responsive name days", () => {
  const css = read("components/site-header.module.css");
  for (const token of ["background: var(--ps-premium-gradient, var(--forest));", "font-family: var(--ps-font-body, system-ui, sans-serif);", "border-radius: var(--ps-radius-control);", '.mobileMenuShell a[data-active="true"]', "@media (max-width: 1199px)", "@media (max-width: 360px)", ".mobileNameDay", "prefers-reduced-motion"]) assert.ok(css.includes(token), token);
  const header = read("components/site-header.tsx");
  for (const token of ["data-mobile-name-day", 'href="/psie-meniny"', "aria-expanded", "aria-current", 'aria-modal="true"', "LazyPublicSearchSuggestions"]) assert.ok(header.includes(token), token);
});
test("V2-03 footer keeps high-contrast brand and legal controls", () => {
  const css = read("components/site-footer.module.css");
  assert.ok(css.includes("background: var(--ps-premium-gradient, var(--forest-dark));"));
  assert.ok(css.includes("color: var(--ps-premium-on-dark, white);"));
  assert.ok(css.includes(".footer-cookie-button:focus-visible"));
  const footer = read("components/site-footer.tsx");
  for (const href of ["/kontakt", "/pravne-informacie", "/sukromie", "/podmienky-pouzivania", "/opravy-a-podnety", "/zasady-obsahu"]) assert.ok(footer.includes('href="' + href + '"'), href);
  assert.ok(footer.includes("<CookieSettingsButton />"));
});
test("V2-03 search preserves shared GET contract, suggestion focus and breadcrumbs", () => {
  const css = read("app/design-system.css");
  assert.ok(css.includes("background: var(--ps-color-surface);"));
  assert.ok(css.includes(".article-breadcrumbs a:focus-visible"));
  const suggestions = read("components/public-search-suggestions.module.css");
  for (const token of ["border-radius: var(--ps-radius-control);", '.option[data-active="true"]', ".option:focus-visible", "min-height: 44px;"]) assert.ok(suggestions.includes(token), token);
  const home = read("components/home-portal-search.tsx");
  assert.ok(home.includes('action={action} method="get"'));
  assert.ok(home.includes("name={inputName}"));
  assert.ok(home.includes("hidden.map"));
  assert.ok(!read("app/hladat/search.module.css").includes(":global(.portal-search-form button)"));
});
