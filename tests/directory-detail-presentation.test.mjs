import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  formatDirectoryUpdatedAt,
  getDirectoryDetailPresentation,
  getDirectoryQuickFacts,
  publicDirectoryDetailUrl,
  usefulDirectoryDetailValue,
} from "../lib/directory-detail-presentation.ts";
import { buildDirectoryProfileJsonLd } from "../lib/directory-profile-schema.ts";

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

test("description and URL fallback preserve behavior while text-only address does not fabricate navigation", () => {
  const presentation = getDirectoryDetailPresentation(profile({ description: "", importData: { Web: "N/A" } }));
  assert.deepEqual(presentation.descriptionParagraphs, ["Krátky opis služby."]);
  assert.equal(presentation.websiteUrl, null);
  assert.equal(presentation.navigationUrl, null);
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

test("editorial public address wins independently of technical confirmation with structured fallback only when empty", () => {
  const editorial = getDirectoryDetailPresentation(profile({
    address: "Hlavná 123, 949 01 Nitra",
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
  assert.equal(editorial.address, "Hlavná 123, 949 01 Nitra");
  assert.equal(editorial.navigationUrl, null);

  const structuredFallback = getDirectoryDetailPresentation(profile({
    address: "",
    formattedServiceAddress: "Hviezdoslavova 88\n953 01 Zlaté Moravce",
  }));
  assert.equal(structuredFallback.address, "Hviezdoslavova 88, 953 01 Zlaté Moravce");

  const unconfirmed = getDirectoryDetailPresentation(profile({
    address: "Legacy 12",
    postalCode: "",
    street: "",
    houseNumber: "",
    addressFormat: "",
    serviceAddressConfirmation: "LEGACY_UNCONFIRMED",
  }));
  assert.equal(unconfirmed.address, "Legacy 12");
  assert.equal(unconfirmed.navigationUrl, null);
});


test("DIRECTORY-AI-PROFILE-SURFACE-1 formats a neutral public updated date", () => {
  assert.equal(formatDirectoryUpdatedAt("2026-10-04T08:30:00Z"), "Aktualizované 4. 10. 2026");
  assert.equal(formatDirectoryUpdatedAt(""), null);
  assert.equal(formatDirectoryUpdatedAt("not-a-date"), null);
});

test("DIRECTORY-AI-PROFILE-SURFACE-1 veterinary quick facts contain only populated public values", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    category: "veterinari",
    services: ["Pohotovosť", "Chirurgia"],
    qualifications: ["Interná medicína"],
    importData: {
      Telefón: "+421 900 111 222",
      "E-mail": "kontakt@veterina.example",
      Web: "https://veterina.example",
      Facebook: "https://facebook.com/veterina.example",
      Instagram: "Neuvedené",
      _psipedia_quality_phone_status: "NOT_FOUND",
      _psipedia_quality_phone_checked_at: "2026-10-01T08:00:00Z",
    },
    updatedAt: "2026-10-04T08:30:00Z",
  }));
  const facts = getDirectoryQuickFacts(presentation, "Veterinárne pracovisko");
  const byLabel = Object.fromEntries(facts.map((fact) => [fact.label, fact]));

  assert.equal(byLabel["Typ profilu"].value, "Veterinárne pracovisko");
  assert.equal(byLabel["Mesto / obec"].value, "Nitra");
  assert.equal(byLabel.Okres.value, "Nitra");
  assert.equal(byLabel.Kraj.value, "Nitriansky kraj");
  assert.equal(byLabel.Služby.value, "Pohotovosť, Chirurgia");
  assert.equal(byLabel["Zameranie / kvalifikácie"].value, "Interná medicína");
  assert.deepEqual(byLabel.Telefón.links, [{ label: "+421 900 111 222", href: "tel:+421900111222" }]);
  assert.deepEqual(byLabel["E-mail"].links, [{ label: "kontakt@veterina.example", href: "mailto:kontakt@veterina.example" }]);
  assert.deepEqual(byLabel.Web.links, [{ label: "Oficiálny web", href: "https://veterina.example/" }]);
  assert.equal(byLabel.Instagram, undefined);
  assert.equal(byLabel["Posledná aktualizácia"].value, "Aktualizované 4. 10. 2026");
  assert.equal(facts.some((fact) => /quality|intern/i.test(fact.label)), false);
});

test("DIRECTORY-AI-PROFILE-SURFACE-1 omits empty quick-fact rows", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    city: "",
    district: "",
    region: "",
    services: [],
    qualifications: [],
    websiteUrl: null,
    importData: {
      Telefón: "Neuvedené",
      "E-mail": "Nezistené",
      Facebook: "N/A",
    },
    updatedAt: "invalid",
  }));

  assert.deepEqual(getDirectoryQuickFacts(presentation, "Tréner / psia škola"), [
    { label: "Typ profilu", value: "Tréner / psia škola" },
  ]);
});

test("DIRECTORY-AI-PROFILE-SURFACE-1 breeder quick facts use canonical breed relations, not text parsing", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    category: "chovatelske-stanice",
    name: "Moonlight Dogs",
    description: "Rodinná chovateľská stanica so zameraním na pracovnú líniu.",
    services: [],
    qualifications: ["Pracovná línia"],
    importData: {
      Plemeno: "Legacy textové plemeno",
      Facebook: "https://facebook.com/moonlightdogs",
    },
  }));
  const relations = [{
    id: 11,
    slug: "labradorsky-retriever",
    name: "Labradorský retriever",
    href: "/plemena/labradorsky-retriever",
    imageUrl: null,
    fciGroup: 8,
  }];
  const facts = getDirectoryQuickFacts(presentation, "Chovateľská stanica", relations);
  const breeds = facts.find((fact) => fact.label === "Plemená");

  assert.deepEqual(breeds?.links, [{
    label: "Labradorský retriever",
    href: "/plemena/labradorsky-retriever",
  }]);
  assert.equal(JSON.stringify(facts).includes("Legacy textové plemeno"), false);
  assert.equal(facts.find((fact) => fact.label === "Zameranie / kvalifikácie")?.value, "Pracovná línia");
});

test("DIRECTORY-AI-PROFILE-SURFACE-1 club fixture exposes type, location and public focus", () => {
  const presentation = getDirectoryDetailPresentation(profile({
    category: "kynologicke-kluby",
    name: "Kynologický klub Nitra",
    services: ["Agility", "Poslušnosť"],
    qualifications: [],
    importData: { Telefón: "+421 905 222 333" },
  }));
  const facts = getDirectoryQuickFacts(presentation, "Kynologický klub");
  const labels = facts.map((fact) => fact.label);

  assert.ok(labels.includes("Typ profilu"));
  assert.ok(labels.includes("Mesto / obec"));
  assert.ok(labels.includes("Služby"));
  assert.ok(labels.includes("Telefón"));
});

test("DIRECTORY-AI-PROFILE-SURFACE-1 JSON-LD preserves canonical graph and adds truthful visible fields", () => {
  const fixtures = [
    { category: "veterinari", expectedType: "VeterinaryCare" },
    { category: "chovatelske-stanice", expectedType: "LocalBusiness" },
    { category: "kynologicke-kluby", expectedType: "Organization" },
  ];

  for (const fixture of fixtures) {
    const sourceProfile = profile({
      category: fixture.category,
      address: "Testovacia 1",
      websiteUrl: "https://canonical.example.org",
      importData: {
        Telefón: "+421 900 123 456",
        "E-mail": "profil@example.org",
        Facebook: "https://facebook.com/profil.example",
      },
      updatedAt: "2026-10-04T08:30:00Z",
    });
    const presentation = getDirectoryDetailPresentation(sourceProfile);
    const relatedBreeds = [{
      id: 11,
      slug: "labradorsky-retriever",
      name: "Labradorský retriever",
      href: "/plemena/labradorsky-retriever",
      imageUrl: null,
      fciGroup: 8,
    }];
    const canonical = `https://psipedia.sk/adresar/${fixture.category}/testovacia-sluzba`;
    const schema = buildDirectoryProfileJsonLd({
      profile: sourceProfile,
      presentation,
      canonical,
      relatedBreeds,
    });
    const entity = schema["@graph"].find((item) => item["@type"] === fixture.expectedType);
    const webPage = schema["@graph"].find((item) => item["@type"] === "WebPage");
    const breadcrumbs = schema["@graph"].find((item) => item["@type"] === "BreadcrumbList");

    assert.ok(entity);
    assert.equal(entity["@id"], `${canonical}#profile`);
    assert.deepEqual(entity.mainEntityOfPage, { "@id": canonical });
    assert.equal(entity.address["@type"], "PostalAddress");
    assert.deepEqual(entity.knowsAbout, ["Labradorský retriever"]);
    assert.ok(entity.sameAs.includes("https://canonical.example.org/"));
    assert.ok(entity.sameAs.includes("https://facebook.com/profil.example"));
    assert.equal(webPage["@id"], canonical);
    assert.equal(webPage.dateModified, "2026-10-04T08:30:00Z");
    assert.deepEqual(webPage.mainEntity, { "@id": `${canonical}#profile` });
    assert.deepEqual(webPage.breadcrumb, { "@id": `${canonical}#breadcrumb` });
    assert.equal(breadcrumbs["@id"], `${canonical}#breadcrumb`);
  }
});

test("DIRECTORY-AI-PROFILE-SURFACE-1 public component renders semantic quick facts without an Overené badge", () => {
  const component = fs.readFileSync(new URL("../components/directory-profile-detail.tsx", import.meta.url), "utf8");
  assert.match(component, /Základné informácie/);
  assert.match(component, /<dl className=\{styles\.quickFactsList\}>/);
  assert.match(component, /<time dateTime=\{fact\.dateTime\}>/);
  assert.doesNotMatch(component, />Overené</);
});
