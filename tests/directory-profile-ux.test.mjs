import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { directoryCategories } from "../lib/directory.ts";
import { getDirectoryDetailPresentation } from "../lib/directory-detail-presentation.ts";

const source = readFileSync("components/directory-profile-detail.tsx", "utf8");
const css = readFileSync("components/directory-profile-detail.module.css", "utf8");
const sharedHero = readFileSync("components/public-profile/public-profile-hero.tsx", "utf8");

test("directory detail remains single layout for all 10 supported categories", () => {
  assert.equal(directoryCategories.length, 10);
  assert.match(source, /export function DirectoryProfileDetail/);
  assert.match(source, /getDirectoryCategory\(presentation\.category\)/);
  assert.doesNotMatch(source, /import.*PublicProfileHero/);
  assert.match(sharedHero, /export function PublicProfileHero/);
  assert.match(source, /data-directory-profile-hero/);
});

test("photo appears before textual content in source order, while natural display and no-photo paths remain safe", () => {
  assert.ok(source.indexOf("data-public-profile-media") < source.indexOf("className={styles.heroCopy}"));
  assert.match(source, /presentation\.imageUrl \? \(/);
  assert.match(source, /context="detail"/);
  assert.match(source, /config=\{presentation\.detailImageDisplay\}/);
  assert.match(source, /loading="eager"/);
  assert.match(source, /fetchPriority="high"/);
  assert.match(css, /\.heroMedia:has\(\[data-image-display="natural"\]\)/);
});

test("semantic mobile order follows description, contact, services, specialist data, maps, reviews, relations and form", () => {
  const order = [
    'title="O službe"',
    'id="directory-profile-contact"',
    'title="Poskytované služby"',
    'title={presentation.health?.title',
    '<PublicLocationMap',
    '<ProfileReviewSection',
    '<RelatedEntityLinks',
    '<RelatedBreedList',
    '<DirectoryContactForm',
  ];
  const locations = order.map((needle) => source.indexOf(needle));
  assert.ok(locations.every((n) => n !== -1), "All ordered sections must exist: " + locations);
  assert.ok(locations.every((n, i) => i === 0 || n > locations[i - 1]), "Logical DOM order must be stable");
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
});

test("map gate, CTA, real reviews and inquiry form remain wired to existing components", () => {
  assert.match(source, /isApproximateMapItem\(mapItem\)/);
  assert.match(source, /buildGoogleMapsDirectionsUrl/);
  assert.match(source, /href="#kontakt"/);
  assert.match(source, /<PublicLocationMap/);
  assert.match(source, /<ProfileReviewSection/);
  assert.match(source, /<DirectoryContactForm profileId=\{presentation.id\}/);
});

test("opening hours display only when present, without guessing an unavailable value", () => {
  const p = {
    id: 101, slug: "veterinar-test", name: "Ambulancia test", category: "veterinari",
    excerpt: "Test", description: "", services: [], qualifications: [], city: "Nitra",
    district: "", region: "", address: "", priceNote: "", imageUrl: null,
    websiteUrl: null, verified: false, featured: false, updatedAt: "", seo: {},
    importData: { "Ordinačné hodiny": "Po–Pi 9:00–17:00" },
  };
  assert.equal(getDirectoryDetailPresentation(p).openingHours, "Po–Pi 9:00–17:00");
  assert.equal(getDirectoryDetailPresentation({ ...p, importData: { "Ordinačné hodiny": "Neoverené" } }).openingHours, null);
});
