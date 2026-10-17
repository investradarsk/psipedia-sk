import "./gemini-shelter-privacy-identity.test.mjs";
import "./gemini-adoption-contract.test.mjs";
import "./gemini-lost-found-contract.test.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { geminiHttpCode, inspectInteraction } from "../scripts/gemini-interactions-contract.mjs";
import { retryInitialResearch503 } from "../scripts/gemini-research-retry.mjs";

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
      GITHUB_RUN_ATTEMPT: scenario === "workflow_replay" ? "2" : "1",
      GEMINI_AGENT_PAID_ENABLED: "true", // Child process only; all network blocked by preload.
      AGENT_GEMINI_ACCESS_KEY: "mock-key",
      AGENT_NOTION_ACCESS_TOKEN: "mock-token",
      NOTION_DIRECTORY_DATA_SOURCE_ID: ds,
      AGENT_JOB_ID: "7",
      NOTION_EVENTS_DATA_SOURCE_ID: ds,
      NOTION_HELP_DATA_SOURCE_ID: ds,
      NOTION_ORGANIZATIONS_DATA_SOURCE_ID: ds,
      NOTION_ADOPTIONS_DATA_SOURCE_ID: ds,
      NOTION_LOST_FOUND_DATA_SOURCE_ID: scenario === "wrong_config"
        ? "3ed793fc-1d18-8141-bc25-000bc25ab39b"
        : "3ed793fc-1d18-8122-95b9-000b05c3c6bd",
      AGENT_STABLE_KEY: stableKey,
      AGENT_CATEGORY_PROMPT: "Testovací redakčný prompt pre kategóriu " + stableKey + ". Vyhľadaj len overené fakty a vytvor iba neverejný koncept.",
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

test("initial research HTTP 503 retries at most twice, counting every paid request", () => {
  for (const [scenario, requests, expectedStatus, concepts, searches] of [
    ["gemini_503_once", 5, "SUCCESS", 1, 1],
    ["gemini_503_twice", 6, "SUCCESS", 1, 1],
    ["gemini_503_always", 3, "FAILED", 0, 0],
  ]) {
    const run = runOffline(scenario, "directory.chovatelske-stanice");
    assert.equal(run.exitCode, expectedStatus === "SUCCESS" ? 0 : 1, scenario + ": " + run.stderr);
    assert.equal(run.callback.status, expectedStatus, scenario);
    assert.equal(run.callback.error_code, expectedStatus === "FAILED" ? "GEMINI_HTTP_503" : null);
    assert.equal(run.callback.request_count, requests, scenario);
    assert.equal(run.callback.search_count, searches, scenario);
    assert.equal(run.callback.concept_count, concepts, scenario);
    assert.deepEqual(run.counts, { geminiCalls: requests, notionPosts: concepts, callbacks: 1 }, scenario);
  }
});

test("HTTP 503 after initial research never retries a continuation or Notion write", () => {
  const run = runOffline("gemini_503_functions");
  assert.equal(run.exitCode, 1, run.stderr);
  assert.equal(run.callback.error_code, "GEMINI_HTTP_503");
  assert.equal(run.callback.request_count, 2);
  assert.equal(run.callback.search_count, 1);
  assert.deepEqual(run.counts, { geminiCalls: 2, notionPosts: 0, callbacks: 1 });
});

test("HTTP 503 retry respects the remaining global request budget", async () => {
  for (const startUsed of [8, 7]) {
    let used = startUsed;
    let calls = 0;
    const delays = [];
    await assert.rejects(() => retryInitialResearch503({
      request: async () => {
        calls++;
        used++;
        throw Error("GEMINI_HTTP_503");
      },
      canRetry: () => used < 9,
      wait: async (ms) => { delays.push(ms); },
    }), /GEMINI_HTTP_503/);
    assert.equal(calls, 9 - startUsed);
    assert.equal(used, 9);
    assert.deepEqual(delays, startUsed === 8 ? [] : [400]);
  }
});

test("offline create-before-Notion-search is rejected without side effects", () => {
  const run = runOffline("out_of_order");
  assert.equal(run.exitCode, 1, run.stderr);
  assert.equal(run.callback.status, "FAILED");
  assert.equal(run.callback.error_code, "AGENT_CANDIDATE_UNRESOLVED");
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
    assert.doesNotMatch(JSON.stringify(properties.Popis), /Dôkazy/);
    if (key.startsWith("events")) {
      assert.equal(properties["Čas začiatku"].rich_text[0].text.content, "10:00");
      assert.equal(properties["Organizátor"].rich_text[0].text.content, "Organizátor");
    } else assert.equal(properties.Slug, undefined);
  });
}
for (const key of ["events.vystavy", "help.zbierky", "help.adopcia"]) {
  for (const scenario of ["wrong_database", "incomplete_scan", "malformed_scan", "gemini_timeout"]) {
    test(key + " refuses " + scenario + " without write", () => {
      const run = runOffline(scenario, key);
      assert.equal(run.exitCode, 1, run.stderr);
      assert.equal(run.callback.status, "FAILED");
      assert.equal(run.counts.notionPosts, 0);
      assert.equal(run.counts.callbacks, 1);
    });
  }
  for (const scenario of ["duplicate", "ambiguous"]) {
    test(key + " possible duplicate remains a private review draft: " + scenario, () => {
      const run = runOffline(scenario, key);
      assert.equal(run.exitCode, 0, run.stderr);
      assert.equal(run.counts.notionPosts, 1);
      assert.match(JSON.stringify(run.pages[0].properties["Gemini poznámka"]), /duplicita/);
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
for (const key of ["help.unknown", "events.unknown", "directory.unknown", "directory.utulky-a-zachrana"]) {
  test("unsupported category stops before APIs: " + key, () => {
    const run = runOffline("success", key);
    assert.equal(run.callback.error_code, "CATEGORY_UNSUPPORTED");
    assert.deepEqual(run.counts, { geminiCalls: 0, notionPosts: 0, callbacks: 1 });
  });
}

for (const key of ["directory.veterinari", "events.vystavy", "help.zbierky", "help.adopcia"]) {
  test(key + " retains confirmed writes when Notion scan is temporarily stale", () => {
    const run = runOffline("repeat_create", key);
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.counts.notionPosts, 1);
    assert.equal(run.callback.concept_count, 1);
    assert.equal(run.callback.duplicate_count, 0, "technical replay is not a business duplicate");
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
test("help.adopcia omits private phone without discarding the draft", () => {
  const run=runOffline("adoption_private","help.adopcia");
  assert.equal(run.counts.notionPosts,1);
  assert.doesNotMatch(JSON.stringify(run.pages), /905 123 456/);
  assert.match(JSON.stringify(run.pages[0].properties["Gemini poznámka"]), /Súkromné/);
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
  assert.doesNotMatch(JSON.stringify(page.properties.Popis), /dôkazy/i);
});
for (const scenario of ["wrong_database","wrong_type","incomplete_scan","malformed_scan"]) {
  test("shelter rejects " + scenario + " before POST", () => {
    const run = runOffline(scenario, "help.utulky");
    assert.equal(run.exitCode, 1, run.stderr);
    assert.equal(run.counts.notionPosts, 0);
    assert.equal(run.counts.callbacks, 1);
  });
}
for (const scenario of ["duplicate","ambiguous","shelter_other_type"]) {
  test("shelter warns about organization identity: " + scenario, () => {
    const run = runOffline(scenario, "help.utulky");
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.counts.notionPosts, 1);
    assert.match(JSON.stringify(run.pages[0].properties["Gemini poznámka"]), /duplicita/);
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

for (const [scenario, status, requests, concepts, error] of [
  ["pilot_duplicate_done", "SUCCESS", 3, 1, null],
  ["pilot_duplicate_loop", "SUCCESS", 3, 1, null],
  ["pilot_search_loop", "SUCCESS", 5, 0, null],
  ["pilot_duplicate_new", "SUCCESS", 3, 1, null],
  ["pilot_duplicate_recover", "SUCCESS", 3, 1, null],
  ["pilot_empty", "SUCCESS", 4, 0, null],
  ["pilot_limit", "FAILED", 9, 0, "AGENT_TURN_LIMIT"],
  ["pilot_limit_write", "FAILED", 9, 0, "AGENT_TURN_LIMIT"],
  ["pilot_malformed_stop", "FAILED", 5, 0, "AGENT_NO_PROGRESS"],
  ["pilot_ignores_stop", "FAILED", 5, 0, "AGENT_NO_PROGRESS"],
  ["pilot_unresolved_stop", "FAILED", 5, 0, "AGENT_NO_PROGRESS"],
]) {
  test("live pilot regression: " + scenario, () => {
    const run = runOffline(scenario, "directory.kynologicke-kluby", "1");
    assert.equal(run.callback.status, status, run.stderr);
    assert.equal(run.callback.error_code, error);
    assert.equal(run.exitCode, status === "SUCCESS" ? 0 : 1);
    assert.equal(run.callback.concept_count, concepts);
    assert.deepEqual(run.counts, { geminiCalls: requests, notionPosts: concepts, callbacks: 1 });
    assert.ok(run.callback.request_count <= 9);
    if (scenario.startsWith("pilot_duplicate")) assert.equal(run.callback.duplicate_count, 1);
    assert.doesNotMatch(run.stderr, /mock-key|mock-token|offline-test-secret/);
  });
}
for (const key of ["veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie", "vencenie", "fyzioterapia", "dalsie-sluzby"]) {
  test("directory immediate confirmed single draft: " + key, () => {
    const run = runOffline("success", "directory." + key, "1");
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.callback.concept_count, 1);
    assert.deepEqual(run.counts, { geminiCalls: 3, notionPosts: 1, callbacks: 1 });
  });
}
for (const scenario of ["notion_uncertain", "notion_500", "notion_invalid_json", "notion_missing_id"]) {
  test("directory never retries uncertain create: " + scenario, () => {
    const run = runOffline(scenario);
    assert.equal(run.callback.status, "FAILED");
    assert.equal(run.callback.error_code, "NOTION_CREATE_UNCERTAIN");
    assert.deepEqual(run.counts, { geminiCalls: 3, notionPosts: 1, callbacks: 1 });
  });
}

const LF = "help.stratene-a-najdene";
test("Lost/Found E2E LOST: exact parent, DRAFT-only properties, one signed callback", () => {
  const run = runOffline("success", LF, "1");
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(run.callback.status, "SUCCESS");
  assert.equal(run.callback.concept_count, 1);
  assert.equal(run.callback.search_count, 1);
  assert.equal(run.counts.notionPosts, 1);
  assert.equal(run.counts.callbacks, 1);
  const page = run.pages[0];
  assert.match(JSON.stringify(page.properties["Gemini poznámka"]), /Overte dostupnosť/);
  assert.equal(page.parent.data_source_id, "3ed793fc-1d18-8122-95b9-000b05c3c6bd");
  assert.equal(page.properties.Typ.rich_text[0].text.content, "LOST");
  assert.equal(page.properties["Psipedia stav"].rich_text[0].text.content, "DRAFT");
  for (const key of ["Slug","Psipedia ID","Latitude","Longitude","Publikované",
    "Verejný kontakt","Vyriešené","URL Psipedia"]) assert.equal(page.properties[key], undefined);
});
test("Lost/Found signed callback errors never retry or create extra concepts",()=>{
  for (const scenario of ["callback_bad_signature","callback_503"]) {
    const run=runOffline(scenario,"help.stratene-a-najdene","1");
    assert.equal(run.exitCode,1,run.stderr);
    assert.equal(run.counts.notionPosts,1);
    assert.equal(run.counts.callbacks,1);
    assert.match(run.stderr,/Callback failed:/);
  }
});
test("Lost/Found E2E FOUND: same canonical database, never published", () => {
  const run = runOffline("lost_found", LF, "1");
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(run.counts.notionPosts, 1);
  assert.equal(run.pages[0].properties.Typ.rich_text[0].text.content,"FOUND");
  assert.equal(run.pages[0].properties["Psipedia stav"].rich_text[0].text.content,"DRAFT");
});
for (const scenario of ["wrong_config", "wrong_database","wrong_type",
  "incomplete_scan", "malformed_scan", "gemini_timeout"]) {
  test("Lost/Found E2E blocks "+scenario+" without a POST", () => {
    const run=runOffline(scenario, LF);
    assert.equal(run.exitCode,1,run.stderr);
    assert.equal(run.callback.status,"FAILED");
    assert.equal(run.counts.notionPosts,0);
    assert.equal(run.counts.callbacks,1);
    assert.doesNotMatch(run.stderr,/mock-key|mock-token|offline-test-secret/);
    if (scenario==="wrong_config") assert.equal(run.counts.geminiCalls,0);
  });
}
for (const scenario of ["duplicate","ambiguous"]) {
  test("Lost/Found keeps a private draft with warning: "+scenario,()=>{
    const run=runOffline(scenario,LF);
    assert.equal(run.exitCode,0,run.stderr);
    assert.equal(run.counts.notionPosts,1);
    assert.match(JSON.stringify(run.pages[0].properties["Gemini poznámka"]), /duplicita/);
    assert.equal(run.callback.duplicate_count,1);
  });
}
for (const scenario of ["notion_uncertain","notion_500","notion_invalid_json","notion_missing_id"]) {
  test("Lost/Found POST "+scenario+" is never retried and signed FAILED callback sent",()=>{
    const run=runOffline(scenario,LF);
    assert.equal(run.exitCode,1,run.stderr);
    assert.equal(run.callback.status,"FAILED");
    assert.equal(run.callback.error_code,"NOTION_CREATE_UNCERTAIN");
    assert.equal(run.counts.notionPosts,1);
    assert.equal(run.counts.callbacks,1);
  });
}
test("Lost/Found completes initial and final paginated snapshot scans",()=>{
  const run=runOffline("paginated",LF,"1");
  assert.equal(run.exitCode,0,run.stderr);
  assert.equal(run.counts.notionPosts,1);
});
test("Lost/Found retains confirmed drafts across stale Notion reads",()=>{
  const run=runOffline("repeat_create",LF);
  assert.equal(run.exitCode,0,run.stderr);
  assert.equal(run.callback.concept_count,1);
  assert.equal(run.callback.duplicate_count,0);
  assert.equal(run.counts.notionPosts,1);
});
const remainingKeys=[
  "events.vystavy","events.preteky","events.seminare","events.treningy",
  "events.stretnutia","events.dalsie",
  "directory.veterinari","directory.treneri","directory.kynologicke-kluby",
  "directory.chovatelske-kluby","directory.chovatelske-stanice",
  "directory.salony-a-sluzby","directory.hotely-a-opatrovanie","directory.vencenie",
  "directory.fyzioterapia","directory.dalsie-sluzby",
  "help.docasna-opatera","help.zbierky","help.dobrovolnictvo",
  "help.utulky","help.adopcia",
];
test("all remaining 21 worker categories retain explicit capability",()=>{
  assert.equal(new Set(remainingKeys).size,21);
});
for (const key of remainingKeys) {
  test("regression: existing category stays draft-only "+key,()=>{
    const run=runOffline("success",key,"1");
    assert.equal(run.exitCode,0,run.stderr);
    assert.equal(run.counts.notionPosts,1);
    assert.equal(run.callback.status,"SUCCESS");
    assert.match(JSON.stringify(run.pages[0].properties["Gemini poznámka"]), /Overte dostupnosť/);
  });
}

const allWorkerKeys = [...remainingKeys, "help.stratene-a-najdene"];
test("the offline zero-draft matrix contains all 22 canonical worker categories", () => {
  assert.equal(allWorkerKeys.length, 22);
  assert.equal(new Set(allWorkerKeys).size, 22);
});
for (const key of allWorkerKeys) {
  test("no premature success: Google Search -> Notion search -> explicit no-draft outcome: " + key, () => {
    const run = runOffline("pilot_empty", key);
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.callback.status, "SUCCESS");
    assert.equal(run.callback.concept_count, 0);
    assert.equal(run.callback.outcome_code, "no_relevant_candidate");
    assert.deepEqual(run.counts, { geminiCalls: 4, notionPosts: 0, callbacks: 1 });
    assert.ok(run.callback.request_count <= 9);
    assert.doesNotMatch(run.stderr, /mock-key|mock-token|offline-test-secret/);
  });
}

test("all four no-draft terminal reasons stay callback-safe, without provider text", () => {
  const worker = readFileSync(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url), "utf8");
  assert.match(worker, /outcome_code: status === "SUCCESS" && metrics.concept_count === 0/);
  assert.match(worker, /parseNoDraftOutcome\(answer\)/);
  assert.doesNotMatch(worker, /outcome_code: answer/);
});

for (const key of ["events.vystavy", "help.zbierky", "help.adopcia", "help.utulky", LF]) {
  for (const scenario of ["missing_source", "invalid_source", "ungrounded", "missing_evidence", "missing_grounding", "partial_property", "missing_organizer"]) {
    test(key + " keeps usable draft despite optional gap: " + scenario, () => {
      const run = runOffline(scenario, key, "1");
      assert.equal(run.exitCode, 0, run.stderr);
      assert.equal(run.counts.notionPosts, 1);
      assert.ok(!JSON.stringify(run.pages).includes("http://example"));
    });
  }
}
for (const scenario of ["lost_private", "lost_gps", "lost_private_text", "lost_stale", "lost_resolved", "shelter_private", "shelter_unverified"]) {
  test("private fields omitted; editorial uncertainty goes to note: " + scenario, () => {
    const run = runOffline(scenario, scenario.startsWith("shelter") ? "help.utulky" : LF, "1");
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.counts.notionPosts, 1);
    assert.doesNotMatch(JSON.stringify(run.pages), /905 123 456|48\.123456|Hlavná 42|private@example/);
  });
}

test("all 151 records are available through explicit Notion tool pagination", () => {
  const run = runOffline("many_records", "directory.veterinari", "1");
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(run.callback.concept_count, 1);
  assert.equal(run.counts.notionPosts, 1);
});
test("re-running an existing workflow cannot repeat uncertain technical writes", () => {
  const run = runOffline("workflow_replay");
  assert.equal(run.callback.error_code, "AGENT_REPLAY_REQUIRES_REVIEW");
  assert.deepEqual(run.counts, { geminiCalls: 0, notionPosts: 0, callbacks: 1 });
});

for (const key of [...remainingKeys, LF]) {
  test("live schema-driven fields use the same worker for " + key, () => {
    const run = runOffline("dynamic_fields", key, "1");
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.callback.concept_count, 1);
    const p = run.pages[0].properties;
    assert.equal(p["Ďalší overený fakt"].rich_text[0].text.content, "Nové obsahové pole zo živej schémy");
    assert.equal(p["Počet miest"].number, 4);
    assert.equal(p["Prístupnosť"].checkbox, true);
    assert.deepEqual(p["Zameranie"].multi_select, [{ name: "Malé psy" }, { name: "Veľké psy" }]);
    if (key === "help.adopcia") {
      assert.equal(p["Hmotnosť"].number, 4);
      assert.equal(p["Plemeno"].rich_text[0].text.content, "kríženec yorkšírskeho teriéra");
      assert.equal(p["Kríženec"].checkbox, true);
      assert.match(JSON.stringify(p["Zdravotné poznámky"]), /Očkovaný a kastrovaný/);
      assert.equal(p["Dátum narodenia"], undefined);
      assert.match(JSON.stringify(p["Gemini poznámka"]), /Dátum narodenia/);
      assert.match(JSON.stringify(p["Gemini poznámka"]), /08\/2024/);
      assert.doesNotMatch(JSON.stringify(p["Gemini poznámka"]), /Web|Organizátor/);
    }
  });
}
for (const key of ["directory.veterinari", "events.vystavy", "help.zbierky", "help.utulky", "help.adopcia", LF]) {
  test("dynamic fields cannot override protected controls: " + key, () => {
    const run = runOffline("dynamic_protected", key, "1");
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.counts.notionPosts, 1);
    assert.doesNotMatch(JSON.stringify(run.pages), /999|FAKE|internal@example|Publikované|published/);
    assert.equal(run.pages[0].properties["Publikovať"], undefined);
  });
  test("dynamic fields retain in-run technical idempotency: " + key, () => {
    const run = runOffline("dynamic_replay", key);
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.counts.notionPosts, 1);
    assert.equal(run.callback.concept_count, 1);
    assert.equal(run.callback.duplicate_count, 0);
  });
}
test("dynamic arbitrary text fields cannot bypass Lost/Found privacy", () => {
  const run = runOffline("dynamic_privacy", LF, "1");
  assert.equal(run.exitCode, 0, run.stderr);
  assert.equal(run.counts.notionPosts, 1);
  assert.doesNotMatch(JSON.stringify(run.pages), /owner@example|48\.123456|905 123 456/);
});

for (const key of ["directory.veterinari", "events.vystavy", "help.zbierky", "help.utulky", "help.adopcia", LF]) {
  test("dynamic fields keep possible duplicates as private drafts with warning: " + key, () => {
    const run = runOffline("dynamic_duplicate", key, "1");
    assert.equal(run.exitCode, 0, run.stderr);
    assert.equal(run.counts.notionPosts, 1);
    assert.equal(run.callback.concept_count, 1);
    assert.equal(run.callback.duplicate_count, 1);
    assert.match(JSON.stringify(run.pages[0].properties["Gemini poznámka"]), /Možná duplicita/);
  });
}
