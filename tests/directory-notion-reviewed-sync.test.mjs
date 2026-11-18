import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { planDirectoryReviewSync } from "../lib/directory-review-sync-policy.ts";

const mirror = await readFile(new URL("../lib/directory-notion-reviewed-sync.ts", import.meta.url), "utf8");
const sync = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");

test("first mirror uses canonical Admin review state; never imports old test checkboxes", () => {
  assert.equal(planDirectoryReviewSync({ adminReviewed: true, notionReviewed: false, baseline: null }), "push");
  assert.equal(planDirectoryReviewSync({ adminReviewed: false, notionReviewed: true, baseline: null }), "push");
  assert.equal(planDirectoryReviewSync({ adminReviewed: false, notionReviewed: false, baseline: null }), "acknowledge");
});

test("later Notion edits pull and later Admin edits push without record-wide timestamps", () => {
  assert.equal(planDirectoryReviewSync({ adminReviewed: false, notionReviewed: true, baseline: false }), "pull");
  assert.equal(planDirectoryReviewSync({ adminReviewed: true, notionReviewed: false, baseline: false }), "push");
  assert.equal(planDirectoryReviewSync({ adminReviewed: true, notionReviewed: true, baseline: false }), "acknowledge");
  assert.equal(planDirectoryReviewSync({ adminReviewed: false, notionReviewed: false, baseline: false }), "unchanged");
  assert.equal(planDirectoryReviewSync({ adminReviewed: true, notionReviewed: false, baseline: true }), "push");
  assert.equal(planDirectoryReviewSync({ adminReviewed: false, notionReviewed: true, baseline: true }), "push");
});

test("review mirror uses fixed Notion field, strict mapped identity and D1 CAS", () => {
  assert.match(mirror, /DIRECTORY_REVIEW_NOTION_PROPERTY = "Odkontrolované"/);
  assert.match(mirror, /notionDirectoryPageBelongsToSource/);
  assert.match(mirror, /notionRichTextProperty\(input\.page, "Psipedia ID"\)/);
  assert.match(mirror, /AND source_data_json=\? RETURNING id/);
  assert.match(mirror, /mergeDirectoryProfileReviewMetadata/);
  assert.doesNotMatch(mirror, /Kontrola AI/);
});

test("Admin checkbox and both Notion sweep paths call the isolated review mirror", () => {
  assert.match(route, /syncDirectoryReviewedWithNotion/);
  assert.match(sync, /syncDirectoryReviewedWithNotion/);
  assert.match(sync, /"Odkontrolované": checkbox\(Boolean\(profile\.reviewed\)\)/);
});

test("reviewed profiles are excluded from targeted, recent-page and changed-D1 Notion sync", () => {
  assert.match(sync, /if \(!profile \|\| profile\.reviewed\) return "unchanged" as const/);
  assert.match(sync, /if \(current\?\.reviewed\) \{ summary\.unchanged\+\+; continue; \}/);
  assert.match(sync, /if \(profile\.reviewed\) return "skipped" as const/);
  assert.match(sync, /profile\.reviewed \|\| \["chovatelske-stanice"/);
  assert.match(sync, /changedProfile\?\.reviewed/);
});
