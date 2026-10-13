import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { geminiHttpCode, inspectInteraction } from "../scripts/gemini-interactions-contract.mjs";

const worker = fileURLToPath(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/gemini-external-agent-fetch-mock.mjs", import.meta.url));
const ds = "84e0664c-ca47-405f-9d54-31b20287bc8c";

function runOffline(scenario) {
  // The preload replaces global fetch *before* the worker imports or runs.
  // The secrets are synthetic and never leave this local child process.
  const child = spawnSync(process.execPath, ["--import", fixture, worker], {
    encoding: "utf8",
    timeout: 12000,
    env: {
      ...process.env,
      MOCK_SCENARIO: scenario,
      GEMINI_AGENT_PAID_ENABLED: "true", // Child process only; all network blocked by preload.
      AGENT_GEMINI_ACCESS_KEY: "mock-key",
      AGENT_NOTION_ACCESS_TOKEN: "mock-token",
      NOTION_DIRECTORY_DATA_SOURCE_ID: ds,
      AGENT_JOB_ID: "7",
      AGENT_STABLE_KEY: "directory.veterinari",
      AGENT_MAX_NEW_CONCEPTS: "2",
      PSIPEDIA_AGENT_CALLBACK_SECRET: "offline-test-secret",
      PSIPEDIA_AGENT_CALLBACK_URL: "https://psipedia.sk/api/internal/gemini-agent/callback",
      GEMINI_MODEL: "gemini-3.8-flash",
    },
  });
  assert.equal(child.error, undefined, child.error?.message);
  const callback = child.stdout?.match(/^MOCK_CALLBACK (.+)$/m);
  const counts = child.stdout?.match(/^MOCK_COUNTS (.+)$/m);
  assert.ok(counts, "Fetch fixture must install and intercept all network traffic: " + child.stderr);
  return {
    exitCode: child.status,
    callback: callback ? JSON.parse(callback[1]) : null,
    counts: JSON.parse(counts[1]),
    stderr: child.stderr,
  };
}

test("offline success: Search-only, function-only, duplicate scan, Notion draft and one signed callback", () => {
  const run = runOffline("success");
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(run.callback.status, "SUCCESS");
  assert.equal(run.callback.error_code, null);
  assert.equal(run.callback.concept_count, 1);
  assert.equal(run.callback.request_count, 4);
  assert.equal(run.callback.search_count, 1);
  assert.deepEqual(run.counts, { geminiCalls: 4, notionPosts: 1, callbacks: 1 });
});

for (const [scenario, error, requests] of [
  ["http_400_tools", "GEMINI_HTTP_400_TOOLS", 1],
  ["in_progress", "GEMINI_STATE_IN_PROGRESS", 1],
  ["missing_search", "GEMINI_SEARCH_NOT_USED", 1],
  ["unknown_tool", "GEMINI_INVALID_TOOL_CALL", 2],
  ["empty_action", "GEMINI_EMPTY_TOOL_CALL", 2],
  ["invalid_call", "GEMINI_INVALID_TOOL_CALL", 3],
]) {
  test("offline " + scenario + ": controlled failure, no write and one callback", () => {
    const run = runOffline(scenario);
    assert.equal(run.exitCode, 1);
    assert.equal(run.callback.status, "FAILED");
    assert.equal(run.callback.error_code, error);
    assert.equal(run.callback.request_count, requests);
    assert.deepEqual(run.counts, { geminiCalls: requests, notionPosts: 0, callbacks: 1 });
    assert.doesNotMatch(run.stderr, /mock-key|mock-token|offline-test-secret/);
  });
}

test("offline create-before-Notion-search is rejected without side effects", () => {
  const run = runOffline("out_of_order");
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(run.callback.status, "SUCCESS");
  assert.equal(run.callback.concept_count, 0);
  assert.deepEqual(run.counts, { geminiCalls: 3, notionPosts: 0, callbacks: 1 });
});

test("offline uncertain Notion POST is never retried and is reported as FAILED", () => {
  const run = runOffline("notion_uncertain");
  assert.equal(run.exitCode, 1);
  assert.equal(run.callback.error_code, "NOTION_CREATE_UNCERTAIN");
  assert.equal(run.callback.concept_count, 0);
  assert.deepEqual(run.counts, { geminiCalls: 3, notionPosts: 1, callbacks: 1 });
  assert.doesNotMatch(run.stderr, /SIMULATED_POST_TIMEOUT/);
});

test("offline Notion publish-only status option fails before any draft POST", () => {
  const run = runOffline("unsafe_status_default");
  assert.equal(run.exitCode, 1);
  assert.equal(run.callback.status, "FAILED");
  assert.equal(run.callback.error_code, "NOTION_DRAFT_OPTION_MISSING");
  assert.deepEqual(run.counts, { geminiCalls: 3, notionPosts: 0, callbacks: 1 });
});

test("offline failed callback is attempted only once and leaves job for operator recovery", () => {
  const run = runOffline("callback_503");
  assert.equal(run.exitCode, 1);
  assert.equal(run.callback.status, "SUCCESS");
  assert.deepEqual(run.counts, { geminiCalls: 4, notionPosts: 1, callbacks: 1 });
  assert.match(run.stderr, /CALLBACK_HTTP_503/);
});

test("strict Interactions states and tool-call IDs cannot silently signal success", () => {
  const base = { id: "int_1", status: "completed", steps: [] };
  assert.throws(() => inspectInteraction({ ...base, status: "failed" }, "research"), /GEMINI_STATE_FAILED/);
  assert.throws(() => inspectInteraction(base, "research"), /GEMINI_SEARCH_NOT_USED/);
  assert.throws(() => inspectInteraction({ ...base, status: "requires_action" }, "functions"), /GEMINI_EMPTY_TOOL_CALL/);
  assert.throws(() => inspectInteraction({ ...base, status: "incomplete" }, "functions"), /GEMINI_STATE_INCOMPLETE/);
  assert.throws(() => inspectInteraction({
    ...base, status: "requires_action",
    steps: [{ type: "function_call", id: "same", name: "search_notion", arguments: {} },
      { type: "function_call", id: "same", name: "search_notion", arguments: {} }],
  }, "functions"), /GEMINI_INVALID_TOOL_CALL/);
  assert.equal(geminiHttpCode(400, { error: { message: "TOOLS cannot be combined" } }), "GEMINI_HTTP_400_TOOLS");
  assert.equal(geminiHttpCode(429, { error: { message: "Never log secret" } }), "GEMINI_HTTP_429");
});
