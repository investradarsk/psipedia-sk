import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("Partneri step 8 preserves SQL 0173 mirror and atomic Admin audit/notice",()=>{
  const s=read("lib/partner-direct-profile.ts");
  assert.match(s,/planDirectory0173EditorialSqlMirror/);
  assert.match(s,/planDirectory0170FactSqlMirror/);
  assert.match(s,/partnerFieldDiff/);
  assert.match(s,/adminNotificationEventStatement/);
  assert.match(s,/PARTNER_EDIT_CAS_CONFLICT/);
  assert.ok(s.indexOf("PARTNER_EDIT_CAS_CONFLICT")<s.indexOf("adminNotificationEventStatement(database"));
});
test("private R2 chat attachments stay outside public media",()=>{
  assert.match(read("lib/partner-chat.ts"),/quarantine\/partner-chat\//);
  assert.match(read("app/media/[...key]/route.ts"),/segments\[0\] === "quarantine"/);
  assert.match(read("drizzle/0190_partner_private_chat.sql"),/CREATE TABLE IF NOT EXISTS partner_chat_attachments/);
});
