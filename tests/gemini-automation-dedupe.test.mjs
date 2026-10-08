import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { normalizeGeminiName, normalizeGeminiCity, normalizeGeminiEmail, normalizeGeminiPhone,
  normalizeGeminiWebsite, geminiRejectionIdentities, geminiCandidateSignals,
} from "../lib/gemini-automation-identity.ts";
import { checkGeminiCandidateDedupe, geminiDedupeCountsAsDuplicate } from "../lib/gemini-automation-dedupe.ts";
import { rememberGeminiRejection, isGeminiCandidateRejected } from "../lib/gemini-automation-dedupe-store.ts";
import { classifyChangedFiles } from "../scripts/ci-scope.mjs";

const sql = readFileSync(new URL("../drizzle/0114_gemini_dedupe.sql", import.meta.url), "utf8");
const base = {
  name: "Psia škola Živý Pes",
  primary_url: "https://zivypes.sk/",
  source_urls: ["https://zivypes.sk/", "https://example.org/zaznam"],
  description: "Prvý opis",
  location: { country: "Slovakia", region: "Nitriansky kraj", district: "Nitra", city: "Nitra", address: null },
  contacts: { phone: "+421 905 123 456", email: "INFO@ZIVYPES.SK", website: "https://www.zivypes.sk/",
    facebook: null, instagram: null },
  confidence: 0.91,
  evidence: [{ source_url: "https://zivypes.sk/", fields: ["name"] }],
};
function candidate(patch = {}) {
  return { ...base, ...patch, location: { ...base.location, ...(patch.location ?? {}) },
    contacts: { ...base.contacts, ...(patch.contacts ?? {}) } };
}
const scope = (data = candidate()) =>
  ({ stableKey: "directory.treneri", section: "directory", subcategory: "treneri", candidate: data });

function setup() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(sql);
  sqlite.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT NOT NULL, status TEXT NOT NULL,
    name TEXT NOT NULL, city TEXT NOT NULL, website_url TEXT, source_data_json TEXT NOT NULL
  )`);
  const executed = [];
  const db = { prepare(statement) {
    executed.push(statement);
    return { bind(...values) {
      const handle = sqlite.prepare(statement);
      return {
        async first() { return handle.get(...values) ?? null; },
        async all() { return { results: handle.all(...values) }; },
        async run() { return handle.run(...values); },
      };
    } };
  } };
  const add = ({ name = base.name, city = "Nitra", website = "https://zivypes.sk/",
    phone = "", email = "", status = "published", category = "treneri", data = null } = {}) =>
    sqlite.prepare("INSERT INTO directory_profiles (name,city,website_url,source_data_json,status,category) VALUES (?,?,?,?,?,?)")
      .run(name, city, website, JSON.stringify(data ?? { "Telefón": phone, "E-mail": email }), status, category).lastInsertRowid;
  return { db, sqlite, executed, add, close() { sqlite.close(); } };
}
test("name, city, URL, diacritics and non-www/subdomains deterministic identity", () => {
  assert.equal(normalizeGeminiName("  PSIA   ŠKOLA – Živý   Pes  "), "psia skola zivy pes");
  assert.equal(normalizeGeminiCity("  Žilina   "), "zilina");
  assert.deepEqual(normalizeGeminiWebsite("HTTPS://WWW.Example.SK:443/path///?utm_source=x&b=2&a=1#hash"),
    { domain: "example.sk", url: "example.sk/path?a=1&b=2" });
  assert.equal(normalizeGeminiWebsite("https://klub.example.sk/")?.domain, "klub.example.sk");
  assert.notEqual(normalizeGeminiWebsite("https://klub.example.sk/")?.domain,
    normalizeGeminiWebsite("https://shop.example.sk/")?.domain);
  assert.equal(normalizeGeminiWebsite("ftp://example.sk"), null);
  assert.equal(normalizeGeminiWebsite("https://user:password@example.sk"), null);
});
test("safe +421 phone, email normalization and no guessed missing contact", () => {
  for (const value of ["0905 123 456", "+421 905 123 456", "00421-905-123-456", "421905123456"])
    assert.equal(normalizeGeminiPhone(value), "+421905123456");
  for (const value of ["905123456", "+421 905", "090512345", "NA", ""])
    assert.equal(normalizeGeminiPhone(value), "");
  assert.equal(normalizeGeminiEmail(" Info+Bratislava@Example.SK "), "info+bratislava@example.sk");
  assert.equal(normalizeGeminiEmail("info@example.sk"), "info@example.sk");
  assert.equal(normalizeGeminiEmail("bad-email"), "");
  assert.equal(geminiRejectionIdentities(geminiCandidateSignals(candidate({primary_url: null, contacts:
    { phone: "1234", email: null, website: null }, location: { city: null }}))).length, 0);
});
test("canonical exact URL, domain+name+city, phone and email are strong", async (t) => {
  for (const profile of [
    { website: "https://zivypes.sk/" },
    { website: "https://www.zivypes.sk/kurzy", phone: "", email: "" },
    { website: "https://other.sk/", name: "Iná škola", phone: "+421905123456" },
    { website: "https://other.sk/", name: "Iná škola", email: "info@zivypes.sk" },
  ]) {
    await t.test(JSON.stringify(profile), async () => {
      const ctx = setup();
      ctx.add(profile);
      const result = await checkGeminiCandidateDedupe(ctx.db, scope());
      assert.equal(result.status, "DUPLICATE");
      assert.equal(result.matchedEntityType, "directory");
      assert.equal(result.matchedEntityId, 1);
      ctx.close();
    });
  }
});
test("same name/city is only possible; shared domain and another city is not exact", async () => {
  const ctx = setup();
  ctx.add({ website: "https://other.sk", phone: "", email: "" });
  assert.equal((await checkGeminiCandidateDedupe(ctx.db, scope())).status, "POSSIBLE_DUPLICATE");
  ctx.close();
  const shared = setup();
  shared.add({ website: "https://zivypes.sk", city: "Košice", phone: "", email: "" });
  assert.equal((await checkGeminiCandidateDedupe(shared.db, scope())).status, "POSSIBLE_DUPLICATE");
  shared.close();
});
test("different name same domain is not definite, same name different city and web is NEW", async () => {
  const a = setup();
  a.add({ name: "Úplne iný salón", website: "https://zivypes.sk", city: "Košice" });
  assert.notEqual((await checkGeminiCandidateDedupe(a.db, scope())).status, "DUPLICATE");
  a.close();
  const b = setup();
  b.add({ website: "https://another.sk/", city: "Košice" });
  assert.equal((await checkGeminiCandidateDedupe(b.db, scope())).status, "NEW");
  b.close();
});
test("draft and published canonical entities are both read; no write side effects", async () => {
  const ctx = setup();
  ctx.add({ status: "draft", phone: "+421905123456" });
  assert.deepEqual((await checkGeminiCandidateDedupe(ctx.db, scope())).matchedDraftId, 1);
  assert.ok(ctx.executed.every((q) => /^SELECT/i.test(q.trim())));
  assert.equal(geminiDedupeCountsAsDuplicate("POSSIBLE_DUPLICATE"), false);
  assert.equal(geminiDedupeCountsAsDuplicate("DUPLICATE"), true);
  ctx.close();
});
test("explicit rejection is persisted, idempotent and matches independent future candidate", async () => {
  const ctx = setup();
  const one = await rememberGeminiRejection(ctx.db, { stableKey: "directory.treneri", candidate: candidate(), reasonCode: "NOT_RELEVANT", at: "2026-10-08T06:00:00Z" });
  await rememberGeminiRejection(ctx.db, { stableKey: "directory.treneri", candidate: candidate(), reasonCode: "NOT_RELEVANT", at: "2026-10-08T07:00:00Z" });
  assert.equal(Number(ctx.sqlite.prepare("SELECT COUNT(*) AS n FROM gemini_automation_rejections").get().n), one);
  const changed = candidate({ description: "Úplne iný description", source_urls: [...base.source_urls].reverse() });
  assert.equal((await checkGeminiCandidateDedupe(ctx.db, scope(changed))).status, "REJECTED_BEFORE");
  assert.equal((await isGeminiCandidateRejected(ctx.db, scope(changed)))?.reasonCode, "NOT_RELEVANT");
  assert.equal(ctx.sqlite.prepare("SELECT rejected_at FROM gemini_automation_rejections LIMIT 1").get().rejected_at, "2026-10-08T06:00:00Z");
  assert.equal(ctx.sqlite.prepare("SELECT COUNT(*) AS n FROM directory_profiles").get().n, 0);
  const serialized = JSON.stringify(ctx.sqlite.prepare("SELECT * FROM gemini_automation_rejections").all());
  assert.ok(!serialized.includes("905123456") && !serialized.includes("info@zivypes.sk"));
  assert.ok(!serialized.includes("Prvý opis") && !serialized.includes("example.org"));
  ctx.close();
});
test("different strong identity with same name/city must not be rejected by old name alone", async () => {
  const ctx = setup();
  await rememberGeminiRejection(ctx.db, { stableKey: "directory.treneri", candidate: candidate() });
  const other = candidate({ contacts: { phone: "+421 905 444 333", email: "other@another.sk", website: "https://another.sk/" },
    primary_url: "https://another.sk/", source_urls: ["https://another.sk/"],
    evidence: [{ source_url: "https://another.sk/", fields: ["name"] }] });
  assert.equal((await checkGeminiCandidateDedupe(ctx.db, scope(other))).status, "NEW");
  ctx.close();
});
test("name/city-only rejection fallback works but insufficient identity cannot persist", async () => {
  const ctx = setup();
  const poor = candidate({ contacts: {phone: null, email: null, website: null}, primary_url: null });
  assert.equal(await rememberGeminiRejection(ctx.db, { stableKey: "directory.treneri", candidate: poor }), 1);
  assert.equal((await checkGeminiCandidateDedupe(ctx.db, scope(poor))).status, "REJECTED_BEFORE");
  await assert.rejects(rememberGeminiRejection(ctx.db, { stableKey: "directory.treneri",
    candidate: candidate({ name: "Názov", primary_url: null, location: { city: null }, contacts: { phone: null,email: null,website: null } }) }), /NO_REJECTION_IDENTITY/);
  ctx.close();
});
test("scope validation, unsupported event/help fail closed, bounded canonical lookup", async () => {
  const ctx = setup();
  await assert.rejects(checkGeminiCandidateDedupe(ctx.db, { ...scope(), subcategory: "veterinari" }), /INVALID_SCOPE/);
  await assert.rejects(checkGeminiCandidateDedupe(ctx.db, { ...scope(), stableKey: "events.vystavy", section: "events", subcategory: "vystavy" }), /POLICY_NOT_READY|INVALID_SCOPE/);
  await assert.rejects(checkGeminiCandidateDedupe(ctx.db, { ...scope(), candidate: { name: "raw provider text" } }), /INVALID_CANDIDATE/);
  const queries = ctx.executed.filter((q) => q.includes("directory_profiles"));
  assert.equal(queries.length, 0);
  ctx.close();
});
test("migration constraints, CI scope and isolation invariants", () => {
  const ctx = setup();
  assert.throws(() => ctx.sqlite.prepare("INSERT INTO gemini_automation_rejections (stable_key,identity_kind,identity_hash,candidate_name,rejected_at,updated_at) VALUES ('directory.treneri','email','not-hash','X','now','now')").run());
  for (const path of ["lib/gemini-automation-identity.ts", "lib/gemini-automation-dedupe.ts", "lib/gemini-automation-dedupe-store.ts", "tests/gemini-automation-dedupe.test.mjs"]) {
    assert.ok(classifyChangedFiles([path]).scopes.includes("GEMINI_AUTOMATION"));
  }
  const migrationScope = classifyChangedFiles(["drizzle/0114_gemini_dedupe.sql"]);
  assert.ok(migrationScope.scopes.includes("GEMINI_AUTOMATION"));
  assert.ok(migrationScope.scopes.includes("DATABASE_MIGRATIONS"));
  const sources = ["../lib/gemini-automation-dedupe.ts", "../lib/gemini-automation-dedupe-store.ts",
    "../lib/gemini-automation-identity.ts"].map((s) => readFileSync(new URL(s, import.meta.url), "utf8")).join("\n");
  assert.ok(!/from ["'].*(?:notion|tavily|data-automation|gemini-automation-discovery\.ts)/.test(sources));
  assert.ok(!/fetch\s*\(|\bpublish\s*\(|createManagedDirectoryProfile\s*\(|discoverGeminiCandidates\s*\(/.test(sources));
  ctx.close();
});

test("source-only primary URL changes cannot bypass name+city rejection memory", async () => {
  const ctx = setup();
  const original = candidate({ contacts: { phone: null, email: null, website: null } });
  await rememberGeminiRejection(ctx.db, { stableKey: "directory.treneri", candidate: original });
  const revised = candidate({
    contacts: { phone: null, email: null, website: null },
    primary_url: "https://other-evidence.sk/entry",
    source_urls: ["https://other-evidence.sk/entry"],
    evidence: [{ source_url: "https://other-evidence.sk/entry", fields: ["name"] }],
  });
  assert.equal((await checkGeminiCandidateDedupe(ctx.db, scope(revised))).status, "REJECTED_BEFORE");
  ctx.close();
});
