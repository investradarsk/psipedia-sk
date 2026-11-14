import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isDuplicatedDirectoryDescription } from "../lib/directory-description-dedupe.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("an identical short and long service description is shown only once", () => {
  const repeated = "Aktívny psí salón v Piešťanoch otvorený od marca 2025.";
  assert.equal(isDuplicatedDirectoryDescription(repeated, repeated), true);
  assert.equal(
    isDuplicatedDirectoryDescription("  Aktívny   psí salón\n", "aktívny psí salón"),
    true,
  );
  assert.equal(isDuplicatedDirectoryDescription(repeated, repeated + " Objednávky prijímame."), false);
  assert.equal(isDuplicatedDirectoryDescription("", repeated), false);
  assert.equal(isDuplicatedDirectoryDescription(repeated, ""), false);
});

test("public service detail still keeps a real long description and a nonduplicated excerpt", () => {
  const detail = read("components/directory-profile-detail.tsx");
  assert.match(detail, /showExcerpt=\{!isDuplicatedDirectoryDescription\(presentation\.excerpt, presentation\.description\)\}/);
  assert.match(detail, /title="O službe"/);
  assert.match(detail, /<DetailParagraphs value=\{presentation\.description\}/);
  assert.match(detail, /showExcerpt && presentation\.excerpt/);
});

test("directory overview updates managed legacy copy without affecting mobile or category hero", () => {
  const page = read("components/directory-page.tsx");
  const css = read("components/directory-public.module.css");
  assert.match(page, /contentSource="route"/);
  assert.match(page, /className=\{!active \? styles\.compactDesktopHero : undefined\}/);
  assert.match(page, /Výsledky spresni podľa lokality a zamerania/);
  assert.match(page, /z profilu môžeš poslať dopyt cez Psipediu/);
  assert.match(css, /@media \(min-width: 821px\) \{\s*\.compactDesktopHero/);
  assert.match(css, /min-height: 248px/);
  assert.match(css, /\.resultsSection \.sharedCategoryNavigation \{\s*margin-bottom: 8px;/);
});
