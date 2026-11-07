import test from "node:test";
import assert from "node:assert/strict";
import { encodeIndependentBreedWorkCopyReceipt } from
  "../lib/notion-breed-workcopy-baseline-receipt.mjs";

test("new workcopy receipt stores two independent values and preserves conflict", () => {
  const notion = { intro: "Text z Notionu", editorialComplete: false, energy: 3 };
  const admin = { intro: "Text v Admine", editorialComplete: true, energy: 3 };
  const before = JSON.stringify({ notion, admin });
  const receipt = encodeIndependentBreedWorkCopyReceipt(notion, admin);
  const parsed = JSON.parse(receipt.slice("breed-field-v1:".length));
  assert.deepEqual(JSON.parse(parsed.notion), notion);
  assert.deepEqual(JSON.parse(parsed.admin), admin);
  assert.notDeepEqual(JSON.parse(parsed.notion), JSON.parse(parsed.admin));
  assert.equal(JSON.stringify({ notion, admin }), before);
});

test("malformed or missing snapshots cannot masquerade as a baseline", () => {
  assert.throws(() => encodeIndependentBreedWorkCopyReceipt(null, { intro: "x" }),
    /BASELINE_EMPTY/);
  assert.throws(() => encodeIndependentBreedWorkCopyReceipt({}, { intro: "x" }),
    /BASELINE_EMPTY/);
  assert.throws(() => encodeIndependentBreedWorkCopyReceipt({ intro: "x" }, []),
    /BASELINE_EMPTY/);
});
