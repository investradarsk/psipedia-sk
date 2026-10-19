#!/usr/bin/env node
// Offline only. Reports contain aggregate metrics, not private response payloads.
import { readFileSync } from "node:fs";
import { compareReports } from "./admin-perf-core.mjs";
if (process.argv.length !== 4) {
  console.error("Usage: node scripts/admin-perf-compare.mjs BEFORE.json AFTER.json");
  process.exitCode = 1;
} else {
  try {
    const before = JSON.parse(readFileSync(process.argv[2], "utf8"));
    const after = JSON.parse(readFileSync(process.argv[3], "utf8"));
    const result = compareReports(before, after);
    console.log(JSON.stringify({ schema: 1, comparison: "after_minus_before",
      provenance: "local_synthetic", comparable_screens: result.filter((r) => r.comparable).length,
      rows: result }, null, 2));
    if (result.some((r) => !r.comparable)) process.exitCode = 2;
  } catch {
    console.error("Invalid or incompatible local reports.");
    process.exitCode = 1;
  }
}
