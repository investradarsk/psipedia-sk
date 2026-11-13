import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const sections = ["events", "services", "reviews", "steniatka", "starostlivost", "aktivity"];

test("six explicitly approved section banners use existing photos and real public CTA URLs", () => {
  const presets = read("lib/public-section-photo-promos.ts");
  const urls = {
    events: "/aktivity/trening",
    services: "/adresar/veterinari",
    reviews: "/recenzie?typ=produkty#obsah-recenzie",
    steniatka: "/steniatka/prve-dni",
    starostlivost: "/starostlivost/zdravie",
    aktivity: "/aktivity/trening",
  };
  for (const name of sections) {
    assert.match(presets, new RegExp(`^  ${name}: \\\\{`, "m"), name);
    assert.ok(presets.includes(`href: "${urls[name]}"`), `Missing usable target for ${name}`);
  }
  assert.equal((presets.match(/^    tone: "(?:care|rescue|volunteer)",/gm) ?? []).length, 6);
  assert.doesNotMatch(presets, /^  (?:breeds|plemena|novinky|pomoc-psom): \{/m);
});

test("same exact photographic component as Help; no new visual styling fork", () => {
  const help = read("components/public-visual-system/public-help-banner.tsx");
  const callout = read("components/public-visual-system/public-photo-callout.tsx");
  const shared = read("components/public-visual-system/public-magazine-banner.tsx");
  assert.match(help, /<PublicPhotoCallout promo=\{promo\}/);
  assert.match(callout, /<PublicMagazineBanner/);
  assert.match(callout, /bannerId\?: string/);
  assert.match(callout, /testId=\{bannerId \?\? \`help-\$\{promo\.tone\}\`\}/);
  assert.match(shared, /const publicBannerPhotos/);
  assert.match(shared, /data-public-photo-callout=\{photoTone\}/);
});

test("event, service and review banners appear only on their top-level overviews", () => {
  const events = read("components/events-page.tsx");
  const directory = read("components/directory-page.tsx");
  const reviews = read("components/reviews-hub.tsx");
  assert.match(events, /isMainListing \? \(\s*<PublicPhotoCallout\s+promo=\{publicSectionPhotoPromos\.events\}/);
  assert.match(events, /bannerId="section-events"/);
  assert.match(directory, /isOverview \? \(\s*<PublicPhotoCallout\s+promo=\{publicSectionPhotoPromos\.services\}/);
  assert.match(directory, /bannerId="section-services"/);
  assert.match(reviews, /view === "all" \? \(\s*<PublicPhotoCallout\s+promo=\{publicSectionPhotoPromos\.reviews\}/);
  assert.match(reviews, /bannerId="section-reviews"/);
  for (const source of [events, directory, reviews]) {
    assert.equal((source.match(/<PublicPhotoCallout/g) ?? []).length, 1);
    assert.match(source, /import \{ PublicPhotoCallout \} from "@\/components\/public-visual-system\/public-photo-callout"/);
  }
  assert.match(events, /<EventCalendar/);
  assert.match(events, /<PublicContextBanner/);
  assert.match(directory, /<DirectoryResults/);
  assert.match(reviews, /<PublicSubcategoryNavigator/);
});

test("puppies, health and training hubs share one conditional preset, no topic or breed banners", () => {
  const editorial = read("components/editorial-section.tsx");
  const root = editorial.slice(editorial.indexOf("export async function EditorialSectionHub"), editorial.indexOf("export async function EditorialSectionTopic"));
  const details = editorial.slice(editorial.indexOf("export async function EditorialSectionTopic"));
  assert.match(editorial, /type EditorialSectionSlug = "steniatka" \| "starostlivost" \| "aktivity"/);
  assert.match(root, /<PublicPhotoCallout\s+promo=\{publicSectionPhotoPromos\[sectionSlug\]\}/);
  assert.match(root, /bannerId=\{\`section-\$\{sectionSlug\}\`\}/);
  assert.equal((root.match(/<PublicPhotoCallout/g) ?? []).length, 1);
  assert.doesNotMatch(details, /<PublicPhotoCallout|publicSectionPhotoPromos\[/);
  assert.ok(root.indexOf('<div className={styles.topicGroups}') < root.indexOf("<PublicPhotoCallout"));
  assert.ok(root.indexOf("<PublicPhotoCallout") < root.indexOf('<section className={styles.nextSection}'));
  assert.doesNotMatch(read("lib/public-section-photo-promos.ts"), /"plemena"|"breeds"/);
});
