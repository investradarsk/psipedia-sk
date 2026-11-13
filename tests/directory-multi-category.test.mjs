import test from "node:test";
import assert from "node:assert/strict";
import {
  DIRECTORY_ADDITIONAL_CATEGORIES_KEY,
  normalizeAdditionalDirectoryCategories,
  readAdditionalDirectoryCategories,
  mergeAdditionalDirectoryCategories,
  directoryCategoryMembershipSql,
} from "../lib/directory-multi-category.ts";

test("additional categories are validated, deduplicated, and exclude the primary", () => {
  assert.deepEqual(normalizeAdditionalDirectoryCategories(
    ["treneri", "hotely-a-opatrovanie", "treneri", "bogus"], "treneri",
  ), ["hotely-a-opatrovanie"]);
  assert.throws(() => mergeAdditionalDirectoryCategories({}, ["bogus"], "treneri"));
  assert.throws(() => mergeAdditionalDirectoryCategories({}, "hotely-a-opatrovanie", "treneri"));
});

test("untouched saves preserve categories and explicit clearing works", () => {
  const source = { [DIRECTORY_ADDITIONAL_CATEGORIES_KEY]: JSON.stringify(["hotely-a-opatrovanie"]) };
  assert.deepEqual(readAdditionalDirectoryCategories(
    mergeAdditionalDirectoryCategories({ ...source }, undefined, "treneri"), "treneri",
  ), ["hotely-a-opatrovanie"]);
  assert.deepEqual(readAdditionalDirectoryCategories(
    mergeAdditionalDirectoryCategories({ ...source }, [], "treneri"), "treneri",
  ), []);
});

test("secondary listing membership is parameterized", () => {
  assert.match(directoryCategoryMembershipSql(), /category = \?/);
  assert.match(directoryCategoryMembershipSql(), /json_each/);
  assert.throws(() => directoryCategoryMembershipSql("foo;drop"));
});
