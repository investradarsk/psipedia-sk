import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public directory reads stay compatible before archived_at migration reaches production", async () => {
  const source = await readFile(new URL("../lib/directory-store.ts", import.meta.url), "utf8");

  assert.match(source, /const DIRECTORY_PUBLIC_PROFILE_COLUMNS = DIRECTORY_PROFILE_COLUMNS\.replace/);
  assert.match(source, /published_at, NULL AS archived_at, created_by/);

  for (const signature of [
    "getPublishedDirectoryProfiles",
    "getFeaturedDirectoryProfiles",
    "getPublishedDirectoryProfileUncached",
    "createDirectoryInquiry",
    "createDirectoryProfileChangeRequest",
  ]) {
    const start = source.indexOf(`function ${signature}`) >= 0
      ? source.indexOf(`function ${signature}`)
      : source.indexOf(`const ${signature}`);
    assert.notEqual(start, -1, signature);
    const end = source.indexOf("\n}", start);
    const block = source.slice(start, end === -1 ? start + 4000 : end + 2);
    assert.match(block, /DIRECTORY_PUBLIC_PROFILE_COLUMNS/, signature);
  }

  const adminStart = source.indexOf("function getManagedDirectoryProfileById");
  const adminBlock = source.slice(adminStart, adminStart + 700);
  assert.match(adminBlock, /DIRECTORY_PROFILE_COLUMNS/);
  assert.doesNotMatch(adminBlock, /DIRECTORY_PUBLIC_PROFILE_COLUMNS/);
});
