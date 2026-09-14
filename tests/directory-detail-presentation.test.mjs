import assert from "node:assert/strict";
import test from "node:test";
import { getDirectoryDetailPresentation, publicDirectoryDetailUrl, usefulDirectoryDetailValue } from "../lib/directory-detail-presentation.ts";

function profile(overrides = {}) {
  return {
    id: 7,
    slug: "testovacia-sluzba",
    name: "Testovacia služba",
    category: "treneri",
    excerpt: "Krátky opis služby.",
    description: "Prvý odsek.\n\nDruhý odsek.",
    services: ["Individuálny výcvik"],
    qualifications: ["Certifikovaný tréner"],
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    address: "Testovacia 1",
    online: true,
    priceNote: "Cena dohodou",
    websiteUrl: "https://canonical.example.org",
    imageUrl: null,
    verified: true,
    featured: false,
    updatedAt: "2026-09-14T06:00:00Z",
    importData: null,
    seo: {},
    ...overrides,
  };
}

test("legacy contact aliases are normalized into presentation-only contacts", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    importData: {
      Telefon: "+421 900 123 456",
      Email: "prvy@example.org; neplatny; druhy@example.org",
      Webstránka: "example.org",
      Facebook: "Neuvedené",
      Instagram: "https://instagram.com/example",
    },
  }));

  assert.deepEqual(presentation.phone, { value: "+421 900 123 456", href: "tel:+421900123456" });
  assert.deepEqual(presentation.emails, [
    { value: "prvy@example.org", href: "mailto:prvy@example.org" },
    { value: "druhy@example.org", href: "mailto:druhy@example.org" },
  ]);
  assert.equal(presentation.websiteUrl, "https://example.org/");
  assert.equal(presentation.facebookUrl, null);
  assert.equal(presentation.instagramUrl, "https://instagram.com/example");
});

test("category-specific legacy facts and coverage aliases are normalized without exposing importData", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    importData: {
      "Individuálny výcvik": "Áno",
      "Skupinový výcvik": "Neoverené",
      "Behaviorálne poradenstvo": "Na objednávku",
      "Oblasť pôsobenia": "Nitra a okolie",
    },
  }));

  assert.deepEqual(presentation.facts, [
    { label: "Individuálny výcvik", value: "Áno" },
    { label: "Behaviorálne poradenstvo", value: "Na objednávku" },
  ]);
  assert.equal(presentation.coverage, "Nitra a okolie");
  assert.equal("importData" in presentation, false);
});

test("description, URL fallback and navigation preserve the current detail behavior", () => {
  const presentation = getDirectoryDetailPresentation(profile({ description: "", importData: { Web: "N/A" } }));
  assert.deepEqual(presentation.descriptionParagraphs, ["Krátky opis služby."]);
  assert.equal(presentation.websiteUrl, null);
  assert.equal(presentation.navigationUrl, "https://www.google.com/maps/search/?api=1&query=Testovacia%201%2C%20Nitra%2C%20Nitra%2C%20Nitriansky%20kraj%2C%20Slovensko");
  assert.equal(usefulDirectoryDetailValue("Nie je uvedené"), null);
  assert.equal(publicDirectoryDetailUrl("example.sk/kontakt"), "https://example.sk/kontakt");
});
