import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  hasCompletePublicPhotoCredit,
  isInternalBreedSportNote,
  isNotionOnlySocialDraftHeading,
  isPhotoAttributionHeading,
  isPrivateEditorialArticleHeading,
  photoCreditFromNotionAttribution,
} from "../lib/public-editorial-guard.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Notion-only sections never enter the public article body", () => {
  for (const heading of [
    "Sociálne siete – interný návrh",
    "Sociálne siete — redakčný návrh",
    "Redakčné prvky pre administráciu",
    "Redakčné poznámky",
    "Redakčné poznámky – pre Admin",
    "Redakčné prvky pre Psipedia Admin",
    "Psipedia bloky",
    "Pred publikovaním",
  ]) assert.equal(isPrivateEditorialArticleHeading(heading), true, heading);

  for (const heading of ["Povaha a výcvik", "Odborné zdroje", "Fotografia a licencia", "Sociálne siete"]) {
    assert.equal(isPrivateEditorialArticleHeading(heading), false, heading);
  }
  assert.equal(isPhotoAttributionHeading("Fotografia a licencia"), true);

  const publicDetail = read("components/article-detail.tsx");
  const articleBlocks = read("lib/article-blocks.ts");
  const articleStore = read("lib/article-store.ts");
  const notionSync = read("lib/notion-article-sync.ts");
  assert.match(publicDetail, /const blocks = publicArticleBlocks\(/);
  assert.match(publicDetail, /articleBlockHeadings\(blocks\)/);
  assert.match(publicDetail, /articleBlockPlainText\(blocks\)/);
  assert.match(articleBlocks, /isPrivateEditorialArticleHeading\(block\.text\)/);
  assert.match(articleBlocks, /return !privateTail/);
  assert.match(articleStore, /const canonicalBlocks = publicArticleBlocks\(normalizeArticleBlocks\(payload\.blocks/);
  assert.match(articleStore, /const blocks = canonicalBlocks/);
  assert.match(notionSync, /isPrivateEditorialArticleHeading\(heading\)/);
  assert.match(notionSync, /hasCompletePublicPhotoCredit\(imageCredit, imageCreditUrl\)/);
  assert.match(notionSync, /Kredit fotografie/);
  assert.match(notionSync, /selectNotionArticleBodyBlocks\(remoteBlocks,/);
  assert.match(notionSync, /selectNotionArticleBodyBlocks\(blocks,/);
  assert.match(read("lib/notion-article-content-plan.ts"), /fields\.push\(\["Kredit fotografie"/);
});

test("real Wikimedia photo attribution moves to the Admin credit field losslessly", () => {
  const notionNote = "Titulná fotografia zachytáva psa pri vode. Autor: Kája.Svi; zdroj: Wikimedia Commons – Czechoslovakian wolfdog.jpg; licencia: Creative Commons Attribution-ShareAlike 4.0. Ide o ilustračnú fotografiu.";
  const credit = photoCreditFromNotionAttribution(notionNote);
  assert.equal(credit, "Kája.Svi · Wikimedia Commons – Czechoslovakian wolfdog.jpg · Creative Commons Attribution-ShareAlike 4.0");
  assert.equal(hasCompletePublicPhotoCredit(credit, "https://commons.wikimedia.org/wiki/File:Czechoslovakian_wolfdog.jpg"), true);
  assert.equal(photoCreditFromNotionAttribution("Fotografia je ilustračná; autora overíme neskôr."), "");
  assert.equal(hasCompletePublicPhotoCredit("", "https://commons.wikimedia.org/wiki/File:a.jpg"), false);
  assert.equal(hasCompletePublicPhotoCredit("Fotografia: Wikimedia Commons", "https://commons.wikimedia.org/wiki/File:a.jpg"), false);
  assert.match(read("components/article-detail.tsx"), /hasCompletePublicPhotoCredit\(article\.imageCredit, article\.imageCreditUrl\)/);
});

test("unpublished breed suitability audit notes are not displayed, legitimate notes remain", () => {
  for (const note of [
    "Redakčné hodnotenie vhodnosti; finálny audit pred publikovaním.",
    "Redakčné hodnotenie vhodnosti; finálne overiť pred publikovaním.",
    "Pred publikovaním overiť zdroje.",
    "Redakčná kontrola hodnotenia.",
  ]) assert.equal(isInternalBreedSportNote(note), true, note);
  assert.equal(isInternalBreedSportNote("Vhodný šport pre skúseného psovoda."), false);
  assert.match(read("app/plemena/[slug]/page.tsx"), /!isInternalBreedSportNote\(sport\.note\)/);
});

test("CC0, Pexels and Unsplash photo credits are complete only with a source URL", () => {
  const origin = "https://commons.wikimedia.org/wiki/File:Dog.jpg";
  for (const credit of [
    "BunbunYU / Wikimedia Commons · CC0 1.0",
    "Blue Bird / Pexels · Pexels License",
    "Photographer / Unsplash · Unsplash License",
    "Autor / Wikimedia Commons · verejná doména",
    "Autor / Wikimedia Commons · CC BY-SA 4.0",
  ]) {
    assert.equal(hasCompletePublicPhotoCredit(credit, origin), true, credit);
    assert.equal(hasCompletePublicPhotoCredit(credit, ""), false, credit);
  }
  assert.equal(hasCompletePublicPhotoCredit("License not verified", origin), false);
  assert.equal(hasCompletePublicPhotoCredit("Adelaide University / Original content", origin), false);
  assert.equal(photoCreditFromNotionAttribution("Autor: Tester; zdroj: Wikimedia Commons; licencia: CC0 1.0."), "Tester · Wikimedia Commons · CC0 1.0");
});

test("generic social-media headings stay public unless they contain both internal post drafts", () => {
  assert.equal(isPrivateEditorialArticleHeading("Sociálne siete"), false);
  assert.equal(isNotionOnlySocialDraftHeading("Sociálne siete", ["Facebook", "Instagram"]), true);
  assert.equal(isNotionOnlySocialDraftHeading("Sociálne siete", ["Prečo uverejniť nález psa", "Bezpečnosť"]), false);
  assert.equal(isNotionOnlySocialDraftHeading("Sociálne siete", ["Facebook"]), false);
  assert.equal(isNotionOnlySocialDraftHeading("Socializácia", ["Facebook", "Instagram"]), false);
  const articleBlocks = read("lib/article-blocks.ts");
  const notionSync = read("lib/notion-article-sync.ts");
  assert.match(articleBlocks, /socialDraft = isNotionOnlySocialDraftHeading\(block\.text, subsections\)/);
  assert.match(notionSync, /isNotionSocialDraftSection\(blocks, index\)/);
  assert.match(notionSync, /return isNotionOnlySocialDraftHeading\(blockText\(headingBlock\), subsections\)/);
});
