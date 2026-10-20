import { createHash } from "node:crypto";

export const PINNED_SHA256_0136 = "e68a37cf5a205fa01dfd77d42ea77a18d5507735a8d5d7d26f57ddded2f2b965";
export const OBJECTS_0136 = Object.freeze([
  "gemini_global_control",
  "gemini_global_stop_job_insert",
  "gemini_global_stop_job_claim",
  "gemini_global_stop_direct_run",
]);
const requiredClauses = Object.freeze({
  gemini_global_stop_job_insert: ["BEFORE INSERT ON gemini_manual_background_jobs", "GEMINI_GLOBAL_STOP", "state='RUNNING'"],
  gemini_global_stop_job_claim: ["BEFORE UPDATE OF status ON gemini_manual_background_jobs", "GEMINI_GLOBAL_STOP", "state='RUNNING'"],
  gemini_global_stop_direct_run: ["BEFORE INSERT ON gemini_automation_runs", "GEMINI_GLOBAL_STOP", "state='RUNNING'"],
});
export function assertGeminiStop0136Schema(schema, sql) {
  if (createHash("sha256").update(sql).digest("hex") !== PINNED_SHA256_0136)
    throw Error("0136 migration SQL immutable digest mismatch");
  const rows = schema?.objects ?? [];
  for (const name of OBJECTS_0136) {
    const matches = rows.filter(row => row.name === name);
    const kind = name === "gemini_global_control" ? "table" : "trigger";
    if (matches.length !== 1 || matches[0].type !== kind)
      throw Error("0136 missing or duplicated "+name);
    if (name === "gemini_global_control") {
      if (!String(matches[0].sql ?? "").includes("state") || !String(matches[0].sql ?? "").includes("RESUMING"))
        throw Error("0136 control state CHECK is missing");
    } else {
      const ddl = String(matches[0].sql ?? "");
      for (const part of requiredClauses[name]) if (!ddl.includes(part))
        throw Error("0136 trigger contract changed: "+name);
    }
  }
  if (!(schema.geminiManualJobColumns ?? []).some(x => x.name === "worker_started_at" && String(x.type).toUpperCase() === "TEXT"))
    throw Error("0136 one-use worker_started_at column is missing");
  return true;
}
