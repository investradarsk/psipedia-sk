import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("ARTICLE public surface already exposes canonical editorial identity and dates", () => {
  const source = read("../components/article-detail.tsx");
  for (const pattern of [
    /title=\{article\.title\}/,
    /Publikované <time dateTime=\{article\.dateIso\}>/,
    /Aktualizované\{" "\}\s*<time dateTime=\{article\.updatedDateIso\}>/,
    /section === "novinky" \? "NewsArticle" : "Article"/,
    /author: articleAuthorJsonLd\(authorName\)/,
    /"@type": "BreadcrumbList"/,
    /relatedBreeds/,
  ])
    assert.match(source, pattern);
});

test("BREED public surface has a canonical breed identity without an invented commercial type", () => {
  const source = read("../app/plemena/[slug]/page.tsx");
  assert.match(source, /<h1>\{\s*breed\s*\.name\s*\}<\/h1>/);
  assert.match(source, /<dl\s*className=\{\s*styles\s*\.factGrid\s*\}/);
  assert.match(source, /idSuffix:\s*"breed"/);
  assert.match(source, /about:\s*\{\s*"@id":\s*breedEntityId\s*\}/);
  assert.match(source, /mainEntityId:\s*breedEntityId/);
  assert.doesNotMatch(
    source,
    /"@type":\s*"Product"|"@type":\s*"LocalBusiness"|"@type":\s*"ProfilePage"/,
  );
  assert.doesNotMatch(source, />Overené\s*informácie</);
});

test("EVENT public surface keeps visible facts aligned with the shared Event graph", () => {
  const detail = read("../components/event-detail.tsx");
  const route = read("../app/[section]/[slug]/page.tsx");
  const schema = read("../lib/event-schema.ts");
  for (const label of ["Termín", "Miesto", "Organizátor", "Aktualizované"])
    assert.match(detail, new RegExp(label));
  assert.match(route, /buildEventJsonLd\(\s*event,\s*canonical\s*\)/);
  assert.match(schema, /datePublished:\s*event\s*\.publishedAt\s*\|\|\s*event\s*\.createdAt/);
  assert.match(schema, /dateModified:\s*event\s*\.updatedAt/);
  assert.match(schema, /"@type":\s*"VirtualLocation"/);
  assert.match(schema, /"@type":\s*"PostalAddress"/);
  assert.doesNotMatch(schema, /registrationUrl|offers:|priceCurrency|ProfilePage/);
});

test("ORGANIZATION public surface exposes canonical Organization identity, sameAs and update state", () => {
  const detail = read("../components/organization-profile-detail.tsx");
  const presentation = read("../lib/organization-profile-presentation.ts");
  const schema = read("../lib/organization-seo.ts");
  const sharedHero = read("../components/public-profile/public-profile-hero.tsx");
  assert.match(detail, /title=\{\s*organization\s*\.name\s*\}/);
  assert.match(
    sharedHero,
    /<PublicHeading[^>]*as="h1"[^>]*data-long-title=\{\s*title\s*\.length\s*>=\s*70\s*\?\s*""\s*:\s*undefined\s*\}>\s*\{\s*title\s*\}\s*<\/PublicHeading>/,
  );
  assert.match(detail, /DetailFactsCard\s*title="Základné\s*informácie"/);
  assert.match(presentation, /label:\s*"Aktualizované"/);
  assert.match(schema, /"@type":\s*"Organization"/);
  assert.match(schema, /"@type":\s*"PostalAddress"/);
  assert.match(schema, /sameAs/);
  assert.match(schema, /dateModified:\s*organization\s*\.updatedAt/);
  assert.doesNotMatch(schema, /sourceUrl|lastVerifiedAt|ProfilePage/);
});

test("ADOPTION public surface uses a privacy-safe canonical dog main entity", () => {
  const route = read("../app/pomoc-psom/adopcia/[slug]/page.tsx");
  const detail = read("../components/adoption-detail.tsx");
  const schema = read("../lib/adoption-detail.ts");
  assert.match(
    route,
    /robots:\s*seo\s*\.indexable\s*\?\s*undefined\s*:\s*\{\s*index:\s*false,\s*follow:\s*true\s*\}/,
  );
  assert.match(detail, /<h1>\{\s*dog\s*\.name\s*\}<\/h1>/);
  assert.match(detail, /label:\s*"Aktualizované"/);
  assert.match(schema, /idSuffix:\s*"dog"/);
  assert.match(schema, /mainEntity:\s*\{\s*"@id":\s*dogEntity\[\s*"@id"\s*\]\s*\}/);
  assert.doesNotMatch(schema, /contactEmail.*dogEntity|contactPhone.*dogEntity|ProfilePage/);
  assert.doesNotMatch(
    detail,
    /Overenie\s*profilu|Posledné\s*overenie|Profil\s*potrebuje\s*nové\s*overenie/,
  );
});

test("LOST and FOUND surface preserves lifecycle index policy and excludes private contact data from schema", () => {
  const source = read("../components/lost-found-dog-detail.tsx");
  assert.match(source, /lostFoundStatusShouldIndex\(\s*report\s*\.status\s*\)/);
  assert.match(source, /idSuffix:\s*"dog-report"/);
  assert.match(source, /buildWebPageJsonLd\(\s*\{\s*/);
  assert.match(source, /datePublished:\s*report\s*\.publishedAt\s*\|\|\s*report\s*\.createdAt/);
  assert.match(source, /dateModified:\s*report\s*\.updatedAt/);
  assert.match(
    source,
    /Telefón\s*a\s*e-mail\s*oznamovateľa\s*nie\s*sú\s*automaticky\s*publikované/,
  );
  assert.doesNotMatch(source, /report\s*\.contactEmail|report\s*\.contactPhone|ProfilePage/);
});

test("HELP public surface has canonical main entity and no public verification wording", () => {
  const route = read("../app/pomoc-psom/[category]/[slug]/page.tsx");
  const shell = read("../components/help-details/help-detail-shell.tsx");
  const types = read("../components/help-details/help-detail-types.tsx");
  assert.match(route, /idSuffix:\s*"help-case"/);
  assert.match(route, /mainEntityId:\s*helpEntity\[\s*"@id"\s*\]/);
  assert.match(route, /dateModified:\s*item\s*\.updatedAt/);
  assert.match(shell, /Aktuálnosť\s*a\s*zdroje/);
  assert.match(shell, /Aktualizované:/);
  assert.doesNotMatch(shell + types, /Overené\s*Psipediou|Posledná\s*kontrola/);
});

test("DIRECTORY regression keeps PR #641 semantic fact and schema contracts unchanged", () => {
  const detail = read("../components/directory-profile-detail.tsx");
  const presentation = read("../lib/directory-detail-presentation.ts");
  const schema = read("../lib/directory-profile-schema.ts");
  assert.match(
    detail,
    /<DetailContactsCard\s+id="directory-profile-contact"\s+title="Adresa a kontakt"/,
  );
  assert.match(read("../components/detail-primitives/detail-primitives.tsx"), /<DetailFactList/);
  assert.match(presentation, /label:\s*"Posledná\s*aktualizácia"/);
  assert.match(schema, /"VeterinaryCare"/);
  assert.match(schema, /"Organization"/);
  assert.match(schema, /"LocalBusiness"/);
  assert.match(schema, /dateModified:\s*profile\s*\.updatedAt/);
  assert.match(schema, /sameAs/);
  assert.doesNotMatch(schema, /ProfilePage/);
});

test("sitemap keeps entity parity, real updated timestamps and excludes query/redirect duplicates", () => {
  const source = read("../app/sitemap.ts");
  const organizationSitemap = read("../lib/organization-sitemap.ts");
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
  assert.match(source, /lastModified:\s*latestModified\(\s*\[\s*event\s*\.updatedAt\s*\]\s*\)/);
  assert.match(source, /lastModified:\s*latestModified\(\s*\[\s*item\s*\.updatedAt\s*\]\s*\)/);
  assert.match(source, /buildOrganizationSitemapEntries\(\s*organizations\s*\)/);
  assert.match(
    organizationSitemap,
    /latestModified\(\s*\[\s*organization\s*\.updatedAt,\s*organization\s*\.publishedAt\s*\]\s*\)/,
  );
  assert.match(source, /SITEMAP_REDIRECT_SOURCES/);
  assert.match(source, /assertValidSitemap\(\s*entries\s*\)/);
});
