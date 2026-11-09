import test from "node:test";
import assert from "node:assert/strict";
import { isTransferableBreedWorkCopyValue } from "../lib/notion-breed-workcopy-value.mjs";

test("blank Notion cells never clear an existing Psipedia value", () => {
  for (const value of [null, undefined, "", "  \n  ", []]) {
    assert.equal(isTransferableBreedWorkCopyValue(value), false);
  }
});

test("explicit values, including false and zero, remain editable", () => {
  for (const value of [false, true, 0, 1, "Zdravý pes", ["plávanie"]]) {
    assert.equal(isTransferableBreedWorkCopyValue(value), true);
  }
});

test("explicit edits transfer blank values, but missing properties never do", () => {
  for (const value of [null, "", "  ", []])
    assert.equal(isTransferableBreedWorkCopyValue(value, true), true);
  assert.equal(isTransferableBreedWorkCopyValue(undefined, true), false);
});
