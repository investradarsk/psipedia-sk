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
