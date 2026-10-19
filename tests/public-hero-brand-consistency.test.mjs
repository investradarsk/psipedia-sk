import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const header = source("components/site-header.tsx");
const headerCss = source("components/site-header.module.css");
const sharedHero = source("components/public-visual-system/unified-section-hero.tsx");
const sharedCss = source("components/public-visual-system/unified-section-hero.module.css");
const homeCss = source("app/home-v2.module.css");
const map = source("app/mapa/page.tsx");
const visuals = source("lib/section-visual-contract.ts");

test("header name days navigate to the canonical public calendar on both viewports", () => {
  assert.match(header, /<Link href="\/psie-meniny" className=\{styles\.mobileNameDay\}/);
  assert.match(header, /<Link href="\/psie-meniny" className=\{styles\.desktopNameDay\}/);
  assert.match(headerCss, /\.mobileNameDay:focus-visible/);
  assert.match(headerCss, /\.desktopNameDay:focus-visible/);
});

test("shared public hero and news navigation use the same strong brand accent", () => {
  assert.match(headerCss, /\.desktopNav :global\(\.nav-news\)[\s\S]*background: var\(--brand-accent-strong\)/);
  assert.doesNotMatch(headerCss, /#ffd0c3/i);
  assert.match(sharedCss, /\.eyebrow[\s\S]*background: var\(--brand-accent-strong/);
  assert.match(sharedCss, /\.breadcrumbs[\s\S]*color: #fff/);
  assert.match(homeCss, /\.homeV2 :global\(\.hero-kicker\)[\s\S]*background: var\(--brand-accent-strong/);
});

test("hero copy has fixed vertical anchor and quick routes are restored without changing search scope", () => {
  assert.match(sharedCss, /\.copy \{[\s\S]*justify-content: flex-start/);
  assert.match(sharedHero, /defaultHeroQuickLinks\(visual\.visualKey\)/);
  assert.match(sharedHero, /Rýchlo:/);
  assert.match(sharedHero, /portalSearchSlot \? \[\] : activeShortcuts/);
  assert.doesNotMatch(sharedHero, /overrides\.(action|inputName|hidden)\s*=/);
});

test("map uses the existing managed hero visual and preserves its interactive search", () => {
  assert.match(visuals, /visualKey: "section\.mapa"/);
  assert.match(map, /getSectionHeroVisual\("section\.mapa"\)/);
  assert.match(map, /<UnifiedSectionHeroShell>/);
  assert.match(map, /<UnifiedSectionHero/);
  assert.match(map, /<MapExperience/);
  assert.doesNotMatch(map, /className=\{styles\.hero\}/);
});
