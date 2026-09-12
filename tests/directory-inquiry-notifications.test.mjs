import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function createD1Adapter(sqlite) {
  const queries = [];
  function statement(sql, bindings = []) {
    function execute() {
      const prepared = sqlite.prepare(sql);
      if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
        return { success: true, results: prepared.all(...bindings), meta: { changes: 0 } };
      }
      const result = prepared.run(...bindings);
      return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid ?? 0) } };
    }
    return {
      bind(...values) { return statement(sql, values); },
      async all() { queries.push({ sql, bindings }); return execute(); },
      async first() { queries.push({ sql, bindings }); return execute().results[0] ?? null; },
      async run() { queries.push({ sql, bindings }); return execute(); },
      execute,
    };
  }
  return {
    queries,
    prepare(sql) { return statement(sql); },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((item) => item.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function createDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      internal_email TEXT
    );
    CREATE TABLE directory_inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER,
      profile_name TEXT NOT NULL,
      profile_slug TEXT NOT NULL,
      profile_category TEXT NOT NULL,
      recipient_email TEXT,
      sender_name TEXT NOT NULL,
      sender_email TEXT NOT NULL,
      sender_phone TEXT NOT NULL DEFAULT '',
      dog_info TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'new',
      consent INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX directory_inquiries_status_created_idx ON directory_inquiries(status, created_at);
    CREATE INDEX directory_inquiries_profile_idx ON directory_inquiries(profile_id, created_at);
    CREATE INDEX directory_inquiries_email_idx ON directory_inquiries(sender_email, created_at);
  `);
  const migration = readFileSync(new URL("../drizzle/0031_directory_inquiry_notifications.sql", import.meta.url), "utf8");
  sqlite.exec(migration);
  sqlite.prepare(`INSERT INTO directory_profiles (id, slug, name, category, status, internal_email) VALUES (1, ?, ?, 'veterinari', 'published', ?)`)
    .run("veterina-test", "Veterina Test", "provider@example.sk");
  return { sqlite, d1: createD1Adapter(sqlite) };
}

function inquiryPayload(overrides = {}) {
  return {
    profileId: 1,
    senderName: "Ján Test",
    senderEmail: "visitor-secret@example.com",
    senderPhone: "+421900111222",
    dogInfo: "Labrador, 4 roky",
    message: "Dobrý deň, potrebujem konzultáciu k zdravotnému problému môjho psa a chcel by som sa informovať o voľnom termíne.",
    consent: true,
    submissionKey: "11111111-1111-4111-8111-111111111111",
    ...overrides,
  };
}

function configureRuntime(d1, extras = {}) {
  const runtime = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  for (const key of ["DB", "ADMIN_EMAILS", "RESEND_API_KEY", "EDITORIAL_FROM_EMAIL"]) delete runtime[key];
  Object.assign(runtime, {
    DB: d1,
    ADMIN_EMAILS: "admin@psipedia.sk",
    ...extras,
  });
  return runtime;
}

async function loadWorker(label) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("directory-inquiry-notifications", `${label}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

async function request(worker, d1, path, init = {}, admin = false, extras = {}) {
  const headers = new Headers(init.headers);
  if (admin) headers.set("oai-authenticated-user-email", "admin@psipedia.sk");
  configureRuntime(d1, extras);
  return worker.fetch(
    new Request(`http://localhost${path}`, { ...init, headers }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      DB: d1,
      ADMIN_EMAILS: "admin@psipedia.sk",
      ...extras,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function seedInquiry(sqlite, {
  status = "new",
  createdAt = new Date().toISOString(),
  submissionKey = null,
  profileName = "Veterina Test",
  senderName = "Ján Test",
  message = "Dopyt s dostatočne dlhou správou na uloženie v databáze.",
} = {}) {
  const result = sqlite.prepare(`
    INSERT INTO directory_inquiries (
      profile_id, profile_name, profile_slug, profile_category, recipient_email,
      sender_name, sender_email, sender_phone, dog_info, message, status, consent,
      created_at, updated_at, submission_key
    ) VALUES (1, ?, 'veterina-test', 'veterinari', 'provider@example.sk', ?, 'visitor@example.com', '+421900000000', '', ?, ?, 1, ?, ?, ?)
  `).run(profileName, senderName, message, status, createdAt, createdAt, submissionKey);
  return Number(result.lastInsertRowid);
}

test("new inquiry sends one safe idempotent notification and duplicate submissionKey does not duplicate inquiry or email", async () => {
  const { sqlite, d1 } = createDatabase();
  sqlite.prepare("UPDATE directory_profiles SET name = ? WHERE id = 1").run("Vet <Alpha & Beta>");
  const resendRequests = [];
  const longMessage = `Potrebujem konzultáciu <img src=x onerror=alert(1)> ${"bezpecny text ".repeat(30)}KONIEC-CELEJ-SPRAVY`;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), RESEND_ENDPOINT);
    resendRequests.push({ url: String(url), init, body: JSON.parse(String(init.body)) });
    return Response.json({ id: "email-new-1" }, { status: 200 });
  };
  const extras = { RESEND_API_KEY: "re_test_key", EDITORIAL_FROM_EMAIL: "Psipedia <notifikacie@psipedia.sk>" };
  configureRuntime(d1, extras);
  const worker = await loadWorker("new-success");
  const payload = inquiryPayload({
    senderName: "Ján <script>alert(1)</script>",
    message: longMessage,
  });

  const first = await request(worker, d1, "/api/directory/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, false, extras);
  assert.equal(first.status, 201);
  assert.deepEqual(await first.json(), { success: true });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_inquiries").get().count, 1);
  const outbox = sqlite.prepare("SELECT * FROM directory_inquiry_notifications").get();
  assert.equal(outbox.notification_type, "new");
  assert.equal(outbox.status, "sent");
  assert.equal(outbox.attempts, 1);
  assert.equal(outbox.provider_message_id, "email-new-1");
  assert.ok(outbox.sent_at);

  assert.equal(resendRequests.length, 1);
  const sent = resendRequests[0];
  assert.equal(sent.init.headers["Idempotency-Key"], "directory-inquiry/new/1");
  assert.equal(sent.body.to, "psipedia.sk@gmail.com");
  assert.equal(sent.body.subject, "Nový dopyt: Vet <Alpha & Beta>");
  assert.match(sent.body.html, /Vet &lt;Alpha &amp; Beta&gt;/);
  assert.match(sent.body.html, /Ján &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(sent.body.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(sent.body.html, /<script>|<img src=x/i);
  assert.doesNotMatch(JSON.stringify(sent.body), /visitor-secret@example\.com|\+421900111222|Labrador, 4 roky/);
  assert.doesNotMatch(`${sent.body.text}\n${sent.body.html}`, /KONIEC-CELEJ-SPRAVY/);
  assert.match(sent.body.text, /https:\/\/psipedia\.sk\/admin\/dopyty#dopyt-1/);

  const duplicate = await request(worker, d1, "/api/directory/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, false, extras);
  assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), { success: true });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_inquiries").get().count, 1);
  assert.equal(sqlite.prepare("SELECT attempts FROM directory_inquiry_notifications WHERE notification_type = 'new'").get().attempts, 1);
  assert.equal(resendRequests.length, 1);
});

test("failed Resend preserves inquiry and failed outbox, then retry succeeds with same idempotency key", async () => {
  const { sqlite, d1 } = createDatabase();
  const resendRequests = [];
  let attempt = 0;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), RESEND_ENDPOINT);
    resendRequests.push({ init, body: JSON.parse(String(init.body)) });
    attempt += 1;
    if (attempt === 1) return Response.json({ message: "temporary unavailable" }, { status: 503 });
    return Response.json({ id: "email-retry-1" }, { status: 200 });
  };
  const extras = { RESEND_API_KEY: "re_test_key", EDITORIAL_FROM_EMAIL: "notifikacie@psipedia.sk" };
  configureRuntime(d1, extras);
  const worker = await loadWorker("retry-success");
  const payload = inquiryPayload({ submissionKey: "22222222-2222-4222-8222-222222222222" });

  const first = await request(worker, d1, "/api/directory/inquiries", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  }, false, extras);
  assert.equal(first.status, 201, "email failure must not fail the inquiry request");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_inquiries").get().count, 1);
  let outbox = sqlite.prepare("SELECT * FROM directory_inquiry_notifications WHERE notification_type = 'new'").get();
  assert.equal(outbox.status, "failed");
  assert.equal(outbox.attempts, 1);
  assert.equal(outbox.last_error, "resend_http_503");
  assert.equal(outbox.sent_at, null);

  const retry = await request(worker, d1, "/api/directory/inquiries", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  }, false, extras);
  assert.equal(retry.status, 200);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_inquiries").get().count, 1);
  outbox = sqlite.prepare("SELECT * FROM directory_inquiry_notifications WHERE notification_type = 'new'").get();
  assert.equal(outbox.status, "sent");
  assert.equal(outbox.attempts, 2);
  assert.equal(outbox.provider_message_id, "email-retry-1");
  assert.equal(outbox.last_error, null);
  assert.ok(outbox.sent_at);
  assert.equal(resendRequests.length, 2);
  assert.equal(resendRequests[0].init.headers["Idempotency-Key"], "directory-inquiry/new/1");
  assert.equal(resendRequests[1].init.headers["Idempotency-Key"], "directory-inquiry/new/1");
});

test("admin badge reflects new inquiry count and decreases after new to read", async () => {
  const { sqlite, d1 } = createDatabase();
  const firstId = seedInquiry(sqlite, { status: "new" });
  seedInquiry(sqlite, { status: "new" });
  seedInquiry(sqlite, { status: "read" });
  globalThis.fetch = async () => { throw new Error("Unexpected external fetch"); };
  configureRuntime(d1);
  const worker = await loadWorker("admin-badge");

  const before = await request(worker, d1, "/admin/dopyty", { method: "GET" }, true);
  assert.equal(before.status, 200);
  const beforeHtml = await before.text();
  assert.match(beforeHtml, /aria-label="2 nových dopytov"/);

  const update = await request(worker, d1, `/api/admin/inquiries/${firstId}`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "read" }),
  }, true);
  assert.equal(update.status, 200);
  const after = await request(worker, d1, "/admin/dopyty", { method: "GET" }, true);
  assert.equal(after.status, 200);
  const afterHtml = await after.text();
  assert.match(afterHtml, /aria-label="1 nových dopytov"/);
  assert.doesNotMatch(afterHtml, /aria-label="2 nových dopytov"/);
});

test("hourly reminder sends only for new inquiries older than 24h and only once", async () => {
  const { sqlite, d1 } = createDatabase();
  const now = Date.now();
  const oldNewId = seedInquiry(sqlite, { status: "new", createdAt: new Date(now - 25 * 60 * 60 * 1000).toISOString() });
  seedInquiry(sqlite, { status: "new", createdAt: new Date(now - 23 * 60 * 60 * 1000).toISOString() });
  seedInquiry(sqlite, { status: "read", createdAt: new Date(now - 30 * 60 * 60 * 1000).toISOString() });
  const resendRequests = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), RESEND_ENDPOINT);
    resendRequests.push({ init, body: JSON.parse(String(init.body)) });
    return Response.json({ id: `email-stale-${resendRequests.length}` }, { status: 200 });
  };
  const extras = { RESEND_API_KEY: "re_test_key", EDITORIAL_FROM_EMAIL: "notifikacie@psipedia.sk" };
  const runtime = configureRuntime(d1, extras);
  const worker = await loadWorker("stale-reminder");
  const scheduledEnv = { DB: d1, ...extras };

  await worker.scheduled({}, scheduledEnv, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(resendRequests.length, 1);
  assert.equal(resendRequests[0].init.headers["Idempotency-Key"], `directory-inquiry/stale-24h/${oldNewId}`);
  assert.match(resendRequests[0].body.subject, /^Nevybavený dopyt po 24 h:/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_inquiry_notifications WHERE notification_type = 'stale-24h'").get().count, 1);
  const reminder = sqlite.prepare("SELECT * FROM directory_inquiry_notifications WHERE notification_type = 'stale-24h'").get();
  assert.equal(reminder.inquiry_id, oldNewId);
  assert.equal(reminder.status, "sent");

  Object.assign(runtime, scheduledEnv);
  await worker.scheduled({}, scheduledEnv, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(resendRequests.length, 1, "second hourly sweep must not resend an already sent reminder");
  assert.equal(sqlite.prepare("SELECT attempts FROM directory_inquiry_notifications WHERE inquiry_id = ? AND notification_type = 'stale-24h'").get(oldNewId).attempts, 1);
});
