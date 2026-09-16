import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOrganizationJsonLd,
  buildOrganizationMetadata,
  organizationMetadataDescription,
} from "../lib/organization-seo.ts";

function organization(overrides = {}) {
  return {
    id: 7,
    name: "Psia nádej",
    slug: "psia-nadej",
    legalName: "Psia nádej, o.z.",
    registrationNumber: "12345678",
    type: "CIVIC_ASSOCIATION",
    shortDescription: "Pomáhame psom v núdzi.",
    description: "Bezpečný verejný opis organizácie.",
    publicEmail: "info@example.sk",
    publicPhone: "+421 900 123 456",
    websiteUrl: "https://example.sk",
    facebookUrl: "https://facebook.com/example",
    instagramUrl: "https://instagram.com/example",
    city: "Nitra",
    district: "Nitra",
    region: "Nitriansky kraj",
    countryCode: "SK",
    imageUrl: "/media/organizations/psia-nadej.webp",
    sourceUrl: "https://private-provenance.example/source",
    publishedAt: "2026-09-01T10:00:00.000Z",
    lastVerifiedAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-11T10:00:00.000Z",
    directory: null,
    ...overrides,
  };
}

test("published organization metadata reuses canonical SEO contract including OG and Twitter", () => {
  const metadata = buildOrganizationMetadata(organization());
  const canonical = "https://psipedia.sk/organizacie/psia-nadej";

  assert.equal(metadata.title, "Psia nádej");
  assert.equal(metadata.description, "Pomáhame psom v núdzi.");
  assert.equal(metadata.alternates?.canonical, canonical);
  assert.equal(metadata.openGraph?.url, canonical);
  assert.equal(metadata.openGraph?.title, "Psia nádej | Psipedia.sk");
  assert.equal(metadata.openGraph?.description, "Pomáhame psom v núdzi.");
  assert.equal(metadata.twitter?.title, "Psia nádej | Psipedia.sk");
  assert.equal(metadata.twitter?.description, "Pomáhame psom v núdzi.");
});

test("metadata uses a safe deterministic organization fallback when descriptions are empty", () => {
  const item = organization({ shortDescription: "  ", description: "" });
  assert.equal(
    organizationMetadataDescription(item),
    "Verejný profil organizácie Psia nádej na Psipedia.sk.",
  );
  assert.equal(
    buildOrganizationMetadata(item).description,
    "Verejný profil organizácie Psia nádej na Psipedia.sk.",
  );
});

test("Organization JSON-LD has stable canonical identity and only sanitized real public fields", () => {
  const jsonLd = buildOrganizationJsonLd(organization());
  assert.deepEqual(jsonLd, {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://psipedia.sk/organizacie/psia-nadej#organization",
    name: "Psia nádej",
    url: "https://psipedia.sk/organizacie/psia-nadej",
    description: "Bezpečný verejný opis organizácie.",
    image: "https://psipedia.sk/media/organizations/psia-nadej.webp",
    email: "info@example.sk",
    telephone: "+421 900 123 456",
    sameAs: [
      "https://example.sk/",
      "https://facebook.com/example",
      "https://instagram.com/example",
    ],
  });
  assert.equal(JSON.stringify(jsonLd).includes("sourceUrl"), false);
  assert.equal(JSON.stringify(jsonLd).includes("lastVerifiedAt"), false);
});

test("Organization JSON-LD excludes unsafe URLs and empty optional values without garbage", () => {
  const jsonLd = buildOrganizationJsonLd(organization({
    shortDescription: "",
    description: " ",
    publicEmail: "not-an-email",
    publicPhone: "123",
    websiteUrl: "javascript:alert(1)",
    facebookUrl: "data:text/html,unsafe",
    instagramUrl: "notaurl",
    imageUrl: "javascript:alert(1)",
  }));

  assert.deepEqual(jsonLd, {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://psipedia.sk/organizacie/psia-nadej#organization",
    name: "Psia nádej",
    url: "https://psipedia.sk/organizacie/psia-nadej",
  });
  assert.equal(JSON.stringify(jsonLd).includes("undefined"), false);
  assert.equal(JSON.stringify(jsonLd).includes("null"), false);
  assert.equal(JSON.stringify(jsonLd).includes("javascript:"), false);
  assert.equal(JSON.stringify(jsonLd).includes("data:"), false);
});
