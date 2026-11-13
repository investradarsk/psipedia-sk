import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("mobile menu grip is after scrollable nav, not at the top of its list", () => {
  const header = read("components/site-header.tsx");
  const start = header.indexOf('id="mobile-menu"');
  const end = header.indexOf("<NavigationProgress />", start);
  const drawer = header.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.equal((drawer.match(/data-menu-dismiss-grip\b/g) ?? []).length, 1);
  assert.equal((drawer.match(/<nav\b/g) ?? []).length, 1);
  assert.ok(drawer.indexOf("</nav>") < drawer.indexOf("data-menu-dismiss-grip"));
  assert.match(drawer, /<button\s+type="button"\s+className=\{styles\.menuDismissGrip\}/);
  assert.doesNotMatch(drawer, /tabIndex=\{-1\}/);
  assert.match(drawer, /aria-label="Zavrieť navigačné menu"/);
  assert.match(drawer, /title="Potiahni nahor alebo nadol, prípadne klepni pre zatvorenie"/);
});

test("the viewport-aware menu reserves the bottom grip outside the scroll area", () => {
  const style = read("components/site-header.module.css");
  const system = read("app/design-system.css");
  assert.match(style, /:global\(#mobile-menu\.is-open\) > \.menuDismissGrip/);
  assert.doesNotMatch(style, /\.menuDismissGrip\s*\{[\s\S]*?position: sticky;\s*top: 0/);
  assert.match(style, /border-top: 1px solid var\(--line\)/);
  assert.match(style, /min-height: 48px/);
  assert.match(style, /touch-action: none/);
  assert.match(style, /:focus-visible/);
  assert.match(style, /\.mobileMenuShell:global\(#mobile-menu\.is-open\)\s*\{\s*display: flex;\s*flex-direction: column/);
  assert.match(style, /\.mobileMenuShell:global\(#mobile-menu\.is-open\) > :global\(nav\)\s*\{\s*flex: 1 1 auto;\s*min-height: 0;\s*height: auto/);
  assert.match(system, /overflow-y: auto/);
  assert.match(system, /100dvh - var\(--psipedia-mobile-menu-top/);
});

test("grip owns upward and downward gestures without intercepting list/browser navigation", () => {
  const header = read("components/site-header.tsx");
  assert.match(header, /menu\?\.querySelector<HTMLButtonElement>\(":scope > \[data-menu-dismiss-grip\]"\)/);
  assert.match(header, /grip\.addEventListener\("touchstart", onStart/);
  assert.match(header, /grip\.addEventListener\("touchmove", onMove/);
  assert.match(header, /const close = startY !== null && Math\.abs\(distance\) >= 60/);
  assert.match(header, /drawer\.style\.transform = "translate3d\(0," \+ distance \+ "px,0\)"/);
  assert.match(header, /distance = Math\.max\(-180, Math\.min\(180,/);
  assert.match(header, /menuReturnFocusRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(header, /document\.addEventListener\("touchstart"/);
  assert.match(header, /aria-label=\{menuOpen \? "Zavrieť menu" : "Otvoriť menu"\}/);
  assert.match(header, /setOpenMobileMenu\(null\)/);
});

test("mobile swipe browser tests check actual grip geometry, native scroll, tap and keyboard", () => {
  const tests = read("tests/e2e/mobile-swipe-navigation.spec.ts");
  assert.match(tests, /for \(const width of \[320, 390, 768\]\)/);
  assert.match(tests, /expect\(before\.navBottom/);
  assert.match(tests, /expect\(before\.gripBottom\)/);
  assert.match(tests, /expect\(before\.nativeScrolling\)\.toBe\("auto"\)/);
  assert.match(tests, /await page\.keyboard\.press\("Enter"\)/);
  assert.match(tests, /await chromeFingerSwipe\(page, \[x, y\], \[x, y \+ 115\]\)/);
  assert.match(tests, /await expect\(menu\)\.toHaveClass\(\/is-open\/\)/);
});
