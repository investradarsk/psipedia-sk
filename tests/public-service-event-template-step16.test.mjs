import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const shared = read("components/detail-primitives/detail-primitives.tsx");
const directory = read("components/directory-profile-detail.tsx");
const event = read("components/event-detail.tsx");
const css = read("components/detail-primitives/detail-primitives.module.css");
const serviceStyles = read("components/directory-profile-detail.module.css");

test("STEP-16: events and all public service profiles use the same detail frame and hero actions", () => {
  assert.match(shared, /export function DetailHeroActions\(/);
  const section = shared.slice(shared.indexOf("export function DetailHeroActions("), shared.indexOf("export function PublicDetailFlow("));
  assert.match(section, /<nav/);
  assert.match(section, /aria-label=\{label\}/);
  assert.match(section, /data-public-detail-actions/);
  assert.match(section, /styles\.heroActions/);
  for (const source of [directory, event]) {
    assert.match(source, /<DetailHeroActions/);
    assert.match(source, /<\/DetailHeroActions>/);
    assert.match(source, /<DetailHero/);
    assert.match(source, /<PublicDetailLayout/);
    assert.match(source, /<PublicFoundation/);
  }
  assert.match(directory, /data-public-service-detail-template="shared-event-service"/);
  assert.match(directory, /<DetailHero\s+kind="directory"\s+mediaPresentation="compact"/);
  assert.match(event, /<DetailHero\s+kind="event"/);
  assert.match(css, /\.heroActions\s*\{/);
  assert.match(css, /\.heroFrame\[data-media-presentation="compact"\]/);
  assert.match(serviceStyles, /\.heroActions\s*\{\s*composes: heroActions/);
});

test("STEP-16: directory category-specific facts, safe directions, privacy and inquiry form survive", () => {
  assert.match(directory, /getDirectoryCategory\(presentation\.category\)/);
  assert.match(directory, /<DirectoryServicesList services=\{presentation\.services\}/);
  assert.match(directory, /<DirectoryOpeningHours value=\{presentation\.openingHours\}/);
  assert.match(directory, /presentation\.health\?\.title \?\? "Odborné informácie"/);
  assert.match(directory, /<ProfileReviewSection/);
  assert.match(directory, /<RelatedBreedList/);
  assert.match(directory, /<DirectoryContactForm profileId=\{presentation\.id\}/);
  assert.match(directory, /href="#kontakt"/);
  assert.match(directory, /presentation\.phone\?\.href|presentation\.phone\.href/);
  assert.match(directory, /isApproximateMapItem\(mapItem\)/);
  assert.match(directory, /buildGoogleMapsDirectionsUrl/);
  assert.match(directory, /<PublicLocationMap/);
  assert.match(directory, /premiumBadge|sponsoredBadge/);
  assert.match(directory, /presentation\.detailImageDisplay/);
  assert.match(directory, /<PublicMediaFallback/);
  const mobileOrder = ['title="O službe"', 'id="directory-profile-contact"', 'title="Poskytované služby"', 'title={presentation.health?.title', 'key: "hours"', 'key: "map"', 'key: "reviews"', '<DirectoryContactForm'];
  const positions = mobileOrder.map((key) => directory.indexOf(key));
  assert.ok(positions.every(v => v >= 0), "Missing section from the shared service template");
  assert.ok(positions.every((v, i) => i === 0 || v > positions[i - 1]), "Original mobile ordering changed");
});

test("STEP-16: event timing, admission, organizer, registration and map retain their own data contract", () => {
  for (const field of ["formatEventDate(event)", "timeLabel", "event.organizer", "event.admissionFee", "event.contactPhone", "event.contactEmail", "showRegistration", "event.registrationUrl", "event.websiteUrl", "PublicLocationMap", "EventMarkdown", "EventsBackLink"]) {
    assert.ok(event.includes(field), "Missing event-specific field " + field);
  }
  assert.match(event, /data-event-facts/);
  assert.match(event, /label="Odkazy podujatia"/);
  assert.match(directory, /label="Akcie profilu"/);
  assert.doesNotMatch(shared.slice(shared.indexOf("export function DetailHeroActions("), shared.indexOf("export function PublicDetailFlow(")), /fetch\(|api\/|DATABASE_URL|notion\.|href=/);
});
