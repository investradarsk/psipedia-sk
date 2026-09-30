import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const metadata = readFileSync(new URL("../lib/directory-profile-metadata.ts", import.meta.url), "utf8");
const store = readFileSync(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
const adminQuery = readFileSync(new URL("../lib/directory-admin-query.ts", import.meta.url), "utf8");
const adminStore = readFileSync(new URL("../lib/directory-admin-store.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../components/admin-directory-dashboard.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../components/admin-directory-editor.tsx", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../app/admin/adresar/[id]/page.tsx", import.meta.url), "utf8");

test("profile review is private admin metadata and does not need a schema migration", () => {
  assert.match(metadata, /profileReviewKeyPrefix = "_psipedia_profile_review_"/);
  assert.match(metadata, /readDirectoryProfileReviewMetadata/);
  assert.match(metadata, /mergeDirectoryProfileReviewMetadata/);
  assert.match(metadata, /key\.startsWith\(profileReviewKeyPrefix\)/);
  assert.match(store, /UPDATE directory_profiles SET source_data_json = \? WHERE id = \? RETURNING \*/);
});

test("managed profile reads and admin lists expose reviewed state", () => {
  assert.match(store, /reviewed: reviewMetadata\.reviewed/);
  assert.match(store, /reviewedAt: reviewMetadata\.reviewedAt/);
  assert.match(adminQuery, /image_url, source_data_json, verified/);
  assert.match(adminStore, /readDirectoryProfileReviewMetadata/);
  assert.match(adminStore, /reviewed: reviewMetadata\.reviewed/);
});

test("review checkbox can be changed from both list and detail", () => {
  for (const source of [dashboard, editor]) {
    assert.match(source, /action: "set-reviewed"/);
    assert.match(source, /Odkontrolované/);
    assert.match(source, /type="checkbox"/);
  }
  assert.match(api, /body\.action === "set-reviewed"/);
  assert.match(api, /setManagedDirectoryProfileReviewed/);
});

test("published profile detail links directly to its public page in a new tab", () => {
  assert.match(detailPage, /directoryProfileHref\(profile\)/);
  assert.match(detailPage, /Otvoriť verejný profil ↗/);
  assert.match(detailPage, /target="_blank"/);
  assert.match(detailPage, /profile\.status === "published"/);
});
