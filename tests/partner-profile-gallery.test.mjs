import test from "node:test";
import assert from "node:assert/strict";
import { readProfileGallery, mergeProfileGallery, normalizeProfileGalleryUrls } from "../lib/partner-profile-gallery.ts";
import { DIRECTORY_BREEDER_GALLERY_KEY } from "../lib/directory-breeder-gallery.ts";

test("gallery round-trips on veterinarian, salon and organization profiles", () => {
  const urls = ["/media/directory/a.webp", "https://example.sk/photos/b.webp"];
  for (const category of ["veterinari", "salony-a-sluzby", null]) {
    const input = { existing: "preserve", "Otváracie hodiny": "Po–Pi 9–17" };
    const updated = mergeProfileGallery(input, urls, category);
    assert.equal(updated.existing, "preserve");
    assert.deepEqual(readProfileGallery(updated, category), urls);
    assert.deepEqual(readProfileGallery(mergeProfileGallery(updated, [], category), category), []);
  }
});

test("breeder gallery keeps its existing metadata key and URLs", () => {
  const input = { [DIRECTORY_BREEDER_GALLERY_KEY]: '["/media/directory/old.webp"]' };
  assert.deepEqual(readProfileGallery(input, "chovatelske-stanice"), ["/media/directory/old.webp"]);
  const output = mergeProfileGallery(input, ["/media/directory/new.webp"], "chovatelske-stanice");
  assert.deepEqual(readProfileGallery(output, "chovatelske-stanice"), ["/media/directory/new.webp"]);
});

test("unsafe, duplicate and oversized gallery entries are refused", () => {
  assert.throws(() => normalizeProfileGalleryUrls(["javascript:alert(1)"]), /Neplatná/);
  assert.throws(() => normalizeProfileGalleryUrls(["/media/one.webp", "/media/one.webp"]), /dvakrát/);
  assert.throws(() => normalizeProfileGalleryUrls(Array(7).fill("/media/one.webp")), /najviac 6/);
  assert.deepEqual(normalizeProfileGalleryUrls(["/images/example.jpg"]), ["/images/example.jpg"]);
});
