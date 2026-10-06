import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  ORGANIZATION_ID,
  SITE_LOGO_ID,
  SITE_LOGO_URL,
  WEBSITE_ID,
  articleAuthorJsonLd,
  buildGenericMainEntityJsonLd,
  buildSiteIdentityJsonLd,
  buildWebPageJsonLd,
} from "../lib/seo.ts";

function graphEntity(schema, type) {
  const entity = schema["@graph"].find((item) => item["@type"] === type);
  assert.ok(entity, `${type} entity must exist`);
  return entity;
}

test("SEO-STRUCTURED-DATA-2 exposes one canonical Psipedia publisher identity with a real logo", () => {
  const schema = buildSiteIdentityJsonLd();
  const organization = graphEntity(schema, "Organization");
  const website = graphEntity(schema, "WebSite");

  assert.equal(organization["@id"], ORGANIZATION_ID);
  assert.equal(organization.logo["@id"], SITE_LOGO_ID);
  assert.equal(organization.logo.url, SITE_LOGO_URL);
  assert.equal(organization.logo.contentUrl, SITE_LOGO_URL);
  assert.equal(organization.logo.width, 512);
  assert.equal(organization.logo.height, 512);
  assert.deepEqual(website.publisher, { "@id": ORGANIZATION_ID });
});

test("SEO-STRUCTURED-DATA-2 canonical WebPage references the shared WebSite, publisher, main entity and breadcrumbs by @id", () => {
  const page = buildWebPageJsonLd({
    canonical: "/test-detail",
    name: "Test detail",
    description: "Canonical detail page.",
    mainEntityId: "/test-detail#entity",
    breadcrumbId: "/test-detail#breadcrumb",
    datePublished: "2026-09-01T10:00:00.000Z",
    dateModified: "2026-10-03T10:00:00.000Z",
  });

  assert.equal(page["@id"], "https://psipedia.sk/test-detail");
  assert.equal(page.url, "https://psipedia.sk/test-detail");
  assert.deepEqual(page.publisher, { "@id": ORGANIZATION_ID });
  assert.deepEqual(page.isPartOf, { "@id": WEBSITE_ID });
  assert.deepEqual(page.mainEntity, { "@id": "https://psipedia.sk/test-detail#entity" });
  assert.deepEqual(page.breadcrumb, { "@id": "https://psipedia.sk/test-detail#breadcrumb" });
  assert.equal(page.datePublished, "2026-09-01T10:00:00.000Z");
  assert.equal(page.dateModified, "2026-10-03T10:00:00.000Z");
  assert.equal(page.inLanguage, "sk-SK");
});

test("SITEWIDE-AI-ENTITY-SURFACE-1 generic public entities get deterministic canonical identity without invented subtype semantics", () => {
  const entity = buildGenericMainEntityJsonLd({
    canonical: "/pomoc-psom/adopcia/ben",
    name: "Ben",
    description: "Verejný opis psa.",
    image: "/images/ben.webp",
    idSuffix: "dog",
  });

  assert.deepEqual(entity, {
    "@type": "Thing",
    "@id": "https://psipedia.sk/pomoc-psom/adopcia/ben#dog",
    name: "Ben",
    url: "https://psipedia.sk/pomoc-psom/adopcia/ben",
    mainEntityOfPage: { "@id": "https://psipedia.sk/pomoc-psom/adopcia/ben" },
    description: "Verejný opis psa.",
    image: "https://psipedia.sk/images/ben.webp",
  });
});

test("SEO-STRUCTURED-DATA-2 editorial author reuses the canonical Psipedia Organization instead of creating a second incomplete Organization", () => {
  assert.deepEqual(articleAuthorJsonLd("Redakcia Psipedia"), { "@id": ORGANIZATION_ID });
  assert.deepEqual(articleAuthorJsonLd("Jana Testovacia"), { "@type": "Person", name: "Jana Testovacia" });
});

test("SEO-STRUCTURED-DATA-2 public detail routes use canonical WebPage publisher references", () => {
  const layout = fs.readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const article = fs.readFileSync(new URL("../components/article-detail.tsx", import.meta.url), "utf8");
  const breed = fs.readFileSync(new URL("../app/plemena/[slug]/page.tsx", import.meta.url), "utf8");
  const event = fs.readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
  const directory = fs.readFileSync(new URL("../app/adresar/[category]/[slug]/page.tsx", import.meta.url), "utf8");
  const directorySchema = fs.readFileSync(new URL("../lib/directory-profile-schema.ts", import.meta.url), "utf8");
  const help = fs.readFileSync(new URL("../app/pomoc-psom/[category]/[slug]/page.tsx", import.meta.url), "utf8");
  const organization = fs.readFileSync(new URL("../lib/organization-seo.ts", import.meta.url), "utf8");

  assert.match(layout, /<StructuredData value=\{buildSiteIdentityJsonLd\(\)\}/);

  for (const source of [article, breed, event, directorySchema, help, organization]) {
    assert.match(source, /buildWebPageJsonLd\(/);
  }
  assert.match(directory, /buildDirectoryProfileJsonLd\(/);

  assert.match(article, /publisher: \{ "@id": ORGANIZATION_ID \}/);
  assert.match(breed, /publisher: \{ "@id": ORGANIZATION_ID \}/);
  assert.doesNotMatch(article, /publisher:[\s\S]{0,240}favicon\.svg/);
  assert.doesNotMatch(breed, /publisher:[\s\S]{0,240}favicon\.svg/);
});

test("SEO-STRUCTURED-DATA-2 never substitutes the Psipedia brand for a foreign organization logo", () => {
  const event = fs.readFileSync(new URL("../app/[section]/[slug]/page.tsx", import.meta.url), "utf8");
  const directorySchema = fs.readFileSync(new URL("../lib/directory-profile-schema.ts", import.meta.url), "utf8");
  const organization = fs.readFileSync(new URL("../lib/organization-seo.ts", import.meta.url), "utf8");

  assert.match(event, /Do not invent a foreign Organization node/);
  assert.doesNotMatch(event, /organizer: \{ "@type": "Organization"/);

  assert.match(directorySchema, /schemaType === "Organization" && profileImage/);
  assert.match(directorySchema, /logo: \{ "@type": "ImageObject", url: profileImage \}/);
  assert.match(organization, /logo: \{ "@type": "ImageObject", url: imageUrl \}/);

  for (const source of [event, directorySchema, organization]) {
    assert.doesNotMatch(source, /favicon\.svg|pwa\/icon-512\.png/);
  }
});
