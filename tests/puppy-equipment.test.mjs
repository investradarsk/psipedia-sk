import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
test("puppy checklist is a managed, indexable topic with its own route and contextual entry points", () => {
  assert.match(read("lib/portal.ts"), /slug: "vybava", label: "Výbava pre šteniatko"/);
  assert.match(read("app/[section]/[slug]/page.tsx"), /portalTopic && section === "steniatka" && slug === "vybava"/);
  assert.match(read("components/editorial-section.tsx"), /\["pred-kupou-psa", "prve-dni"\]\.includes\(subpage.slug\)/);
  assert.match(read("app/sitemap.ts"), /portalSubpageHref\(section, subpage\)/);
});
test("checklist uses stable IDs, excludes optional items from readiness and stores locally", () => {
  const model = read("lib/puppy-equipment.ts");
  const ids = [...model.matchAll(/\{ id: "([^"]+)", title:/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(model, /items.filter\(item => !item.optional\)/);
  assert.match(model, /validIds.has\(id\)/);
  const client = read("components/puppy-equipment-checklist.tsx");
  assert.match(client, /localStorage.setItem\(PUPPY_EQUIPMENT_STORAGE_KEY/);
  assert.match(client, /window.addEventListener\("storage"/);
  assert.match(client, /disabled=\{!ready\}/);
  assert.match(client, /catch \{ setSession\(next\)/);
  assert.doesNotMatch(client, /fetch\(/);
  const page = read("components/puppy-equipment-page.tsx");
  assert.match(page, /AFFILIATE_BANNER_PARTNERS.map/);
  assert.match(page, /rel="sponsored noopener noreferrer"/);
  assert.match(page, /Stránka obsahuje partnerské odkazy/);
});
