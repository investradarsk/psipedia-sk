/**
 * Pure, fail-closed D1 schema contract for the explicitly public contact fields.
 * Does NOT read, decrypt, duplicate or publish private reporter contact details.
 */
export const CONTACTS_0165_TARGET = "0165_lost_found_public_contacts.sql";
export const CONTACTS_0165_GIT_BLOB_SHA = "8b7628d7d93eea14da024e88cfb2ffeb4ac6ebdb";
export const CONTACTS_0165_TABLE = "lost_found_dog_reports";
export const CONTACTS_0165_PRIVATE_TABLE = "lost_found_dog_private_details";
export const CONTACTS_0165_COLUMNS = Object.freeze([
  "public_phone", "public_email", "public_website_url",
  "public_facebook_url", "public_instagram_url",
]);
export const CONTACTS_0165_SQL = Object.freeze(CONTACTS_0165_COLUMNS.map(name =>
  "ALTER TABLE lost_found_dog_reports ADD COLUMN " + name + " TEXT NOT NULL DEFAULT '';",
));

const must = (ok, code) => { if (!ok) throw new Error("CONTACTS_0165_" + code); };
const countValid = value => Number.isSafeInteger(value) && value >= 0;

/** Returns installation state; throws if source, schema, or protection is unsafe. */
export function assertContacts0165Schema({
  tablePresent = false, privateTablePresent = false, columns = [],
  privateColumns = [], rowCount = null, privateCount = null, ledgerCount = null,
} = {}) {
  must(tablePresent, "SOURCE_TABLE_MISSING");
  must(privateTablePresent, "PRIVATE_TABLE_MISSING");
  must(countValid(rowCount), "ROW_COUNT_INVALID");
  must(countValid(privateCount), "PRIVATE_ROW_COUNT_INVALID");
  must(ledgerCount === null || countValid(ledgerCount), "LEDGER_COUNT_INVALID");
  const names = new Set(columns.map(x => x.name));
  for (const name of ["id", "public_contact_note", "slug", "status"])
    must(names.has(name), "SOURCE_FIELD_MISSING_" + name);
  const privateNames = new Set(privateColumns.map(x => x.name));
  for (const name of ["report_id", "contact_phone_encrypted", "contact_email_encrypted"])
    must(privateNames.has(name), "PRIVATE_FIELD_MISSING_" + name);
  const present = CONTACTS_0165_COLUMNS.filter(name => names.has(name));
  must(present.length === 0 || present.length === CONTACTS_0165_COLUMNS.length,
    "PARTIAL_SCHEMA_REFUSED");
  for (const name of present) {
    const column = columns.find(x => x.name === name);
    must(String(column?.type).trim().toUpperCase() === "TEXT"
      && Number(column?.notnull) === 1
      && String(column?.dflt_value).trim() === "''"
      && Number(column?.pk) === 0,
      "INCOMPATIBLE_COLUMN_" + name);
  }
  return {
    installed: present.length === CONTACTS_0165_COLUMNS.length,
    readyToApply: present.length === 0,
    presentColumns: present.length,
    rowCount, privateCount, ledgerCount,
  };
}

/** Confirm additive rollout preserved counts, ledger and all protected source columns. */
export function assertContacts0165Postflight(before, after) {
  must(Boolean(before) && Boolean(after), "POSTFLIGHT_SNAPSHOT_MISSING");
  must(before.readyToApply && !before.installed, "POSTFLIGHT_INVALID_START");
  const result = assertContacts0165Schema(after);
  must(result.installed, "POSTFLIGHT_COLUMNS_MISSING");
  must(result.rowCount === before.rowCount, "POSTFLIGHT_ROW_COUNT_CHANGED");
  must(result.privateCount === before.privateCount, "POSTFLIGHT_PRIVATE_COUNT_CHANGED");
  must(result.ledgerCount === before.ledgerCount, "POSTFLIGHT_LEDGER_CHANGED");
  return result;
}
