import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const directoryCss = readFileSync("components/directory-public.module.css", "utf8");
const formCss = readFileSync("components/directory-filter-form.module.css", "utf8");
const page = readFileSync("components/directory-page.tsx", "utf8");
const form = readFileSync("components/directory-filter-form.tsx", "utf8");

test("desktop directory panel owns one bounded sticky scrollbar", () => {
  const block = directoryCss.match(/@media \(min-width: 821px\) \{\s*\.filterColumn \{([^}]+)\}/)?.[1];
  assert.ok(block, "desktop-only sticky panel viewport rule exists");
  assert.match(directoryCss, /\.filterColumn \{\s*position: sticky;/);
  assert.match(block, /max-height:\s*calc\(100dvh - var\(--psipedia-sticky-header-height, 76px\) - 32px\)/);
  assert.match(block, /overflow-y:\s*auto/);
  assert.match(block, /scrollbar-gutter:\s*stable/);
  assert.doesNotMatch(formCss, /\.sidebarForm\s*\{[^}]*max-height:/);
  assert.doesNotMatch(formCss, /\.sidebarForm\s*\{[^}]*overflow-y:\s*auto/);
});

test("mobile disclosure and dialog keep their native independent controls", () => {
  assert.match(directoryCss, /@media \(max-width: 820px\) \{[\s\S]*?\.filterColumn \{\s*position: static;/);
  assert.match(formCss, /\.dialog\[open\][\s\S]*?overflow-y: auto/);
  assert.match(form, /data-directory-modal=\{modal \? "true" : "false"\}/);
  assert.match(form, /data-directory-filter-disclosure/);
  assert.match(page, /<PublicFilterPanel[\s\S]*className=\{styles\.filterColumn\}/);
});
