import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runAdminUploadQueue } from "../lib/admin-upload-queue.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("Uppy upload queue attempts every file with no more than two in flight", async () => {
  const files = ["one", "two", "three", "four", "five", "six"];
  let inFlight = 0;
  let peak = 0;
  const attempted = [];
  await runAdminUploadQueue(files, async (file) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    attempted.push(file);
    await new Promise((resolve) => setTimeout(resolve, 2));
    inFlight -= 1;
  });
  assert.equal(peak, 2);
  assert.deepEqual(attempted, files);
  assert.equal(inFlight, 0);
});

test("empty selection needs no uploader and per-file failures do not stop the queue", async () => {
  let called = 0;
  await runAdminUploadQueue([], async () => { called += 1; });
  assert.equal(called, 0);
  const attempted = [];
  const failures = [];
  await runAdminUploadQueue(["first", "bad", "last"], async (item) => {
    attempted.push(item);
    try {
      if (item === "bad") throw new Error("Invalid image");
    } catch (error) {
      failures.push(error.message);
    }
  });
  assert.deepEqual(attempted, ["first", "bad", "last"]);
  assert.deepEqual(failures, ["Invalid image"]);
});

test("all admin media thumbnails request bounded R2 variants without rewriting stored URLs", () => {
  const files = [
    "components/admin-photo-gallery.tsx",
    "components/admin-breed-editor.tsx",
    "components/admin-article-block-editor.tsx",
    "components/admin-article-editor.tsx",
    "components/admin-facebook-images.tsx",
  ];
  for (const path of files) {
    const source = read(path);
    assert.match(source, /responsiveMediaSrcSet\(/, path);
    assert.match(source, /sizes=/, path);
    assert.match(source, /loading="lazy"/, path);
    assert.match(source, /decoding="async"/, path);
  }
  const photo = read("components/admin-photo-gallery.tsx");
  assert.match(photo, /width=\{160\} height=\{128\}/);
  assert.match(photo, /onChange\(next\)/);
  assert.match(read("app/api/admin/uploads/route.ts"), /"authors", "breeds", "events"/);
  assert.match(read("lib/admin-image-upload.ts"), /fetch\("\/api\/admin\/uploads"/);
});
