import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPublicHeaderNavigation } from "../lib/public-header-navigation.ts";

const file = (name) => readFileSync(new URL("../" + name, import.meta.url), "utf8");

test("server header projection keeps stored submenu overrides, fallback URLs and classes", () => {
  const nav = [
    { id: "steniatka", label: "Šteniatka", href: "/steniatka", parentId: null, position: 0, visible: true },
    { id: "aktivity", label: "Výcvik", href: "/aktivity", parentId: null, position: 1, visible: true },
    { id: "novinky", label: "Články", href: "/clanky", parentId: null, position: 2, visible: true },
    { id: "pomoc-psom", label: "Pomoc", href: "/pomoc-psom", parentId: null, position: 3, visible: true },
    { id: "custom", label: "Vlastné", href: "/vlastne", parentId: "steniatka", position: 4, visible: true },
    { id: "hidden", label: "Skryté", href: "/hidden", parentId: "aktivity", position: 5, visible: false },
  ];
  const sections = [
    { slug: "steniatka", description: "Všetko o šteniatkach", subpages: [
      { slug: "prvy-tyzden", label: "Prvý týždeň", visible: true },
    ] },
    { slug: "aktivity", description: "Výcvik psov", subpages: [
      { slug: "prvy-trening", label: "Prvý tréning", visible: true },
      { slug: "skryty", label: "Skrytý", visible: false },
      { slug: "presmerovany", label: "Zmenený", href: "/vycvik/vlastne", visible: true },
    ] },
    { slug: "novinky", description: "Novinky", subpages: [] },
  ];
  const result = buildPublicHeaderNavigation(nav, sections);
  assert.equal(result.length, 4);
  assert.deepEqual(result[0].children.map(item => item.href), ["/vlastne"]);
  assert.deepEqual(result[1].children.map(item => item.href), ["/aktivity/prvy-trening", "/vycvik/vlastne"]);
  assert.equal(result[2].className, "nav-news");
  assert.equal(result[2].title, "Novinky");
  assert.equal(result[3].className, "nav-help");
  assert.equal(result[0].title, "Všetko o šteniatkach");
  assert.equal(result[1].children[0].parentId, "aktivity");
  assert.ok(result[1].children.every(item => item.visible));
});

test("header server boundary does not ship full portal editorial content to clients", () => {
  const layout = file("app/layout.tsx");
  const header = file("components/site-header.tsx");
  assert.match(layout, /buildPublicHeaderNavigation\(await getNavigationItems\(\), portalSections\)/);
  assert.match(layout, /<SiteHeader navigationItems=\{navigationItems\}/);
  assert.doesNotMatch(header, /import\s+\{\s*portalSections\s*\}/);
  assert.doesNotMatch(header, /useMemo\(/);
  assert.match(header, /const nav = navigationItems;/);
});

test("autocomplete is split from initial header and homepage JavaScript", () => {
  const header = file("components/site-header.tsx");
  const home = file("components/home-portal-search.tsx");
  const wrapper = file("components/lazy-public-search-suggestions.tsx");
  assert.match(header, /import \{ LazyPublicSearchSuggestions \} from "\.\/lazy-public-search-suggestions"/);
  assert.match(home, /import \{ LazyPublicSearchSuggestions \} from "\.\/lazy-public-search-suggestions"/);
  assert.doesNotMatch(header, /from "\.\/public-search-suggestions"/);
  assert.doesNotMatch(home, /from "\.\/public-search-suggestions"/);
  assert.match(wrapper, /lazy\(async \(\) => \{/);
  assert.match(wrapper, /await import\("\.\/public-search-suggestions"\)/);
  assert.match(wrapper, /props\.query\.trim\(\)\.length < 2/);
  assert.doesNotMatch(wrapper, /setActivated\(/);
  assert.match(wrapper, /<Suspense fallback=\{null\}>/);
  const details = file("tests/public-details-v2-ui.test.mjs");
  assert.match(details, /buildPublicHeaderNavigation\(defaultNavigationItems, portalSections\)/);
});
