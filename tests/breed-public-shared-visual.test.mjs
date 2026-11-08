import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("breed profile composes the canonical public detail shell and shared cards", () => {
  const page = read("app/plemena/[slug]/page.tsx");
  const css = read("app/plemena/[slug]/breed-profile.module.css");
  const shared = read("components/detail-primitives/detail-primitives.tsx");

  assert.match(page, /import \{ DetailHero, PublicDetailLayout \}/);
  assert.match(page, /<DetailHero\s+kind="breed"/);
  assert.match(page, /<PublicDetailLayout\s+mode="inline"/);
  assert.match(page, /data-testid="breed-content-layout"/);
  assert.match(shared, /data-public-detail-layout/);
  assert.ok(page.indexOf('<article className={styles.mainColumn}>') < page.indexOf('data-testid="breed-utility-sidebar"'));
  assert.match(css, /composes: section from "\.\.\/\.\.\/\.\.\/components\/detail-primitives\/detail-primitives\.module\.css"/);
  assert.match(css, /composes: factTiles from "\.\.\/\.\.\/\.\.\/components\/detail-primitives\/detail-primitives\.module\.css"/);
  assert.doesNotMatch(css, /grid-template-columns: minmax\(0, 1fr\) minmax\(230px, 280px\)/);
  assert.match(css, /\.page \.readingSection h2/);
  assert.match(css, /\.page \.quickFacts \.factGrid > div/);
});

test("breed profile keeps data, image fallback, navigation, full gallery and relations", () => {
  const page = read("app/plemena/[slug]/page.tsx");
  for (const part of [
    'data-testid="breed-hero-photo"',
    'data-image-fallback="breed-photo"',
    'data-testid="breed-quick-facts"',
    '<BreedSectionNav items={sectionNavItems} />',
    'data-testid="breed-fit"',
    '<BreedProfileAccordion',
    'data-testid="breed-sports"',
    'data-testid="breed-fci-cta"',
    'data-testid="breed-utility-sidebar"',
    'maxImages={gallery.length}',
    'renderImage={(image) => <BreedPhoto',
    'relations.breedingStations',
    'relations.breedClubs',
    'relations.similarBreeds',
    'relatedArticles',
  ]) assert.ok(page.includes(part), part);
  assert.match(page, /<section className=\{`shell \$\{styles\.gallerySection\}\`\} aria-labelledby="breed-gallery-heading">/);
  assert.match(page, /<PublicPhotoGallery\s+variant="breed"/);
  assert.match(read("app/plemena/[slug]/breed-profile.module.css"), /\.page \.gallerySection \.galleryGrid img/);
});

test("shared public visuals remain limited to breed detail and do not touch sync", () => {
  const page = read("app/plemena/[slug]/page.tsx");
  assert.doesNotMatch(page, /NOTION_BREED_WORKCOPY_SYNC_ENABLED|NOTION_BREED_SYNC_ENABLED/);
  assert.match(page, /getPublishedBreed\(slug\)/);
  assert.match(page, /getBreedDetailRelations/);
  const shared = read("components/detail-primitives/detail-primitives.module.css");
  assert.match(shared, /data-public-detail-hero="breed"/);
});
