import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile menu height is viewport-aware and never feeds its own height into the sticky offset", () => {
  const header = source("components/site-header.tsx");
  const css = source("app/design-system.css");
  assert.match(header, /mastheadHeight \+ bandHeight \+ borderHeight/);
  assert.match(header, /--psipedia-mobile-menu-top/);
  assert.doesNotMatch(header, /Math\.ceil\(header\.getBoundingClientRect\(\)\.height\)/);
  assert.match(css, /100dvh - var\(--psipedia-mobile-menu-top/);
  assert.match(css, /safe-area-inset-bottom/);
});

test("shared mobile hero stays edge-to-edge without changing visual resolution or public search", () => {
  const hero = source("components/public-visual-system/unified-section-hero.module.css");
  const resolver = source("components/public-visual-system/unified-section-hero.tsx");
  assert.match(hero, /width: 100dvw/);
  assert.match(hero, /border-radius: 0/);
  assert.match(hero, /--ps-control-min-height/);
  assert.match(resolver, /visual\.imageUrl/);
  assert.match(resolver, /managedSearch\(searchSlot, config\)/);
});

test("mobile Partner entry and the full public navigation remain present", () => {
  const header = source("components/site-header.tsx");
  assert.match(header, /const partnerHref = partnerAuthenticated \? "\/partner" : "\/partner\/prihlasenie"/);
  assert.match(header, /data-partner-login-entry/);
  assert.match(header, /aria-label="Mobilná navigácia"/);
  assert.match(header, /menuReturnFocusRef\.current/);
});
