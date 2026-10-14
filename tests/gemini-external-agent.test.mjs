import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { geminiAutomationCatalog } from "../lib/gemini-automation-catalog.ts";
import { eventTypeFromPortalSlug } from "../lib/events.ts";
import { notionCategoryValue } from "../scripts/gemini-notion-category.mjs";
import { directoryProfileValues, hasMinimumVeterinarianContact } from "../scripts/gemini-notion-directory-fields.mjs";
import { readFileSync } from "node:fs";
import {
  externalAgentEnabled, externalAgentScheduledEnabled, ExternalAgentError, dispatchExternalGemini,
  sweepExternalGemini, completeExternalGemini,
} from "../lib/gemini-external-agent.ts";

function fakeDb() {
  let job = null;
  const runs = [];
  const queries = [];
  const db = {
    prepare(sql) {
      queries.push(sql);
      let args = [];
      const stmt = {
        bind(...values) { args = values; return stmt; },
        async first() {
          if (sql.includes("FROM gemini_automation_settings")) {
            if (sql.includes("next_run_at")) return { stable_key: "directory.veterinari" };
            return { id: 42, max_new_concepts: 8, cadence_minutes: 720 };
          }
          if (sql.includes("FROM gemini_manual_background_jobs")) return job;
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO gemini_manual_background_jobs")) {
            if (job && job.status === "RUNNING") throw Error("busy");
            job = { id: 7, setting_id: 42, stable_key: args[1],
              status: "RUNNING", error_code: args[2] };
            return { meta: { changes: 1, last_row_id: 7 } };
          }
          if (sql.includes("UPDATE gemini_manual_background_jobs SET status=")) {
            if (!job || job.status !== "RUNNING") return { meta: { changes: 0 } };
            job.status = args[0];
            job.error_code = args[1];
            return { meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO gemini_automation_runs")) {
            runs.push(args);
            return { meta: { changes: 1, last_row_id: 21 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { db, queries, runs, getJob: () => job };
}

test("external agent remains entirely off by default and avoids all external traffic", async () => {
  assert.equal(externalAgentEnabled({}), false);
  assert.equal(externalAgentEnabled({ GEMINI_EXTERNAL_AGENT_ENABLED: "false" }), false);
  const { db, queries } = fakeDb();
  assert.deepEqual(await sweepExternalGemini({ db, env: {} }), { dispatched: 0, reason: "DISABLED" });
  assert.equal(queries.length, 0);
  await assert.rejects(
    dispatchExternalGemini({ db, env: {}, stableKey: "directory.veterinari", trigger: "MANUAL" }),
    (error) => error instanceof ExternalAgentError && error.code === "DISABLED",
  );
});

test("external dispatch sends only bounded routing metadata to GitHub (no data processing in Psipedia)", async () => {
  const { db, getJob } = fakeDb();
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(null, { status: 204 });
  };
  try {
    const category = geminiAutomationCatalog.find((item) => item.section === "directory").stableKey;
    const result = await dispatchExternalGemini({
      db, env: {
        GEMINI_EXTERNAL_AGENT_ENABLED: "true",
        GITHUB_ACTIONS_DISPATCH_TOKEN: "github-test-secret",
        GEMINI_AGENT_CALLBACK_SECRET: "callback-secret",
      },
      stableKey: category, trigger: "MANUAL",
      now: new Date("2026-10-11T20:00:00.000Z"),
    });
    assert.deepEqual(result, { jobId: 7, status: "QUEUED" });
    assert.equal(getJob().status, "RUNNING");
    assert.equal(getJob().error_code, "EXT_MANUAL");
    assert.match(String(request.url), /actions\/workflows\/gemini-notion-agent\.yml\/dispatches$/);
    const parsed = JSON.parse(request.options.body);
    assert.equal(parsed.ref, "main");
    assert.deepEqual(Object.keys(parsed.inputs).sort(),
      ["job_id", "max_new_concepts", "stable_key", "trigger_type"].sort());
    assert.equal(parsed.inputs.max_new_concepts, "5");
    assert.doesNotMatch(request.options.body, /GEMINI_API_KEY|NOTION_API_TOKEN|https:\/\/api.notion.com/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("callback rejects missing signature, then accepts exactly one signed completion", async () => {
  const { db, getJob, runs } = fakeDb();
  const category = geminiAutomationCatalog.find((item) => item.section === "directory").stableKey;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  const config = {
    GEMINI_EXTERNAL_AGENT_ENABLED: "true",
    GITHUB_ACTIONS_DISPATCH_TOKEN: "github-secret",
    GEMINI_AGENT_CALLBACK_SECRET: "hmac-test-secret",
  };
  try {
    await dispatchExternalGemini({ db, env: config, stableKey: category, trigger: "MANUAL" });
  } finally {
    globalThis.fetch = originalFetch;
  }
  const body = JSON.stringify({
    job_id: 7, status: "SUCCESS", concept_count: 2, duplicate_count: 3,
    request_count: 5, search_count: 6, error_code: null,
  });
  assert.equal((await completeExternalGemini({ db, env: config, body, signature: null })).status, 401);
  assert.equal(getJob().status, "RUNNING");
  const signature = "sha256=" + createHmac("sha256", "hmac-test-secret").update(body).digest("hex");
  assert.deepEqual(await completeExternalGemini({ db, env: config, body, signature }),
    { status: 200, ok: true });
  assert.equal(getJob().status, "SUCCESS");
  assert.equal(runs.length, 1);
  assert.equal(runs[0][10], 2);
  assert.equal((await completeExternalGemini({ db, env: config, body, signature })).status, 409);
});

test("manual external opt-in never starts a scheduled job without separate consent", async () => {
  const { db, queries } = fakeDb();
  const env = {
    GEMINI_EXTERNAL_AGENT_ENABLED: "true",
    GITHUB_ACTIONS_DISPATCH_TOKEN: "github-test-secret",
    GEMINI_AGENT_CALLBACK_SECRET: "hmac-test-secret",
  };
  assert.equal(externalAgentEnabled(env), true);
  assert.equal(externalAgentScheduledEnabled(env), false);
  assert.deepEqual(await sweepExternalGemini({ db, env }), {
    dispatched: 0, reason: "SCHEDULE_DISABLED",
  });
  assert.equal(queries.length, 0, "No database job should be reserved");
  await assert.rejects(
    dispatchExternalGemini({ db, env, stableKey: "directory.veterinari", trigger: "SCHEDULED" }),
    (error) => error instanceof ExternalAgentError && error.code === "DISABLED",
  );
  assert.equal(queries.length, 0);
  assert.equal(externalAgentScheduledEnabled({
    ...env, GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "true",
  }), true);
  assert.equal(externalAgentScheduledEnabled({
    ...env, GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "false",
  }), false);
  assert.equal(externalAgentScheduledEnabled({
    GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "true",
  }), false, "Schedule alone must never enable the external worker");
});

test("explicit scheduled opt-in dispatches only one bounded job", async () => {
  const { db, getJob } = fakeDb();
  const originalFetch = globalThis.fetch;
  let dispatches = 0;
  globalThis.fetch = async () => {
    dispatches++;
    return new Response(null, { status: 204 });
  };
  try {
    const result = await sweepExternalGemini({ db, env: {
      GEMINI_EXTERNAL_AGENT_ENABLED: "true",
      GEMINI_EXTERNAL_AGENT_SCHEDULED_ENABLED: "true",
      GITHUB_ACTIONS_DISPATCH_TOKEN: "github-test-secret",
      GEMINI_AGENT_CALLBACK_SECRET: "hmac-test-secret",
    }, now: new Date("2026-10-12T01:00:00.000Z") });
    assert.deepEqual(result, { dispatched: 1 });
    assert.equal(dispatches, 1);
    assert.equal(getJob().error_code, "EXT_SCHEDULED");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Notion category values preserve directory slugs and canonical singular event types", () => {
  for (const item of geminiAutomationCatalog) {
    const expected = item.section === "events"
      ? eventTypeFromPortalSlug(item.subcategory) : item.subcategory;
    assert.ok(expected, "Unknown catalog type: " + item.stableKey);
    assert.equal(notionCategoryValue(item.section, item.subcategory), expected, item.stableKey);
  }
  assert.equal(notionCategoryValue("events", "vystavy"), "Výstava");
  assert.equal(notionCategoryValue("directory", "veterinari"), "veterinari");
  assert.equal(notionCategoryValue("events", "unknown"), null);
  assert.equal(notionCategoryValue("events", "../../secret"), null);
  const worker = readFileSync(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url), "utf8");
  assert.match(worker, /notionCategoryValue\(section, subcategory\)/);
  assert.match(worker, /"Typ podujatia": target\.categoryValue/);
  assert.match(worker, /"Kategória": target\.categoryValue/);
});


test("directory draft preserves verified public contacts and separate official logo/cover URLs", () => {
  const fields = directoryProfileValues({
    name: "AmyVet – Veterinárna klinika Sereď",
    website_url: "https://www.amyvet.sk/",
    phone: "+421 914 434 141",
    email: "info@amyvet.sk",
    address: "Starý Most 3075/13, 926 01 Sereď",
    street: "Starý Most",
    house_number: "3075/13",
    postal_code: "92601",
    district: "Galanta",
    region: "Trnavský kraj",
    facebook_url: "https://www.facebook.com/amyvet/",
    instagram_url: "https://www.instagram.com/amyvet/",
    services: "Veterinárna diagnostika",
    logo_url: "https://www.amyvet.sk/images/logo.png",
    image_url: "https://amyvet.sk/images/clinic.webp",
    image_alt: "Veterinárna klinika",
  });
  assert.equal(fields["Telefón"], "+421 914 434 141");
  assert.equal(fields["E-mail"], "info@amyvet.sk");
  assert.equal(fields["PSČ"], "926 01");
  assert.equal(fields["Číslo domu"], "3075/13");
  assert.equal(fields["Logo URL"], "https://www.amyvet.sk/images/logo.png");
  assert.equal(fields["Hlavný obrázok URL"], "https://amyvet.sk/images/clinic.webp");
  assert.equal(fields["Zdroj obrázka"], "https://www.amyvet.sk/");
  assert.equal(fields["Alt text obrázka"], "Veterinárna klinika");
  assert.equal(fields["Kraj"], "Trnavský kraj");
  assert.equal(fields["Facebook"], "https://www.facebook.com/amyvet/");
  assert.equal(hasMinimumVeterinarianContact({
    "Telefón": { phone_number: fields["Telefón"] },
    "E-mail": { email: fields["E-mail"] },
  }), true);
});

test("directory worker rejects unverified off-site logos and malformed contacts", () => {
  const fields = directoryProfileValues({
    website_url: "https://amyvet.sk",
    phone: "fake", email: "not-an-email", postal_code: "12345678",
    facebook_url: "https://facebook.com.attacker.com/amyvet",
    logo_url: "https://search.example.com/images/some-logo.png",
    image_url: "https://cdn.third-party.example/unknown-photo.jpg",
    address: "",
  });
  assert.equal(fields["Logo URL"], undefined);
  assert.equal(fields["Hlavný obrázok URL"], undefined);
  assert.equal(fields["Zdroj obrázka"], undefined);
  assert.equal(fields["Telefón"], undefined);
  assert.equal(fields["E-mail"], undefined);
  assert.equal(fields["Facebook"], undefined);
  assert.equal(fields["PSČ"], undefined);
  assert.equal(hasMinimumVeterinarianContact(fields), false);
  assert.equal(Object.hasOwn(fields, "Interný e-mail"), false);
  assert.equal(Object.hasOwn(fields, "Psipedia stav"), false);
});

test("vector logos can be saved independently without being sent to raster image ingestion", () => {
  const fields = directoryProfileValues({
    name: "Clinic",
    website_url: "https://example.com",
    logo_url: "https://example.com/static/logo.svg",
  });
  assert.equal(fields["Logo URL"], "https://example.com/static/logo.svg");
  assert.equal(fields["Hlavný obrázok URL"], undefined);
  assert.equal(fields["Alt text obrázka"], undefined);
  const fallback = directoryProfileValues({
    name: "Clinic", website_url: "https://example.com",
    logo_url: "https://example.com/logo.png",
  });
  assert.equal(fallback["Hlavný obrázok URL"], fallback["Logo URL"]);
  assert.equal(fallback["Alt text obrázka"], "Logo Clinic");
});

test("Gemini worker offers actual Notion email/phone encoders and gates empty veterinary drafts", () => {
  const source = readFileSync(new URL("../scripts/gemini-notion-agent.mjs", import.meta.url), "utf8");
  assert.match(source, /if \(schema.type === "email"\) return \{ email: value \}/);
  assert.match(source, /if \(schema.type === "phone_number"\) return \{ phone_number: value \}/);
  assert.match(source, /directoryProfileValues\(args\)/);
  assert.match(source, /hasMinimumVeterinarianContact\(properties\)/);
  assert.match(source, /logo_url: \{ type: "string"/);
  assert.match(source, /image_url: \{ type: "string"/);
  assert.match(source, /"insufficient_verified_contact_details"/);
});

test("remaining unsupported dedicated help agendas cannot reserve or dispatch", async () => {
  for (const stableKey of ["help.adopcia", "help.stratene-a-najdene"]) {
    const { db, queries } = fakeDb();
    await assert.rejects(dispatchExternalGemini({ db, stableKey, trigger: "MANUAL", env: {
      GEMINI_EXTERNAL_AGENT_ENABLED: "true", GITHUB_ACTIONS_DISPATCH_TOKEN: "mock", GEMINI_AGENT_CALLBACK_SECRET: "mock",
    } }), error => error.code === "CATEGORY");
    assert.equal(queries.length, 0);
  }
});

test("concurrent signed callbacks confirm the original job and history exactly once", async () => {
  const { db, runs, getJob } = fakeDb();
  const env = { GEMINI_EXTERNAL_AGENT_ENABLED: "true", GITHUB_ACTIONS_DISPATCH_TOKEN: "mock", GEMINI_AGENT_CALLBACK_SECRET: "mock" };
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try { await dispatchExternalGemini({ db, env, stableKey: "events.vystavy", trigger: "MANUAL" }); }
  finally { globalThis.fetch = original; }
  const body = JSON.stringify({ job_id: 7, status: "SUCCESS", concept_count: 1, duplicate_count: 0, request_count: 3, search_count: 1 });
  const signature = "sha256=" + createHmac("sha256", "mock").update(body).digest("hex");
  const responses = await Promise.all([completeExternalGemini({ db, env, body, signature }), completeExternalGemini({ db, env, body, signature })]);
  assert.deepEqual(responses.map(v => v.status).sort(), [200, 409]);
  assert.equal(getJob().stable_key, "events.vystavy");
  assert.equal(runs.length, 1);
  assert.equal((await completeExternalGemini({ db, env, body: body.replace('"concept_count":1', '"concept_count":2'), signature })).status, 401);
});
