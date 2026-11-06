import test from "node:test";
import assert from "node:assert/strict";
import { planBreedWorkcopyIdentity } from "../lib/notion-breed-workcopy-identity-plan.mjs";

const uid = n => "00000000-0000-0000-0000-" + n.toString(16).padStart(12, "0");
const plain = str => ({ type: "rich_text", rich_text: [{ plain_text: String(str) }] });
const title = str => ({ type: "title", title: [{ plain_text: String(str) }] });
const number = n => ({ type: "number", number: n });
const checkbox = v => ({ type: "checkbox", checkbox: v });

function setup() {
  const sourcePages = [], workPages = [], canonicalBreeds = [], productionLinks = [];
  for (let index = 0; index < 344; index++) {
    const id = index + 1000, oldPageId = uid(index + 1), newPageId = uid(index + 501);
    const name = "Plemeno " + id, slug = "plemeno-" + id, fci = index + 1;
    sourcePages.push({
      id: oldPageId,
      properties: {
        "Psipedia ID": plain(id),
        "Názov": title(name),
        "Slug": plain(slug),
        "FCI číslo": number(fci),
        "Editorial complete": checkbox(index < 56),
      },
    });
    workPages.push({
      id: newPageId,
      properties: {
        "Psipedia ID": plain(id),
        "Názov": title(name),
        "Zdrojový profil Notion": {
          type: "url",
          url: "https://app.notion.com/p/" + oldPageId.replaceAll("-", ""),
        },
        "FCI číslo": number(fci),
        "Editorial complete": checkbox(index < 56),
      },
    });
    canonicalBreeds.push({
      id, slug, name, fci_number: fci, status: index < 200 ? "published" : "draft",
      image: "/media/unchanged.webp", seo_title: "Existing canonical SEO",
    });
    productionLinks.push({ breed_id: id, notion_page_id: oldPageId });
  }
  return { sourcePages, workPages, canonicalBreeds, productionLinks };
}
const includes = (plan, code) => plan.issues.some(item => item.code === code);

test("strict 344-row identity plan verifies Notion provenance and D1 links without writes", () => {
  const arg = setup(), snapshot = JSON.stringify(arg);
  const p = planBreedWorkcopyIdentity(arg);
  assert.equal(p.identityReady, true, JSON.stringify(p.issues.slice(0, 5)));
  assert.equal(p.cutoverReady, false);
  assert.equal(p.summary.matchingLinks, 344);
  assert.equal(p.summary.issues, 0);
  assert.equal(p.rows.length, 344);
  assert.equal(p.rows[0].breedId, 1000);
  assert.equal(JSON.stringify(arg), snapshot);
  assert.equal(arg.canonicalBreeds[0].status, "published");
  assert.equal(arg.canonicalBreeds[0].image, "/media/unchanged.webp");
  assert.equal(arg.canonicalBreeds[0].seo_title, "Existing canonical SEO");
});

test("work copy link pointing to someone else's old page prevents cutover", () => {
  const arg = setup();
  arg.workPages[8].properties["Zdrojový profil Notion"].url =
    "https://app.notion.com/p/" + arg.sourcePages[9].id.replaceAll("-", "");
  const p = planBreedWorkcopyIdentity(arg);
  assert.equal(p.identityReady, false);
  assert(includes(p, "WORK_PROVENANCE_LINK_MISMATCH"));
  assert.equal(p.cutoverReady, false);
});

test("missing or competing production mappings must not be overwritten", () => {
  const arg = setup();
  arg.productionLinks.splice(2, 1);
  let p = planBreedWorkcopyIdentity(arg);
  assert.equal(p.identityReady, false);
  assert(includes(p, "D1_PRODUCTION_LINK_MISSING"));

  const arg2 = setup();
  arg2.productionLinks[8].notion_page_id = arg2.workPages[8].id;
  p = planBreedWorkcopyIdentity(arg2);
  assert.equal(p.identityReady, false);
  assert(includes(p, "D1_LINK_NOT_OLD_SOURCE"));
});

test("FCI identity changes cannot be accepted even with matching Psipedia ID", () => {
  const arg = setup();
  arg.workPages[4].properties["FCI číslo"].number = 999;
  let p = planBreedWorkcopyIdentity(arg);
  assert.equal(p.identityReady, false);
  assert(includes(p, "BREED_FCI_MISMATCH"));

  const d1 = setup();
  d1.canonicalBreeds[4].fci_number = null;
  p = planBreedWorkcopyIdentity(d1);
  assert.equal(p.identityReady, false);
  assert(includes(p, "BREED_FCI_MISMATCH"));
});

test("slug is verified against canonical D1, never inferred from title", () => {
  const arg = setup();
  arg.sourcePages[4].properties["Slug"] = plain("dangerous-new-slug");
  const p = planBreedWorkcopyIdentity(arg);
  assert.equal(p.identityReady, false);
  assert(includes(p, "D1_SLUG_MISMATCH"));
});

test("duplicate Psipedia ID, duplicate D1 slug and missing pages all fail closed", () => {
  const arg = setup();
  arg.workPages[1].properties["Psipedia ID"] = plain("1000");
  arg.canonicalBreeds[1].slug = arg.canonicalBreeds[0].slug;
  arg.sourcePages.pop();
  const p = planBreedWorkcopyIdentity(arg);
  assert.equal(p.identityReady, false);
  assert(includes(p, "NOTION_BREED_INVENTORY_NOT_344"));
  assert(includes(p, "WORK_DUPLICATE_BREED_ID"));
  assert(includes(p, "D1_DUPLICATE_SLUG"));
});

test("editorial flag divergence is a data freshness blocker", () => {
  const arg = setup();
  arg.workPages[14].properties["Editorial complete"] = checkbox(false);
  const p = planBreedWorkcopyIdentity(arg);
  assert.equal(p.identityReady, false);
  assert(includes(p, "EDITORIAL_COMPLETE_DIFFERENCE"));
});
