import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

test("EDITOR-5: canonical tools share one presentational frame without owning persistence", () => {
  const frame = read("components/admin-editor-tool-frame.tsx");
  const css = read("components/admin-editor-tool-frame.module.css");
  for (const kind of ["image", "gallery", "map", "contacts", "relations", "seo"])
    assert.match(frame, new RegExp('\\| "' + kind + '"'));
  assert.match(frame, /data-admin-editor-tool=\{kind\}/);
  assert.match(css, /focus-visible/);
  assert.doesNotMatch(frame, /fetch\s*\(|\/api\/|D1|notion\.pages|window\.location|useEffect|onSubmit/);
});

test("EDITOR-5: existing upload, gallery, map, SEO and breed relation behavior remains canonical", () => {
  const components = [
    ["components/admin-single-image-upload.tsx", /<AdminEditorToolFrame kind="image">/],
    ["components/admin-photo-gallery.tsx", /<AdminEditorToolFrame kind="gallery">/],
    ["components/admin-profile-google-maps.tsx", /<AdminEditorToolFrame kind="map">/],
    ["components/admin-seo-fields.tsx", /<AdminEditorToolFrame kind="seo">/],
    ["components/admin-breed-relation-group.tsx", /<AdminEditorToolFrame kind="relations">/],
  ];
  for (const [path, pattern] of components) assert.match(read(path), pattern, path);
  const single = read("components/admin-single-image-upload.tsx");
  assert.match(single, /<AdminGalleryDropzone/);
  const gallery = read("components/admin-photo-gallery.tsx");
  assert.match(gallery, /<AdminUppyGalleryUpload/);
  assert.match(gallery, /<AdminSortableGallery/);
  assert.match(gallery, /validateAdminPhotoGalleryUrl/);
  assert.match(gallery, /onChange\(next\)/);
  assert.match(read("components/admin-sortable-gallery.tsx"), /gallerySortableIds\(urls\)/);
  assert.match(read("components/admin-sortable-gallery.tsx"), /data-admin-editor-tool="gallery-list"/);
  const map = read("components/admin-profile-google-maps.tsx");
  assert.match(map, /<AdminGooglePlacePicker/);
  assert.match(map, /cache: "no-store"/);
  assert.match(map, /Google Places discovery is deliberately/);
  assert.doesNotMatch(map, /useEffect\([\s\S]*?findLocation\(\)/);
  const relations = read("components/admin-breed-relation-group.tsx");
  assert.match(relations, /onToggle\(item\.id\)/);
  assert.match(relations, /signal: controller\.signal/);
  const seo = read("components/admin-seo-fields.tsx");
  assert.match(seo, /onChange\(\{ \.\.\.value, \[key\]: next \}\)/);
  assert.match(seo, /value\.noindex/);
});

test("EDITOR-5: directory, organizations and events reuse one contact presentation, without mixing internal and public addresses", () => {
  for (const path of [
    "components/admin-directory-editor.tsx",
    "components/admin-organization-editor.tsx",
    "components/admin-event-editor.tsx",
  ]) {
    assert.match(read(path), /<AdminEditorToolFrame kind="contacts">/, path);
  }
  const directory = read("components/admin-directory-editor.tsx");
  for (const id of ["directory-phone", "directory-public-email", "directory-email", "directory-facebook", "directory-instagram"])
    assert.match(directory, new RegExp('id="' + id + '"'));
  const event = read("components/admin-event-editor.tsx");
  assert.match(event, /id="event-registration"/);
  assert.match(event, /id="event-web"/);
  assert.doesNotMatch(read("components/admin-editor-tool-frame.tsx"), /value\?:|onSave\?:|onChange\?:/);
});
