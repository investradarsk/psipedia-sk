import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";

const CONTROL = new Set([".github/workflows/offline-contracts.yml", ".github/ci/offline-suites.json", "scripts/ci-offline-scope.mjs", "tests/ci-v2-offline-scope.test.mjs"]);

export function selectOfflineSuites(suites, files, { event = "pull_request", baseRef = "main", trusted = true } = {}) {
  const all = event !== "pull_request" || !trusted || !files.length || files.some(f => CONTROL.has(f));
  return suites.filter(suite => (all || !suite.mainOnly || baseRef === "main") &&
    (all || files.some(file => suite.paths.some(pattern =>
      file === pattern || (pattern.includes("*") && posix.matchesGlob(file, pattern))))));
}

export function resolveOfflineRange({base, head, git = args => execFileSync("git", args, {encoding:"utf8", stdio:["ignore","pipe","pipe"]})}) {
  if (![base,head].every(x => typeof x === "string" && /^[a-f0-9]{40,64}$/i.test(x) && !/^0+$/.test(x)))
    return {files:[], trusted:false};
  try {
    const files = git(["diff", "--no-renames", "--name-only", "-z", base + "..." + head]).split("\0").filter(Boolean);
    return {files, trusted:files.length > 0};
  } catch {
    return {files:[], trusted:false};
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const suites = JSON.parse(readFileSync(new URL("../.github/ci/offline-suites.json", import.meta.url), "utf8"));
  const event = process.env.GITHUB_EVENT_NAME;
  const range = event === "pull_request" ? resolveOfflineRange({base:process.env.CI_BASE_SHA, head:process.env.CI_HEAD_SHA}) : {files:[],trusted:false};
  const selected = selectOfflineSuites(suites, range.files, {event,baseRef:process.env.GITHUB_BASE_REF,trusted:range.trusted});
  const ids = new Set(selected.map(s => s.id));
  if (!process.env.GITHUB_OUTPUT) throw new Error("GITHUB_OUTPUT is required");
  appendFileSync(process.env.GITHUB_OUTPUT, [
    ...suites.map(s => s.id + "=" + ids.has(s.id)),
    "node22=" + selected.some(s => s.node === "22"),
    "node22_16=" + selected.some(s => s.node === "22.16.0"),
    ""
  ].join("\n"));
  console.log("Selected offline suites:", [...ids].join(", ") || "(none)");
}
