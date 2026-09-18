import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("components/public-visual-system/public-visual-system.tsx", "utf8");
const styles = readFileSync("components/public-visual-system/public-visual-system.module.css", "utf8");
const barrel = readFileSync("components/public-visual-system/index.ts", "utf8");

test("public visual system exposes opt-in public-only foundation primitives", () => {
  for (const name of [
    "PublicFoundation",
    "PublicSectionHeader",
    "PublicContentList",
    "PublicContentListItem",
    "PublicDataCard",
    "PublicActionLink",
    "PublicActionButton",
    "PublicIcon",
  ]) {
    assert.match(source, new RegExp(`export function ${name}\\b`), `${name} export is missing`);
    assert.match(barrel, new RegExp(`\\b${name}\\b`), `${name} barrel export is missing`);
  }
  assert.doesNotMatch(source, /(?:admin|editor)[/-]/i);
  assert.doesNotMatch(styles, /\\.(?:admin|editor)\\b/i);
  assert.doesNotMatch(styles, /(^|[,{]\\s*)(html|body|:root)\\b/m);
});

test("header policy distinguishes editorial, compact, image and data/service presentation", () => {
  assert.match(source, /type PublicHeaderVariant = "editorial" \| "compact" \| "image" \| "data"/);
  assert.match(source, /image\?: \{ src: string; alt: string \}/);
  assert.match(source, /const sideVisual = image \?/);
  assert.match(source, /: visual \?/);
  assert.match(styles, /\.headerEditorial h1,\s*\.headerImage h1/);
  assert.match(styles, /\.headerCompact h1,\s*\.headerData h1/);
  assert.match(styles, /\.headerData\s*\{[^}]*border:/s);
  assert.doesNotMatch(source, /image:\s*\{ src:/);
});

test("typography is compact and keeps editorial versus data heading hierarchy", () => {
  assert.match(styles, /--pv-type-body:\s*\.9375rem/);
  assert.match(styles, /--pv-type-body-dense:\s*\.875rem/);
  assert.match(styles, /--pv-type-data-heading:\s*clamp\(1\.9rem, 3\.4vw, 3\.15rem\)/);
  assert.match(styles, /--pv-type-editorial-heading:\s*clamp\(2\.35rem, 5vw, 4\.25rem\)/);
  assert.match(styles, /--pv-leading-body:\s*1\.62/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /--pv-type-body:\s*\.9rem/);
});

test("content list and data cards are compact, explicit interactive surfaces", () => {
  assert.match(source, /className=\{cx\(styles\.contentItem/);
  assert.match(source, /className=\{cx\(styles\.dataCard/);
  assert.match(source, /<ArrowIcon size=\{16\}/);
  assert.match(source, /<ArrowIcon size=\{17\}/);
  assert.match(styles, /\.contentItemWithImage\s*\{[^}]*grid-template-columns:\s*148px minmax\(0, 1fr\)/s);
  assert.match(styles, /\.dataCard\s*\{[^}]*min-height:\s*82px/s);
  assert.match(styles, /\.dataCard:hover\s*\{[^}]*border-color:\s*var\(--forest\)/s);
  assert.match(styles, /\.contentItem:focus-visible,\s*\.dataCard:focus-visible/s);
});

test("CTA hierarchy and icon policy stay reusable and emoji-independent", () => {
  assert.match(source, /type PublicActionVariant = "primary" \| "secondary" \| "tertiary"/);
  assert.match(styles, /\.actionPrimary\s*\{/);
  assert.match(styles, /\.actionSecondary\s*\{/);
  assert.match(styles, /\.actionTertiary\s*\{/);
  assert.match(styles, /\.action\s*\{[^}]*min-height:\s*44px/s);
  assert.match(source, /icon: ReactElement/);
  assert.match(source, /aria-hidden="true"/);
  assert.doesNotMatch(source, /🐾|🔎|📍|📅|➡️|👉/u);
});

test("mobile contract protects 390px layouts from horizontal overflow", () => {
  assert.match(styles, /@media \(max-width: 390px\)/);
  assert.match(styles, /grid-template-columns:\s*88px minmax\(0, 1fr\)/);
  assert.match(styles, /\.headerCopy,\s*\.headerVisual,\s*\.contentCopy,\s*\.dataCardBody\s*\{[^}]*min-width:\s*0/s);
  assert.match(styles, /max-width:\s*100%/);
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(styles, /position:\s*(?:fixed|sticky)/);
});
