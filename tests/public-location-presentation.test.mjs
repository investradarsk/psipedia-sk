import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { publicLocationLabel, publicLocationValue } from "../lib/public-location.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("legacy synthetic locations never present as physical city, district or region", () => {
  assert.equal(publicLocationValue("Online", "city"), "");
  assert.equal(publicLocationValue(" ONLINE ", "region"), "");
  assert.equal(publicLocationValue("Slovensko", "city"), "");
  assert.equal(publicLocationValue("Slovenská republika", "district"), "");
  assert.equal(publicLocationValue("Ráztočno", "city"), "Ráztočno");
  assert.equal(publicLocationValue("Nitriansky kraj", "region"), "Nitriansky kraj");
  assert.equal(publicLocationLabel(["Online", "Nitra", "Nitriansky kraj", "Nitra"]), "Nitra · Nitriansky kraj");
  assert.equal(publicLocationLabel(["Online", ""]), "");
});

test("all central public location surfaces suppress online placeholders", () => {
  const files = [
    "components/directory-card.tsx",
    "components/directory-club-results.tsx",
    "components/help-card.tsx",
    "components/help-details/help-detail-shell.tsx",
    "components/help-details/help-detail-types.tsx",
    "components/event-card.tsx",
    "components/event-detail.tsx",
    "components/event-calendar.tsx",
    "app/page.tsx",
  ];
  for (const path of files) {
    assert.match(read(path), /publicLocationValue|publicLocationLabel/, path);
  }
  assert.doesNotMatch(read("components/event-card.tsx"), /Online podujatie/);
  assert.doesNotMatch(read("components/event-detail.tsx"), /Online podujatie/);
  assert.doesNotMatch(read("components/event-calendar.tsx"), /Online podujatie/);
});

test("past events are marked automatically, registration is hidden and future events remain actionable", () => {
  const detail = read("components/event-detail.tsx");
  const events = read("lib/events.ts");
  assert.match(events, /export function eventDateStatus/);
  assert.match(detail, /dateStatus === "past" && !event.cancelled/);
  assert.match(detail, /Podujatie sa už uskutočnilo/);
  assert.match(detail, /data-event-past-notice/);
  assert.match(detail, /showRegistration = dateStatus !== "past" && !event.cancelled/);
  assert.match(detail, /showRegistration && event.registrationUrl/);
});

test("public filters remove Online region and import placeholders", () => {
  assert.match(read("components/event-listing-results.tsx"), /slovakRegions\.filter/);
  assert.match(read("components/help-browser.tsx"), /slovakRegions\.filter/);
  assert.match(read("components/admin-event-editor.tsx"), /slovakRegions\.filter/);
  assert.match(read("components/admin-help-editor.tsx"), /slovakRegions\.filter/);
  assert.match(read("components/directory-filter-form.tsx"), /publicLocationValue/);
  assert.match(read("lib/directory-store.ts"), /slovensko\|slovenská republika/);
});

test("no homepage category asserts content absence from missing approved images", () => {
  const home = read("app/page.tsx");
  const events = read("lib/event-store.ts");
  const eventSlice = events.slice(events.indexOf("export async function getHomepageUpcomingEventsWithImages")).split("\nexport async function ")[0];
  assert.match(eventSlice, /cancelled = 0/);
  assert.doesNotMatch(eventSlice, /HOMEPAGE_REAL_IMAGE_SQL/);
  assert.doesNotMatch(home, /Nové podujatia práve dopĺňame|Momentálne tu nie je otvorená výzva/);
});
