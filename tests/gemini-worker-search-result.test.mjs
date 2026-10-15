import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseNoDraftOutcome, requiresNoDraftRecovery } from "../scripts/gemini-search-outcome.mjs";

test("a run with no concepts requires continuation rather than silent success", () => {
  assert.equal(requiresNoDraftRecovery(0), true);
  assert.equal(requiresNoDraftRecovery(1), false);
});
test("explicit safe no-write outcomes are accepted", () => {
  for (const outcome of ["no_relevant_candidate", "duplicate_only", "insufficient_evidence", "exhausted"])
    assert.equal(parseNoDraftOutcome(JSON.stringify({ outcome })), outcome);
});
test("missing or ambiguous no-draft outcomes fail closed", () => {
  for (const text of ["", "done", "{}", '{"outcome":"created"}',
      '{"outcome":"exhausted","extra":true}', '[]', 'null', '{"outcome":1}'])
    assert.throws(() => parseNoDraftOutcome(text), /AGENT_OUTCOME_MISSING/);
});
test("research -> notion search -> continuation -> draft or reason is retained", () => {
  const src = readFileSync(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url), "utf8");
  assert.match(src, /const research = await gemini\(/);
  assert.match(src, /name: "search_notion"/);
  assert.match(src, /searchedBeforeTurn \? await createDraft/);
  assert.match(src, /if \(!completionRecovery\) \{/);
  assert.match(src, /previous_interaction_id: response.id, tools: functionTools/);
  assert.match(src, /parseNoDraftOutcome\(answer\)/);
  assert.match(src, /GEMINI_REQUEST_LIMIT/);
  assert.match(src, /NOTION_CREATE_UNCERTAIN/);
  assert.match(src, /NOTION_DRAFT_OPTION_MISSING/);
});

import { externalWorkerCategorySupported, notionCategoryValue } from "../scripts/gemini-notion-category.mjs";

const keys = [
  ...["veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
    "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
    "vencenie", "fyzioterapia", "dalsie-sluzby"].map(x => "directory." + x),
  ...["vystavy", "preteky", "seminare", "treningy", "stretnutia", "dalsie"].map(x => "events." + x),
  ...["docasna-opatera", "zbierky", "dobrovolnictvo", "utulky", "adopcia", "stratene-a-najdene"].map(x => "help." + x),
];
test("all 22 worker categories share fail-closed search outcome handling", async (t) => {
  assert.equal(keys.length, 22);
  const source = readFileSync(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url), "utf8");
  assert.match(source, /requiresNoDraftRecovery\(metrics.concept_count\)/);
  assert.match(source, /parseNoDraftOutcome\(answer\)/);
  for (const key of keys) {
    await t.test(key, () => {
      assert.ok(externalWorkerCategorySupported(key));
      const [section, slug] = key.split(".");
      assert.ok(notionCategoryValue(section, slug));
      assert.equal(requiresNoDraftRecovery(0), true);
      assert.equal(parseNoDraftOutcome('{"outcome":"exhausted"}'), "exhausted");
      assert.throws(() => parseNoDraftOutcome("unexplained"), /AGENT_OUTCOME_MISSING/);
    });
  }
});
