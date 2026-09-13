import assert from "node:assert/strict";
import test from "node:test";
import { getHelpPresentation, parseHelpLabelledText, usefulHelpValue } from "../lib/help-detail-presentation.ts";

function helpCase(overrides = {}) {
  return {
    id: 1,
    slug: "testovacia-organizacia",
    title: "Testovacia organizácia",
    category: "utulky",
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

test("labelled organization dump is converted into usable fields", () => {
  const parsed = parseHelpLabelledText("Popis: Pomáhame opusteným psom. Typ organizácie: Občianske združenie Adopcie: Áno Dočasná opatera: Neoverené");
  assert.deepEqual(parsed.fields, [
    { label: "Popis", value: "Pomáhame opusteným psom." },
    { label: "Typ organizácie", value: "Občianske združenie" },
    { label: "Adopcie", value: "Áno" },
  ]);
});

test("organization presentation keeps only supported help options and confirmed contacts", () => {
  const presentation = getHelpPresentation(helpCase({
    description: "Popis: Pomáhame opusteným psom. Typ organizácie: Občianske združenie Adopcie: Áno Prijímanie alebo záchrana psov: Neoverené Materiálna pomoc: Nie Oblasť pôsobenia: Nitra a okolie Zdroj: https://example.org/o-nas Posledná kontrola: 13. 9. 2026",
    contactNote: "Telefón: +421 900 123 456 E-mail: pomoc@example.org Web: https://example.org Facebook: Neoverené",
  }));

  assert.equal(presentation.description, "Pomáhame opusteným psom.");
  assert.equal(presentation.organizationType, "Občianske združenie");
  assert.equal(presentation.coverage, "Nitra a okolie");
  assert.deepEqual(presentation.helpOptions, [{ label: "Adopcie", value: "Áno" }]);
  assert.equal(presentation.contacts.length, 3);
  assert.equal(presentation.contacts.find((entry) => entry.label === "E-mail")?.href, "mailto:pomoc@example.org");
  assert.equal(presentation.sources[0]?.href, "https://example.org/o-nas");
  assert.equal(presentation.lastChecked, "13. 9. 2026");
});

test("plain prose remains intact when no labelled import fields exist", () => {
  const presentation = getHelpPresentation(helpCase({ description: "Prvý odsek o organizácii.\n\nDruhý odsek s praktickými informáciami." }));
  assert.equal(presentation.description, "Prvý odsek o organizácii.\n\nDruhý odsek s praktickými informáciami.");
  assert.deepEqual(presentation.helpOptions, []);
  assert.deepEqual(presentation.contacts, []);
});
