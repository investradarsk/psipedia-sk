// Isolated 0160 guard. 0158/0159 history is deliberately not modified.
export const EVENT_0160_MIGRATION = "0160_event_contacts_admission.sql";
export const EVENT_0160_SQL_BLOB = "f49ad290f6aca08086f1d346f544fe74813bc3ef";
const target = ["contact_phone", "contact_email", "admission_fee"];

export function classifyEvent0160(columns) {
  if (!Array.isArray(columns)) throw Error("EVENT_0160_COLUMNS_INVALID");
  const byName = new Map(columns.map(row => [row.name, row]));
  if (!byName.has("id")) throw Error("EVENT_0160_BASE_SCHEMA_MISSING_ID");
  const present = target.filter(name => byName.has(name));
  if (present.length !== 0 && present.length !== target.length)
    throw Error("EVENT_0160_PARTIAL_SCHEMA_REFUSED");
  if (present.length === 0) return { alreadyInstalled: false };
  for (const name of target) {
    const row = byName.get(name);
    if (String(row.type || "").toUpperCase() !== "TEXT") throw Error("EVENT_0160_COLUMN_TYPE_MISMATCH:" + name);
    if (name !== "admission_fee" && (Number(row.notnull) !== 0 || row.dflt_value != null))
      throw Error("EVENT_0160_CONTACT_CONSTRAINT_MISMATCH:" + name);
    if (name === "admission_fee" &&
        (Number(row.notnull) !== 1 || String(row.dflt_value) !== "''"))
      throw Error("EVENT_0160_ADMISSION_CONSTRAINT_MISMATCH");
  }
  return { alreadyInstalled: true };
}

export function assertEvent0160Postflight(columns) {
  if (!classifyEvent0160(columns).alreadyInstalled) throw Error("EVENT_0160_COLUMNS_MISSING");
  return true;
}
