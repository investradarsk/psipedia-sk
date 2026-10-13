import assert from "node:assert/strict";
import test from "node:test";
import { classifyPreparedMigrations } from "../scripts/production-d1-0123-0124-preflight.mjs";

const expectedNames = Array.from({ length: 125 }, (_, i) => String(i).padStart(4, "0") + "_test.sql");
expectedNames[123] = "0123_event_organization_structured_address.sql";
expectedNames[124] = "0124_gemini_notion_review_locks.sql";
const namesByTable = {
  managed_events: ["district", "postal_code", "street", "house_number", "address_format"],
  organization_locations: ["postal_code", "street", "house_number", "address_format"],
};
const newColumn = (name) => ({ name, type: "TEXT", notnull: 1, dflt_value: "''" });
function fixture(last = 122, addr = false, locks = false) {
  const columnsByTable = Object.fromEntries(Object.entries(namesByTable).map(([table, columns]) => [
    table, [{ name: "id", type: "INTEGER" }, ...(addr ? columns.map(newColumn) : [])],
  ]));
  const tableSql = Object.fromEntries(Object.keys(namesByTable).map(table => [table,
    "CREATE TABLE " + table + " (id INTEGER PRIMARY KEY" +
    (addr ? ", CONSTRAINT " + table + "_address_format_check CHECK (address_format IN ('', 'STREET', 'MUNICIPALITY_NUMBER'))" : "") + ")"]));
  columnsByTable.gemini_notion_review_locks = locks ? [
    { name: "notion_page_id", type: "TEXT", notnull: 1, pk: 1 },
    { name: "owner", type: "TEXT", notnull: 1 },
    { name: "created_at", type: "TEXT", notnull: 1, dflt_value: "strftime('now')" },
  ] : [];
  if (locks) tableSql.gemini_notion_review_locks = "CREATE TABLE gemini_notion_review_locks (...)";
  return { historyNames: expectedNames.slice(0, last + 1), expectedNames, columnsByTable, tableSql };
}
const cases = [
  [122, false, false, "READY_0123"],
  [123, true, false, "READY_0124"],
  [124, true, true, "COMPLETE"],
  [121, false, false, "STOP_BACKLOG_BEFORE_0122"],
  [122, true, false, "STOP_SCHEMA_HISTORY_DRIFT"],
  [123, false, false, "STOP_SCHEMA_HISTORY_DRIFT"],
  [123, true, true, "STOP_SCHEMA_HISTORY_DRIFT"],
  [124, true, false, "STOP_SCHEMA_HISTORY_DRIFT"],
];
for (const [last, address, lock, classification] of cases) {
  test(classification + " with history ending " + last + " address=" + address + " lock=" + lock, () => {
    const result = classifyPreparedMigrations(fixture(last, address, lock));
    assert.equal(result.classification, classification);
    assert.equal(result.safeReadiness, ["READY_0123", "READY_0124", "COMPLETE"].includes(classification));
  });
}
test("partial address ADD COLUMN fails closed", () => {
  const input = fixture();
  input.columnsByTable.managed_events.push(newColumn("district"));
  assert.equal(classifyPreparedMigrations(input).classification, "STOP_SCHEMA_HISTORY_DRIFT");
});
test("incorrect type / nullable default fails closed", () => {
  const input = fixture(123, true);
  input.columnsByTable.managed_events.find(c => c.name === "postal_code").notnull = 0;
  assert.equal(classifyPreparedMigrations(input).classification, "STOP_SCHEMA_HISTORY_DRIFT");
});
test("missing address_format constraint fails closed", () => {
  const input = fixture(123, true);
  input.tableSql.organization_locations = "CREATE TABLE organization_locations (id INTEGER)";
  assert.equal(classifyPreparedMigrations(input).classification, "STOP_SCHEMA_HISTORY_DRIFT");
});
test("missing lock PK fails closed", () => {
  const input = fixture(124, true, true);
  input.columnsByTable.gemini_notion_review_locks[0].pk = 0;
  assert.equal(classifyPreparedMigrations(input).classification, "STOP_SCHEMA_HISTORY_DRIFT");
});
test("reordered history is not accepted", () => {
  const input = fixture(124, true, true);
  [input.historyNames[123], input.historyNames[124]] = [input.historyNames[124], input.historyNames[123]];
  assert.equal(classifyPreparedMigrations(input).classification, "STOP_HISTORY_DRIFT");
});
test("future migrations force a fresh audit", () => {
  const input = fixture(124, true, true);
  input.expectedNames.push("0125_future.sql");
  input.historyNames.push("0125_future.sql");
  assert.equal(classifyPreparedMigrations(input).classification, "STOP_FUTURE_HISTORY_REQUIRES_NEW_AUDIT");
});
test("missing migration history is not assumed empty production", () => {
  assert.throws(() => classifyPreparedMigrations({ ...fixture(), historyNames: [] }), /Missing D1 migration history/);
});
