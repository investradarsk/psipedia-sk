import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isInternalBreedSportNote,
  isPrivateEditorialArticleHeading,
} from "../lib/public-editorial-guard.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("internal Notion tail sections cannot become public article content", () => {
  for (const heading of [
    "Fotografia a licencia",
    "Sociálne siete – interný návrh",
    "Sociálne siete",
    "Redakčné prvky pre administráciu",
    "Redakčné poznámky",
    "Redakčné prvky pre Psipedia Admin",
    "Psipedia bloky",
  ]) assert.equal(isPrivateEditorialArticleHeading(heading), true, heading);

  for (const heading of ["Povaha a výcvik", "Odborné zdroje", "Zdravie a starostlivosť"]) {
    assert.equal(isPrivateEditorialArticleHeading(heading), false, heading);
  }

  const publicDetail = read("components/article-detail.tsx");
  const articleBlocks = read("lib/article-blocks.ts");
  const notionSync = read("lib/notion-article-sync.ts");
  assert.match(publicDetail, /const blocks = publicArticleBlocks\(/);
  assert.match(publicDetail, /articleBlockHeadings\(blocks\)/);
  assert.match(publicDetail, /articleBlockPlainText\(blocks\)/);
  assert.match(articleBlocks, /if \(block\.type === "h2"\) privateSection = isPrivateEditorialArticleHeading\(block\.text\)/);
  assert.match(notionSync, /isPrivateEditorialArticleHeading\(heading\)/);
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
