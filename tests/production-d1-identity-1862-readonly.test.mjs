import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const load = (file) => readFileSync(new URL("../"+file,import.meta.url),"utf8");
const script = load("scripts/production-d1-identity-1862-readonly.mjs");
const workflow = load(".github/workflows/production-d1-identity-1862-readonly.yml");

test("identity investigation is manual only, production protected and cannot auto deploy", () => {
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/^\s*(?:push|pull_request|schedule):/m);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/CHECK-1862-psipedia-sk-db/);
  assert.match(workflow,/node --check/);
  assert.doesNotMatch(workflow,/\bapply\b|\bd1\s+migrations\s+apply\b/);
});
test("query boundary accepts SELECT only and forbids all D1 write operations", () => {
  assert.match(script,/^\s*function select\(query\)/m);
  assert.match(script,/NON_READONLY_QUERY/);
  assert.match(script,/\^SELECT\\s/i);
  assert.match(script,/INSERT\|UPDATE\|DELETE\|DROP\|ALTER\|REPLACE/);
  assert.match(script,/--remote/);
  assert.match(script,/--command/);
  assert.doesNotMatch(script,/--file|--yes|--execute/);
  assert.doesNotMatch(script,/\b\.run\(|\b\.batch\(/);
});
test("exact identity and Notion provenance must agree before safeToTest can be true", () => {
  assert.match(script,/const RECORD_ID=1862/);
  assert.match(script,/const TEST_PAGE="415793fc-1d18-81ba-a7dc-eabdd37ca3f4"/);
  assert.match(script,/const TEST_SLUG="test-psipedia-lifecycle-0164-20261111"/);
  assert.match(script,/current\?\.slug===TEST_SLUG/);
  assert.match(script,/current\?\.name===TEST_NAME/);
  assert.match(script,/mappingById\.length===1/);
  assert.match(script,/mappingByPage\.length===1/);
  assert.match(script,/!geminiForId/);
  assert.match(script,/safeToTest/);
  assert.match(script,/writes:false/);
});
