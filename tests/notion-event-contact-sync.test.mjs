import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EVENT_NOTION_CONTACT_FIELDS,
  withoutEventContactFields,
  extendEventContactBaseline,
  ignoreUnverifiedEmptyNotionEventContacts,
} from "../lib/notion-event-contact-fields.ts";
import { reconcileProfileFields } from "../lib/notion-profile-field-reconciliation.ts";
import { stableAgendaSnapshotJson } from "../lib/notion-bidirectional-reconciliation.ts";
import { sha256Text } from "../lib/notion-sync-shared.ts";
import { selectiveNotionProperties } from "../lib/notion-selective-property-patch.ts";
import { agendaEditableFields } from "../lib/notion-events-help-adapters.ts";

const [phone, email, admission] = EVENT_NOTION_CONTACT_FIELDS;
const legacy = { Názov: "Stopárske preteky", Organizátor: "Akadémia Sírius" };
const empty = { [phone]: "", [email]: "", [admission]: "" };
const populated = {
  [phone]: "+421 905 223 372",
  [email]: "knisova@gmail.com",
  [admission]: "Zdarma",
};
const eq = (path, left, right) => stableAgendaSnapshotJson("events", { [path]: left }) ===
  stableAgendaSnapshotJson("events", { [path]: right });
const merge = (baseline, notion, psipedia) => reconcileProfileFields({
  baseline, notion, psipedia, protectedFields: new Set(),
  canonicalFieldsWin: true, equalField: eq,
});

test("Notion and canonical contract use exactly the three new rich-text fields", () => {
  for (const field of EVENT_NOTION_CONTACT_FIELDS) {
    assert.equal(agendaEditableFields.events.includes(field), true);
  }
  for (const field of EVENT_NOTION_CONTACT_FIELDS) {
    assert.equal(agendaEditableFields.organizations.includes(field), false);
  }
  const bulk = readFileSync(new URL("../lib/notion-bulk-sources.ts", import.meta.url), "utf8");
  const adapters = readFileSync(new URL("../lib/notion-events-help-adapters.ts", import.meta.url), "utf8");
  const legacySync = readFileSync(new URL("../lib/notion-event-sync.ts", import.meta.url), "utf8");
  assert.match(bulk, /contact_phone,contact_email,admission_fee/);
  assert.match(bulk, /"Telefón organizátora": s\(row\.contact_phone\)/);
  assert.match(bulk, /"E-mail organizátora": s\(row\.contact_email\)/);
  assert.match(bulk, /"Vstupné": s\(row\.admission_fee\)/);
  for (const field of EVENT_NOTION_CONTACT_FIELDS) {
    assert.ok(adapters.includes('values["' + field + '"]'));
    assert.ok(legacySync.includes('page, "' + field + '"'));
  }
});

test("old verified mapping hash can seed new fields without a false global conflict", async () => {
  const priorHash = await sha256Text(stableAgendaSnapshotJson("events", legacy));
  const notion = { ...legacy, ...empty };
  const admin = { ...legacy, ...populated };
  // The new schema changes both full hashes, but not the historical field values.
  assert.equal(await sha256Text(stableAgendaSnapshotJson("events", withoutEventContactFields(notion))), priorHash);
  assert.equal(await sha256Text(stableAgendaSnapshotJson("events", withoutEventContactFields(admin))), priorHash);
  const baseline = extendEventContactBaseline(withoutEventContactFields(notion));
  const result = merge(baseline, notion, admin);
  assert.equal(result.kind, "MERGE");
  assert.deepEqual(result.conflicts, []);
  for (const field of EVENT_NOTION_CONTACT_FIELDS) {
    assert.equal(result.merged[field], populated[field]);
  }
  assert.equal(result.merged.Názov, legacy.Názov);
});

test("editing one Notion text field pulls it into D1 without changing neighboring data", () => {
  const baseline = extendEventContactBaseline(legacy);
  const notion = { ...legacy, ...empty, [phone]: "+421 905 000 000" };
  const admin = { ...legacy, ...empty };
  const result = merge(baseline, notion, admin);
  assert.equal(result.kind, "MERGE");
  assert.equal(result.merged[phone], "+421 905 000 000");
  assert.equal(result.merged[email], "");
  assert.equal(result.merged[admission], "");
  assert.equal(result.merged.Organizátor, legacy.Organizátor);
});

test("blank Notion fields cannot delete previously synchronized canonical data", () => {
  const baseline = { ...legacy, ...populated };
  const notion = { ...legacy, ...empty };
  const admin = { ...legacy, ...populated };
  const safe = ignoreUnverifiedEmptyNotionEventContacts(notion, baseline);
  const result = merge(baseline, safe, admin);
  assert.equal(result.kind, "UNCHANGED");
  for (const field of EVENT_NOTION_CONTACT_FIELDS) assert.equal(safe[field], populated[field]);
  assert.equal(notion[phone], "");
});

test("two different edits of the same newly added field remain a conflict", () => {
  const baseline = extendEventContactBaseline(legacy);
  const notion = { ...legacy, ...empty, [phone]: "0900 111 222" };
  const admin = { ...legacy, ...empty, [phone]: "0900 333 444" };
  const result = merge(baseline, notion, admin);
  assert.equal(result.kind, "CONFLICT");
  assert.ok(result.conflicts.some(c => c.field === phone && c.reason === "AMBIGUOUS_SAME_FIELD"));
});

test("targeted writeback sends only changed event text properties and sync metadata", () => {
  const txt = value => ({ rich_text: value ? [{ type: "text", text: { content: value } }] : [] });
  const remote = {
    "Názov": { title: [{ type: "text", text: { content: legacy.Názov } }] },
    [phone]: txt(""),
    [email]: txt(""),
    [admission]: txt(""),
    "Posledný sync": { date: { start: "2026-10-29" } },
  };
  const desired = {
    "Názov": remote["Názov"],
    [phone]: txt(populated[phone]),
    [email]: txt(populated[email]),
    [admission]: txt(populated[admission]),
    "Posledný sync": { date: { start: "2026-11-08" } },
  };
  const changes = selectiveNotionProperties(remote, desired);
  assert.deepEqual(Object.keys(changes).sort(), [
    ...EVENT_NOTION_CONTACT_FIELDS, "Posledný sync",
  ].sort());
});
