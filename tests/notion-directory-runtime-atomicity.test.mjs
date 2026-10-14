import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
const shared = await readFile(new URL("../lib/notion-sync-shared.ts", import.meta.url), "utf8");
const geoSource = await readFile(new URL("../lib/geoapify-geocoder.ts", import.meta.url), "utf8");

const createBody = source.slice(source.indexOf("async function createProfileFromNotion"), source.indexOf("async function applyNotionToProfile"));
const updateBody = source.slice(source.indexOf("async function applyNotionToProfile"), source.indexOf("async function recentNotionPages"));

test("Geoapify native fetch is invoked lexically rather than as a bound instance method", () => {
  assert.match(geoSource, /options\.fetchImpl \?\? \(\(\.\.\.args: Parameters<typeof fetch>\) => fetch\(\.\.\.args\)\)/);
  assert.match(geoSource, /this\.fetchImpl\(url/);
});

test("create validates canonical input and exact service address before R2 upload", () => {
  assert.ok(createBody.indexOf("normalizeManagedDirectoryProfileInput(payload)") < createBody.indexOf("prepareNotionMainImage"));
  assert.ok(createBody.indexOf("verifyDirectoryCanonicalAddress") < createBody.indexOf("prepareNotionMainImage"));
  assert.ok(createBody.indexOf("sameDirectoryIdentity") < createBody.indexOf("prepareNotionMainImage"));
});

test("update rejects downgrade, checks address and canonical input before R2 upload", () => {
  for (const name of ["blocksConfirmedAddressDowngrade", "verifyDirectoryCanonicalAddress", "normalizeManagedDirectoryProfileInput"]) {
    assert.ok(updateBody.indexOf(name) >= 0 && updateBody.indexOf(name) < updateBody.indexOf("prepareNotionMainImage"), name);
  }
});

test("archive restoration is part of a guarded canonical update", () => {
  assert.doesNotMatch(updateBody, /restoreManagedDirectoryProfile\(/);
  assert.match(updateBody, /restoreArchived: current\.status === "archived"/);
  assert.match(updateBody, /expectedUpdatedAt: current\.updatedAt/);
  assert.match(store, /archived_at = CASE WHEN \?=1 THEN NULL ELSE archived_at END/);
  assert.match(store, /if \(existing\.status === "archived" && !guard\?\.restoreArchived\)/);
});

test("ambiguous database commit never triggers blind R2 removal", () => {
  const cleanup = shared.slice(shared.indexOf("export async function cleanupUnreferencedNotionUpload"));
  assert.match(cleanup, /SELECT 1 AS used FROM directory_profiles WHERE image_key = \? LIMIT 1/);
  assert.match(cleanup, /if \(!referenced\) await cleanupNotionImageKeys/);
  assert.match(cleanup, /catch \{/);
  assert.doesNotMatch(createBody, /cleanupNotionImageKeys\(input\.bindings\.BUCKET, \[prepared\.uploadedKey\]\)/);
  assert.doesNotMatch(updateBody, /cleanupNotionImageKeys\(input\.bindings\.BUCKET, \[prepared\.uploadedKey\]\)/);
});
