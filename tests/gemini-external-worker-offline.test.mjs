import "./gemini-shelter-privacy-identity.test.mjs";
import "./gemini-adoption-contract.test.mjs";
import "./gemini-lost-found-contract.test.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { geminiHttpCode, inspectInteraction } from "../scripts/gemini-interactions-contract.mjs";

const worker = fileURLToPath(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/gemini-external-agent-fetch-mock.mjs", import.meta.url));
const ds = "84e0664c-ca47-405f-9d54-31b20287bc8c";

function runOffline(scenario, stableKey = "directory.veterinari", maxNew = "2") {
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
      NOTION_EVENTS_DATA_SOURCE_ID: ds,
      NOTION_HELP_DATA_SOURCE_ID: ds,
      NOTION_ORGANIZATIONS_DATA_SOURCE_ID: ds,
      NOTION_ADOPTIONS_DATA_SOURCE_ID: ds,
      AGENT_STABLE_KEY: stableKey,
      AGENT_MAX_NEW_CONCEPTS: maxNew,
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
    pages: [...child.stdout.matchAll(/^MOCK_PAGE (.+)$/gm)].map(m => JSON.parse(m[1])),
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

for (const key of ["events.vystavy", "events.preteky", "events.seminare", "events.treningy", "events.stretnutia", "events.dalsie",
  "help.docasna-opatera", "help.zbierky", "help.dobrovolnictvo"]) {
  test("category E2E draft-only: " + key, () => {
    const run = runOffline("success", key, "1");
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.callback.concept_count, 1);
    assert.equal(run.counts.notionPosts, 1);
    assert.equal(run.counts.geminiCalls, 3, "limit stops further requests");
    const properties = run.pages[0].properties;
    assert.doesNotMatch(JSON.stringify(properties), /Publikované|published|Ready|Sync stav/);
    assert.match(JSON.stringify(properties.Popis), /Dôkazy/);
    if (key.startsWith("events")) {
      assert.equal(properties["Čas začiatku"].rich_text[0].text.content, "10:00");
      assert.equal(properties["Organizátor"].rich_text[0].text.content, "Organizátor");
    } else assert.equal(properties.Slug, undefined);
  });
}
for (const key of ["events.vystavy", "help.zbierky", "help.adopcia"]) {
  for (const scenario of ["wrong_database", "wrong_type", "missing_source", "invalid_source", "ungrounded", "missing_evidence",
    "missing_grounding", "incomplete_scan", "malformed_scan", "partial_property", "gemini_timeout"]) {
    test(key + " refuses " + scenario + " without write", () => {
      const run = runOffline(scenario, key);
      assert.equal(run.exitCode, 1, run.stderr);
      assert.equal(run.callback.status, "FAILED");
      assert.equal(run.counts.notionPosts, 0);
      assert.equal(run.counts.callbacks, 1);
    });
  }
  for (const scenario of ["duplicate", "ambiguous"]) {
    test(key + " fresh final scan blocks " + scenario, () => {
      const run = runOffline(scenario, key);
      assert.equal(run.exitCode, 0, run.stderr);
      assert.equal(run.counts.notionPosts, 0);
      assert.equal(run.callback.duplicate_count, 1);
    });
  }
  for (const scenario of ["notion_uncertain", "notion_500", "notion_invalid_json", "notion_missing_id"]) {
    test(key + " never retries " + scenario, () => {
      const run = runOffline(scenario, key);
      assert.equal(run.exitCode, 1);
      assert.equal(run.callback.error_code, "NOTION_CREATE_UNCERTAIN");
      assert.equal(run.counts.notionPosts, 1);
      assert.equal(run.counts.callbacks, 1);
    });
  }
}
for (const key of ["help.stratene-a-najdene", "help.unknown", "events.unknown", "directory.unknown", "directory.utulky-a-zachrana"]) {
  test("unsupported category stops before APIs: " + key, () => {
    const run = runOffline("success", key);
    assert.equal(run.callback.error_code, "CATEGORY_UNSUPPORTED");
    assert.deepEqual(run.counts, { geminiCalls: 0, notionPosts: 0, callbacks: 1 });
  });
}

for (const key of ["events.vystavy", "help.zbierky", "help.adopcia"]) {
  test(key + " retains confirmed writes when Notion scan is temporarily stale", () => {
    const run = runOffline("repeat_create", key);
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.counts.notionPosts, 1);
    assert.equal(run.callback.concept_count, 1);
    assert.equal(run.callback.duplicate_count, 1);
  });
}

test("help.adopcia creates canonical Nápad without identity/publication or personal data", () => {
  const run=runOffline("success","help.adopcia","1");
  assert.equal(run.exitCode,0,run.stderr);
  assert.equal(run.counts.notionPosts,1);
  const p=run.pages[0].properties;
  assert.equal(p.Stav.select.name,"Nápad");
  assert.equal(p.Meno.title[0].text.content,"Nový psík");
  for(const key of ["Psipedia ID","Slug","Latitude","Longitude","Verejný kontakt"])assert.equal(p[key],undefined);
});
test("help.adopcia rejects private phone from Gemini before writing Notion", () => {
  const run=runOffline("adoption_private","help.adopcia");
  assert.equal(run.counts.notionPosts,0);
  assert.equal(run.callback.error_code,"NOTION_ADOPTION_CONTRACT_INVALID");
});
test("event worker completes initial and final paginated scans before creating", () => {
  const run = runOffline("paginated", "events.vystavy");
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(run.counts.notionPosts, 1);
});

test("shelter creates only a canonical Organization draft (SHELTER/Nápad)", () => {
  const run = runOffline("success", "help.utulky", "1");
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(run.counts.notionPosts, 1);
  assert.equal(run.callback.concept_count, 1);
  const page = run.pages[0];
  assert.equal(page.properties.Typ.rich_text[0].text.content, "SHELTER");
  assert.equal(page.properties.Stav.select.name, "Nápad");
  assert.equal(page.properties["Psipedia stav"], undefined);
  assert.equal(page.properties.Kategória, undefined);
  assert.equal(page.properties.Adresa, undefined);
  assert.equal(page.properties.Latitude, undefined);
  assert.match(JSON.stringify(page.properties.Popis), /dôkazy/i);
});
for (const scenario of ["wrong_database","wrong_type","missing_source","missing_evidence","ungrounded",
  "incomplete_scan","malformed_scan","partial_property","shelter_unverified","shelter_private"]) {
  test("shelter rejects " + scenario + " before POST", () => {
    const run = runOffline(scenario, "help.utulky");
    assert.equal(run.exitCode, 1, run.stderr);
    assert.equal(run.counts.notionPosts, 0);
    assert.equal(run.counts.callbacks, 1);
  });
}
for (const scenario of ["duplicate","ambiguous","shelter_other_type"]) {
  test("shelter blocks cross-type or uncertain organization identity: " + scenario, () => {
    const run = runOffline(scenario, "help.utulky");
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.counts.notionPosts, 0);
    assert.equal(run.callback.duplicate_count, 1);
  });
}
for (const scenario of ["notion_uncertain","notion_500","notion_invalid_json","notion_missing_id"]) {
  test("shelter does not retry ambiguous Notion create: " + scenario, () => {
    const run = runOffline(scenario, "help.utulky");
    assert.equal(run.exitCode, 1, run.stderr);
    assert.equal(run.callback.error_code, "NOTION_CREATE_UNCERTAIN");
    assert.equal(run.counts.notionPosts, 1);
  });
}
