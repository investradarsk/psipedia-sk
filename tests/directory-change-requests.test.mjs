import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

function createD1Adapter(sqlite) {
  const queries = [];
  function statement(sql, bindings = []) {
    function execute() {
      const prepared = sqlite.prepare(sql);
      if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { success: true, results: prepared.all(...bindings), meta: { changes: 0 } };
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
      try { const results = statements.map((item) => item.execute()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
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
      district TEXT NOT NULL DEFAULT '', region TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', online INTEGER NOT NULL DEFAULT 0,
      price_note TEXT NOT NULL DEFAULT '', website_url TEXT, internal_email TEXT, image_url TEXT, image_key TEXT, import_key TEXT,
      source_data_json TEXT NOT NULL DEFAULT '{}', search_text TEXT NOT NULL DEFAULT '', verified INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0, seo_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      published_at TEXT, created_by TEXT NOT NULL, updated_by TEXT NOT NULL
    );
  `);
  for (const file of [
    "../drizzle/0003_talented_cammi.sql",
    "../drizzle/0006_solid_captain_marvel.sql",
    "../drizzle/0011_purple_morlocks.sql",
    "../drizzle/0021_mysterious_darkhawk.sql",
  ]) {
    const migration = readFileSync(new URL(file, import.meta.url), "utf8");
    for (const sql of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) sqlite.exec(sql);
  }
  const insert = sqlite.prepare(`
    INSERT INTO directory_profiles (
      slug, name, category, status, excerpt, description, services_json, qualifications_json, city, district, region,
      address, online, price_note, website_url, internal_email, import_key, source_data_json, search_text, verified,
      featured, seo_json, created_at, updated_at, published_at, created_by, updated_by
    ) VALUES (?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, '', 1, 0, '{}', ?, ?, ?, 'seed@psipedia.sk', 'seed@psipedia.sk')
  `);
  const now = "2026-08-29T10:00:00.000Z";
  const profiles = [
    ["veterinar-test", "Veterina Test", "veterinari", "Veterinárna starostlivosť pre psy.", "Podrobný verejný popis veterinárnej ambulancie.", ["Prevencia"], ["Stav overenia: čiastočne overené"], "Nitra", "Nitra", "Nitriansky kraj", "Hlavná 1", "od 20 €", "https://vet.example", "vet-internal@example.sk", "import-vet", { Telefón: "+421900111222", "E-mail": "verejny@vet.example", Web: "https://vet.example" }],
    ["trener-test", "Tréner Test", "treneri", "Výcvik psov v Bratislave.", "Podrobný verejný popis trénera a jeho služieb.", ["Individuálny výcvik"], [], "Bratislava", "Bratislava I", "Bratislavský kraj", "", "dohodou", "https://trener.example", null, "import-trener", { "Typ služby": "Tréner", Facebook: "https://facebook.com/trener" }],
    ["stanica-test", "Stanica Test", "chovatelske-stanice", "Chovateľská stanica border kólií.", "Podrobný verejný popis chovateľskej stanice.", ["Chov"], [], "Žilina", "Žilina", "Žilinský kraj", "", "", "https://stanica.example", null, "import-stanica", { Plemeno: "Border kólia", "FCI skupina": "1", Chovateľ: "Jana Testová", "Aktívny chov": "Áno" }],
    ["vencenie-test", "Venčenie Test", "vencenie", "Spoľahlivé venčenie psov.", "Podrobný verejný popis venčenia a starostlivosti.", ["Individuálne venčenie"], [], "Košice", "Košice I", "Košický kraj", "", "10 €", null, null, "import-vencenie", { "Individuálne venčenie": "Áno", "GPS / foto report": "Áno", Pokrytie: "Košice" }],
    ["fyzio-test", "Fyzio Test", "fyzioterapia", "Rehabilitácia a fyzioterapia psov.", "Podrobný verejný popis rehabilitačných služieb.", ["Hydroterapia"], [], "Trnava", "Trnava", "Trnavský kraj", "", "od 25 €", "https://fyzio.example", null, "import-fyzio", { Hydroterapia: "Áno", Laserterapia: "Áno", "Odborník / certifikácia": "MVDr." }],
    ["dalsia-test", "Ďalšia služba Test", "dalsie-sluzby", "Fotografovanie psov po celom Slovensku.", "Podrobný verejný popis fotografovania psov.", ["Fotografovanie"], [], "Online", "", "Online", "", "od 80 €", "https://foto.example", null, "import-dalsia", { "Typ služby": "Fotograf", Pokrytie: "Celé Slovensko", "Celoslovenská dostupnosť": "Áno" }],
  ];
  for (const profile of profiles) insert.run(
    profile[0], profile[1], profile[2], profile[3], profile[4], JSON.stringify(profile[5]), JSON.stringify(profile[6]),
    profile[7], profile[8], profile[9], profile[10], profile[11], profile[12], profile[13], profile[14], JSON.stringify(profile[15]), now, now, now,
  );
  return { sqlite, d1: createD1Adapter(sqlite), profiles };
}

async function request(worker, d1, path, init = {}, admin = false) {
  const headers = new Headers(init.headers);
  if (admin) headers.set("oai-authenticated-user-email", "admin@psipedia.sk");
  try {
    return await worker.fetch(new Request(`http://localhost${path}`, { ...init, headers }), {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) }, DB: d1, ADMIN_EMAILS: "admin@psipedia.sk",
    }, { waitUntil() {}, passThroughOnException() {} });
  } catch (error) {
    const latest = d1.queries.at(-1);
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}${latest ? `\nLast SQL: ${latest.sql}` : ""}`, { cause: error });
  }
}

function proposal(overrides = {}) {
  return {
    profileId: 1, requesterName: "Ján Majiteľ", requesterEmail: "jan@example.sk", requesterPhone: "+421900000000",
    requesterRole: "majiteľ", authorized: true, consent: true, note: "Zmenilo sa telefónne číslo.",
    proposedData: {
      name: "Veterina Test", serviceType: "Veterinárne pracovisko", city: "Nitra", district: "Nitra", region: "Nitriansky kraj",
      address: "Hlavná 1", phone: "+421911222333", email: "verejny@vet.example", website: "https://vet.example/",
      facebook: "", instagram: "", description: "Podrobný verejný popis veterinárnej ambulancie.", services: ["Prevencia"],
      priceNote: "od 20 €", coverage: "", online: false, specialized: {},
    }, ...overrides,
  };
}

test("profile-specific forms are prefilled for representative directory categories and keep verification private", async () => {
  const { d1, profiles } = createDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  Object.assign(runtimeEnv, { DB: d1, ADMIN_EMAILS: "admin@psipedia.sk" });
  const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("change-form", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);
  for (const [slug, name, category] of profiles) {
    const detail = await request(worker, d1, `/adresar/${category}/${slug}`);
    assert.equal(detail.status, 200);
    assert.match(await detail.text(), new RegExp(`/adresar/${category}/${slug}/upravit`));
    const form = await request(worker, d1, `/adresar/${category}/${slug}/upravit`);
    assert.equal(form.status, 200, `${category}/${slug}`);
    const html = await form.text();
    assert.match(html, /Navrhnúť úpravu profilu/);
    assert.match(html, new RegExp(name));
    assert.doesNotMatch(html, /Stav overenia|čiastočne overené|import-vet|vet-internal@example\.sk/i);
  }
  const kennel = await request(worker, d1, "/adresar/chovatelske-stanice/stanica-test/upravit");
  assert.match(await kennel.text(), /Border kólia/);
  const walking = await request(worker, d1, "/adresar/vencenie/vencenie-test/upravit");
  assert.match(await walking.text(), /GPS \/ foto report/);
  const physio = await request(worker, d1, "/adresar/fyzioterapia/fyzio-test/upravit");
  assert.match(await physio.text(), /Odborník \/ certifikácia/);
});

test("server validation stores a separate request and never changes the profile", async () => {
  const { sqlite, d1 } = createDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  const emails = [];
  Object.assign(runtimeEnv, {
    DB: d1,
    ADMIN_EMAILS: "admin@psipedia.sk",
    EDITORIAL_FROM_EMAIL: "redakcia@psipedia.sk",
    EDITORIAL_EMAIL: { async send(message) { emails.push(message); } },
  });
  const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("change-submit", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);
  const before = sqlite.prepare("SELECT * FROM directory_profiles WHERE id = 1").get();

  for (const [label, body] of [
    ["required authorization", proposal({ authorized: false })],
    ["invalid requester email", proposal({ requesterEmail: "zly-email" })],
    ["invalid URL", proposal({ proposedData: { ...proposal().proposedData, website: "javascript:alert(1)" } })],
    ["missing profile", proposal({ profileId: 99999 })],
  ]) {
    const response = await request(worker, d1, "/api/directory/profile-change-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 400, label);
  }
  assert.equal(emails.length, 0, "validation errors must not send email");

  const success = await request(worker, d1, "/api/directory/profile-change-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(proposal()) });
  assert.equal(success.status, 201);
  assert.deepEqual(await success.json(), { success: true });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_profile_change_requests").get().count, 1);
  const stored = sqlite.prepare("SELECT * FROM directory_profile_change_requests").get();
  assert.equal(stored.profile_id, 1);
  assert.equal(stored.profile_name, "Veterina Test");
  assert.equal(stored.profile_slug, "veterinar-test");
  assert.equal(stored.profile_category, "veterinari");
  assert.equal(stored.status, "new");
  assert.equal(JSON.parse(stored.proposed_data_json).phone, "+421911222333");
  assert.deepEqual(sqlite.prepare("SELECT * FROM directory_profiles WHERE id = 1").get(), before);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].to, "psipedia.sk@gmail.com");
  assert.match(emails[0].subject, /^\[Návrh profilu\] Veterina Test$/);
  assert.match(emails[0].text, /Veterina Test/);
  assert.match(emails[0].text, /https:\/\/psipedia\.sk\/admin\/adresar\/navrhy#navrh-1/);
  assert.doesNotMatch(emails[0].text, /proposed_data_json|Navrhované údaje/i);

  const bot = await request(worker, d1, "/api/directory/profile-change-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...proposal(), company: "spam" }) });
  assert.equal(bot.status, 201);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_profile_change_requests").get().count, 1);
});

test("editorial notifications follow successful inserts and email failures never undo stored data", async () => {
  const { sqlite, d1 } = createDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  const emails = [];
  Object.assign(runtimeEnv, {
    DB: d1,
    ADMIN_EMAILS: "admin@psipedia.sk",
    EDITORIAL_FROM_EMAIL: "redakcia@psipedia.sk",
    EDITORIAL_EMAIL: { async send(message) { emails.push(message); } },
  });
  const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("editorial-email", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);

  const invalidInquiry = await request(worker, d1, "/api/directory/inquiries", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ profileId: 1, senderName: "Ján", senderEmail: "zly-email", message: "Dostatočne dlhá testovacia správa.", consent: true }),
  });
  assert.equal(invalidInquiry.status, 400);
  assert.equal(emails.length, 0);

  const inquiry = await request(worker, d1, "/api/directory/inquiries", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ profileId: 1, senderName: "Ján Klient", senderEmail: "jan@example.sk", senderPhone: "+421900123456", dogInfo: "Dvojročný labrador", message: "Prosím o termín preventívnej prehliadky môjho psa.", consent: true }),
  });
  assert.equal(inquiry.status, 201);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_inquiries").get().count, 1);
  assert.match(emails.at(-1).subject, /^\[Dopyt\] Veterina Test$/);
  assert.match(emails.at(-1).text, /preventívnej prehliadky/);
  assert.match(emails.at(-1).text, /admin\/dopyty#dopyt-1/);

  const tip = await request(worker, d1, "/api/news-tips", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ topic: "iny", title: "Nové podujatie pre psov", summary: "V Nitre sa pripravuje verejné podujatie pre psov a ich majiteľov.", sourceUrl: "https://example.sk/zdroj", location: "Nitra", eventDate: "2026-09-20", contactName: "Anna Tipérka", contactEmail: "anna@example.sk", consent: true }),
  });
  assert.equal(tip.status, 201);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM news_tips").get().count, 1);
  assert.match(emails.at(-1).subject, /^\[Tip pre redakciu\]/);
  assert.match(emails.at(-1).text, /admin\/tipy#tip-1/);

  const positive = await request(worker, d1, "/api/article-feedback", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ articlePath: "/clanky/test", articleTitle: "Testovací článok", helpful: true, missingText: "" }),
  });
  assert.equal(positive.status, 201);
  assert.equal(emails.length, 2, "positive usefulness votes do not require editorial action");

  const negative = await request(worker, d1, "/api/article-feedback", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ articlePath: "/clanky/test", articleTitle: "Testovací článok", helpful: false, missingText: "V článku chýba dôležitý zdroj." }),
  });
  assert.equal(negative.status, 201);
  assert.equal(emails.length, 3);
  assert.match(emails.at(-1).subject, /^\[Podnet k článku\]/);
  assert.match(emails.at(-1).text, /V článku chýba dôležitý zdroj/);

  runtimeEnv.EDITORIAL_EMAIL = { async send() { throw new Error("simulated delivery failure"); } };
  const failedEmailInquiry = await request(worker, d1, "/api/directory/inquiries", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ profileId: 1, senderName: "Eva Klientka", senderEmail: "eva@example.sk", message: "Prosím o ďalší dostupný termín pre môjho psa.", consent: true }),
  });
  assert.equal(failedEmailInquiry.status, 201);
  assert.deepEqual(await failedEmailInquiry.json(), { success: true });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM directory_inquiries").get().count, 2, "stored inquiry survives email failure");
});

test("admin endpoints are protected and review uses the safe manual workflow", async () => {
  const { sqlite, d1 } = createDatabase();
  const runtimeEnv = (globalThis.__CLOUDFLARE_WORKERS_ENV__ ??= {});
  Object.assign(runtimeEnv, { DB: d1, ADMIN_EMAILS: "admin@psipedia.sk", EDITORIAL_EMAIL: { async send() {} } });
  const workerUrl = new URL("../dist/server/index.js", import.meta.url); workerUrl.searchParams.set("change-admin", String(Date.now()));
  const { default: worker } = await import(workerUrl.href);
  for (const [email, profileId] of [["approve@example.sk", 1], ["reject@example.sk", 2]]) {
    const body = proposal({ profileId, requesterEmail: email, proposedData: { ...proposal().proposedData, name: profileId === 1 ? "Veterina nový názov" : "Tréner nový názov", region: profileId === 1 ? "Nitriansky kraj" : "Bratislavský kraj" } });
    const response = await request(worker, d1, "/api/directory/profile-change-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(response.status, 201);
  }
  const profilesBefore = sqlite.prepare("SELECT * FROM directory_profiles ORDER BY id").all();
  assert.equal((await request(worker, d1, "/api/admin/profile-change-requests")).status, 401);
  assert.equal((await request(worker, d1, "/api/admin/profile-change-requests/1", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "approved" }) })).status, 401);

  const adminPage = await request(worker, d1, "/admin/adresar/navrhy", {}, true);
  assert.equal(adminPage.status, 200);
  const html = await adminPage.text();
  assert.match(html, /Návrhy úprav profilov/);
  assert.match(html, /Rozdiely/);
  assert.match(html, /Veterina nový názov/);
  assert.match(html, /Schváliť návrh/);

  const approved = await request(worker, d1, "/api/admin/profile-change-requests/1", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "approved" }) }, true);
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).request.status, "approved");
  const rejected = await request(worker, d1, "/api/admin/profile-change-requests/2", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "rejected" }) }, true);
  assert.equal(rejected.status, 200);
  assert.equal((await rejected.json()).request.status, "rejected");
  assert.deepEqual(sqlite.prepare("SELECT * FROM directory_profiles ORDER BY id").all(), profilesBefore);
  assert.equal(sqlite.prepare("SELECT reviewed_by FROM directory_profile_change_requests WHERE id = 1").get().reviewed_by, "admin@psipedia.sk");
});

test("change request layout stacks safely on mobile", () => {
  const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.directory-change-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.directory-change-form input:not\(\[type="checkbox"\]\)[\s\S]*?width: 100%/);
  assert.match(css, /\.directory-change-submit button \{ width: 100%;/);
});

test("public contact and email binding stay restricted to the editorial inbox", () => {
  const contact = readFileSync(new URL("../lib/public-contact.ts", import.meta.url), "utf8");
  const privacy = readFileSync(new URL("../app/sukromie/page.tsx", import.meta.url), "utf8");
  const corrections = readFileSync(new URL("../app/opravy-a-podnety/page.tsx", import.meta.url), "utf8");
  const legal = readFileSync(new URL("../app/pravne-informacie/page.tsx", import.meta.url), "utf8");
  const footer = readFileSync(new URL("../components/site-footer.tsx", import.meta.url), "utf8");
  const wrangler = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
  assert.match(contact, /psipedia\.sk@gmail\.com/);
  for (const source of [privacy, corrections, legal, footer]) assert.match(source, /EDITORIAL_EMAIL_ADDRESS/);
  assert.deepEqual(wrangler.send_email, [{ name: "EDITORIAL_EMAIL", destination_address: "psipedia.sk@gmail.com" }]);
});
