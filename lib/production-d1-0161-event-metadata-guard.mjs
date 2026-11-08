/**
 * Fail-closed schema checks for the additive 0161 event metadata rollout.
 * A standalone, owner-dispatched rollout is necessary while 0158-0160
 * remain held in the sequential production migration ledger.
 */
export const EVENT_0161_TARGET = "0161_event_image_alt_private_notes.sql";
export const EVENT_0161_GIT_BLOB_SHA = "31a9d83f17c23b5a2dba489edbc9f51f911ea598";
export const EVENT_0161_COLUMNS = Object.freeze(["image_alt", "internal_notes"]);

function requireCondition(ok, code) {
  if (!ok) throw new Error(code);
}

export function assertEvent0161Schema({ tablePresent = false, columns = [], rowCount = null } = {}) {
  requireCondition(tablePresent, "EVENT_0161_MANAGED_EVENTS_TABLE_MISSING");
  requireCondition(Number.isSafeInteger(rowCount) && rowCount >= 0, "EVENT_0161_INVALID_ROW_COUNT");
  const relevant = columns.filter((column) => EVENT_0161_COLUMNS.includes(column.name));
  requireCondition(relevant.length === 0 || relevant.length === 2, "EVENT_0161_PARTIAL_SCHEMA_REFUSED");
  if (relevant.length === 0) return { installed: false, rowCount };
  for (const name of EVENT_0161_COLUMNS) {
    const column = relevant.find((item) => item.name === name);
    requireCondition(Boolean(column), "EVENT_0161_PARTIAL_SCHEMA_REFUSED");
    requireCondition(
      String(column.type).trim().toUpperCase() === "TEXT"
      && Number(column.notnull) === 1
      && String(column.dflt_value).trim() === "''",
      "EVENT_0161_INCOMPATIBLE_COLUMN_" + name,
    );
  }
  return { installed: true, rowCount };
}

export function assertEvent0161Postflight(before, after) {
  requireCondition(before && after, "EVENT_0161_MISSING_SNAPSHOT");
  const result = assertEvent0161Schema(after);
  requireCondition(result.installed, "EVENT_0161_POSTFLIGHT_SCHEMA_MISSING");
  requireCondition(before.rowCount === after.rowCount, "EVENT_0161_ROW_COUNT_CHANGED");
  return { installed: true, rowCount: result.rowCount };
}
