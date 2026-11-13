import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("adoption listing retains shared cards with roomy desktop two-column layout", () => {
  const listing = read("components/adoption-catalog.tsx");
  const css = read("components/adoption.module.css");
  assert.match(listing, /<PublicHelpProfileCard/);
  assert.match(css, /@media \(min-width: 961px\)[\s\S]*?\.grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 650px\)/);
});

test("ambiguous zero age is never presented as a verified newborn", () => {
  const detail = read("lib/adoption-detail.ts");
  const catalog = read("lib/adoption-catalog.ts");
  assert.match(detail, /!dog\.birthDate && dog\.approximateAgeMonths === 0\) return "neoverený"/);
  assert.match(catalog, /!dog\.birthDate && dog\.approximateAgeMonths === 0\) return "Vek neoverený"/);
  assert.match(detail, /if \(months === 0\) return "menej ako 1 mesiac"/);
});

test("organization headings use canonical compact styles for reviews, map and details", () => {
  const source = read("components/organization-profile-detail.tsx");
  assert.match(source, /<PublicLocationMap[\s\S]*?compactHeading/);
  assert.match(source, /<ProfileReviewSection\s+compactHeading/);
  assert.match(source, /<DetailSection compactHeading eyebrow=/);
});

test("fundraiser distinguishes amount verification from profile update and volunteer instructions from place", () => {
  const shell = read("components/help-details/help-detail-shell.tsx");
  const types = read("components/help-details/help-detail-types.tsx");
  assert.match(shell, /Dátum overenia vyzbieranej sumy zatiaľ nie je evidovaný/);
  assert.match(types, /function volunteerDeliveryInstructions/);
  assert.match(types, /textFact\("Lokalita", volunteerLocation\(item\)\)/);
  assert.match(types, /textFact\("Pokyny na poskytnutie pomoci", volunteerDeliveryInstructions\(item\)\)/);
});

test("dog report form has a single visible title and no duplicate global search", () => {
  const hero = read("components/public-visual-system/universal-page-hero.tsx");
  const route = read("app/pomoc-psom/stratene-a-najdene/nahlasit/page.tsx");
  const form = read("components/lost-found-submission-form.tsx");
  assert.match(hero, /showSearch \? \(/);
  assert.match(route, /variant="compact" showSearch=\{false\}/);
  assert.match(form, /<h2 className="sr-only">Údaje hlásenia<\/h2>/);
  assert.doesNotMatch(form, /<h2>Nahlásiť strateného alebo nájdeného psa<\/h2>/);
  assert.match(form, /action="\/api\/lost-found\/submissions"/);
});
