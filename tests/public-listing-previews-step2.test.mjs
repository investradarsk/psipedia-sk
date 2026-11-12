import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("article teaser cards omit perex across featured, grid and row variants", () => {
  const card = read("components/article-card.tsx");
  assert.match(card, /<PublicArticleCard/);
  assert.match(card, /title=\{article\.title\}/);
  assert.doesNotMatch(card, /excerpt=\{article\.excerpt/);
});

test("directory cards display category, name and city without prices or service tags", () => {
  const card = read("components/directory-card.tsx");
  assert.match(card, /typeLabel=\{category\?\.singular/);
  assert.match(card, /title=\{profile\.name\}/);
  assert.match(card, /location=\{city\}/);
  assert.doesNotMatch(card, /profile\.services|priceNote|publicLocationLabel|profile\.district|profile\.region/);
});

test("event previews keep the date and type but show the city, not the venue and region", () => {
  const card = read("components/event-card.tsx");
  assert.match(card, /return publicLocationValue\(event\.city, "city"\)/);
  assert.match(card, /formatEventDate\(event\)/);
  assert.match(card, /eventTypePresentation\[event\.eventType\]/);
  assert.doesNotMatch(card, /publicLocationLabel|event\.venue|event\.region/);
});

test("Help previews and adoption cards no longer render free-form descriptions", () => {
  const help = read("components/help-card.tsx");
  const overview = read("components/help-overview.tsx");
  const adoptions = read("components/adoption-catalog.tsx");
  const route = read("app/pomoc-psom/page.tsx");
  assert.doesNotMatch(help, /excerpt=\{item\.excerpt\}/);
  assert.doesNotMatch(overview, /excerpt=\{item\.excerpt\}/);
  assert.doesNotMatch(adoptions, /excerpt=\{dog\.shortDescription\}/);
  assert.match(help, /const meta = publicLocationValue\(item\.city, "city"\)/);
  assert.match(adoptions, /const meta = dog\.city\?\.trim\(\) \?\? ""/);
  assert.match(route, /meta: placeMeta\(item\.city\)/);
  assert.match(route, /meta: placeMeta\(dog\.city\)/);
  assert.match(route, /meta: placeMeta\(report\.city\)/);
  assert.match(adoptions, /Dostupnosť potvrdená/);
  assert.match(help, /<HelpFinancialProgress/);
});

test("e-shop preview cards in reviews show their names without redundant shop descriptions", () => {
  const hub = read("components/reviews-hub.tsx");
  assert.match(hub, /shop\.name/);
  assert.doesNotMatch(hub, /excerpt=\{shop\.description\}/);
});
