import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

function createD1Adapter(sqlite) {
  const queries = [];
  function statement(sql, bindings = []) {
    function execute() {
      const prepared = sqlite.prepare(sql);
      if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql) || /\bRETURNING\b/i.test(sql))
        return { success: true, results: prepared.all(...bindings), meta: { changes: 0 } };
      const result = prepared.run(...bindings);
      return {
        success: true,
        results: [],
        meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid ?? 0) },
      };
    }
    return {
      bind(...values) {
        return statement(sql, values);
      },
      async all() {
        queries.push({ sql, bindings });
        return execute();
      },
      async first() {
        queries.push({ sql, bindings });
        return execute().results[0] ?? null;
      },
      async run() {
        queries.push({ sql, bindings });
        return execute();
      },
      execute,
    };
  }
  return {
    queries,
    prepare(sql) {
      return statement(sql);
    },
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
    CREATE TABLE navigation_items (
      id TEXT PRIMARY KEY NOT NULL, label TEXT NOT NULL, href TEXT NOT NULL, parent_id TEXT,
      position INTEGER NOT NULL DEFAULT 0, visible INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL, updated_by TEXT NOT NULL
    );
    CREATE TABLE directory_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, name TEXT NOT NULL, category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft', excerpt TEXT NOT NULL, description TEXT NOT NULL,
      services_json TEXT NOT NULL DEFAULT '[]', qualifications_json TEXT NOT NULL DEFAULT '[]', city TEXT NOT NULL,
      district TEXT NOT NULL DEFAULT '', region TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
      postal_code TEXT NOT NULL DEFAULT '', street TEXT NOT NULL DEFAULT '', house_number TEXT NOT NULL DEFAULT '',
      address_format TEXT NOT NULL DEFAULT '', service_address_confirmation TEXT NOT NULL DEFAULT 'LEGACY_UNCONFIRMED',
      online INTEGER NOT NULL DEFAULT 0,
      price_note TEXT NOT NULL DEFAULT '', website_url TEXT,
      public_phone TEXT, public_email TEXT, facebook_url TEXT, instagram_url TEXT,
      internal_email TEXT, image_url TEXT, image_key TEXT,
      thumbnail_display_json TEXT, detail_display_json TEXT, import_key TEXT,
      source_data_json TEXT NOT NULL DEFAULT '{}', search_text TEXT NOT NULL DEFAULT '', verified INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0, seo_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      published_at TEXT, archived_at TEXT, created_by TEXT NOT NULL, updated_by TEXT NOT NULL
    );
  `);
  for (const file of [
    "../drizzle/0003_talented_cammi.sql",
    "../drizzle/0006_solid_captain_marvel.sql",
    "../drizzle/0011_purple_morlocks.sql",
    "../drizzle/0021_mysterious_darkhawk.sql",
    "../drizzle/0031_directory_inquiry_notifications.sql",
    "../drizzle/0035_editorial_notification_outbox.sql",
    "../drizzle/0048_article_feedback_attention_status.sql",
  ]) {
    const migration = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const sql of migration
      .split("--> statement-breakpoint")
      .map((value) => value.trim())
      .filter(Boolean))
      sqlite.exec(sql);
  }
  // The public Directory now requires canonical 0170 and step-1 SQL sidecars.
  // Apply the production schema definitions instead of emulating old JSON reads.
  const canonical = readFileSync(new URL("../drizzle/0170_directory_canonical_sql_slots.sql", import.meta.url), "utf8");
  for (const chunk of canonical.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean)) {
    const sql = chunk.replace(/^--[^\n]*\n/gm, "").trim();
    if (/^CREATE (?:TABLE|INDEX)\b/i.test(sql)) sqlite.exec(sql);
  }
  const structured = readFileSync(new URL("../drizzle/0173_directory_structured_sql_foundation.sql", import.meta.url), "utf8");
  for (const sql of structured.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
    sqlite.exec(sql);
  }
  const presentation = readFileSync(new URL("../db/isolated/directory_admin_sql_completion.sql", import.meta.url), "utf8");
  for (const sql of presentation.split("--> statement-breakpoint").map(value => value.trim()).filter(Boolean))
    sqlite.exec(sql);
  const insert = sqlite.prepare(`
    INSERT INTO directory_profiles (
      slug, name, category, status, excerpt, description, services_json, qualifications_json, city, district, region,
      address, online, price_note, website_url, internal_email, import_key, source_data_json, search_text, verified,
      featured, seo_json, created_at, updated_at, published_at, created_by, updated_by
    ) VALUES (?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, '', 1, 0, '{}', ?, ?, ?, 'seed@psipedia.sk', 'seed@psipedia.sk')
  `);
  const now = "2026-08-29T10:00:00.000Z";
  const profiles = [
    [
      "veterinar-test",
      "Veterina Test",
      "veterinari",
      "Veterinárna starostlivosť pre psy.",
      "Podrobný verejný popis veterinárnej ambulancie.",
      ["Prevencia"],
      ["Stav overenia: čiastočne overené"],
      "Nitra",
      "Nitra",
      "Nitriansky kraj",
      "Hlavná 1",
      "od 20 €",
      "https://vet.example",
      "vet-internal@example.sk",
      "import-vet",
      { Telefón: "+421900111222", "E-mail": "verejny@vet.example", Web: "https://vet.example" },
    ],
    [
      "trener-test",
      "Tréner Test",
      "treneri",
      "Výcvik psov v Bratislave.",
      "Podrobný verejný popis trénera a jeho služieb.",
      ["Individuálny výcvik"],
      [],
      "Bratislava",
      "Bratislava I",
      "Bratislavský kraj",
      "",
      "dohodou",
      "https://trener.example",
      null,
      "import-trener",
      { "Typ služby": "Tréner", Facebook: "https://facebook.com/trener" },
    ],
    [
      "stanica-test",
      "Stanica Test",
      "chovatelske-stanice",
      "Chovateľská stanica border kólií.",
      "Podrobný verejný popis chovateľskej stanice.",
      ["Chov"],
      [],
      "Žilina",
      "Žilina",
      "Žilinský kraj",
      "",
      "",
      "https://stanica.example",
      null,
      "import-stanica",
      {
        Plemeno: "Border kólia",
        "FCI skupina": "1",
        Chovateľ: "Jana Testová",
        "Aktívny chov": "Áno",
      },
    ],
    [
      "vencenie-test",
      "Venčenie Test",
      "vencenie",
      "Spoľahlivé venčenie psov.",
      "Podrobný verejný popis venčenia a starostlivosti.",
      ["Individuálne venčenie"],
      [],
      "Košice",
      "Košice I",
      "Košický kraj",
      "",
      "10 €",
      null,
      null,
      "import-vencenie",
      { "Individuálne venčenie": "Áno", "GPS / foto report": "Áno", Pokrytie: "Košice" },
    ],
    [
      "fyzio-test",
      "Fyzio Test",
      "fyzioterapia",
      "Rehabilitácia a fyzioterapia psov.",
      "Podrobný verejný popis rehabilitačných služieb.",
      ["Hydroterapia"],
      [],
      "Trnava",
      "Trnava",
      "Trnavský kraj",
      "",
      "od 25 €",
      "https://fyzio.example",
      null,
      "import-fyzio",
      { Hydroterapia: "Áno", Laserterapia: "Áno", "Odborník / certifikácia": "MVDr." },
    ],
    [
      "dalsia-test",
      "Ďalšia služba Test",
      "dalsie-sluzby",
      "Fotografovanie psov po celom Slovensku.",
      "Podrobný verejný popis fotografovania psov.",
      ["Fotografovanie"],
      [],
      "Online",
      "",
      "Online",
      "",
      "od 80 €",
      "https://foto.example",
      null,
      "import-dalsia",
      { "Typ služby": "Fotograf", Pokrytie: "Celé Slovensko", "Celoslovenská dostupnosť": "Áno" },
    ],
  ];
  for (const profile of profiles) {
    const created = insert.run(
      profile[0],
      profile[1],
      profile[2],
      profile[3],
      profile[4],
      JSON.stringify(profile[5]),
      JSON.stringify(profile[6]),
      profile[7],
      profile[8],
      profile[9],
      profile[10],
      profile[11],
      profile[12],
      profile[13],
      profile[14],
      JSON.stringify(profile[15]),
      now,
      now,
      now,
    );
    const profileId = Number(created.lastInsertRowid);
    const services = sqlite.prepare(`INSERT INTO directory_profile_service_texts
      (profile_id,item_order,service_text,updated_at,updated_by) VALUES (?,?,?,?,?)`);
    for (const [index,service] of profile[5].entries())
      services.run(profileId,index,service,now,"seed@psipedia.sk");
    const qualifications = sqlite.prepare(`INSERT INTO directory_profile_qualifications
      (profile_id,item_order,qualification_text,updated_at,updated_by) VALUES (?,?,?,?,?)`);
    for (const [index, qualification] of profile[6].entries()) {
      qualifications.run(profileId, index, qualification, now, "seed@psipedia.sk");
    }
    const storedContacts = profile[15];
    sqlite.prepare(`UPDATE directory_profiles SET
      public_phone=?,public_email=?,facebook_url=? WHERE id=?`).run(
      storedContacts["Telefón"] ?? null,storedContacts["E-mail"] ?? null,
      storedContacts["Facebook"] ?? null,profileId,
    );
  }
  return { sqlite, d1: createD1Adapter(sqlite), profiles };
}

async function request(worker, d1, path, init = {}, admin = false) {
  const headers = new Headers(init.headers);
  if (admin) headers.set("oai-authenticated-user-email", "admin@psipedia.sk");
  try {
    return await worker.fetch(
      new Request(`http://localhost${path}`, { ...init, headers }),
      {
        ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
        DB: d1,
        ADMIN_EMAILS: "admin@psipedia.sk",
      },
      { waitUntil() {}, passThroughOnException() {} },
    );
  } catch (error) {
    const latest = d1.queries.at(-1);
    throw new Error(
      `${path}: ${error instanceof Error ? error.message : String(error)}${latest ? `\nLast SQL: ${latest.sql}` : ""}`,
      { cause: error },
    );
  }
}

function proposal(overrides = {}) {
  return {
    profileId: 1,
    requesterName: "Ján Majiteľ",
    requesterEmail: "jan@example.sk",
    requesterPhone: "+421900000000",
    requesterRole: "majiteľ",
    authorized: true,
    consent: true,
    note: "Zmenilo sa telefónne číslo.",
    proposedData: {
      name: "Veterina Test",
      serviceType: "Veterinárne pracovisko",
      city: "Nitra",
      district: "Nitra",
      region: "Nitriansky kraj",
      address: "Hlavná 1",
      phone: "+421911222333",
      email: "verejny@vet.example",
      website: "https://vet.example/",
      facebook: "",
      instagram: "",
      description: "Podrobný verejný popis veterinárnej ambulancie.",
      services: ["Prevencia"],
      priceNote: "od 20 €",
      coverage: "",
      specialized: {},
    },
    ...overrides,
  };
}

test("old public correction URLs redirect to profiles without revealing an anonymous form", async () => {
  const { d1, profiles } = createDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  Object.assign(runtimeEnv, { DB: d1, ADMIN_EMAILS: "admin@psipedia.sk" });
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("retired-public-correction", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);

  for (const [slug, , category] of profiles) {
    const publicPath = `/adresar/${category}/${slug}`;
    const detail = await request(worker, d1, publicPath);
    assert.equal(detail.status, 200);
    const html = await detail.text();
    assert.doesNotMatch(html, /Navrhnúť opravu údajov|partner-profile-correction-heading/);
    assert.doesNotMatch(html, new RegExp(publicPath + "/upravit"));

    const oldForm = await request(worker, d1, publicPath + "/upravit");
    assert.equal(oldForm.status, 308, publicPath);
    const location = new URL(oldForm.headers.get("location"), "http://localhost");
    assert.equal(location.pathname, publicPath);
  }
});

test("retired public profile-change endpoint rejects all proposals without D1 or email writes", async () => {
  const { sqlite, d1 } = createDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  Object.assign(runtimeEnv, { DB: d1, ADMIN_EMAILS: "admin@psipedia.sk", RESEND_API_KEY: "re_test_key" });
  const outbound = [];
  globalThis.fetch = async (...args) => { outbound.push(args); throw new Error("Retired endpoint must not send mail"); };
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("retired-proposal-post", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);
  const before = sqlite.prepare("SELECT * FROM directory_profiles WHERE id=1").get();

  for (const body of [
    proposal(),
    proposal({ requesterEmail: "another@example.sk" }),
    proposal({ profileId: 99999 }),
  ]) {
    const response = await request(worker, d1, "/api/directory/profile-change-requests", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(response.status, 410);
    assert.match((await response.json()).error, /Partner účet/);
    assert.match(response.headers.get("cache-control") ?? "", /(?:^|,\s*)no-store(?:,|$)/);
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_profile_change_requests").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM editorial_notifications WHERE resource_type='directory_profile_change_request'").get().count, 0);
  assert.deepEqual(sqlite.prepare("SELECT * FROM directory_profiles WHERE id=1").get(), before);
  assert.equal(outbound.length, 0);
});

test("editorial notifications follow successful inserts and email failures never undo stored data", async () => {
  const { sqlite, d1 } = createDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  const resendRequests = [];
  Object.assign(runtimeEnv, {
    DB: d1,
    ADMIN_EMAILS: "admin@psipedia.sk",
    EDITORIAL_FROM_EMAIL: "redakcia@psipedia.sk",
    RESEND_API_KEY: "re_test_key",
  });
  delete runtimeEnv.EDITORIAL_EMAIL;
  globalThis.fetch = async (url, init) => {
    resendRequests.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return Response.json({ id: `email-test-${resendRequests.length}` }, { status: 200 });
  };
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("editorial-email", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);

  const invalidInquiry = await request(worker, d1, "/api/directory/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profileId: 1,
      senderName: "Ján",
      senderEmail: "zly-email",
      message: "Dostatočne dlhá testovacia správa.",
      consent: true,
      submissionKey: "10000000-0000-4000-8000-000000000001",
    }),
  });
  assert.equal(invalidInquiry.status, 400);
  assert.equal(resendRequests.length, 0);

  const inquiry = await request(worker, d1, "/api/directory/inquiries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profileId: 1,
      senderName: "Ján Klient",
      senderEmail: "jan@example.sk",
      senderPhone: "+421900123456",
      dogInfo: "Dvojročný labrador",
      message: "Prosím o termín preventívnej prehliadky môjho psa.",
      consent: true,
      submissionKey: "10000000-0000-4000-8000-000000000002",
    }),
  });
  assert.equal(inquiry.status, 201);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_inquiries").get().count, 1);
  assert.match(resendRequests.at(-1).body.subject, /^Nový dopyt: Veterina Test$/);
  assert.match(resendRequests.at(-1).body.text, /preventívnej prehliadky/);
  assert.match(resendRequests.at(-1).body.text, /admin\/dopyty#dopyt-1/);
  assert.doesNotMatch(
    resendRequests.at(-1).body.text,
    /jan@example\.sk|\+421900123456|Dvojročný labrador/,
  );

  const tip = await request(worker, d1, "/api/news-tips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      topic: "iny",
      title: "Nové podujatie pre psov",
      summary: "V Nitre sa pripravuje verejné podujatie pre psov a ich majiteľov.",
      sourceUrl: "https://example.sk/zdroj",
      location: "Nitra",
      eventDate: "2026-09-20",
      contactName: "Anna Tipérka",
      contactEmail: "anna@example.sk",
      consent: true,
    }),
  });
  assert.equal(tip.status, 201);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM news_tips").get().count, 1);
  assert.match(resendRequests.at(-1).body.subject, /^\[Tip pre redakciu\]/);
  assert.match(resendRequests.at(-1).body.text, /admin\/tipy#tip-1/);

  const positive = await request(worker, d1, "/api/article-feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      articlePath: "/clanky/test",
      articleTitle: "Testovací článok",
      helpful: true,
      missingText: "",
    }),
  });
  assert.equal(positive.status, 201);
  assert.equal(
    resendRequests.length,
    2,
    "positive usefulness votes do not require editorial action",
  );
  assert.equal(
    sqlite
      .prepare(
        "SELECT COUNT(*) AS count FROM editorial_notifications WHERE resource_type = 'article_feedback'",
      )
      .get().count,
    0,
  );

  const negative = await request(worker, d1, "/api/article-feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      articlePath: "/clanky/test",
      articleTitle: "Testovací článok",
      helpful: false,
      missingText: "V článku chýba dôležitý zdroj.",
    }),
  });
  assert.equal(negative.status, 201);
  assert.equal(resendRequests.length, 3);
  assert.match(resendRequests.at(-1).body.subject, /^\[Podnet k článku\]/);
  assert.match(resendRequests.at(-1).body.text, /V článku chýba dôležitý zdroj/);

  const failureCases = [
    {
      label: "missing API key",
      email: "missing-key@example.sk",
      key: "10000000-0000-4000-8000-000000000010",
      prepare() {
        delete runtimeEnv.RESEND_API_KEY;
        globalThis.fetch = async () => {
          throw new Error("fetch must not run without key");
        };
      },
    },
    {
      label: "Resend 400",
      email: "resend-400@example.sk",
      key: "10000000-0000-4000-8000-000000000011",
      prepare() {
        runtimeEnv.RESEND_API_KEY = "re_test_key";
        globalThis.fetch = async () => new Response("bad request", { status: 400 });
      },
    },
    {
      label: "Resend 500",
      email: "resend-500@example.sk",
      key: "10000000-0000-4000-8000-000000000012",
      prepare() {
        runtimeEnv.RESEND_API_KEY = "re_test_key";
        globalThis.fetch = async () => new Response("server error", { status: 500 });
      },
    },
    {
      label: "network exception",
      email: "network-error@example.sk",
      key: "10000000-0000-4000-8000-000000000013",
      prepare() {
        runtimeEnv.RESEND_API_KEY = "re_test_key";
        globalThis.fetch = async () => {
          throw new Error("simulated network failure");
        };
      },
    },
  ];
  for (const [index, failure] of failureCases.entries()) {
    failure.prepare();
    const beforeCount = sqlite
      .prepare("SELECT COUNT(*) AS count FROM directory_inquiries")
      .get().count;
    const response = await request(worker, d1, "/api/directory/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profileId: 1,
        senderName: `Klient ${index + 1}`,
        senderEmail: failure.email,
        message: "Prosím o ďalší dostupný termín pre môjho psa.",
        consent: true,
        submissionKey: failure.key,
      }),
    });
    assert.equal(response.status, 201, failure.label);
    assert.deepEqual(await response.json(), { success: true }, failure.label);
    assert.equal(
      sqlite.prepare("SELECT COUNT(*) AS count FROM directory_inquiries").get().count,
      beforeCount + 1,
      `${failure.label}: stored inquiry survives email failure`,
    );
  }
});

test("remaining editorial tip and feedback flows retry once without retired public proposal writes", async () => {
  const { sqlite, d1 } = createDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  Object.assign(runtimeEnv, {
    DB: d1,
    ADMIN_EMAILS: "admin@psipedia.sk",
    EDITORIAL_FROM_EMAIL: "redakcia@psipedia.sk",
    RESEND_API_KEY: "re_test_key",
  });
  const failedRequests = [];
  globalThis.fetch = async (url, init) => {
    failedRequests.push({ url: String(url), init });
    return new Response("temporary failure", { status: 503 });
  };
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("editorial-outbox", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);

  const tip = await request(worker, d1, "/api/news-tips", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      topic: "iny",
      title: "Outbox test podujatia",
      summary: "Dostatočne podrobný opis testovacieho podujatia pre spoľahlivú notifikáciu.",
      contactEmail: "outbox-tip@example.sk",
      consent: true,
    }),
  });
  const negative = await request(worker, d1, "/api/article-feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      articlePath: "/clanky/outbox-test",
      articleTitle: "Outbox test článku",
      helpful: false,
      missingText: "Chýba zdroj.",
    }),
  });
  assert.deepEqual(
    [tip.status, negative.status],
    [201, 201],
    "Resend failure must not fail saved submissions",
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS count FROM directory_profile_change_requests").get().count,
    0,
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM news_tips").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM article_feedback").get().count, 1);
  const failed = sqlite
    .prepare("SELECT * FROM editorial_notifications ORDER BY resource_type")
    .all();
  assert.equal(failed.length, 2);
  for (const row of failed) {
    assert.equal(row.status, "failed");
    assert.equal(row.attempts, 1);
    assert.equal(row.last_error, "resend_http_503");
    assert.equal(row.provider_message_id, null);
  }
  assert.equal(failedRequests.length, 2);
  const firstAttemptKeys = failedRequests
    .map((entry) => entry.init.headers["Idempotency-Key"])
    .sort();

  const sentRequests = [];
  globalThis.fetch = async (url, init) => {
    sentRequests.push({ url: String(url), init });
    return Response.json({ id: `provider-${sentRequests.length}` }, { status: 200 });
  };
  const scheduledEnv = {
    DB: d1,
    RESEND_API_KEY: "re_test_key",
    EDITORIAL_FROM_EMAIL: "redakcia@psipedia.sk",
  };
  Object.assign(runtimeEnv, scheduledEnv);
  await worker.scheduled({}, scheduledEnv, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(sentRequests.length, 2);
  const keys = sentRequests.map((entry) => entry.init.headers["Idempotency-Key"]).sort();
  assert.deepEqual(keys, [
    "editorial/article_feedback/new/1",
    "editorial/news_tip/new/1",
  ]);
  assert.deepEqual(keys, firstAttemptKeys, "retry must reuse the original Resend idempotency keys");
  const sent = sqlite.prepare("SELECT * FROM editorial_notifications ORDER BY resource_type").all();
  for (const row of sent) {
    assert.equal(row.status, "sent");
    assert.equal(row.attempts, 2);
    assert.ok(row.sent_at);
    assert.match(row.provider_message_id, /^provider-/);
    assert.equal(row.last_error, null);
  }
  await worker.scheduled({}, scheduledEnv, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(sentRequests.length, 2, "sent notifications must not be delivered twice");
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS count FROM directory_profile_change_requests").get().count,
    0,
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM news_tips").get().count, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM article_feedback").get().count, 1);
});

test("retired Admin proposal page and API are gone; Partner workflow stays separate", async () => {
  const { sqlite, d1 } = createDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  Object.assign(runtimeEnv, { DB: d1, ADMIN_EMAILS: "admin@psipedia.sk" });
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("removed-proposal-admin", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);
  const mutation = {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  };
  for (const path of ["/api/admin/profile-change-requests", "/admin/adresar/navrhy"]) {
    const response = await request(worker, d1, path, {}, true);
    assert.equal(response.status, 404, path);
  }
  assert.equal((await request(worker, d1, "/api/admin/profile-change-requests/1", mutation, true)).status, 404);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_profile_change_requests").get().count, 0);
});

test("public contact and Resend transport stay restricted to the editorial inbox", () => {
  const contact = readFileSync(new URL("../lib/public-contact.ts", import.meta.url), "utf8");
  const privacy = readFileSync(new URL("../app/sukromie/page.tsx", import.meta.url), "utf8");
  const corrections = readFileSync(
    new URL("../app/opravy-a-podnety/page.tsx", import.meta.url),
    "utf8",
  );
  const legal = readFileSync(new URL("../app/pravne-informacie/page.tsx", import.meta.url), "utf8");
  const footer = readFileSync(new URL("../components/site-footer.tsx", import.meta.url), "utf8");
  const editorialEmail = readFileSync(
    new URL("../lib/editorial-email.ts", import.meta.url),
    "utf8",
  );
  const wrangler = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.match(contact, /psipedia\.sk@gmail\.com/);
  for (const source of [privacy, corrections, legal, footer])
    assert.match(source, /EDITORIAL_EMAIL_ADDRESS/);
  assert.equal(wrangler.send_email, undefined);
  assert.match(editorialEmail, /RESEND_API_KEY/);
  assert.match(editorialEmail, /https:\/\/api\.resend\.com\/emails/);
  assert.doesNotMatch(editorialEmail, /EDITORIAL_EMAIL\??:|bindings\.EDITORIAL_EMAIL|send_email/);
});
