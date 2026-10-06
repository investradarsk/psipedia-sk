import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("ARTICLE public surface already exposes canonical editorial identity and dates", () => {
  const source = read("../components/article-detail.tsx");
  for (const pattern of [
    /<h1>\{article\.title\}<\/h1>/,
    /Publikované <time dateTime=\{article\.dateIso\}>/,
    /Aktualizované <time dateTime=\{article\.updatedDateIso\}>/,
    /section === "novinky" \? "NewsArticle" : "Article"/,
    /author: articleAuthorJsonLd\(authorName\)/,
    /"@type": "BreadcrumbList"/,
    /relatedBreeds/,
  ]) assert.match(source, pattern);
});

test("BREED public surface has a canonical breed identity without an invented commercial type", () => {
  const source = read("../app/plemena/[slug]/page.tsx");
  assert.match(source, /<h1>\{breed\.name\}<\/h1>/);
  assert.match(source, /<dl className=\{styles\.factGrid\}/);
  assert.match(source, /idSuffix: "breed"/);
  assert.match(source, /about: \{ "@id": breedEntityId \}/);
  assert.match(source, /mainEntityId: breedEntityId/);
  assert.doesNotMatch(source, /"@type": "Product"|"@type": "LocalBusiness"|"@type": "ProfilePage"/);
});

test("EVENT public surface keeps visible facts aligned with the shared Event graph", () => {
  const detail = read("../components/event-detail.tsx");
  const route = read("../app/[section]/[slug]/page.tsx");
  const schema = read("../lib/event-schema.ts");
  for (const label of ["Termín", "Miesto", "Organizátor", "Aktualizované"]) assert.match(detail, new RegExp(label));
  assert.match(route, /buildEventJsonLd\(event, canonical\)/);
  assert.match(schema, /datePublished: event\.publishedAt \|\| event\.createdAt/);
  assert.match(schema, /dateModified: event\.updatedAt/);
  assert.match(schema, /"@type": "VirtualLocation"/);
  assert.match(schema, /"@type": "PostalAddress"/);
  assert.doesNotMatch(schema, /registrationUrl|offers:|priceCurrency|ProfilePage/);
});

test("ORGANIZATION public surface exposes canonical Organization identity, sameAs and update state", () => {
  const detail = read("../components/organization-profile-detail.tsx");
  const presentation = read("../lib/organization-profile-presentation.ts");
  const schema = read("../lib/organization-seo.ts");
  assert.match(detail, /<h1>\{organization\.name\}<\/h1>/);
  assert.match(detail, /DetailFactsCard title="Základné informácie"/);
  assert.match(presentation, /label: "Aktualizované"/);
  assert.match(schema, /"@type": "Organization"/);
  assert.match(schema, /"@type": "PostalAddress"/);
  assert.match(schema, /sameAs/);
  assert.match(schema, /dateModified: organization\.updatedAt/);
  assert.doesNotMatch(schema, /sourceUrl|lastVerifiedAt|ProfilePage/);
});

test("ADOPTION public surface uses a privacy-safe canonical dog main entity", () => {
  const route = read("../app/pomoc-psom/adopcia/[slug]/page.tsx");
  const detail = read("../components/adoption-detail.tsx");
  const schema = read("../lib/adoption-detail.ts");
  assert.match(route, /robots: seo\.indexable \? undefined : \{ index: false, follow: true \}/);
  assert.match(detail, /<h1>\{dog\.name\}<\/h1>/);
  assert.match(detail, /label: "Aktualizované"/);
  assert.match(schema, /idSuffix: "dog"/);
  assert.match(schema, /mainEntity: \{ "@id": dogEntity\["@id"\] \}/);
  assert.doesNotMatch(schema, /contactEmail.*dogEntity|contactPhone.*dogEntity|ProfilePage/);
});

test("LOST and FOUND surface preserves lifecycle index policy and excludes private contact data from schema", () => {
  const source = read("../components/lost-found-dog-detail.tsx");
  assert.match(source, /lostFoundStatusShouldIndex\(report\.status\)/);
  assert.match(source, /idSuffix: "dog-report"/);
  assert.match(source, /buildWebPageJsonLd\(\{/);
  assert.match(source, /datePublished: report\.publishedAt \|\| report\.createdAt/);
  assert.match(source, /dateModified: report\.updatedAt/);
  assert.match(source, /Telefón a e-mail oznamovateľa nie sú automaticky publikované/);
  assert.doesNotMatch(source, /report\.contactEmail|report\.contactPhone|ProfilePage/);
});

test("HELP public surface has canonical main entity and no public verification wording", () => {
  const route = read("../app/pomoc-psom/[category]/[slug]/page.tsx");
  const shell = read("../components/help-details/help-detail-shell.tsx");
  const types = read("../components/help-details/help-detail-types.tsx");
  assert.match(route, /idSuffix: "help-case"/);
  assert.match(route, /mainEntityId: helpEntity\["@id"\]/);
  assert.match(route, /dateModified: item\.updatedAt/);
  assert.match(shell, /Aktuálnosť a zdroje/);
  assert.match(shell, /Aktualizované:/);
  assert.doesNotMatch(shell + types, /Overené Psipediou|Posledná kontrola/);
});

test("DIRECTORY regression keeps PR #641 semantic fact and schema contracts unchanged", () => {
  const detail = read("../components/directory-profile-detail.tsx");
  const presentation = read("../lib/directory-detail-presentation.ts");
  const schema = read("../lib/directory-profile-schema.ts");
  assert.match(detail, /<h2 id="directory-basic-information">Základné informácie<\/h2>/);
  assert.match(detail, /<dl className=\{styles\.quickFactsList\}/);
  assert.match(presentation, /label: "Posledná aktualizácia"/);
  assert.match(schema, /"VeterinaryCare"/);
  assert.match(schema, /"Organization"/);
  assert.match(schema, /"LocalBusiness"/);
  assert.match(schema, /dateModified: profile\.updatedAt/);
  assert.match(schema, /sameAs/);
  assert.doesNotMatch(schema, /ProfilePage/);
});

test("sitemap keeps entity parity, real updated timestamps and excludes query/redirect duplicates", () => {
  const source = read("../app/sitemap.ts");
  for (const parityStage of [
    "parity-articles",
    "parity-events",
    "parity-directory",
    "parity-help",
    "parity-adoptions",
    "parity-organizations",
    "parity-lost-found",
    "parity-breeds",
  ]) {
    assert.match(source, new RegExp(parityStage));
  }
  assert.match(source, /lastModified: latestModified\(\[event\.updatedAt\]\)/);
  assert.match(source, /lastModified: latestModified\(\[item\.updatedAt\]\)/);
  assert.match(source, /lastModified: latestModified\(\[organization\.updatedAt\]\)/);
  assert.match(source, /SITEMAP_REDIRECT_SOURCES/);
  assert.match(source, /assertValidSitemap\(entries\)/);
});
