#!/usr/bin/env node
/**
 * Offline-first, read-only production smoke history analysis.
 * The optional GitHub mode sends GET requests only; this tool NEVER mutates GitHub.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const SHA = /^[a-f0-9]{40}$/i;
const SMOKE_JOB = /(?:production[\s-]*smoke|playwright[\s-]*production)/i;
const STATES = new Set(["success", "failure", "cancelled", "skipped", "timed_out", "action_required", "neutral"]);
const code = String.fromCharCode(96);

function iso(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function evidence(url, repo) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "github.com" || u.username || u.password ||
        u.search || u.hash || !u.pathname.startsWith("/" + repo + "/actions/")) return null;
    return u.href;
  } catch { return null; }
}

function conclusion(row) {
  if (row.status && row.status !== "completed") return "unknown";
  const result = String(row.conclusion || "").toLowerCase();
  return STATES.has(result) ? result : "unknown";
}

function normalizedRecord(row, repo, warnings) {
  const test = String(row.test || row.name || "").trim();
  const stamp = iso(row.timestamp || row.completed_at || row.updated_at || row.created_at);
  const sha = String(row.sha || row.head_sha || "").toLowerCase();
  if (!test || !stamp || !SHA.test(sha)) {
    warnings.push("Ignored invalid record (test, timestamp, or full SHA missing).");
    return null;
  }
  const result = conclusion(row);
  return {
    test, sha, date: stamp.slice(0, 10), timestamp: stamp,
    status: String(row.status || "completed"), result,
    run_id: Number.isSafeInteger(Number(row.run_id)) ? Number(row.run_id) : null,
    run_number: Number.isSafeInteger(Number(row.run_number)) ? Number(row.run_number) : null,
    attempt: Number.isInteger(Number(row.run_attempt || row.attempt)) && Number(row.run_attempt || row.attempt) > 0
      ? Number(row.run_attempt || row.attempt) : 1,
    job_id: row.job_id ?? null,
    url: evidence(row.url || row.html_url, repo),
    event: row.event || null
  };
}

/** Accept sanitized records or saved GitHub Actions runs with attached jobs. */
export function normalizeRuns(payload, { repo = "investradarsk/psipedia-sk" } = {}) {
  const warnings = [];
  const rows = [];
  const input = Array.isArray(payload) ? { records: payload } : payload;
  if (!input || typeof input !== "object") throw new Error("Expected JSON records or workflow_runs.");
  if (Array.isArray(input.records)) {
    for (const record of input.records) {
      const row = normalizedRecord(record, repo, warnings);
      if (row) rows.push(row);
    }
  } else if (Array.isArray(input.workflow_runs)) {
    for (const run of input.workflow_runs) {
      if (run.event === "pull_request" || run.event === "pull_request_target") {
        warnings.push("Excluded PR workflow run " + String(run.id || "?") + ": not production evidence.");
        continue;
      }
      if (!Array.isArray(run.jobs)) {
        warnings.push("No job evidence for workflow run " + String(run.id || "?") + "; workflow conclusion is not smoke conclusion.");
        continue;
      }
      const jobs = run.jobs.filter(job => SMOKE_JOB.test(String(job.name || "")));
      if (!jobs.length) {
        warnings.push("No identifiable production smoke job in run " + String(run.id || "?") + ".");
        continue;
      }
      for (const job of jobs) {
        const row = normalizedRecord({
          test: job.name, sha: run.head_sha,
          timestamp: job.completed_at || job.started_at || run.updated_at || run.created_at,
          status: job.status || run.status, conclusion: job.conclusion,
          run_id: run.id, run_number: run.run_number, run_attempt: run.run_attempt,
          job_id: job.id, url: job.html_url || run.html_url, event: run.event
        }, repo, warnings);
        if (row) rows.push(row);
      }
    }
  } else {
    throw new Error("Expected records[] or workflow_runs[] in fixture.");
  }
  const unique = new Map();
  for (const row of rows) {
    const key = [row.test, row.sha, row.run_id, row.attempt, row.job_id, row.timestamp].join("|");
    unique.set(key, row);
  }
  return { records: [...unique.values()], warnings: [...warnings, ...(input.warnings || [])] };
}

function byTime(a, b) {
  return a.timestamp.localeCompare(b.timestamp) ||
    a.attempt - b.attempt || (a.run_id || 0) - (b.run_id || 0);
}

function isFailure(result) { return result === "failure" || result === "timed_out"; }

export function analyze(payload, { repo = "investradarsk/psipedia-sk", head = null, source = "fixture" } = {}) {
  if (head !== null && !SHA.test(head)) throw new Error("--head must be a complete 40-digit commit SHA.");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Invalid repository.");
  const { records, warnings } = normalizeRuns(payload, { repo });
  const sorted = records.sort(byTime);
  const names = [...new Set(sorted.map(r => r.test))].sort();
  const groups = [];
  for (const row of sorted) {
    let group = groups.find(g => g.test === row.test && g.sha === row.sha && g.date === row.date);
    if (!group) {
      group = { test: row.test, sha: row.sha, date: row.date, runs: [] };
      groups.push(group);
    }
    group.runs.push(row);
  }
  const tests = names.map(test => {
    const history = sorted.filter(r => r.test === test);
    const latest = history.at(-1);
    let state = "UNKNOWN";
    let reason = "No trusted current HEAD supplied; latest recorded outcome is historical evidence only.";
    if (head && latest.sha !== head) {
      reason = "Latest evidence SHA does not match current HEAD; current health unknown.";
    } else if (head && latest.sha === head) {
      if (isFailure(latest.result)) {
        state = "CURRENT_FAIL"; reason = "Latest observed smoke result failed at supplied HEAD.";
      } else if (latest.result === "success") {
        state = "PASS_ON_HEAD"; reason = "Latest observed smoke job passed on HEAD; no claim about other tests or incidents.";
      } else if (latest.result === "cancelled") {
        state = "CANCELLED"; reason = "Latest smoke job on HEAD was cancelled, not a pass.";
      } else if (latest.result === "skipped") {
        state = "SKIPPED"; reason = "Latest smoke job on HEAD was skipped, not a pass.";
      } else {
        reason = "No completed, decisive smoke result at HEAD.";
      }
    }
    const laterPasses = [];
    let repeatedFailures = 0;
    let flaky = false;
    let regression = false;
    for (let i = 0; i < history.length; i++) {
      if (isFailure(history[i].result)) {
        if (i > 0 && isFailure(history[i - 1].result)) repeatedFailures++;
        const later = history.slice(i + 1).find(r => r.result === "success");
        if (later) {
          laterPasses.push({
            failed_url: history[i].url, passed_url: later.url,
            failed_sha: history[i].sha, passed_sha: later.sha,
            same_sha: history[i].sha === later.sha,
            failed_at: history[i].timestamp, passed_at: later.timestamp
          });
          if (history[i].sha === later.sha) flaky = true;
        }
      }
      if (isFailure(history[i].result) && history.slice(0, i).some(r => r.result === "success")) regression = true;
    }
    return {
      test, state, reason, latest, count: history.length,
      failures: history.filter(r => isFailure(r.result)).length,
      repeated_failures: repeatedFailures,
      flaky, regression,
      later_passes: laterPasses
    };
  });
  const issueNotices = [];
  for (const issue of (Array.isArray(payload?.issues) ? payload.issues : [])) {
    const number = Number(issue.number);
    const runNumber = Number(issue.run_number || String(issue.title || "").match(/run\s*#(\d+)/i)?.[1]);
    if (!Number.isSafeInteger(number) || !Number.isSafeInteger(runNumber)) continue;
    const matched = sorted.filter(r => r.run_number === runNumber);
    issueNotices.push({
      number, run_number: runNumber,
      url: typeof issue.html_url === "string" && issue.html_url ===
        "https://github.com/" + repo + "/issues/" + number ? issue.html_url : null,
      evidence_count: matched.length,
      assessment: "UNRESOLVED_EVIDENCE",
      note: "Open/closed issue state and a later success cannot independently prove incident resolution."
    });
  }
  if (!head) warnings.push("No current HEAD provided: all current-status assessments remain UNKNOWN.");
  if (!tests.length) warnings.push("No identifiable production smoke test evidence. Do not infer health from workflow status.");
  return {
    schema_version: 1, repository: repo, source,
    head_sha: head, latest_observation: sorted.at(-1)?.timestamp || null,
    summary: {
      tests: tests.length, current_fail: tests.filter(t => t.state === "CURRENT_FAIL").length,
      pass_on_head: tests.filter(t => t.state === "PASS_ON_HEAD").length,
      unknown: tests.filter(t => t.state === "UNKNOWN").length,
      cancelled: tests.filter(t => t.state === "CANCELLED").length,
      skipped: tests.filter(t => t.state === "SKIPPED").length
    },
    tests, groups, issue_notices: issueNotices,
    warnings: [...new Set(warnings)]
  };
}

function safeMarkdown(value) {
  return String(value ?? "").replace(/[|\\\r\n]/g, " ").replace(/[\[\]*_<>]/g, "");
}
function mdLink(url, title) { return url ? "[" + safeMarkdown(title) + "](" + url + ")" : "not available"; }

export function renderMarkdown(report) {
  const lines = [
    "# Production smoke history — evidence only",
    "",
    "- Repository: " + code + report.repository + code,
    "- Supplied HEAD: " + (report.head_sha ? code + report.head_sha + code : "UNKNOWN"),
    "- Latest observation: " + (report.latest_observation || "none"),
    "- Source: " + safeMarkdown(report.source),
    "- Rule: PASS on one test or SHA does NOT close historical incidents, prove deployment, or prove all tests healthy.",
    "",
    "| Test | HEAD assessment | Latest result | SHA | Evidence |",
    "| --- | --- | --- | --- | --- |"
  ];
  for (const t of report.tests) {
    lines.push("| " + safeMarkdown(t.test) + " | " + t.state + " | " +
      t.latest.result + " | " + code + t.latest.sha.slice(0, 12) + code + " | " +
      mdLink(t.latest.url, "job/run") + " |");
  }
  lines.push("", "## History by test, SHA, UTC day", "");
  for (const group of report.groups) {
    lines.push("- " + safeMarkdown(group.test) + " — " + code + group.sha.slice(0, 12) +
      code + " / " + group.date + ": " + group.runs.map(r =>
        r.result + " (" + mdLink(r.url, "run #" + (r.run_number ?? "?") + " attempt " + r.attempt) + ")").join(", "));
  }
  lines.push("", "## Later passes, retries and regressions", "");
  for (const t of report.tests) {
    lines.push("- " + safeMarkdown(t.test) + ": failures=" + t.failures +
      ", consecutive-failure-pairs=" + t.repeated_failures +
      ", same-SHA fail-to-pass=" + t.flaky + ", pass-to-fail regression=" + t.regression +
      ", later passes=" + t.later_passes.length + ". " + safeMarkdown(t.reason));
    for (const p of t.later_passes) {
      lines.push("  - Failure " + mdLink(p.failed_url, p.failed_sha.slice(0, 12)) +
        " followed by pass " + mdLink(p.passed_url, p.passed_sha.slice(0, 12)) +
        (p.same_sha ? " (same SHA, potentially flaky)" : " (different SHA, not proof of original fix)"));
    }
  }
  if (report.issue_notices.length) {
    lines.push("", "## Issue references (never auto-resolved)", "");
    for (const issue of report.issue_notices) {
      lines.push("- " + mdLink(issue.url, "Issue #" + issue.number) + " / workflow run #" +
        issue.run_number + ": " + issue.assessment + "; matched smoke jobs=" + issue.evidence_count + ".");
    }
  }
  lines.push("", "## Warnings", "");
  lines.push(...(report.warnings.length ? report.warnings : ["No input warnings."]).map(w => "- " + safeMarkdown(w)));
  return lines.join("\n") + "\n";
}

async function githubGet(repo, path, token) {
  const url = "https://api.github.com/repos/" + repo + path;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "psipedia-smoke-history-readonly"
  };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(url, {
    method: "GET", headers, redirect: "error", signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error("GitHub read failed (HTTP " + response.status + ").");
  return response.json();
}

/** Bounded GET-only collector. No issue mutation, no workflow reruns or artifacts downloads. */
export async function readGitHub({ repo, limit = 20, token = process.env.GITHUB_TOKEN } = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || "")) throw new Error("Invalid --repo.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("--limit must be 1..50.");
  const branch = await githubGet(repo, "/branches/main", token);
  const body = await githubGet(repo,
    "/actions/workflows/playwright-e2e.yml/runs?per_page=" + limit + "&branch=main", token);
  const warnings = [];
  const workflow_runs = [];
  for (const run of (body.workflow_runs || []).slice(0, limit)) {
    if (run.event === "pull_request" || run.event === "pull_request_target") continue;
    const jobs = await githubGet(repo, "/actions/runs/" + run.id + "/jobs?per_page=100", token);
    if (jobs.total_count > jobs.jobs.length) {
      warnings.push("Incomplete job page for run " + run.id + "; only visible jobs included.");
    }
    workflow_runs.push({ ...run, jobs: jobs.jobs || [] });
  }
  return { payload: { workflow_runs, warnings }, head: branch.commit?.sha || null };
}

export function demoPayload() {
  const a = "a".repeat(40), b = "b".repeat(40);
  const base = "https://github.com/investradarsk/psipedia-sk/actions/runs/";
  return { records: [
    { test: "Playwright production smoke (desktop)", sha: a, timestamp: "2026-10-15T08:00:00Z", conclusion: "failure", run_id: 101, run_number: 101, url: base + "101" },
    { test: "Playwright production smoke (desktop)", sha: a, timestamp: "2026-10-15T09:00:00Z", conclusion: "success", run_id: 102, run_number: 102, url: base + "102" },
    { test: "Playwright production smoke (desktop)", sha: b, timestamp: "2026-10-16T08:00:00Z", conclusion: "failure", run_id: 103, run_number: 103, url: base + "103" },
    { test: "Playwright production smoke (mobile)", sha: b, timestamp: "2026-10-16T09:00:00Z", conclusion: "skipped", run_id: 104, run_number: 104, url: base + "104" },
    { test: "Playwright production smoke (tablet)", sha: b, timestamp: "2026-10-16T09:01:00Z", conclusion: "cancelled", run_id: 105, run_number: 105, url: base + "105" }
  ], issues: [{ number: 883, title: "Production smoke zlyhal – run #101", run_number: 101,
    html_url: "https://github.com/investradarsk/psipedia-sk/issues/883" }] };
}

async function main(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--demo" || arg === "--github") options[arg.slice(2)] = true;
    else if (["--input", "--repo", "--head", "--limit", "--markdown", "--json"].includes(arg)) {
      if (!argv[i + 1]) throw new Error("Missing value for " + arg);
      options[arg.slice(2)] = argv[++i];
    } else throw new Error("Unknown argument " + arg);
  }
  if ([options.demo, options.github, Boolean(options.input)].filter(Boolean).length !== 1)
    throw new Error("Choose exactly one of --input PATH, --demo or --github.");
  const repo = options.repo || "investradarsk/psipedia-sk";
  const api = options.github ? await readGitHub({ repo, limit: options.limit ? Number(options.limit) : 20 }) : null;
  const payload = options.demo ? demoPayload() : options.input
    ? JSON.parse(options.input === "-" ? await (async () => {
        const chunks = [];
        for await (const chunk of process.stdin) chunks.push(chunk);
        return Buffer.concat(chunks).toString("utf8");
      })() : readFileSync(options.input, "utf8"))
    : api.payload;
  const head = options.head || api?.head || null;
  const report = analyze(payload, { repo, head, source: options.demo ? "synthetic-demo" : options.github ? "github-get" : "fixture" });
  const markdown = renderMarkdown(report);
  if (options.markdown) writeFileSync(options.markdown, markdown, { flag: "wx" });
  if (options.json) writeFileSync(options.json, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  if (!options.markdown && !options.json) process.stdout.write(markdown);
  else process.stdout.write("Read-only reports written to explicitly supplied local paths.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error("Smoke history analyzer: " + error.message);
    process.exitCode = 1;
  });
}
