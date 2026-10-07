import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createGeminiAutomationClient } from "../lib/gemini-automation-client.ts";
import { GeminiAutomationError } from "../lib/gemini-automation-types.ts";
import { runGeminiAutomation } from "../lib/gemini-automation-runner.ts";
import { classifyChangedFiles } from "../scripts/ci-scope.mjs";
import { SECRET_ENV_NAMES, validateRuntimeEnvironment } from "../config/runtime-env.ts";

const migration = readFileSync(new URL("../drizzle/0113_gemini_automation_foundation.sql", import.meta.url), "utf8");

test("secret is registered but not required to deploy", () => {
  assert.ok(SECRET_ENV_NAMES.includes("GEMINI_API_KEY"));
  assert.doesNotThrow(() => validateRuntimeEnvironment({}, { profile: "runtime" }));
  assert.match(readFileSync(new URL("../.env.example", import.meta.url), "utf8"), /^GEMINI_API_KEY=$/m);
  const wrangler = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.equal(Object.hasOwn(wrangler.vars, "GEMINI_API_KEY"), false);
});

test("missing key fails before any network traffic; errors contain no secret", async () => {
  let requests = 0;
  const client = createGeminiAutomationClient({
    env: {},
    fetchImpl: async () => { requests++; throw new Error("must not be called"); },
  });
  await assert.rejects(client.generateContent({ contents: [{ role: "user", parts: [{ text: "public" }] }] }),
    (error) => error instanceof GeminiAutomationError && error.code === "CONFIG_MISSING");
  assert.equal(requests, 0);
});

test("fetch injection, configurable model, secret header only, bounded timeout", async () => {
  const secret = "test-never-leak-this-key";
  const client = createGeminiAutomationClient({
    env: { GEMINI_API_KEY: secret, GEMINI_MODEL: "gemini-2.5-flash-lite" },
    timeoutMs: 1000,
    fetchImpl: async (url, init) => {
      assert.match(String(url), /\/models\/gemini-2\.5-flash-lite:generateContent$/);
      assert.equal(new Headers(init?.headers).get("x-goog-api-key"), secret);
      assert.equal(new Headers(init?.headers).get("Content-Type"), "application/json");
      assert.equal(String(init?.body).includes(secret), false);
      assert.ok(init?.signal);
      return new Response(JSON.stringify({ candidates: [] }), { status: 200 });
    },
  });
  const output = await client.generateContent({ contents: [{ role: "user", parts: [{ text: "public data" }] }] });
  assert.equal(output.model, "gemini-2.5-flash-lite");
});

test("HTTP and invalid-response error classification never exposes provider bodies", async () => {
  for (const [status, code] of [[401, "AUTH_FAILED"], [403, "AUTH_FAILED"], [429, "RATE_LIMITED"], [503, "PROVIDER_ERROR"]]) {
    const client = createGeminiAutomationClient({ env: { GEMINI_API_KEY: "private" }, fetchImpl: async () =>
      new Response("provider secret diagnostic", { status }) });
    await assert.rejects(client.generateContent({ contents: [{ role: "user", parts: [{ text: "public" }] }] }),
      (error) => error.code === code && !String(error).includes("provider secret diagnostic"));
  }
  const invalid = createGeminiAutomationClient({ env: { GEMINI_API_KEY: "private" },
    fetchImpl: async () => new Response("{not-json", { status: 200 }) });
  await assert.rejects(invalid.generateContent({ contents: [{ role: "user", parts: [{ text: "public" }] }] }),
    (error) => error.code === "INVALID_RESPONSE");
});

test("timeout abort is classified without leaking transport exception", async () => {
  const client = createGeminiAutomationClient({
    env: { GEMINI_API_KEY: "private" }, timeoutMs: 1,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("private timeout details")), { once: true });
    }),
  });
  await assert.rejects(client.generateContent({ contents: [{ role: "user", parts: [{ text: "public" }] }] }),
    (error) => error.code === "TIMEOUT" && !String(error).includes("private"));
});

test("D1 foundation schema is additive, constrained and indexed", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_gemini_runs_setting_started'").get());
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name = 'idx_gemini_settings_due'").get());
  db.prepare("INSERT INTO gemini_automation_settings(stable_key,section,subcategory) VALUES ('directory.vets','directory','vets')").run();
  assert.throws(() => db.prepare("INSERT INTO gemini_automation_settings(stable_key,section,subcategory) VALUES ('directory.vets','directory','vets')").run());
  assert.throws(() => db.prepare("UPDATE gemini_automation_settings SET enabled = 3").run());
  assert.throws(() => db.prepare("INSERT INTO gemini_automation_runs(setting_id,trigger_type,status,started_at,completed_at,model) VALUES (1,'TEST','RUNNING','now','now','model')").run());
  db.close();
});

test("runner is isolated: deterministic run success/failure, no remote side effects", async () => {
  const queries = [];
  const database = { prepare(sql) { return { bind(...params) { return { async run() {
    queries.push({ sql, params });
    return { meta: { last_row_id: 7 } };
  } }; } }; } };
  const now = () => new Date("2026-10-07T12:00:00.000Z");
  const common = { database, env: { GEMINI_API_KEY: "private" }, settingId: 4, now };
  const success = await runGeminiAutomation(common);
  assert.equal(success.status, "SUCCESS");
  const failed = await runGeminiAutomation({ ...common, client: { generateContent: async () => { throw new Error("unknown"); } },
    execute: async (client) => { await client.generateContent({}); } });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.errorCode, "PROVIDER_ERROR");
  assert.ok(queries.some(({ sql, params }) => sql.includes("UPDATE gemini_automation_runs") && params.includes("PROVIDER_ERROR")));
  assert.equal(queries.some(({ sql }) => /notion|publish|data_automation/i.test(sql)), false);
});

test("CI scope catches Gemini code and migration without legacy Tavily broad matrix", () => {
  for (const name of ["lib/gemini-automation-client.ts", "tests/gemini-automation-foundation.test.mjs"]) {
    const classification = classifyChangedFiles([name]);
    assert.ok(classification.scopes.includes("GEMINI_AUTOMATION"));
    assert.equal(classification.automationBroad, false);
    assert.equal(classification.fullCore, false);
  }
  const migrationScope = classifyChangedFiles(["drizzle/0113_gemini_automation_foundation.sql"]);
  assert.ok(migrationScope.scopes.includes("DATABASE_MIGRATIONS"));
  assert.ok(migrationScope.scopes.includes("GEMINI_AUTOMATION"));
  assert.match(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"), /"\*\/5 \* \* \* \*"/);
});
