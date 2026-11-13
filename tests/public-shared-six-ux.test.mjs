import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");
const home = source("app/page.tsx");
const homeStyles = source("app/home-v2.module.css");
const factStyles = source("components/detail-primitives/detail-primitives.module.css");
const detail = source("components/directory-profile-detail.tsx");
const category = source("components/directory-category-navigation.tsx");
const categoryStyles = source("components/directory-public.module.css");
const sharedTabs = source("components/public-visual-system/public-subcategory-navigator.module.css");
const favorite = source("components/favorite-button.tsx");
const share = source("components/share-button.tsx");
const utilityStyles = source("components/public-utility-action.module.css");

test("homepage articles retain their archive CTA and upcoming events sidebar", () => {
  assert.match(home, /<HomeLatestArticles\s+articles=\{articleSelection\.latest\}\s+sidebar=\{/);
  const news = home.indexOf("<HomeLatestArticles");
  const events = home.indexOf('title="Najbližšie podujatia"');
  const puppies = home.indexOf('testId="steniatka"');
  assert.ok(news >= 0 && events > news && puppies > events);
  assert.match(home, /data-home-events/);
  assert.match(source("components/home-editorial.tsx"), /data-home-section-cta="latest"/);
  assert.match(homeStyles, /home-news-section/);
});

test("homepage featured card keeps its photograph readable beneath white metadata", () => {
  // The editorial overlay is intentionally translucent instead of the old
  // 97%-opaque block. Lock in both image visibility and text contrast.
  assert.match(homeStyles, /linear-gradient\(\s*0deg,\s*rgba\(5,\s*25,\s*19,\s*0?\.88\)\s*0%/);
  assert.match(homeStyles, /text-shadow:\s*0 1px 2px rgba\(0,\s*0,\s*0,\s*0?\.35\)/);
  assert.match(homeStyles, /article-card-meta > time/);
  assert.match(homeStyles, /color:\s*#fff;/);
  assert.match(homeStyles, /opacity:\s*1;/);
});

test("bookmark and share use one reusable public utility action style", () => {
  assert.match(favorite, /public-utility-action favorite-button/);
  assert.match(share, /utilityStyles.utility/);
  assert.match(share, /<ShareIcon/);
  assert.match(utilityStyles, /\.utility:global\(\.favorite-button\)/);
  assert.match(utilityStyles, /min-height: 44px/);
});

test("shared detail fact list is slimmer and keeps semantic values", () => {
  assert.match(factStyles, /\.factTiles dd,\s*\.facts dd/);
  assert.match(factStyles, /font-weight: 500/);
  assert.match(factStyles, /border-top: 1px solid var\(--detail-border\)/);
  const event = source("components/event-detail.tsx");
  assert.match(event, /<dl\s+className=\{detailStyles\.factTiles\}\s+data-event-facts/);
  assert.match(event, /<dt>Termín<\/dt>/);
  assert.match(event, /<dt>Miesto<\/dt>/);
});

test("up to six categories stay visible; larger directory groups swipe by six on mobile", () => {
  // After unification with Help/Events, services use one responsive link grid,
  // not a mobile select or scrollable toolbar.
  assert.match(category, /<PublicSubcategoryNavigator/);
  assert.match(category, /mobileLayout="grid"/);
  assert.match(category, /label="Kategórie služieb pre psov"/);
  assert.match(sharedTabs, /\.compactGridMobile \.compactTrack \{/);
  assert.match(sharedTabs, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(sharedTabs, /\.compactGridMobile \.compactItem/);
  assert.match(sharedTabs, /min-height: 52px/);
  assert.match(sharedTabs, /\.compactGridMobile \.pagedPage/);
  assert.match(sharedTabs, /scroll-snap-type:\s*x mandatory/);
});

test("all opt-in service profiles use a wide contain photo and three accessible hero actions", () => {
  assert.match(factStyles, /data-media-presentation="compact"/);
  assert.match(factStyles, /grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(factStyles, /object-fit: contain/);
  assert.match(detail, /href="#kontakt"\s*>\s*Poslať dopyt\s*<\/a>/);
  assert.match(detail, />\s*Zavolať\s*<\/a>/);
  assert.match(detail, />\s*Navigovať\s*<\/a>/);
  assert.doesNotMatch(detail, /className=\{styles.secondaryAction\} href=\{presentation.websiteUrl\}/);
  assert.match(detail, /Otvoriť web/);
});
