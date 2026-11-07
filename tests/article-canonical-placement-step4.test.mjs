import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { selectEndRelated } from "../lib/article-magazine-selection.ts";

const read = (path) => readFileSync(path, "utf8");
const detail = read("components/article-detail.tsx");
const editor = read("components/admin-article-editor.tsx");
const store = read("lib/article-store.ts");
const route = read("app/[section]/[slug]/page.tsx");
const portalRoute = read("app/[section]/page.tsx");
const archive = read("app/clanky/page.tsx");
const taxonomy = read("lib/article-subsection-taxonomy.ts");

test("EDITORIAL-4 detail breadcrumb and JSON-LD share the canonical subsection", () => {
  assert.match(detail, /portalSection\.subpages\.find/);
  assert.match(detail, /getPortalSubpage\(section, article\.portalSubpage\)/);
  assert.match(detail, /portalSubpageHref\(\{ slug: section \}, managedTopic\)/);
  assert.match(detail, /name: topicLabel, item: `\$\{SITE_URL\}\$\{topicHref\}`/);
  assert.match(route, /portalSection=\{managedSection\}/);
});

test("EDITORIAL-4 editor requires an intentional subsection and preserves general archive categories", () => {
  assert.match(editor, /setPortalSubpage\(""/);
  assert.doesNotMatch(editor, /setPortalSubpage\(nextAreas\[0\]/);
  assert.match(editor, /<option value="">Vyber oblasť/);
  assert.match(editor, /\{portalSection === "clanky" && \(/);
  assert.match(editor, /articleCategoryForPortalPlacement\(portalSection, portalSubpage\)/);
  assert.match(store, /articleCategoryForPortalPlacement\(portalSection, portalSubpage \?\? ""\)/);
  assert.match(taxonomy, /export function articleCategoryForPortalPlacement/);
});

test("EDITORIAL-4 subsection SQL applies portal_subpage before LIMIT/OFFSET", () => {
  assert.match(store, /conditions\.push\("portal_subpage = \?"\)/);
  assert.match(store, /LIMIT \?\$\{offset === undefined \? "" : " OFFSET \?"\}/);
  assert.match(route, /portalSubpage: portalTopic\.subpage\.slug/);
  assert.match(route, /limit: pageSize \+ 1/);
  assert.match(route, /offset: \(page - 1\) \* pageSize/);
});

test("EDITORIAL-4 news and all-articles archives are independent", () => {
  assert.match(archive, /title: "Všetky články"/);
  assert.match(portalRoute, /if \(slug === "novinky"\) return <NewsHub/);
  assert.doesNotMatch(portalRoute, /permanentRedirect\("\/clanky"\)/);
});

test("EDITORIAL-4 end recommendations rank subsection, section, cross-section", () => {
  const article = { slug: "current", portalSection: "aktivity", portalSubpage: "trening", category: "Výcvik" };
  const candidates = [
    { slug: "cross", portalSection: "starostlivost", portalSubpage: "vycvik", category: "Výcvik" },
    { slug: "sports", portalSection: "aktivity", portalSubpage: "psie-sporty", category: "Výcvik" },
    { slug: "training", portalSection: "aktivity", portalSubpage: "trening", category: "Výcvik" },
  ];
  assert.deepEqual(selectEndRelated(article, candidates, null).map((item) => item.slug), [
    "training", "sports", "cross",
  ]);
});
