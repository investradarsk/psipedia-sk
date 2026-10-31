import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { assertNotionTransferAudit0148Schema, targetSchemaObjects } from "../scripts/production-d1-migrate.mjs";

const sql=readFileSync(new URL("../drizzle/0148_notion_transfer_audit.sql",import.meta.url),"utf8");
const source=(name)=>readFileSync(new URL(name,import.meta.url),"utf8");
test("0148 transfer history creates only append-only directional metadata and requires index",()=>{
 const db=new DatabaseSync(":memory:");
 const schema=()=>({objects:db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','index','trigger')").all()});
 try{
  assert.deepEqual(targetSchemaObjects(schema(),"0148_notion_transfer_audit.sql"),{partial:false});
  db.exec(sql);
  assert.deepEqual(targetSchemaObjects(schema(),"0148_notion_transfer_audit.sql"),{partial:true});
  assert.equal(assertNotionTransferAudit0148Schema(schema()),true);
  const add=db.prepare("INSERT INTO notion_transfer_audit(scope,direction,record_count) VALUES(?,?,?)");
  add.run("directory:veterinari","NOTION_TO_ADMIN",2);
  add.run("articles","ADMIN_TO_NOTION",1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM notion_transfer_audit").get().n,2);
  assert.throws(()=>add.run("breeds","UNKNOWN",1),/CHECK constraint/);
  assert.throws(()=>add.run("breeds","NOTION_TO_ADMIN",0),/CHECK constraint/);
  const broken=schema();broken.objects=broken.objects.filter(x=>x.name!=="idx_notion_transfer_audit_scope_time");
  assert.throws(()=>assertNotionTransferAudit0148Schema(broken),/index missing/);
 }finally{db.close();}
});
test("new Notion diagnostics are auth-only, never mutate Notion and do not fabricate history",()=>{
 const api=source("../app/api/admin/notion-connection-diagnostics/route.ts");
 const diag=source("../lib/notion-connection-diagnostics.ts");
 const history=source("../lib/notion-transfer-audit.ts");
 const ui=source("../components/admin-notion-connection-diagnostic.tsx");
 const groups=source("../lib/notion-field-authority.ts");
 assert.match(api,/getAdminApiUser/);
 assert.match(api,/cache|no-store/i);
 assert.match(diag,/notionRequest/);
 assert.match(diag,/method:"GET"/);
 assert.doesNotMatch(diag,/method:"(?:POST|PATCH|DELETE)"/);
 assert.match(history,/record_count/);
 assert.match(history,/NOTION_TO_ADMIN/);
 assert.match(ui,/Otestovať prepojenie/);
 assert.match(ui,/Historický smer neodhadujeme/);
 assert.match(groups,/agendaEditableFields\[scope\]/);
 assert.match(groups,/directoryCategories\.map/);
});
