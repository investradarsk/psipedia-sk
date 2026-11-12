import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ADMIN_AUDIT_TARGETS,
  auditAdminSources,
  measureAdminSource,
} from "../scripts/audit-admin-performance-v2.mjs";

test("audit counts TypeScript syntax, not false matches in comments", () => {
  const source = `
    "use client";
    import type { Profile } from "./model";
    import { type Other } from "./other";
    import { useState } from "react";
    import "./styles.css";
    // fetch("not really"); useState("not really")
    const [value] = useState("hello");
    const widget = dynamic(() => import("./widget"));
    async function run() { return fetch("/api/read"); }
  `;
  const result = measureAdminSource("fixture.tsx", source);
  assert.equal(result.isClientModule, true);
  assert.equal(result.runtimeStaticImports, 2, "react runtime + side-effect CSS import");
  assert.equal(result.typeOnlyImports, 2);
  assert.equal(result.useStateCalls, 1);
  assert.equal(result.fetchCallsites, 1);
  assert.equal(result.dynamicImportCallsites, 1);
  assert.equal(result.dynamicWrapperCallsites, 1);
  assert.ok(result.sourceBytes > 0);
  assert.ok(result.sourceLines > 1);
});

test("invalid TypeScript is rejected rather than silently omitted", () => {
  assert.throws(() => measureAdminSource("broken.tsx", "const z = <Panel attr={ ;"), /TypeScript parse error/);
});

test("audit has an explicit deterministic inventory and does not infer bundle sizes", () => {
  const output = auditAdminSources();
  assert.equal(output.kind, "psipedia-admin-source-audit-not-runtime-metrics");
  assert.equal(output.targets.length, ADMIN_AUDIT_TARGETS.length);
  assert.deepEqual(output.targets.map(value => value.path), [...ADMIN_AUDIT_TARGETS]);
  assert.equal(new Set(ADMIN_AUDIT_TARGETS).size, ADMIN_AUDIT_TARGETS.length);
  for (const item of output.targets) {
    assert.ok(item.sourceBytes > 0, item.path);
    assert.ok(item.sourceLines > 0, item.path);
    assert.ok(item.runtimeStaticImports >= 0, item.path);
    assert.ok(item.dynamicImportCallsites >= 0, item.path);
  }
  assert.equal(output.evidence.searchCategoriesDeclared, 8);
  assert.equal(output.evidence.containsUnindexedSubstringExpression, true);
  assert.equal(output.evidence.usesD1Batch, true);
  assert.equal(output.evidence.hasSearchAbortController, true);
  assert.equal(output.evidence.shellUsesAttentionPromise, true);
  assert.equal(output.evidence.homeSharesAttentionPromise, true);
  assert.ok(output.limitations.some(value => value.includes("not shipped")));
});

test("source audit has no data-plane or deployment side effects", () => {
  const source = readFileSync(new URL("../scripts/audit-admin-performance-v2.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\bwriteFile(?:Sync)?\s*\(/);
  assert.doesNotMatch(source, /\bexec(?:Sync|File|FileSync)?\s*\(/);
  assert.doesNotMatch(source, /cloudflare:workers/);
  assert.doesNotMatch(source, /process\.env\.(?:CLOUDFLARE|NOTION|DATABASE)/);
  assert.match(source, /psipedia-admin-source-audit-not-runtime-metrics/);
});
