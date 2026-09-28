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
  assert.equal(presentation.verified, true);
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
  assert.equal(presentation.health, null);
  assert.equal(presentation.coverage, "Nitra a okolie");
  assert.equal("importData" in presentation, false);
});

test("veterinary Health variant exposes only populated existing veterinary fields", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    category: "veterinari",
    importData: {
      "Špecializácie": "Interná medicína, chirurgia",
      "Pohotovosť": "Áno",
      "Hospitalizácia": "Áno",
      "RTG": "Digitálne RTG",
      "USG": "Áno",
      "Laboratórium": "Nezistené",
    },
  }));

  assert.deepEqual(presentation.health, {
    variant: "veterinari",
    eyebrow: "Zdravie a starostlivosť",
    title: "Veterinárna starostlivosť a vybavenie",
    facts: [
      { label: "Špecializácie", value: "Interná medicína, chirurgia" },
      { label: "Pohotovosť", value: "Áno" },
      { label: "Hospitalizácia", value: "Áno" },
      { label: "RTG", value: "Digitálne RTG" },
      { label: "USG", value: "Áno" },
    ],
  });
});

test("veterinary Health variant is omitted when no useful health data exists", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    category: "veterinari",
    importData: {
      "Pohotovosť": "Neuvedené",
      "Hospitalizácia": "Neoverené",
    },
  }));

  assert.deepEqual(presentation.facts, []);
  assert.equal(presentation.health, null);
});

test("physiotherapy Health variant exposes only populated therapy and rehabilitation fields", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    category: "fyzioterapia",
    importData: {
      "Hydroterapia": "Áno",
      "Laserterapia": "Neoverené",
      "Manuálne techniky": "Mäkké a mobilizačné techniky",
      "Pooperačná rehabilitácia": "Áno",
      "Neurologickí pacienti": "Áno",
      "Odborník / certifikácia": "Veterinárny fyzioterapeut",
    },
  }));

  assert.deepEqual(presentation.health, {
    variant: "fyzioterapia",
    eyebrow: "Zdravie a starostlivosť",
    title: "Terapie a rehabilitácia",
    facts: [
      { label: "Hydroterapia", value: "Áno" },
      { label: "Manuálne techniky", value: "Mäkké a mobilizačné techniky" },
      { label: "Pooperačná rehabilitácia", value: "Áno" },
      { label: "Neurologickí pacienti", value: "Áno" },
      { label: "Odborník / certifikácia", value: "Veterinárny fyzioterapeut" },
    ],
  });
});

test("description, URL fallback and navigation preserve the current detail behavior", () => {
  const presentation = getDirectoryDetailPresentation(profile({ description: "", importData: { Web: "N/A" } }));
  assert.deepEqual(presentation.descriptionParagraphs, ["Krátky opis služby."]);
  assert.equal(presentation.websiteUrl, null);
  assert.equal(presentation.navigationUrl, "https://www.google.com/maps/search/?api=1&query=Testovacia%201%2C%20Nitra%2C%20Nitra%2C%20Nitriansky%20kraj%2C%20Slovensko");
  assert.equal(usefulDirectoryDetailValue("Nie je uvedené"), null);
  assert.equal(publicDirectoryDetailUrl("example.sk/kontakt"), "https://example.sk/kontakt");
});


test("existing breed and organization relations are exposed without synthetic values", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    category: "treneri",
    importData: {
      Plemeno: "Labradorský retriever",
      Organizácia: "Fixture klub",
      "Zastrešujúca organizácia": "Neoverené",
    },
  }));

  assert.ok(presentation.facts.some((fact) => fact.label === "Plemeno" && fact.value === "Labradorský retriever"));
  assert.ok(presentation.facts.some((fact) => fact.label === "Organizácia" && fact.value === "Fixture klub"));
  assert.equal(presentation.facts.some((fact) => fact.label === "Zastrešujúca organizácia"), false);
});

test("confirmed structured service address becomes authoritative while legacy address remains fallback only", () => {
  const structured = getDirectoryDetailPresentation(profile({
    address: "LEGACY sídlo 999",
    city: "Zlaté Moravce",
    district: "Zlaté Moravce",
    region: "Nitriansky kraj",
    postalCode: "953 01",
    street: "Hviezdoslavova",
    houseNumber: "88",
    addressFormat: "STREET",
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
    formattedServiceAddress: "Hviezdoslavova 88\n953 01 Zlaté Moravce",
  }));
  assert.equal(structured.address, "Hviezdoslavova 88, 953 01 Zlaté Moravce");
  assert.match(structured.navigationUrl, /Hviezdoslavova%2088/);
  assert.doesNotMatch(structured.navigationUrl, /LEGACY/);

  const legacy = getDirectoryDetailPresentation(profile({
    address: "Legacy 12",
    postalCode: "",
    street: "",
    houseNumber: "",
    addressFormat: "",
    serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
  }));
  assert.equal(legacy.address, "Legacy 12");
  assert.match(legacy.navigationUrl, /Legacy%2012/);
});
