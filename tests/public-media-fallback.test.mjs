import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("public missing media has one exported, CSS-scoped, accessible source", () => {
  const src = read("components/public-visual-system/public-media-fallback.tsx");
  const css = read("components/public-visual-system/public-media-fallback.module.css");
  const index = read("components/public-visual-system/index.ts");
  assert.ok(src.includes("export function PublicMediaFallback"));
  assert.ok(index.includes('export { PublicMediaFallback } from "./public-media-fallback"'));
  assert.match(src, /role=\{decorative \? undefined : "img"\}/);
  assert.match(src, /aria-label=\{decorative \? undefined : label\}/);
  assert.ok(src.includes("data-public-media-fallback"));
  assert.ok(src.includes('size === "detail"'));
  assert.ok(css.includes('[data-media-size="detail"]'));
  assert.doesNotMatch(src, /"use client"|fetch\(|localStorage|window\./);
});

test("public profiles retain real photos and show canonical fallback only when absent", () => {
  const card = read("components/directory-card.tsx");
  const directory = read("components/directory-profile-detail.tsx");
  const organization = read("components/public-profile/public-profile-hero.tsx");
  for (const src of [card, directory, organization]) {
    assert.ok(src.includes("<ImageDisplay"), "existing image renderer must remain");
    assert.ok(src.includes("<PublicMediaFallback"), "missing photo has one shared fallback");
  }
  assert.ok(card.includes("profile.imageUrl ? <ImageDisplay"));
  assert.ok(card.includes("styles.cardWithImage"), "no-photo cards keep the same media column");
  assert.ok(
    card.includes("publicLocationValue(profile.city"),
    "preserve canonical public-location sanitation from main",
  );
  assert.ok(
    card.includes("publicLocationLabel("),
    "preserve canonical location presentation from main",
  );
  assert.ok(directory.includes("config={presentation.detailImageDisplay}"));
  assert.ok(directory.includes('<PublicMediaFallback size="detail"'));
  assert.ok(organization.includes("config={imageConfig}"));
  assert.ok(organization.includes('<PublicMediaFallback size="detail"'));
});

test("article and breed listing cards reuse the same canonical missing-photo visual", () => {
  const articles = read("components/article-card.tsx");
  const breeds = read("components/breed-card.tsx");
  const shared = read("components/public-visual-system/public-media-fallback.tsx");

  // Real thumbnails remain untouched, including their responsive media contracts.
  assert.match(articles, /article\.image \? \(/);
  assert.match(articles, /<ImageDisplay/);
  assert.match(articles, /config=\{article\.thumbnailImageDisplay\}/);
  assert.match(articles, /responsiveMediaSrcSet\(article\.image,/);
  assert.match(articles, /omitMissingImage/);
  assert.match(articles, /article\.image \|\| !omitMissingImage/);
  assert.match(
    articles,
    /className="article-placeholder" aria-hidden="true"><PublicMediaFallback \/>/,
  );
  assert.doesNotMatch(articles, /<PawMark/);

  // Existing breed photo-error handling and FCI status overlay are preserved.
  assert.match(breeds, /breed\.image \? <BreedPhoto/);
  assert.match(
    breeds,
    /className="breed-card-placeholder" aria-hidden="true"><PublicMediaFallback \/>/,
  );
  assert.match(breeds, /className="fci-badge">FCI \{breed\.fciGroup\}/);
  assert.match(breeds, /aria-label=/);
  assert.doesNotMatch(breeds, /<PawMark/);

  // Both use the existing component, not new media assets or a second design.
  assert.match(
    articles,
    /import \{ PublicMediaFallback \} from "@\/components\/public-visual-system\/public-media-fallback"/,
  );
  assert.match(
    breeds,
    /import \{ PublicMediaFallback \} from "@\/components\/public-visual-system\/public-media-fallback"/,
  );
  assert.match(shared, /data-public-media-fallback/);
});
