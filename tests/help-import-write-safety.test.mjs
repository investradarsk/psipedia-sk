import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route=readFileSync(new URL("../app/api/admin/import/route.ts",import.meta.url),"utf8");
const plan=readFileSync(new URL("../lib/admin-import-plan.ts",import.meta.url),"utf8");
const preview=readFileSync(new URL("../lib/help-import-preview.ts",import.meta.url),"utf8");

function helpImportSql(){
  const marker="INSERT INTO help_cases (";const start=route.indexOf(marker);assert.notEqual(start,-1);
  const templateStart=route.lastIndexOf("`",start);const templateEnd=route.indexOf("`).bind(",start);
  assert.notEqual(templateStart,-1);assert.notEqual(templateEnd,-1);return route.slice(templateStart+1,templateEnd);
}

test("generic import builds a validated Help plan before preparing any write and requires explicit confirmation",()=>{
  const build=route.indexOf("const plan = await buildGeneralImportPlan(database, payload);");
  const rejected=route.indexOf("plan.preview.totals.rejected > 0");
  const confirmed=route.indexOf("payload.confirmed !== true");
  const statements=route.indexOf("const statements: D1PreparedStatement[] = [];");
  assert.ok(build>=0&&build<rejected&&rejected<confirmed&&confirmed<statements);
  assert.match(route,/Pred importom je povinný Preview a explicitné potvrdenie/);
});

test("Help plan delegates dedupe and domain validation to read-only preview",()=>{
  assert.match(plan,/previewHelpItems/);
  assert.match(plan,/row\.status === "NEW" && row\.safeForImport/);
  assert.match(plan,/actions\.helpItems\.push\("rejected"\)/);
  assert.match(preview,/isHelpAdminDedicatedCategory/);
  assert.match(preview,/HELP_ADMIN_DOMAIN_SQL/);
});

test("help_cases generic import is create-only, always DRAFT and never auto-publishes",()=>{
  const sql=helpImportSql();
  assert.match(sql,/INSERT INTO help_cases/i);
  assert.match(sql,/ON CONFLICT\(slug\) DO NOTHING/i);
  assert.doesNotMatch(sql,/DO\s+UPDATE/i);
  const helpLoop=route.slice(route.indexOf("for (const [index, row] of helpItems.entries())"),route.indexOf("for (const row of inquiries)"));
  assert.match(helpLoop,/"draft"/);
  assert.match(helpLoop,/null, text\(row\.createdBy/);
  assert.doesNotMatch(helpLoop,/"published"/);
});

test("unsafe Help rows are rejected by the plan before route write preparation",()=>{
  assert.match(plan,/Pomoc riadok \$\{row\.index\}/);
  assert.match(plan,/applyAction\(domains\.help, "rejected"/);
});
