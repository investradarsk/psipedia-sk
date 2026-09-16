import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("../app/organizacie/[slug]/page.tsx", import.meta.url), "utf8");
const componentSource = readFileSync(new URL("../components/organization-profile-detail.tsx", import.meta.url), "utf8");
const mediaSource = readFileSync(new URL("../components/adoption-card-media.tsx", import.meta.url), "utf8");
const catalogSource = readFileSync(new URL("../components/adoption-catalog.tsx", import.meta.url), "utf8");

test("organization route delegates exact slug lookup to ORG-3A and fails closed", () => {
  assert.match(routeSource, /getPublicOrganizationCompositionBySlug\(slug, requireDatabase\(\)\)/);
  assert.match(routeSource, /if \(!composition\) notFound\(\)/);
  assert.doesNotMatch(routeSource, /LIKE|lower\s*\(|normalize|similarity|help_cases|organization_name\s*=|organization_slug\s*=/i);
  assert.doesNotMatch(routeSource, /UPDATE|INSERT|DELETE/i);
});

test("profile shell uses shared page and DETAIL-1 primitives", () => {
  for (const primitive of [
    "PageContainer",
    "Breadcrumbs",
    "SectionHero",
    "DetailContentLayout",
    "DetailActions",
    "DetailSection",
    "DetailParagraphs",
    "DetailFactsCard",
    "DetailContactsCard",
  ]) {
    assert.match(componentSource, new RegExp(`\\b${primitive}\\b`), primitive);
  }
  assert.match(componentSource, /Domov/);
  assert.match(componentSource, /Organizácie/);
  assert.match(componentSource, /aria-current="page"/);
});

test("profile presentation renders canonical related adoptions as public cards", () => {
  assert.match(componentSource, /adoptions\.map/);
  assert.match(componentSource, /adoptionDetailPath\(adoption\.slug\)/);
  assert.match(componentSource, /AdoptionCardMedia/);
  assert.match(componentSource, /mainImage=\{adoption\.mainImage\}/);
  assert.match(componentSource, /data-adoption-card=\{adoption\.slug\}/);
  assert.match(componentSource, /Zobraziť profil/);
  assert.doesNotMatch(componentSource, /sourceUrl|source_data|importKey|createdBy|updatedBy|help_cases/i);
});

test("organization cards reuse the catalog public image, fallback and status primitive", () => {
  assert.match(catalogSource, /AdoptionCardMedia/);
  assert.match(mediaSource, /adoptionDetailStatusLabels\[status\]/);
  assert.match(mediaSource, /data-adoption-media="image"/);
  assert.match(mediaSource, /data-adoption-media="fallback"/);
  assert.match(mediaSource, /alt=\{`\$\{name\} – pes na adopciu`\}/);
});
