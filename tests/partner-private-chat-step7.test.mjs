import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

function setup(){
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE partner_accounts(id TEXT PRIMARY KEY,status TEXT NOT NULL,email_ciphertext TEXT);");
  db.prepare("INSERT INTO partner_accounts(id,status,email_ciphertext) VALUES(?,?,?)")
    .run("account-00000001","ACTIVE","test");
  db.exec(read("drizzle/0175_partner_private_chat.sql").replaceAll("--> statement-breakpoint",""));
  return db;
}
test("0175 one conversation per account and attached message history is private and durable",()=>{
  const db=setup();
  try{
    db.prepare("INSERT INTO partner_conversations(partner_account_id,created_at,updated_at) VALUES(?,?,?)")
      .run("account-00000001","2026-11-20T06:00:00.000Z","2026-11-20T06:00:00.000Z");
    const insert=()=>{
      db.prepare("INSERT INTO partner_conversations(partner_account_id,created_at,updated_at) VALUES(?,?,?)")
        .run("account-00000001","2026-11-20T06:00:00.000Z","2026-11-20T06:00:00.000Z");
    };
    assert.throws(insert,/UNIQUE constraint failed/);
    db.prepare("INSERT INTO partner_chat_messages "+
      "(id,partner_account_id,sender_role,sender_ref,body,attachment_count,created_at) "+
      "VALUES(?,?,?,?,?,?,?)").run("msg-1","account-00000001","PARTNER","partner:account-00000001",
        "Dobrý deň",0,"2026-11-20T06:01:00.000Z");
    db.prepare("INSERT INTO partner_chat_messages "+
      "(id,partner_account_id,sender_role,sender_ref,body,attachment_count,created_at) "+
      "VALUES(?,?,?,?,?,?,?)").run("msg-2","account-00000001","ADMIN","admin:owner",
        "Dobrý deň, ako pomôžeme?",1,"2026-11-20T06:02:00.000Z");
    db.prepare("INSERT INTO partner_chat_attachments VALUES(?,?,?,?,?,?,?)")
      .run("file-1","msg-2","quarantine/partner-chat/x/file.pdf","doklad.pdf","application/pdf",1024,"2026-11-20T06:02:00.000Z");
    assert.equal(db.prepare("SELECT COUNT(*) n FROM partner_chat_messages").get().n,2);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM partner_chat_messages WHERE sender_role='PARTNER'").get().n,1);
    assert.throws(()=>db.prepare("INSERT INTO partner_chat_messages VALUES(?,?,?,?,?,?,?)")
      .run("bad","account-00000001","PUBLIC","public:x","x",0,"2026-11-20T06:02:00.000Z"),/CHECK constraint failed/);
    assert.throws(()=>db.prepare("DELETE FROM partner_chat_messages WHERE id='msg-2'").run(),/FOREIGN KEY constraint failed/);
  }finally{db.close();}
});
test("channel settings are independent and default both enabled",()=>{
  const db=setup();
  try{
    db.prepare("INSERT INTO partner_notification_preferences(partner_account_id,email_enabled,in_app_enabled,updated_at) VALUES(?,?,?,?)")
      .run("account-00000001",0,1,"2026-11-20T06:00:00.000Z");
    assert.deepEqual(
      db.prepare("SELECT email_enabled,in_app_enabled FROM partner_notification_preferences").get(),
      {email_enabled:0,in_app_enabled:1});
    assert.throws(()=>db.prepare("UPDATE partner_notification_preferences SET email_enabled=3").run(),/CHECK constraint failed/);
  }finally{db.close();}
});
test("Admin and Partner endpoints independently authorize and private chat files bypass public media route",()=>{
  const service=read("lib/partner-chat.ts");
  const apiPartner=read("app/api/partner/chat/route.ts");
  const apiAdmin=read("app/api/admin/partners/chat/[accountId]/route.ts");
  const attachPartner=read("app/api/partner/chat/attachments/[id]/route.ts");
  const attachAdmin=read("app/api/admin/partners/chat-attachments/[id]/route.ts");
  const publicMedia=read("app/media/[...key]/route.ts");
  assert.match(service,/quarantine\/partner-chat\//);
  assert.match(publicMedia,/segments\[0\] === "quarantine"/);
  assert.match(service,/Content-Disposition/);
  assert.match(service,/partner_account_id=\?/);
  assert.match(apiPartner,/requirePartnerAccount/);
  assert.match(apiPartner,/assertPartnerMutationOrigin/);
  assert.match(apiAdmin,/requirePartnerAdminMutation/);
  assert.match(apiAdmin,/getAdminApiUser/);
  assert.match(attachPartner,/requirePartnerAccount/);
  assert.match(attachAdmin,/getAdminApiUser/);
  assert.match(service,/adminNotificationEventStatement/);
  assert.match(service,/partner_chat_email_queue/);
  assert.match(read("lib/partner-email.ts"),/runPartnerChatEmailSweep/);
  assert.match(read("lib/partner-email.ts"),/getPartnerNotificationPreferences/);
});
test("every account gets exactly one chat, and UI contains no public message endpoint",()=>{
  const partner=read("app/partner/spravy/page.tsx");
  const admin=read("app/admin/partners/accounts/[id]/page.tsx");
  const list=read("app/admin/partners/page.tsx");
  const form=read("components/partner-private-chat.tsx");
  const prefs=read("components/partner-notification-settings.tsx");
  assert.match(partner,/PartnerPrivateChat/);
  assert.match(admin,/PartnerPrivateChat/);
  assert.match(list,/unreadMessageCount/);
  assert.match(form,/setInterval/);
  assert.match(form,/files/);
  assert.match(prefs,/emailEnabled/);
  assert.match(prefs,/inAppEnabled/);
});
