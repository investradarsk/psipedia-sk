import assert from "node:assert/strict";
import { test } from "node:test";
import {
  findDirectoryLegacyReferences, inspectDirectoryLegacyCode,
} from "../scripts/editorial-legacy-reader-inventory.mjs";

test("source inventory identifies read and write aliases without emitting source values",()=>{
  const result=findDirectoryLegacyReferences("lib/directory-store.ts",
    "const source_data_json = data.secret + data.phone; " +
    "directoryCategoryMembershipSql(); readAdditionalDirectoryCategories(value, category)");
  assert.equal(result.path,"lib/directory-store.ts");
  assert.equal(result.area,"Directory data contracts");
  assert.equal(result.signals.source_data_json,1);
  assert.equal(result.signals.categorySql,1);
  assert.equal(result.signals.additionalCategories,1);
  assert.equal(result.count,3);
  assert.doesNotMatch(JSON.stringify(result),/data\.secret|data\.phone/);
});

test("files without the known Directory JSON signals are not called legacy users",()=>{
  assert.equal(findDirectoryLegacyReferences("lib/event-store.ts",
    "SELECT * FROM managed_events WHERE status='published';"),null);
  assert.equal(findDirectoryLegacyReferences("lib/help-store.ts",
    "SELECT * FROM adoption_dogs;"),null);
});

test("scans actual app, library, components and SQL source paths, not one handpicked module",async()=>{
  const report=await inspectDirectoryLegacyCode();
  assert.equal(report.readOnly,true);
  assert.equal(report.status,"human_review_required");
  assert.ok(report.scannedFiles>=20);
  assert.ok(report.candidateFiles>=5);
  assert.ok(report.candidateReferences>=report.candidateFiles);
  for(const path of [
    "lib/directory-store.ts",
    "lib/directory-multi-category.ts",
    "lib/directory-public-source-contract.ts",
    "lib/notion-directory-sync.ts",
    "app/api/admin/directory/[id]/route.ts",
  ]) assert.ok(report.references.some(entry=>entry.path===path),path);
  assert.ok(report.signalTotals.source_data_json>0);
  assert.ok(report.warnings.some(x=>x.includes("not equivalent to executed public reads")));
  assert.doesNotMatch(JSON.stringify(report),/\+421 \d{3}|office@example|<script>/i);
});
