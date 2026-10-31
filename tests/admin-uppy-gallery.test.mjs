import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Uppy gallery uses only the canonical admin API, with sequential bounded image uploads", () => {
  const uploader = read("components/admin-uppy-gallery-upload.tsx");
  const api = read("lib/admin-image-upload.ts");
  assert.match(uploader, /from "@uppy\/core"/);
  assert.match(uploader, /from "@uppy\/react\/dashboard-modal"/);
  assert.match(uploader, /uppy\.addUploader\(upload\)/);
  assert.match(uploader, /await uploadAdminImage\(file, props\.current\.folder\)/);
  assert.match(uploader, /for \(const id of fileIds\)/);
  assert.match(uploader, /MAX_ADMIN_IMAGE_BYTES/);
  assert.match(uploader, /maxNumberOfFiles: Math\.max\(1, remaining\)/);
  assert.match(uploader, /if \(item\.isRemote\) throw/);
  assert.doesNotMatch(uploader, /companionUrl|tus|aws-s3|transloadit|fetch\(/i);
  assert.match(api, /fetch\("\/api\/admin\/uploads"/);
  assert.match(api, /optimizeImage\(file\)/);
});

test("owner still saves gallery URLs; single-photo upload and all other APIs stay intact", () => {
  const gallery = read("components/admin-photo-gallery.tsx");
  const single = read("components/admin-single-image-upload.tsx");
  const layout = read("app/admin/layout.tsx");
  assert.match(gallery, /<AdminUppyGalleryUpload/);
  assert.match(gallery, /onUploaded=\{acceptUploaded\}/);
  assert.match(gallery, /onChange\(next\)/);
  assert.match(gallery, /Ulož zmeny profilu/);
  assert.match(gallery, /<AdminSortableGallery/);
  assert.match(gallery, /validateAdminPhotoGalleryUrl/);
  assert.match(single, /<AdminGalleryDropzone/);
  assert.match(layout, /@uppy\/dashboard\/css\/style\.min\.css/);
  assert.match(layout, /@uppy\/core\/css\/style\.min\.css/);
});
