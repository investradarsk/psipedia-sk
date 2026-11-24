import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const CENTRAL = {
  "ds-0b-focused-regression": "public_ds0b",
  "admin-interaction-e2e": "admin_interaction",
  "admin-events-e2e": "admin_events",
  "search-e2e": "search",
  "directory-e2e": "directory",
  "seo-recovery-e2e": "seo_recovery",
  "lost-found-public-e2e": "lost_found",
};

export function evaluateGate(mode, needs) {
  if (!needs || typeof needs !== "object" || Array.isArray(needs)) {
    throw new Error("Missing CI dependency results");
  }
  const rows = [];
  const errors = [];
  const result = (job, expected) => {
    const actual = needs[job]?.result;
    const pass = actual === (expected ? "success" : "skipped");
    rows.push({ job, expected: expected ? "success" : "skipped", actual: actual ?? "missing", pass });
    if (!pass) errors.push(job + ": expected " + (expected ? "success" : "skipped") + ", received " + (actual ?? "missing"));
  };
  const flag = (job, name) => {
    const value = needs[job]?.outputs?.[name];
    if (value !== "true" && value !== "false") {
      errors.push(job + ": missing or invalid scope output " + name);
      return false;
    }
    return value === "true";
  };
  if (mode === "central") {
    result("validate", true);
    const full = flag("validate", "full_core");
    for (const [job, name] of Object.entries(CENTRAL)) {
      const selected = flag("validate", name);
      // Preserve the existing bounded directory policy; broad browser coverage
      // is still manual/scheduled and is not represented as completed here.
      result(job, selected && (job !== "directory-e2e" || !full));
    }
  } else if (mode === "reviews") {
    result("scope", true);
    const auth = flag("scope", "review_auth");
    const submission = flag("scope", "review_submission");
    if (!auth && !submission) errors.push("Review scope selected no suite");
    result("shared-build", auth || submission);
    result("reviewer-auth", auth);
    result("validation", submission);
    result("e2e", submission);
  } else {
    throw new Error("Unknown CI gate mode: " + mode);
  }
  return { pass: errors.length === 0, rows, errors };
}

export function renderSummary(mode, report) {
  // Only fixed job IDs, fixed expected statuses and known Actions results
  // are rendered; never include arbitrary output values or credentials.
  const known = new Set(["success", "failure", "cancelled", "skipped", "missing"]);
  return [
    "## CI V2 — " + mode + " (" + (report.pass ? "PASS" : "FAIL") + ")",
    "",
    "| Job | Expected | Actual |",
    "| --- | --- | --- |",
    ...report.rows.map((row) => "| " + row.job + " | " + row.expected + " | " + (known.has(row.actual) ? row.actual : "invalid") + " |"),
    "",
    mode === "central"
      ? "Selected local PR jobs only. Full breed manual/scheduled, separate feature workflows and production checks retain their own results."
      : "Selected review pilot jobs only. Independent review/admin/public workflows retain their own results.",
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const mode = process.argv[2];
  const report = evaluateGate(mode, JSON.parse(process.env.CI_GATE_NEEDS || "{}"));
  const summary = renderSummary(mode, report);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");
  console.log(summary);
  if (!report.pass) {
    for (const message of report.errors) console.error(message);
    process.exitCode = 1;
  }
}
