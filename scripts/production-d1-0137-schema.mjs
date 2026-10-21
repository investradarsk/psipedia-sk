import { createHash } from "node:crypto";

// Pin the exact additive SQL reviewed for protected production rollout.
export const PINNED_SHA256_0137 = "29554cadca996ceadccf9f006579203b6d6a93213fea731700c137eb79596052";
export const OBJECTS_0137 = Object.freeze({
  media_source_review_decisions: "table",
  media_review_decisions_monitor_time_idx: "index",
  media_review_claims_idx: "index",
  media_review_decision_finalization_guard: "trigger",
  media_review_decisions_no_update: "trigger",
  media_review_decisions_no_delete: "trigger",
});
export const COLUMNS_0137 = Object.freeze(["review_claim_token", "review_claimed_at"]);

export function assertMediaReview0137Schema(schema, sql) {
  if (createHash("sha256").update(sql).digest("hex") !== PINNED_SHA256_0137)
    throw new Error("0137 migration SQL immutable digest mismatch");

  const rows = schema?.objects ?? [];
  for (const [name, type] of Object.entries(OBJECTS_0137)) {
    const matches = rows.filter(row => row.name === name);
    if (matches.length !== 1 || matches[0].type !== type)
      throw new Error("0137 missing or duplicated " + name);
  }
  const columnRows = schema?.mediaSourceMonitorColumns ?? [];
  for (const name of COLUMNS_0137) {
    const matches = columnRows.filter(row => row.name === name);
    if (matches.length !== 1 || String(matches[0].type).toUpperCase() !== "TEXT")
      throw new Error("0137 required monitor column missing: " + name);
  }
  const ddlFor = name => String(rows.find(row => row.name === name)?.sql ?? "");
  const historyDdl = ddlFor("media_source_review_decisions");
  for (const part of [
    "monitor_id INTEGER NOT NULL", "candidate_image_key TEXT NOT NULL",
    "action TEXT NOT NULL", "actor_ref TEXT NOT NULL",
    "reason TEXT CHECK", "outcome TEXT NOT NULL",
  ]) if (!historyDdl.includes(part)) throw new Error("0137 decision history contract changed");

  const finalize = ddlFor("media_review_decision_finalization_guard");
  for (const part of [
    "BEFORE INSERT ON media_source_review_decisions",
    "MEDIA_REVIEW_INCOMPLETE_DECISION", "review_claim_token IS NULL",
    "NEW.action='reject'", "NEW.action='accept'",
    "directory_profiles", "managed_events",
  ]) if (!finalize.includes(part)) throw new Error("0137 atomic decision guard missing: " + part);

  for (const [name, verb] of [
    ["media_review_decisions_no_update", "UPDATE"],
    ["media_review_decisions_no_delete", "DELETE"],
  ]) {
    const ddl = ddlFor(name);
    if (!ddl.includes("BEFORE " + verb + " ON media_source_review_decisions") ||
        !ddl.includes("MEDIA_REVIEW_AUDIT_IMMUTABLE"))
      throw new Error("0137 immutable audit guard changed: " + name);
  }
  return true;
}
