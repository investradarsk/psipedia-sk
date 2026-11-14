import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { directoryCategories } from "../lib/directory.ts";
import { getDirectoryDetailPresentation } from "../lib/directory-detail-presentation.ts";
import { DIRECTORY_BREEDER_GALLERY_KEY, DIRECTORY_BREEDER_GALLERY_LIMIT, readDirectoryBreederGallery, mergeDirectoryBreederGallery } from "../lib/directory-breeder-gallery.ts";
import { isDirectoryInternalMetadataKey } from "../lib/directory-profile-metadata.ts";

const source = readFileSync("components/directory-profile-detail.tsx", "utf8");
const css = readFileSync("components/directory-profile-detail.module.css", "utf8");
const sharedHero = readFileSync("components/public-profile/public-profile-hero.tsx", "utf8");
const detailPrimitives = readFileSync("components/detail-primitives/detail-primitives.tsx", "utf8");
const detailStyles = readFileSync("components/detail-primitives/detail-primitives.module.css", "utf8");

test("directory detail remains single layout for all 10 supported categories", () => {
  assert.equal(directoryCategories.length, 10);
  assert.match(source, /export function DirectoryProfileDetail/);
  assert.match(source, /getDirectoryCategory\(presentation\.category\)/);
  assert.doesNotMatch(source, /import.*PublicProfileHero/);
  assert.match(sharedHero, /export function PublicProfileHero/);
  assert.match(source, /<DetailHero\s+kind="directory"\s+mediaPresentation="compact"/);
  assert.match(detailPrimitives, /data-directory-profile-hero=\{kind === "directory" \? "" : undefined\}/);
});

test("shared detail shows the service photo before copy visually on mobile while preserving no-photo and natural modes", () => {
  assert.match(detailPrimitives, /data-public-profile-media/);
  assert.match(detailPrimitives, /className=\{styles\.heroMedia\}/);
  assert.match(detailStyles, /\.heroFrame\[data-media-presentation="compact"\] \.heroMedia\s*\{[^}]*grid-row:\s*1;/);
  assert.match(detailStyles, /\.heroFrame\[data-media-presentation="compact"\] \.heroCopy\s*\{[^}]*grid-row:\s*2;/);
  assert.match(source, /presentation\.imageUrl \? \(/);
  assert.match(source, /context="detail"/);
  assert.match(source, /config=\{presentation\.detailImageDisplay\}/);
  assert.match(source, /loading="eager"/);
  assert.match(source, /fetchPriority="high"/);
  assert.match(source, /<PublicMediaFallback/);
  assert.match(detailStyles, /\.heroMedia:has\(\[data-image-display="natural"\]\)/);
});

test("semantic mobile order follows description, contact, services, specialist data, maps, reviews, relations and form", () => {
  const order = [
    'title="O službe"',
    'id="directory-profile-contact"',
    'title="Poskytované služby"',
    'title={presentation.health?.title',
    '<PublicLocationMap',
    '<ProfileReviewSection',
    '<RelatedEntityLinks',
    '<RelatedBreedList',
    '<DirectoryContactForm',
  ];
  const locations = order.map((needle) => source.indexOf(needle));
  assert.ok(locations.every((n) => n !== -1), "All ordered sections must exist: " + locations);
  assert.ok(locations.every((n, i) => i === 0 || n > locations[i - 1]), "Logical DOM order must be stable");
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.match(css, /@media \(max-width: 680px\)/);
  assert.match(css, /@media \(max-width: 360px\)/);
});

test("map gate, CTA, real reviews and inquiry form remain wired to existing components", () => {
  assert.match(source, /isApproximateMapItem\(mapItem\)/);
  assert.match(source, /buildGoogleMapsDirectionsUrl/);
  assert.match(source, /href="#kontakt"/);
  assert.match(source, /<PublicLocationMap/);
  assert.match(source, /<ProfileReviewSection/);
  assert.match(source, /<DirectoryContactForm profileId=\{presentation.id\}/);
});

test("opening hours display only when present, without guessing an unavailable value", () => {
  const p = {
    id: 101, slug: "veterinar-test", name: "Ambulancia test", category: "veterinari",
    excerpt: "Test", description: "", services: [], qualifications: [], city: "Nitra",
    district: "", region: "", address: "", priceNote: "", imageUrl: null,
    websiteUrl: null, verified: false, featured: false, updatedAt: "", seo: {},
    importData: { "Ordinačné hodiny": "Po–Pi 9:00–17:00" },
  };
  assert.equal(getDirectoryDetailPresentation(p).openingHours, "Po–Pi 9:00–17:00");
  assert.equal(getDirectoryDetailPresentation({ ...p, importData: { "Ordinačné hodiny": "Neoverené" } }).openingHours, null);
});


test("breeder gallery metadata round-trips six ordered URLs without affecting unrelated profile data", () => {
  const urls = Array.from({ length: DIRECTORY_BREEDER_GALLERY_LIMIT }, (_, i) => `/media/directory/steniatko-${i}.webp`);
  const existing = { "Plemeno": "Zlatý retriever", "nested_legacy": null };
  const stored = mergeDirectoryBreederGallery(existing, "chovatelske-stanice", urls);
  assert.deepEqual(readDirectoryBreederGallery(stored), urls);
  assert.equal(stored.Plemeno, "Zlatý retriever");
  assert.equal(stored.nested_legacy, null);
  assert.equal(isDirectoryInternalMetadataKey(DIRECTORY_BREEDER_GALLERY_KEY), true);
  const preserved = mergeDirectoryBreederGallery(stored, "chovatelske-stanice", undefined);
  assert.deepEqual(readDirectoryBreederGallery(preserved), urls,
    "Notion and unrelated edits omit galleryUrls and must not delete the saved gallery");
  const cleared = mergeDirectoryBreederGallery(stored, "chovatelske-stanice", []);
  assert.deepEqual(readDirectoryBreederGallery(cleared), []);
  assert.equal(Object.hasOwn(cleared, DIRECTORY_BREEDER_GALLERY_KEY), false);
});

test("breeder gallery rejects unsafe, duplicated, oversized and wrong-category writes", () => {
  const save = (category, urls) => mergeDirectoryBreederGallery({}, category, urls);
  assert.throws(() => save("chovatelske-stanice", ["javascript:alert(1)"]), /Neplatná URL/);
  assert.throws(() => save("chovatelske-stanice", ["/media/directory/a.webp", "/media/directory/a.webp"]), /dvakrát/);
  assert.throws(() => save("chovatelske-stanice", Array.from({ length: 7 }, (_, i) => `/media/${i}.webp`)), /najviac/);
  assert.throws(() => save("veterinari", ["/media/directory/a.webp"]), /len pre chovateľské stanice/);
  assert.deepEqual(save("veterinari", []), {}, "empty optional gallery from an old full-profile form must be a no-op");
  assert.deepEqual(readDirectoryBreederGallery({ [DIRECTORY_BREEDER_GALLERY_KEY]: "invalid JSON" }), []);
  assert.deepEqual(readDirectoryBreederGallery({ [DIRECTORY_BREEDER_GALLERY_KEY]: '["javascript:alert(1)","/media/directory/ok.webp"]' }), ["/media/directory/ok.webp"]);
});

test("public gallery is available on every directory profile while Admin breeder controls remain", () => {
  const admin = readFileSync("components/admin-directory-editor.tsx", "utf8");
  const store = readFileSync("lib/directory-store.ts", "utf8");
  const detailPresentation = readFileSync("lib/directory-detail-presentation.ts", "utf8");
  const partner = readFileSync("components/partner-profile-edit-form.tsx", "utf8");
  assert.match(admin, /<AdminPhotoGallery[\s\S]*?folder="directory"/);
  assert.match(store, /mergeDirectoryBreederGallery\(qualitySourceData, category, payload\.galleryUrls\)/);
  assert.match(store, /readProfileGallery\(safeImportData\(row\.source_data_json, true\), row\.category\)/);
  assert.match(detailPresentation, /galleryUrls: profile\.galleryUrls \?\? \[\]/);
  assert.match(source, /<PublicPhotoGallery/);
  assert.match(source, /profileGallery\.length/);
  assert.match(source, /url !== presentation\.imageUrl/);
  assert.match(source, /title="Galéria"/);
  assert.match(partner, /<PartnerGalleryField/);
});
