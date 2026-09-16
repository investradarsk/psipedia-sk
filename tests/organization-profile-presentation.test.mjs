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
    { label: "Mesto", value: "Nitra" },
    { label: "Kraj", value: "Nitriansky kraj" },
  ]);
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
