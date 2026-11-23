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

test("historical dog report form URL leads into Partner login rather than legacy anonymous form", () => {
  const route = read("app/pomoc-psom/stratene-a-najdene/nahlasit/page.tsx");
  assert.match(route, /partner\/koncepty\/novy\/(?:strateny|najdeny|nahlasit)/);
  assert.match(route, /redirect\(target\)/);
  assert.doesNotMatch(route, /LostFoundSubmissionForm/);
});
