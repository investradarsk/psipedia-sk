import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  indexBreedSearch,
  filterIndexedBreeds,
  groupVisibleBreeds,
} from "../lib/breed-browser-search.ts";
import { normalizeBreedSearchText } from "../lib/breed-fci.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const groups = [
  { number: 1, label: "Ovčiarske" },
  { number: 2, label: "Molosoidné" },
  { number: 3, label: "Teriéry" },
];

const breeds = [
  { slug: "border", name: "Border kólia", officialFciName: "Border Collie", group: "Ovčiarske", fciSection: "Ovčiarske psy", intro: "Pracovný pes", searchText: "border", fciGroup: 1, fciSectionNumber: "1", origin: "Veľká Británia" },
  { slug: "nemecky", name: "Nemecký ovčiak", officialFciName: "Deutscher Schäferhund", group: "Ovčiarske", fciSection: "Ovčiarske psy", intro: "Všestranný pes", searchText: "german shepherd", fciGroup: 1, fciSectionNumber: "1", origin: "Nemecko" },
  { slug: "civava", name: "Čivava", officialFciName: "Chihuahua", group: "Spoločenské", fciSection: "Malé psy", intro: "Malý pes", searchText: "čivava", fciGroup: 3, fciSectionNumber: "2", origin: "Mexiko" },
  { slug: "bul", name: "Bull Terrier", officialFciName: "Bull Terrier", group: "Teriéry", fciSection: "Bull typ", intro: "", searchText: "bully", fciGroup: 3, fciSectionNumber: "3", origin: "Veľká Británia" },
  { slug: "mastif", name: "Mastif", officialFciName: "Mastiff", group: "Molosy", fciSection: "Molosoidné", intro: "Veľké plemeno", searchText: "", fciGroup: 2, fciSectionNumber: "1", origin: "Veľká Británia" },
];

function legacyFilter(cards, options) {
  const normalized = normalizeBreedSearchText(options.query);
  return cards.filter((breed) => {
    const queryMatch = !normalized || normalizeBreedSearchText(
      [breed.name, breed.officialFciName, breed.group, breed.fciSection, breed.intro, breed.searchText].join(" "),
    ).includes(normalized);
    const groupMatch = options.group === "all" || breed.fciGroup === Number(options.group);
    const sectionMatch = !options.section || breed.fciSectionNumber === options.section;
    const originMatch = options.origin === "all" || breed.origin === options.origin;
    return queryMatch && groupMatch && sectionMatch && originMatch;
  });
}

function legacyGroups(visible, allGroups) {
  return allGroups
    .map((group) => ({
      group,
      breeds: visible
        .filter((breed) => breed.fciGroup === group.number)
        .sort((first, second) => first.name.localeCompare(second.name, "sk")),
    }))
    .filter((entry) => entry.breeds.length > 0);
}

test("pre-indexed breed atlas search returns the same matching breeds and FCI ordering as before", () => {
  const index = indexBreedSearch(breeds);
  assert.equal(index.length, breeds.length);
  for (const query of ["", "border", "kólia", "KOLIA", "čivava", "CIVAVA", "Shepherd", "  pes ", "nemecko", "mastiff", "terier", "žiadny"]) {
    for (const group of ["all", "1", "2", "3"]) {
      for (const section of ["", "1", "2", "3"]) {
        for (const origin of ["all", "Veľká Británia", "Mexiko", "Nemecko"]) {
          const filters = { query, group, section, origin };
          const oldResults = legacyFilter(breeds, filters);
          const newResults = filterIndexedBreeds(index, filters);
          assert.deepEqual(newResults.map((breed) => breed.slug), oldResults.map((breed) => breed.slug),
            "Mismatch in filters " + JSON.stringify(filters));
          assert.deepEqual(
            groupVisibleBreeds(newResults, groups).map(({ group, breeds: cards }) => [group.number, cards.map((breed) => breed.slug)]),
            legacyGroups(oldResults, groups).map(({ group, breeds: cards }) => [group.number, cards.map((breed) => breed.slug)]),
            "FCI order differs under " + JSON.stringify(filters),
          );
        }
      }
    }
  }
});

test("breed text normalization is computed once for each catalog entry rather than on every query", () => {
  const index = indexBreedSearch(breeds);
  const snapshots = index.map((entry) => entry.normalizedText);
  for (const query of ["civava", "pes", "kólia", "mastiff"]) {
    filterIndexedBreeds(index, { query, group: "all", section: "", origin: "all" });
    assert.deepEqual(index.map((entry) => entry.normalizedText), snapshots);
  }
  assert.equal(index[0].breed, breeds[0]);
  assert.match(index[0].normalizedText, /border kolia/);
});

test("directory preview read overlaps independent hero and editorial sidebar instead of blocking them", () => {
  const directory = read("components/directory-page.tsx");
  assert.match(directory, /const \[categoryPreviews, heroVisual, discovery\] = await Promise\.all\(\[/);
  assert.match(directory, /isOverview \? getDirectoryCategoryPreviews\(5\) : Promise\.resolve\(null\)/);
  assert.match(directory, /getSectionHeroVisual\(/);
  assert.match(directory, /getArticleDiscoveryData\(/);
  assert.doesNotMatch(directory, /isOverview \? await getDirectoryCategoryPreviews/);
  assert.match(directory, /const isOverview =[\s\S]*filters\.page === 1/);
});

test("FCI atlas keeps native filtering, memoizes normalized input and visits each visible breed once per grouping", () => {
  const browser = read("components/breed-browser.tsx");
  assert.match(browser, /useMemo\(\(\) => indexBreedSearch\(breeds\), \[breeds\]\)/);
  assert.match(browser, /filterIndexedBreeds\(indexedBreeds/);
  assert.match(browser, /groupVisibleBreeds\(visible, groups\)/);
  assert.match(browser, /const INITIAL_PER_GROUP = 3/);
  assert.match(browser, /window\.history\.replaceState/);
  assert.doesNotMatch(browser, /normalizeBreedSearchText\(/);
});

test("calendar month/day projections are memoized without changing navigation or fetch semantics", () => {
  const calendar = read("components/event-calendar.tsx");
  assert.match(calendar, /useMemo\(\(\) => calendarMonthDays\(visibleMonth\), \[visibleMonth\]\)/);
  assert.match(calendar, /const daySummaries = useMemo\(/);
  assert.match(calendar, /\[pending, data\.calendarSummaries, data\.calendarEvents, days\]/);
  assert.match(calendar, /const dailyEvents = useMemo\(/);
  assert.match(calendar, /\[selectedDay, pending, pendingDay, data\.calendarEvents\]/);
  assert.match(calendar, /const DesktopEventFullCalendar = dynamic/);
  assert.match(calendar, /signal: controller\.signal/);
  assert.match(calendar, /calendarOnly/);
  assert.match(calendar, /popstate/);
});

test("map keeps consent-gated renderer and memoizes derived marker and cluster arrays", () => {
  const map = read("components/map/map-experience.tsx");
  assert.equal((map.match(/useMemo\(\(\) => responseItems\(response\), \[response\]\)/g) ?? []).length, 2);
  assert.equal((map.match(/useMemo\(\(\) => responseClusters\(response\), \[response\]\)/g) ?? []).length, 2);
  assert.match(map, /dynamic\([\s\S]*?import\("\.\/google-map-renderer"\)/);
  assert.match(map, /MAP_FETCH_DEBOUNCE_MS/);
  assert.match(map, /request\.signal/);
  assert.match(map, /hasGoogleMapsConsent/);
  assert.doesNotMatch(map, /import \{ GoogleMapRenderer \} from/);
});
