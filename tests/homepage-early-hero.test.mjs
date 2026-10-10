import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const homeStart = page.indexOf("export default async function Home() {");
const deferredStart = page.indexOf("async function HomeDeferredSections");
const loaderStart = page.indexOf("function loadHomepageBelowFoldData()");
const loader = page.slice(loaderStart, homeStart);
const home = page.slice(homeStart, deferredStart);
const belowFold = page.slice(deferredStart);

test("homepage starts all non-hero reads concurrently without blocking above-fold rendering", () => {
  assert.ok(loaderStart > 0 && homeStart > loaderStart && deferredStart > homeStart);
  assert.match(loader, /return Promise\.all\(\[/);
  for (const expected of [
    "getPublishedArticleSummaries",
    "getHomepageUpcomingEventsWithImages",
    "getHomepageHighlightedHelpCasesWithImages",
    "getBreedOfTheDay",
    "getHomepageDirectoryProfilesWithImages",
  ]) {
    assert.ok(loader.includes(expected), `Missing deferred source ${expected}`);
    assert.ok(!home.includes(expected), `Homepage hero still waits on ${expected}`);
  }
  assert.ok(home.indexOf("loadHomepageBelowFoldData()") < home.indexOf('await getResolvedSectionVisual("home.hero")'));
  assert.doesNotMatch(home, /await Promise\.all/);
});

test("hero and search are server-rendered before the deferred sections without placeholder photography", () => {
  assert.match(home, /data-home-hero[\s\S]*?fetchPriority="high"/);
  assert.match(home, /data-home-search[\s\S]*?<HomePortalSearch/);
  assert.match(home, /<Suspense fallback=\{null\}>[\s\S]*?<HomeDeferredSections data=\{deferredData\} \/>/);
  assert.ok(home.indexOf("data-home-hero") < home.indexOf("<Suspense"));
  assert.ok(home.indexOf("data-home-search") < home.indexOf("<Suspense"));
  assert.ok(!home.includes("home-event-placeholder"));
  assert.match(home, /srcSet=\{responsiveMediaSrcSet\(homeHero\.imageUrl,/);
  assert.match(home, /style=\{homeHeroStyle\}/);
});

test("deferred subtree still includes all homepage public sections, CTAs and ads", () => {
  for (const token of [
    "<HomeLatestArticles",
    "data-home-events",
    "data-home-veterinarians",
    "data-home-services-secondary",
    "data-home-help",
    "data-home-breed",
    "<HomeDogNameDayEntry",
    "data-home-calculator",
    "<AdSlot",
  ]) assert.ok(belowFold.includes(token), `Lost homepage content: ${token}`);
  assert.match(belowFold, /const \[publishedArticles, nextEvents, activeHelpCases, breedOfTheDay, veterinarians\] = await data;/);
});
