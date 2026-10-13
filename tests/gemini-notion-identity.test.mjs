import test from "node:test";
import assert from "node:assert/strict";
import { directoryDuplicate, sameDirectoryIdentity } from "../scripts/gemini-notion-identity.mjs";
import { geminiReviewCounts, geminiReviewState } from "../lib/gemini-notion-review-state.ts";

test("deterministic rejected identity survives accents, company suffixes and changed URLs", () => {
  const old = { name: "Šťastný pes s. r. o.", city: "Žilina", website: "https://www.stastnypes.sk/kontakt?utm_source=fb" };
  assert.equal(sameDirectoryIdentity(old, { name: "Stastny Pes", city: "Zilina", website: "https://new-domain.sk" }), true);
  assert.equal(sameDirectoryIdentity(old, { name: "Nová značka", city: "Žilina", website: "http://stastnypes.sk/" }), true);
  assert.equal(sameDirectoryIdentity(old, { name: "Šťastný pes", city: "Bratislava", website: old.website }), false);
  assert.equal(sameDirectoryIdentity(old, { name: "Šťastný psík", city: "Žilina", website: "https://other.sk" }), false);
  const text = value => ({ rich_text: [{ plain_text: value }] });
  const page = { properties: { "Názov": { title: [{ plain_text: "Zmenený názov" }] }, "Stav": { select: { name: "Archív" } },
    "Poznámky": text('[Psipedia Gemini review] ' + JSON.stringify({ action: "REJECT", identity: old })) } };
  assert.equal(directoryDuplicate([page], { name: "Stastny Pes", city: "Zilina", website: "https://new.sk" }), true);
});

test("state counts distinguish approval from actual canonical publication", () => {
  const base = { editorialState: "Na kontrolu", psipediaStatus: "Koncept", psipediaId: "", reviewed: false };
  const states = [base, { ...base, reviewed: true }, { ...base, editorialState: "Publikované", psipediaStatus: "Publikované" },
    { ...base, editorialState: "Archív" }, { ...base, psipediaId: "12", canonicalStatus: "published" }, { ...base, psipediaId: "13" }]
    .map(input => ({ reviewState: geminiReviewState(input) }));
  assert.deepEqual(states.map(x => x.reviewState), ["NEW", "IN_PROGRESS", "APPROVED", "REJECTED", "PUBLISHED", "IMPORTED"]);
  assert.deepEqual(Object.values(geminiReviewCounts(states)), [1, 1, 1, 1, 1, 1]);
});
