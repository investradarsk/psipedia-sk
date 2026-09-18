import assert from "node:assert/strict";
import test from "node:test";
import { getHelpPresentation, parseHelpLabelledText, usefulHelpValue } from "../lib/help-detail-presentation.ts";

function helpCase(overrides = {}) {
  return {
    id: 1,
    slug: "testovacia-vyzva",
    title: "Testovacia výzva",
    category: "dobrovolnictvo",
    status: "published",
    excerpt: "Overený profil testovacej organizácie pre verejný detail.",
    description: "Bežný opis organizácie.",
    organization: "Testovacia organizácia",
    dogName: "",
    breed: "",
    ageNote: "",
    city: "Nitra",
    region: "Nitriansky kraj",
    locationNote: "",
    reportedDate: null,
    deadlineDate: null,
    actionLabel: "Navštíviť organizáciu",
    actionUrl: "https://example.org",
    contactNote: "",
    goalAmount: null,
    raisedAmount: null,
    imageUrl: null,
    imageKey: null,
    verified: true,
    urgent: false,
    resolved: false,
    createdAt: "2026-09-13T12:00:00Z",
    updatedAt: "2026-09-13T12:00:00Z",
    publishedAt: "2026-09-13T12:00:00Z",
    createdBy: "test",
    updatedBy: "test",
    seo: {},
    ...overrides,
  };
}

test("unknown optional values are hidden without treating a real negative value as missing", () => {
  assert.equal(usefulHelpValue("Neoverené"), null);
  assert.equal(usefulHelpValue("Neuvedené"), null);
  assert.equal(usefulHelpValue("N/A"), null);
  assert.equal(usefulHelpValue("Nie"), "Nie");
});

test("labelled help text is converted into usable fields", () => {
  const parsed = parseHelpLabelledText("Popis: Pomôžte s venčením. Dobrovoľníctvo: prechádzky Materiálna pomoc: deky");
  assert.deepEqual(parsed.fields, [
    { label: "Popis", value: "Pomôžte s venčením." },
    { label: "Dobrovoľníctvo", value: "prechádzky" },
    { label: "Materiálna pomoc", value: "deky" },
  ]);
});

test("help presentation keeps only supported options and confirmed contacts", () => {
  const presentation = getHelpPresentation(helpCase({
    description: "Popis: Pomôžte s venčením. Dobrovoľníctvo: prechádzky Materiálna pomoc: Nie Zdroj: https://example.org/pomoc Posledná kontrola: 13. 9. 2026",
    contactNote: "Telefón: +421 900 123 456 E-mail: pomoc@example.org Web: https://example.org Facebook: Neoverené",
  }));

  assert.equal(presentation.description, "Pomôžte s venčením.");
  assert.deepEqual(presentation.helpOptions, [{ label: "Dobrovoľníctvo", value: "prechádzky" }]);
  assert.equal(presentation.contacts.length, 3);
  assert.equal(presentation.contacts.find((entry) => entry.label === "E-mail")?.href, "mailto:pomoc@example.org");
  assert.equal(presentation.sources[0]?.href, "https://example.org/pomoc");
  assert.equal(presentation.lastChecked, "13. 9. 2026");
});

test("plain prose remains intact when no labelled import fields exist", () => {
  const presentation = getHelpPresentation(helpCase({ description: "Prvý odsek o organizácii.\n\nDruhý odsek s praktickými informáciami." }));
  assert.equal(presentation.description, "Prvý odsek o organizácii.\n\nDruhý odsek s praktickými informáciami.");
  assert.deepEqual(presentation.helpOptions, []);
  assert.deepEqual(presentation.contacts, []);
});
