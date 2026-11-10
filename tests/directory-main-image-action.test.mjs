import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  directoryMainImageMatches,
  parseDirectoryMainImageAction,
} from "../lib/directory-main-image-action.ts";

const key1 = "directory/2026/12345678-1234-1234-1234-1234567890ab.webp";
const key2 = "directory/2026/abcdefab-1234-1234-1234-abcdefabcdef.png";
const url1 = "/media/" + key1;
const url2 = "/media/" + key2;
const read = p => readFileSync(new URL("../" + p, import.meta.url), "utf8");

test("clear an existing Directory photo with no replacement", () => {
  const request = parseDirectoryMainImageAction("remove", null, null);
  assert.deepEqual(request, { kind: "remove", imageUrl: null, imageKey: null });
  assert.equal(directoryMainImageMatches({ imageUrl: url1, imageKey: key1 }, request), false);
  assert.equal(directoryMainImageMatches({ imageUrl: null, imageKey: null }, request), true);
});

test("remove, upload, save must commit the NEW URL and key", () => {
  const request = parseDirectoryMainImageAction("replace", url2, key2);
  assert.deepEqual(request, { kind: "replace", imageUrl: url2, imageKey: key2 });
  assert.equal(directoryMainImageMatches({ imageUrl: null, imageKey: null }, request), false);
  assert.equal(directoryMainImageMatches({ imageUrl: url2, imageKey: key1 }, request), false);
  assert.equal(directoryMainImageMatches({ imageUrl: url2, imageKey: key2 }, request), true);
});

test("new photo upload from an empty profile is a replacement, not a stale clear", () => {
  assert.deepEqual(parseDirectoryMainImageAction("replace", url1, key1), {
    kind: "replace", imageUrl: url1, imageKey: key1,
  });
  assert.deepEqual(parseDirectoryMainImageAction("keep", null, null), { kind: "keep" });
  assert.equal(parseDirectoryMainImageAction(undefined, null, null), null);
});

test("reject mismatched keys and arbitrary remote URLs", () => {
  for (const [url, key] of [
    [url1, key2], ["https://example.com/photo.webp", key1],
    ["/media/directory/2026/../../danger.webp", "directory/2026/../../danger.webp"],
    ["/media/directory/2026/non-uuid.webp", "directory/2026/non-uuid.webp"],
    ["", key1], [url1, ""],
  ]) {
    assert.throws(() => parseDirectoryMainImageAction("replace", url, key),
      /DIRECTORY_IMAGE_REPLACEMENT_INVALID/);
  }
  assert.throws(() => parseDirectoryMainImageAction("overwrite", url1, key1),
    /DIRECTORY_IMAGE_ACTION_INVALID/);
});

test("Admin sends media intent separately from editorial fields and verifies D1", () => {
  const editor = read("components/admin-directory-editor.tsx");
  const route = read("app/api/admin/directory/[id]/route.ts");
  assert.match(editor, /replaceMainImageRequestedRef\.current = \{ imageUrl: data\.imageUrl, imageKey: data\.imageKey \}/);
  assert.match(editor, /replaceMainImageRequestedRef\.current = null; removeMainImageRequestedRef\.current = true/);
  assert.match(editor, /\? "remove" : imageReplacement \? "replace" : "keep"/);
  assert.match(editor, /mainImageAction/);
  assert.match(editor, /data\.profile\.imageUrl !== imageReplacement\.imageUrl/);
  assert.match(route, /parseDirectoryMainImageAction/);
  assert.match(route, /await bucket\.head\(mainImageAction\.imageKey\)/);
  assert.match(route, /directoryMainImageMatches\(verifiedMedia, requestedMedia\)/);
  assert.match(route, /mirrorDirectoryMainImageToNotion/);
  assert.match(route, /recordDirectoryNotionAlert/);
});

test("old Directory R2 photo is not deleted while another profile still references it", () => {
  const route = read("app/api/admin/directory/[id]/route.ts");
  const shared = read("lib/notion-sync-shared.ts");
  assert.match(route, /cleanupUnreferencedNotionUpload\(db,/);
  assert.match(shared, /SELECT 1 AS used FROM directory_profiles WHERE image_key = \?/);
});
