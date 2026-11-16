import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { directoryNotionFullMirrorMismatches } from "../lib/directory-notion-full-mirror.ts";
import { BREEDER_NOTION_EDITORIAL_FIELDS } from "../lib/notion-breeder-field-events.ts";
import { DIRECTORY_FIELD_EVENT_CATEGORIES } from "../lib/notion-directory-field-event-scope.ts";

const paths = Object.keys(BREEDER_NOTION_EDITORIAL_FIELDS);
const present = Object.values(BREEDER_NOTION_EDITORIAL_FIELDS);
function snapshot() {
  return {
    name: "Pazúrikovo", excerpt: "Krátky text", description: "Popis",
    services: ["Venčenie"], qualifications: ["Certifikát"],
    region: "Bratislavský kraj", district: "Bratislava V", city: "Bratislava",
    address: "Švabinského 1063/5", postalCode: "851 01",
    street: "Švabinského", houseNumber: "1063/5", addressFormat: "STREET",
    priceNote: "", websiteUrl: "Test", publicPhone: "Test123",
    publicEmail: "Test", facebookUrl: "Test", instagramUrl: "Test",
    seo: {
      title: "SEO", description: "", focusKeyword: "", canonicalUrl: "",
      ogTitle: "", ogDescription: "", ogImage: "", noindex: false,
    },
  };
}
const mismatch = (expected, actual, propertyNames = present) =>
  directoryNotionFullMirrorMismatches({
    expected, actual, presentNotionProperties: propertyNames, paths,
  });

test("Admin -> D1 -> Notion: all 27 editorial fields match in every directory category", () => {
  assert.equal(DIRECTORY_FIELD_EVENT_CATEGORIES.length, 10);
  for (const category of DIRECTORY_FIELD_EVENT_CATEGORIES) {
    const savedD1 = snapshot();
    assert.deepEqual(mismatch(savedD1, structuredClone(savedD1)), [], category);
  }
});

test("Pazúrikovo #1853: phone updated but Notion lost other four contacts is NOT synchronized", () => {
  const d1 = snapshot();
  const notion = {
    ...snapshot(), websiteUrl: "", publicEmail: "", facebookUrl: "", instagramUrl: "",
  };
  assert.deepEqual(mismatch(d1, notion),
    ["websiteUrl", "publicEmail", "facebookUrl", "instagramUrl"]);
  assert.deepEqual(mismatch(d1, { ...notion,
    websiteUrl: "Test", publicEmail: "Test", facebookUrl: "Test", instagramUrl: "Test",
  }), []);
});

test("Explicitly blank D1 field is still transferred and verifiable", () => {
  const expected = { ...snapshot(), publicEmail: "" };
  const notion = structuredClone(expected);
  assert.deepEqual(mismatch(expected, notion), []);
  notion.publicEmail = "Starý e-mail";
  assert.deepEqual(mismatch(expected, notion), ["publicEmail"]);
});

test("Missing Notion property never counts as confirmed empty string", () => {
  const expected = { ...snapshot(), publicEmail: "" };
  assert.deepEqual(mismatch(expected, structuredClone(expected),
    present.filter(name => name !== "E-mail")), ["publicEmail"]);
});

test("Outbound verification preserves raw list text even when inbound parsing would split it", () => {
  const d1 = snapshot();
  d1.qualifications = ["Odborná prax, výcvik"];
  const notion = structuredClone(d1);
  notion.qualifications = "Odborná prax, výcvik";
  assert.deepEqual(mismatch(d1, notion), []);
  notion.qualifications = "Odborná prax";
  assert.deepEqual(mismatch(d1, notion), ["qualifications"]);
});

test("One Notion field failing does not suppress independently valid values", () => {
  const d1 = snapshot();
  const notion = { ...snapshot(), facebookUrl: "Old" };
  assert.deepEqual(mismatch(d1, notion), ["facebookUrl"]);
  assert.deepEqual(mismatch(d1, { ...notion, facebookUrl: "Test" }), []);
});

test("Equivalent HTTP(S) URLs are allowed; arbitrary text is never silently removed", () => {
  const expected = snapshot();
  expected.websiteUrl = "https://example.sk/";
  const actual = structuredClone(expected);
  actual.websiteUrl = "https://example.sk";
  assert.deepEqual(mismatch(expected, actual), []);
  expected.websiteUrl = "Test";
  assert.deepEqual(mismatch(expected, actual), ["websiteUrl"]);
});

test("Full D1 -> Notion transfer always uses one PATCH plus full fresh GET verification", () => {
  const sync = readFileSync("lib/notion-directory-sync.ts", "utf8");
  const admin = readFileSync("app/api/admin/directory/[id]/route.ts", "utf8");
  assert.match(admin, /breederAdminFields: isDirectoryFieldEventCategory\(before\.category\)/);
  assert.match(sync, /for \(const path of fields\)\s*desired\[BREEDER_NOTION_EDITORIAL_FIELDS\[path\]\]/);
  assert.match(sync, /adaptDirectoryNotionTextProperties\(desired, page\.properties \?\? \{\}\)/);
  assert.match(sync, /let fresh = await fetchNotionPage\(bindings, page\.id\)/);
  assert.match(sync, /directoryNotionFullMirrorMismatches\(/);
  assert.match(sync, /const actual: Record<string, unknown> = \{ seo: \{\} \}/);
  assert.doesNotMatch(sync, /actual: notionSnapshot\(candidate\)/);
  assert.match(sync, /const finalPage = await fetchNotionPage\(bindings, page\.id\)/);
  assert.match(sync, /DIRECTORY_ADMIN_TO_NOTION_FULL_PARITY_FAILED/);
  assert.match(sync, /DIRECTORY_ADMIN_TO_NOTION_POST_STATUS_PARITY_FAILED/);
  assert.match(sync, /markPageError\(input\.bindings, failedPage\.id, error, failedPage\)/);
  assert.match(sync, /isDirectoryAdminWritebackEcho\(/);
});
