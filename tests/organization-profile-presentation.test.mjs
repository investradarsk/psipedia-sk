import assert from "node:assert/strict";
import test from "node:test";
import { buildOrganizationProfilePresentation } from "../lib/organization-profile-presentation.ts";

function organization(overrides = {}) {
  return {
    id: 7,
    name: "Psia nádej",
    slug: "psia-nadej",
    legalName: "Psia nádej, o.z.",
    registrationNumber: "12345678",
    type: "CIVIC_ASSOCIATION",
    shortDescription: "Pomáhame psom v núdzi.",
    description: "Prvý odsek.\n\nDruhý odsek.",
    publicEmail: "info@example.sk",
    publicPhone: "+421 900 123 456",
    websiteUrl: "https://example.sk",
    facebookUrl: "https://facebook.com/example",
    instagramUrl: "https://instagram.com/example",
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    countryCode: "SK",
    locations: [{
      id: 50,
      organizationId: 7,
      role: "UNSPECIFIED",
      label: "",
      city: "Nitra",
      district: "Nitra",
      region: "Nitriansky kraj",
      countryCode: "SK",
      isPrimary: true,
      sortOrder: 0,
    }],
    imageUrl: "https://example.sk/image.jpg",
    sourceUrl: "https://private-provenance.example/source",
    publishedAt: "2026-09-01T10:00:00.000Z",
    lastVerifiedAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
    directory: null,
    ...overrides,
  };
}

test("published public fields map into identity, contacts and one shared action", () => {
  const presentation = buildOrganizationProfilePresentation(organization());

  assert.equal(presentation.shortDescription, "Pomáhame psom v núdzi.");
  assert.equal(presentation.description, "Prvý odsek.\n\nDruhý odsek.");
  assert.equal(presentation.location, "Nitra · Nitriansky kraj");
  assert.deepEqual(presentation.facts, [
    { label: "Typ organizácie", value: "Občianske združenie" },
    { label: "Právny názov", value: "Psia nádej, o.z." },
    { label: "Registračné číslo", value: "12345678" },
  ]);
  assert.deepEqual(presentation.locations, [{
    id: 50,
    label: null,
    value: "Nitra · Nitriansky kraj",
    isPrimary: true,
  }]);
  assert.deepEqual(presentation.contacts.map(({ label, href }) => [label, href]), [
    ["Web", "https://example.sk/"],
    ["Facebook", "https://facebook.com/example"],
    ["Instagram", "https://instagram.com/example"],
    ["Email", "mailto:info@example.sk"],
    ["Telefón", "tel:+421900123456"],
  ]);
  assert.deepEqual(presentation.actions, [
    { label: "Navštíviť web organizácie ↗", href: "https://example.sk/", external: true },
  ]);
  assert.equal("sourceUrl" in presentation, false);
  assert.doesNotMatch(JSON.stringify(presentation), /private-provenance/);
});

test("optional or unsafe values disappear instead of producing broken UI", () => {
  const presentation = buildOrganizationProfilePresentation(organization({
    legalName: "Psia nádej",
    registrationNumber: null,
    shortDescription: "  ",
    description: "",
    publicEmail: "not-an-email",
    publicPhone: "123",
    websiteUrl: "javascript:alert(1)",
    facebookUrl: "notaurl",
    instagramUrl: null,
    city: "",
    district: "",
    region: "",
    locations: [],
    imageUrl: "javascript:alert(1)",
  }));

  assert.equal(presentation.shortDescription, null);
  assert.equal(presentation.description, null);
  assert.equal(presentation.location, null);
  assert.equal(presentation.imageUrl, null);
  assert.deepEqual(presentation.facts, [{ label: "Typ organizácie", value: "Občianske združenie" }]);
  assert.deepEqual(presentation.contacts, []);
  assert.deepEqual(presentation.actions, []);
});

test("relative public media path is preserved while external links stay http(s)-only", () => {
  const presentation = buildOrganizationProfilePresentation(organization({ imageUrl: "/media/organizations/psia-nadej.webp" }));
  assert.equal(presentation.imageUrl, "/media/organizations/psia-nadej.webp");
});


test("multiple canonical locations keep ORG-2A order, labels and primary semantics without a duplicate hero location", () => {
  const presentation = buildOrganizationProfilePresentation(organization({
    city: "Legacy mesto",
    district: "Legacy okres",
    region: "Legacy kraj",
    locations: [
      {
        id: 62,
        organizationId: 7,
        role: "SITE",
        label: "Výdajné miesto",
        city: "Nitra",
        district: "Nitra",
        region: "Nitriansky kraj",
        countryCode: "SK",
        isPrimary: false,
        sortOrder: 20,
      },
      {
        id: 61,
        organizationId: 7,
        role: "SERVICE_AREA",
        label: "",
        city: "Šaľa",
        district: "Šaľa",
        region: "Nitriansky kraj",
        countryCode: "SK",
        isPrimary: true,
        sortOrder: 10,
      },
    ],
  }));

  assert.equal(presentation.location, null);
  assert.deepEqual(presentation.locations, [
    { id: 61, label: "Pôsobnosť", value: "Šaľa · Nitriansky kraj", isPrimary: true },
    { id: 62, label: "Výdajné miesto", value: "Nitra · Nitriansky kraj", isPrimary: false },
  ]);
  assert.equal(presentation.facts.some((fact) => ["Mesto", "Okres", "Kraj"].includes(fact.label)), false);
  assert.equal(JSON.stringify(presentation).includes("Legacy mesto"), false);
});

test("legacy compatibility is used only as a compact single-location fallback", () => {
  const presentation = buildOrganizationProfilePresentation(organization({
    locations: [],
    city: "Levice",
    district: "Levice",
    region: "Nitriansky kraj",
  }));

  assert.equal(presentation.location, "Levice · Nitriansky kraj");
  assert.deepEqual(presentation.locations, [
    { id: null, label: null, value: "Levice · Nitriansky kraj", isPrimary: true },
  ]);
  assert.equal(presentation.facts.some((fact) => ["Mesto", "Okres", "Kraj"].includes(fact.label)), false);
});

test("profile omits the location UI contract when canonical and legacy location data are empty", () => {
  const presentation = buildOrganizationProfilePresentation(organization({
    locations: [],
    city: "",
    district: "",
    region: "",
    countryCode: "SK",
  }));

  assert.equal(presentation.location, null);
  assert.deepEqual(presentation.locations, []);
});
