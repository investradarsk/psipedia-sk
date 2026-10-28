import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const shared = read("components/detail-primitives/detail-primitives.tsx");
const css = read("components/detail-primitives/detail-primitives.module.css");
const directory = read("components/directory-profile-detail.tsx");
const directoryCss = read("components/directory-profile-detail.module.css");
const organization = read("components/public-profile/public-profile-hero.tsx");
const reviewsCss = read("components/profile-review-section.module.css");
const linksCss = read("components/related-entity-links.module.css");
const map = read("components/map/public-location-map.tsx");
const mapCss = read("components/map/public-location-map.module.css");
const form = read("components/directory-contact-form.tsx");
const partnerCss = read("components/partner-public-ownership.module.css");

test("all directory categories and organizations use one shared, explicit compact hero", () => {
  assert.match(shared, /mediaPresentation\?: "standard" \| "compact"/);
  assert.match(shared, /data-media-presentation=\{mediaPresentation\}/);
  assert.match(directory, /<DetailHero kind="directory" mediaPresentation="compact"/);
  assert.match(organization, /<DetailHero kind="organization" mediaPresentation="compact"/);
  assert.match(css, /\.heroFrame\[data-media-presentation="compact"\]/);
  assert.match(css, /\[data-image-display="natural"\] img/);
  assert.match(css, /object-fit: contain/);
  // Do not apply the compact media style to breed/event/adoption by accident.
  assert.doesNotMatch(shared, /kind === "event" \? "compact"/);
});

test("directory contact, copy, service list and map stay wired to one shared template", () => {
  assert.match(directory, /showExcerpt=\{!hasExtendedDescription\}/);
  assert.match(directory, /<DirectoryContactForm profileId=\{presentation\.id\}/);
  assert.match(directory, /<ProfileReviewSection/);
  assert.match(directory, /<RelatedEntityLinks/);
  assert.match(directory, /<PublicLocationMap/);
  assert.match(directory, /showDirections=\{publicMap\.items\.length > 1\}/);
  assert.match(directory, /isApproximateMapItem\(mapItem\)/);
  assert.match(directory, /href="#kontakt"/);
  assert.match(directoryCss, /\.servicesList li \{/);
  assert.match(directoryCss, /border-bottom: 1px solid var\(--detail-border\)/);
  assert.match(css, /\[data-testid="public-location-map"\]/);
});

test("map uses an opt-out only for duplicate directory directions and preserves privacy", () => {
  assert.match(map, /showDirections\?: boolean/);
  assert.match(map, /showDirections = true/);
  assert.match(map, /showDirections && directionsUrl/);
  assert.match(map, /hasGoogleMapsConsent/);
  assert.match(map, /isApproximateMapItem\(selected\)/);
  assert.match(map, /setGoogleMapsConsent\(true\)/);
  assert.match(mapCss, /\.mapTypeControl button/);
});

test("common review, navigation and form are compact without removing actions or validation", () => {
  assert.match(reviewsCss, /\.zeroState \{ padding: 12px 15px; \}/);
  assert.match(reviewsCss, /min-height: 44px/);
  assert.match(linksCss, /min-height: 52px/);
  assert.match(partnerCss, /\.management, \.correction \{ gap: 14px; padding: 16px 20px; \}/);
  assert.doesNotMatch(form, /✉️/);
  assert.match(form, /rows=\{4\}/);
  assert.match(form, /required/);
  assert.match(form, /directory-contact-consent/);
  assert.match(form, /submissionKey/);
  assert.match(form, /\/api\/directory\/inquiries/);
});
