import test from "node:test";
import assert from "node:assert/strict";
import {assertPublishedRelatedBlocks} from "../lib/notion-article-related-publication.ts";

const lookup = async (slug) => slug === "existujuci-clanok" ? "/starostlivost/existujuci-clanok" : null;

test("approved published article links pass", async () => {
  await assertPublishedRelatedBlocks([
    {type:"text"}, {type:"related", href:"/starostlivost/existujuci-clanok"},
  ], "novy-clanok", lookup);
});

test("draft, wrong section, external, fragment, and self links fail closed", async () => {
  for (const href of [
    "/clanky/novy-koncept",
    "/clanky/existujuci-clanok",
    "https://example.org/starostlivost/existujuci-clanok",
    "/starostlivost/existujuci-clanok#top",
    "/starostlivost/existujuci-clanok?from=other",
    "/clanky/novy-clanok",
  ]) {
    await assert.rejects(() => assertPublishedRelatedBlocks([
      {type:"related",href},
    ],"novy-clanok",lookup), /Súvisiaci článok/);
  }
});

test("a published relative URL and its exact canonical absolute equivalent work", async () => {
  await assertPublishedRelatedBlocks([
    {type:"related",href:"https://psipedia.sk/starostlivost/existujuci-clanok"},
  ],"other-article",lookup);
});

test("non-related promos and CTA blocks are unaffected", async () => {
  await assertPublishedRelatedBlocks([
    {type:"psipedia-promo",href:"https://other.example"},
    {type:"cta",href:"/adresar/veterinari"},
  ],"test",async () => {throw new Error("should not be called");});
});
