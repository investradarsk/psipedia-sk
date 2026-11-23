import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalNoticeKey, canonicalNoticeStatement, canonicalNoticeType,
  isCanonicalReturnedNotice,
} from "../lib/partner-canonical-notices.ts";
import { applyAtomicModerationTransition } from "../lib/moderation-transition.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function fixture() {
  const sql=new DatabaseSync(":memory:");
  sql.exec([
    "CREATE TABLE moderation_submissions(id TEXT PRIMARY KEY,status TEXT NOT NULL,resource_type TEXT NOT NULL,subject_id TEXT NOT NULL,reviewed_at TEXT,reviewed_by TEXT,rejection_reason_code TEXT,updated_at TEXT);",
    "CREATE TABLE moderation_events(id TEXT PRIMARY KEY,submission_id TEXT,resource_type TEXT,subject_id TEXT,action TEXT,actor_type TEXT,actor_ref TEXT,from_status TEXT,to_status TEXT,reason_code TEXT,changed_fields_json TEXT,request_id TEXT,created_at TEXT);",
    "CREATE TABLE partner_notification_outbox(id TEXT PRIMARY KEY,partner_account_id TEXT,notification_type TEXT CHECK(notification_type IN ('NEW_PROFILE_SUBMITTED','NEW_PROFILE_CREATED','NEW_PROFILE_REJECTED','EVENT_SUBMITTED','EVENT_CREATED','EVENT_REJECTED')),dedupe_key TEXT UNIQUE,status TEXT,expires_at TEXT,attempts INTEGER,created_at TEXT,updated_at TEXT);",
    "INSERT INTO moderation_submissions(id,status,resource_type,subject_id,updated_at) VALUES('draft-1','DRAFT','LOST_FOUND_DOG','21','2026-11-23T12:00:00Z');",
  ].join("\n"));
  const db={
    prepare(query) {
      return {
        bind(...params) {
          return {query,params};
        },
      };
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const results=statements.map(({query,params})=>{
          const stmt=sql.prepare(query);
          if(stmt.reader) {
            const rows=stmt.all(...params);
            return {results:rows,meta:{changes:0}};
          }
          const change=stmt.run(...params);
          return {results:[],meta:{changes:Number(change.changes)}};
        });
        sql.exec("COMMIT");
        return results;
      } catch(error) { sql.exec("ROLLBACK"); throw error; }
    },
  };
  return {sql,db};
}
const submissionId="a7f846be-981f-4ce6-b110-891b82183c41";
const tid = n => "109defac-a73a-4555-91fd-" + String(n).padStart(12,"0");

async function transition(db, expected, next, phase, n, resourceType="LOST_FOUND_DOG") {
  const now="2026-11-23T12:"+String(n).padStart(2,"0")+":00Z";
  const eventId=tid(n);
  await applyAtomicModerationTransition(db,{
    id:"draft-1",expectedStatus:expected,toStatus:next,actorRef:"partner:reporter",
    eventId,changedFieldsJson:'["status"]',now,
    // Same transactional guard as the production workflow: stop any side effects
    // if moderation failed its expected-status CAS.
    extraStatements:phase?[db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract(\'PARTNER_CANONICAL_DRAFT_REVISION_CONFLICT\',char(36)) END").bind(),canonicalNoticeStatement(db,{
      submissionId,accountId:"reporter",resourceType,phase,transitionId:eventId,nowIso:now,
    })]:[],
  });
}

test("all canonical phases use existing outbox CHECK types; returned has distinct, safe key",()=>{
  for (const type of ["LOST_FOUND_DOG","DIRECTORY_PROFILE","MANAGED_EVENT"]) {
    for (const phase of ["SUBMITTED","APPROVED","REJECTED","RETURNED"]) {
      const value=canonicalNoticeType(type,phase);
      assert.ok(["NEW_PROFILE_SUBMITTED","NEW_PROFILE_CREATED","NEW_PROFILE_REJECTED",
        "EVENT_SUBMITTED","EVENT_CREATED","EVENT_REJECTED"].includes(value));
      const key=canonicalNoticeKey(phase,submissionId,tid(1));
      assert.ok(key.startsWith("partner-canonical-"));
      assert.equal(isCanonicalReturnedNotice(value,key),phase==="RETURNED");
    }
  }
  assert.equal(isCanonicalReturnedNotice("NEW_PROFILE_SUBMITTED","partner-canonical-returned//"),false);
  assert.equal(isCanonicalReturnedNotice("AUTH_MAGIC_LINK",canonicalNoticeKey("RETURNED",submissionId,tid(1))),false);
});

test("receipt -> returned -> resubmitted -> approved are atomic and each actual transition has one notice",async()=>{
  const {sql,db}=fixture();
  try{
    await transition(db,"DRAFT","SUBMITTED","SUBMITTED",1);
    await transition(db,"SUBMITTED","PENDING_REVIEW",null,2);
    await transition(db,"PENDING_REVIEW","RETURNED","RETURNED",3);
    await transition(db,"RETURNED","SUBMITTED","SUBMITTED",4);
    await transition(db,"SUBMITTED","PENDING_REVIEW",null,5);
    await transition(db,"PENDING_REVIEW","APPROVED","APPROVED",6);
    const rows=sql.prepare("SELECT notification_type type,dedupe_key key,status FROM partner_notification_outbox ORDER BY created_at").all();
    assert.deepEqual(rows.map(row=>row.type),[
      "NEW_PROFILE_SUBMITTED","NEW_PROFILE_SUBMITTED","NEW_PROFILE_SUBMITTED","NEW_PROFILE_CREATED"]);
    assert.equal(rows.filter(row=>row.key.startsWith("partner-canonical-returned/")).length,1);
    assert.equal(rows.filter(row=>row.key.startsWith("partner-canonical-submitted/")).length,2);
    assert.equal(rows.filter(row=>row.key.startsWith("partner-canonical-approved/")).length,1);
    assert.equal(sql.prepare("SELECT status FROM moderation_submissions WHERE id='draft-1'").get().status,"APPROVED");
    await assert.rejects(transition(db,"PENDING_REVIEW","APPROVED","APPROVED",7));
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM partner_notification_outbox").get().n,4);
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM moderation_events").get().n,6);
  } finally {sql.close();}
});

test("failed/invalid moderation decision cannot enqueue a misleading email; REJECT is independent",async()=>{
  const {sql,db}=fixture();
  try {
    await assert.rejects(transition(db,"PENDING_REVIEW","REJECTED","REJECTED",1));
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM partner_notification_outbox").get().n,0);
    await transition(db,"DRAFT","SUBMITTED","SUBMITTED",2,"MANAGED_EVENT");
    await transition(db,"SUBMITTED","PENDING_REVIEW",null,3);
    await transition(db,"PENDING_REVIEW","REJECTED","REJECTED",4,"MANAGED_EVENT");
    assert.deepEqual(sql.prepare("SELECT notification_type type FROM partner_notification_outbox ORDER BY created_at").all().map(x=>x.type),
      ["EVENT_SUBMITTED","EVENT_REJECTED"]);
    await assert.rejects(transition(db,"PENDING_REVIEW","RETURNED","RETURNED",5,"MANAGED_EVENT"));
    assert.equal(sql.prepare("SELECT COUNT(*) n FROM partner_notification_outbox").get().n,2);
  } finally {sql.close();}
});

test("canonical workflow inserts all receipt and decision notices inside state transition, not post-commit",()=>{
  const src=read("lib/partner-canonical-workflow.ts");
  assert.match(src,/const now=input.now\?\?new Date\(\),nowIso=now.toISOString\(\),eventId=crypto.randomUUID\(\)/);
  assert.match(src,/extraStatements:\[guard\(db\),\.\.\.duplicateStatements,canonicalNoticeStatement\(db,/);
  assert.match(src,/phase:"SUBMITTED",transitionId:eventId/);
  assert.match(src,/phase:"APPROVED",transitionId:"final"/);
  assert.match(src,/phase:input.action==="RETURN"\?"RETURNED":"REJECTED",transitionId:decisionEventId/);
  assert.match(src,/extraStatements:\[guard\(db\),\.\.\.extras\]/);
  assert.doesNotMatch(src,/await queuePartnerLifecycleNotification\(\{accountId:row.accountId/);
});

test("returned and published copy is accurate for canonical workflow without changing older draft templates",()=>{
  const email=read("lib/partner-email.ts");
  assert.match(email,/isCanonicalReturnedNotice\(input.row.notification_type,input.row.dedupe_key\)/);
  assert.match(email,/canonicalApproved=input.row.dedupe_key.startsWith\("partner-canonical-approved\/"\)/);
  assert.match(email,/Nový profil bol schválený a zverejnený/);
  assert.match(email,/Podujatie bolo schválené a zverejnené/);
  assert.match(email,/Nový profil bol vytvorený ako koncept/,"older legacy draft-only emails keep their accurate copy");
  assert.match(email,/Redakcia vám vrátila podanie na doplnenie/);
  assert.match(email,/Dôvod a požadované úpravy nájdete vo svojom Partner účte/);
  assert.match(email,/SITE_URL\+destination/);
  assert.match(email,/partner\/koncepty\/"\+id/);
  assert.doesNotMatch(email,/Dôvod z Adminu: "\+input.row/,"never send internal moderation note or private contact in email");
  assert.match(email,/"Idempotency-Key": input.row.dedupe_key/);
  assert.match(email,/getPartnerNotificationPreferences/);
  assert.match(email,/expires_at>\?1/);
  assert.match(email,/attempts<" \+ MAX_ATTEMPTS/);
});

test("returned submissions appear as actionable notifications and private chat already has generic email queue",()=>{
  const inbox=read("lib/partner-inbox.ts");
  const chat=read("lib/partner-chat.ts");
  const queue=read("lib/partner-chat-email.ts");
  assert.match(inbox,/isCanonicalReturnedNotice\(row.notificationType,row.dedupeKey\)/);
  assert.match(inbox,/\/partner\/koncepty\/"\+row.dedupeKey.split\("\/"\)\[1\]/);
  assert.match(chat,/INSERT INTO partner_chat_email_queue/);
  assert.match(queue,/Idempotency-Key":"partner-chat\/"\+row.messageId/);
  assert.match(queue,/Obsah správy ani prílohy neposielame e-mailom/);
});
