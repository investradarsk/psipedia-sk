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

test("homepage article archive link precedes an independent events section", () => {
  assert.match(home, /<HomeLatestArticles articles=\{articleSelection.latest\} \/>/);
  const news = home.indexOf("<HomeLatestArticles");
  const events = home.indexOf('data-home-events-section');
  const puppies = home.indexOf('testId="steniatka"');
  assert.ok(news >= 0 && events > news && puppies > events);
  assert.match(source("components/home-editorial.tsx"), /data-home-section-cta="latest"/);
  assert.match(homeStyles, /\.home-independent-events-inner/);
});

test("homepage featured card has strong visible light-on-dark metadata", () => {
  assert.match(homeStyles, /rgba\(5,25,19,\.97\)/);
  assert.match(homeStyles, /article-card-meta > time/);
  assert.match(homeStyles, /color: #fff;/);
});

test("bookmark and share use one reusable public utility action style", () => {
  assert.match(favorite, /public-utility-action favorite-button/);
  assert.match(share, /utilityStyles.utility/);
  assert.match(share, /<ShareIcon/);
  assert.match(utilityStyles, /\.utility:global\(\.favorite-button\)/);
  assert.match(utilityStyles, /min-height: 44px/);
});

test("shared detail fact list is slimmer and keeps semantic values", () => {
  assert.match(factStyles, /\.factTiles dd, \.facts dd/);
  assert.match(factStyles, /font-weight: 500/);
  assert.match(factStyles, /border-top: 1px solid var\(--detail-border\)/);
  const event = source("components/event-detail.tsx");
  assert.match(event, /<dl className=\{detailStyles.factTiles\}\s+data-event-facts/);
  assert.match(event, /<dt>Termín<\/dt>/);
  assert.match(event, /<dt>Miesto<\/dt>/);
});

test("all categories can be selected on mobile without horizontal scroll", () => {
  assert.match(category, /<select/);
  assert.match(category, /aria-label="Vyber kategóriu služby"/);
  assert.match(category, /router.push\(event.target.value\)/);
  assert.match(category, /<PublicSubcategoryNavigator/);
  assert.match(categoryStyles, /\.categoryMobileSelect/);
  assert.match(sharedTabs, /\.compactTrack \{/);
  assert.match(sharedTabs, /flex-wrap: wrap/);
});

test("all opt-in service profiles use a wide contain photo and three accessible hero actions", () => {
  assert.match(factStyles, /data-media-presentation="compact"/);
  assert.match(factStyles, /grid-template-columns: repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(factStyles, /object-fit: contain/);
  assert.match(detail, /href="#kontakt">Poslať dopyt/);
  assert.match(detail, />Zavolať<\/a>/);
  assert.match(detail, />Navigovať<\/a>/);
  assert.doesNotMatch(detail, /className=\{styles.secondaryAction\} href=\{presentation.websiteUrl\}/);
  assert.match(detail, /Otvoriť web/);
});
