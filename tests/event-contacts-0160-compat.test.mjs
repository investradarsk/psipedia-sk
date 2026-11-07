import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { canWriteEventContactColumns, EVENT_CONTACT_COLUMNS } from "../lib/event-contact-column-compat.ts";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("EVENT-0160: legacy schema can still save old fields, but not silently discard new fields", () => {
  const legacyColumns = ["id", "slug", "title", "status"];
  assert.equal(canWriteEventContactColumns(legacyColumns, {}), false);
  assert.equal(canWriteEventContactColumns(legacyColumns, { contactPhone: "  ", admissionFee: "" }), false);
  for (const value of [
    { contactPhone: "+421900123456" },
    { contactEmail: "info@example.sk" },
    { admissionFee: "5 €" },
  ]) {
    assert.throws(() => canWriteEventContactColumns(legacyColumns, value), /0160/);
  }
  assert.throws(() => canWriteEventContactColumns([], {}), /Schéma podujatí/);
});

test("EVENT-0160: partial schema never permits writes; complete schema accepts new values", () => {
  const legacyColumns = ["id", "title"];
  for (const suffix of [
    ["contact_phone"], ["contact_email"], ["admission_fee"],
    ["contact_phone", "contact_email"], ["contact_phone", "admission_fee"],
    ["contact_email", "admission_fee"],
  ]) {
    assert.throws(() => canWriteEventContactColumns([...legacyColumns, ...suffix], {}), /neúplná/);
  }
  assert.deepEqual([...EVENT_CONTACT_COLUMNS], ["contact_phone", "contact_email", "admission_fee"]);
  assert.equal(canWriteEventContactColumns([...legacyColumns, ...EVENT_CONTACT_COLUMNS], {
    contactPhone: "+421900123456", contactEmail: "info@example.sk", admissionFee: "5 €",
  }), true);
});

test("EVENT-0160: additive SQL preserves existing rows and initializes admission to empty text", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE managed_events (id INTEGER PRIMARY KEY, title TEXT NOT NULL)");
    db.prepare("INSERT INTO managed_events (id,title) VALUES (?,?)").run(7, "Pôvodné podujatie");
    const sql = read("drizzle/0160_event_contacts_admission.sql");
    assert.match(sql, /ALTER TABLE managed_events ADD COLUMN contact_phone TEXT/);
    assert.match(sql, /ALTER TABLE managed_events ADD COLUMN contact_email TEXT/);
    assert.match(sql, /ALTER TABLE managed_events ADD COLUMN admission_fee TEXT NOT NULL DEFAULT ''/);
    db.exec(sql);
    const columns = db.prepare("PRAGMA table_info('managed_events')").all().map(row => row.name);
    assert.equal(canWriteEventContactColumns(columns, { admissionFee: "Voľný vstup" }), true);
    const oldRow = db.prepare("SELECT id,title,contact_phone,contact_email,admission_fee FROM managed_events WHERE id=7").get();
    assert.equal(oldRow.title, "Pôvodné podujatie");
    assert.equal(oldRow.contact_phone, null);
    assert.equal(oldRow.contact_email, null);
    assert.equal(oldRow.admission_fee, "");
    db.prepare("UPDATE managed_events SET contact_phone=?,contact_email=?,admission_fee=? WHERE id=?")
      .run("+421900123456", "info@example.sk", "5 €", 7);
    const updated = db.prepare("SELECT contact_phone,contact_email,admission_fee FROM managed_events WHERE id=7").get();
    assert.equal(updated.contact_phone, "+421900123456");
    assert.equal(updated.contact_email, "info@example.sk");
    assert.equal(updated.admission_fee, "5 €");
  } finally { db.close(); }
});

test("EVENT-0160: event store chooses compatible INSERT/UPDATE and migration remains owner-controlled", () => {
  const store = read("lib/event-store.ts");
  const migrations = read("scripts/production-d1-migrate.mjs");
  assert.match(store, /PRAGMA table_info\('managed_events'\)/);
  assert.match(store, /const hasContactColumns = await eventContactColumnsReady\(database, input\)/);
  assert.match(store, /const hasContactColumns = await eventContactColumnsReady\(database, contactValues\)/);
  assert.match(store, /hasContactColumns \? "contact_phone, contact_email, admission_fee," : ""/);
  assert.match(store, /hasContactColumns \? "contact_phone = \?, contact_email = \?, admission_fee = \?," : ""/);
  assert.match(store, /values\.map\(\(\) => "\?"\)\.join\(", "\)/);
  assert.match(migrations, /UNACTIVATED_PRODUCTION_TARGETS[\s\S]*"0160_event_contacts_admission.sql"/);
  assert.match(migrations, /0158–0160 are review-only SQL/);
});


test("EVENT-0160: event and service details share layout and display safe contact actions", () => {
  const event = read("components/event-detail.tsx");
  const service = read("components/directory-profile-detail.tsx");
  for (const source of [event, service]) {
    assert.match(source, /PublicDetailLayout/);
    assert.match(source, /DetailHeroActions/);
  }
  assert.match(event, /const hasActions = Boolean\(showRegistration \|\| event\.websiteUrl \|\| contactPhoneHref\)/);
  assert.match(event, /const contactPhoneHref =/);
  assert.match(event, /const contactEmailHref =/);
  assert.match(event, /href=\{contactPhoneHref\}/);
  assert.match(event, /href=\{contactEmailHref\}/);
  assert.match(event, /Zavolať/);
  assert.match(event, /<dt>Vstupné<\/dt>/);
  assert.match(event, /<dt>Verejný telefón<\/dt>/);
  assert.match(event, /<dt>Verejný e-mail<\/dt>/);
  // Raw legacy contact text may remain visible without invalid clickable links.
  assert.match(event, /contactPhoneHref \? <a href=\{contactPhoneHref\}>/);
  assert.match(event, /contactEmailHref \? <a href=\{contactEmailHref\}>/);
});
