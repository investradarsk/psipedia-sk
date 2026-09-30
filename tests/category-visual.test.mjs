import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("CATEGORY-VISUAL landings reuse the public visual foundation", () => {
  const breeds = read("app/plemena/page.tsx");
  const directory = read("components/directory-page.tsx");
  const events = read("components/events-page.tsx");
  const help = read("components/help-overview.tsx");
  const reviews = read("components/reviews-hub.tsx");
  const news = read("components/news-hub.tsx");

  assert.match(breeds, /<Breadcrumbs>/);
  assert.match(breeds, /<PublicSectionHeader/);
  assert.match(directory, /title="Služby pre psov"/);
  assert.match(directory, /<PublicSectionHeader/);
  assert.doesNotMatch(directory, /hero-labrador\.webp/);
  assert.match(events, /<PublicSectionHeader/);
  assert.match(help, /<Breadcrumbs label="Drobečková navigácia">/);
  assert.match(help, /eyebrow="Praktická pomoc"/);
  assert.match(reviews, /<PublicFoundation className=\{styles\.foundation\}>/);
  assert.match(reviews, /<PublicSectionHeader/);
  assert.match(news, /<PublicSectionHeader/);
});

test("CATEGORY-VISUAL keeps reviews at four main entry points in a two-column desktop grid", () => {
  const reviews = read("components/reviews-hub.tsx");
  const css = read("components/reviews-hub.module.css");

  for (const label of ["Všetko", "Produkty", "Služby", "E-shopy"]) {
    assert.match(reviews, new RegExp(`"${label.replace("-", "\\-")}"`));
  }
  assert.equal((reviews.match(/\["(?:all|products|services|eshops)",/g) ?? []).length, 4);
  assert.match(css, /\.modeGrid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,1fr\)\)/);
  assert.match(css, /\.modeCard:focus-visible/);
});

test("CATEGORY-VISUAL category discovery is not horizontal-scroll-only", () => {
  const directory = read("components/directory-public.module.css");
  const news = read("components/news-hub.module.css");
  const help = read("components/help-public.module.css");

  assert.match(directory, /\.categoryNav:not\(\.categoryNavCompact\)\s*\{[\s\S]*?display:\s*grid/);
  assert.match(directory, /\.categoryNavCompact\s*\{[\s\S]*?display:\s*grid/);
  assert.match(news, /\.filters\s*\{[\s\S]*?display:\s*grid/);
  assert.doesNotMatch(news, /\.filters\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(help, /\.overviewCategoryGrid\s*\{[^}]*grid-template-columns:\s*repeat\(3/);
});

test("CATEGORY-VISUAL preserves functional contracts and removes adjacent intro duplication", () => {
  const events = read("components/events-page.tsx");
  const directory = read("components/directory-page.tsx");
  const help = read("components/help-overview.tsx");
  const reviews = read("components/reviews-hub.tsx");

  assert.doesNotMatch(events, /section\?\.intro/);
  assert.match(events, /<EventCalendar events=\{events\}/);
  assert.match(directory, /action="\/adresar"/);
  assert.match(directory, /name="category"/);
  assert.match(directory, /name="q"/);
  assert.match(help, /\/pomoc-psom\/stratene-a-najdene\/nahlasit/);
  assert.match(reviews, /viewHref\(key\)/);
  assert.match(reviews, /<ArticleCard/);
  assert.doesNotMatch(reviews, /min čítania|čas čítania/i);
});
