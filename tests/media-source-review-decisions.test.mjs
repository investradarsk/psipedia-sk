import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  claimMediaCandidate, finalizeAcceptedMediaCandidate, finalizeRejectedMediaCandidate,
  assertMediaReviewSchema, listMediaReviewHistory, releaseMediaCandidateClaim, validateMediaReviewReason,
} from "../lib/media-source-review-decisions.ts";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  sqlite.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, image_url TEXT, image_key TEXT, updated_at TEXT, updated_by TEXT)");
  sqlite.exec("CREATE TABLE managed_events (id INTEGER PRIMARY KEY, image_url TEXT, image_key TEXT, updated_at TEXT, updated_by TEXT)");
  sqlite.exec(read("drizzle/0099_media_source_quality.sql"));
  sqlite.exec(read("drizzle/0137_media_source_review_decisions.sql"));
  const oldKey = "directory/previous.webp";
  sqlite.prepare("INSERT INTO directory_profiles (id,image_url,image_key) VALUES (?,?,?)")
    .run(17,"/media/"+oldKey,oldKey);
  sqlite.prepare(`
    INSERT INTO media_source_monitors (id,entity_type,entity_id,status,
      active_image_key,candidate_image_key,candidate_image_url,candidate_content_hash,
      created_at,updated_at,issue_started_at)
    VALUES (17,'DIRECTORY_PROFILE',17,'CHANGED',?,?,?,?,?,?,?)
  `).run(oldKey,"candidates/directory/17/new.webp","https://example.invalid/new.webp","hash-new",
    "2026-10-20T12:00:00Z","2026-10-20T12:00:00Z","2026-10-20T12:00:00Z");
  const d1 = {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        async first() {return stmt.get() ?? null;},
        async all() {return {results:stmt.all()};},
        bind(...args) {
        return {
          async run() {const result=stmt.run(...args);return {meta:{changes:result.changes}};},
          async first() {return stmt.get(...args) ?? null;},
          async all() {return {results:stmt.all(...args)};},
        };
      }};
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result=[];
        for(const stmt of statements) result.push(await stmt.run());
        sqlite.exec("COMMIT");
        return result;
      } catch(error) {sqlite.exec("ROLLBACK");throw error;}
    },
  };
  const row = {
    id:17,entityType:"DIRECTORY_PROFILE",entityId:17,status:"CHANGED",
    activeImageKey:oldKey,candidateImageKey:"candidates/directory/17/new.webp",
    candidateImageUrl:"https://example.invalid/new.webp",candidateContentHash:"hash-new",
  };
  return {sqlite,d1,row,close:()=>sqlite.close()};
}

test("0137 reject uses one D1 transaction, preserves active image and saves immutable reason",async()=>{
  const f=fixture();
  try {
    const now="2026-10-20T18:05:00Z";
    const token=await claimMediaCandidate(f.d1,f.row,now);
    await finalizeRejectedMediaCandidate({
      database:f.d1,row:f.row,token,now,actorRef:"admin@example.invalid",
      reason:"Nesprávny obrázok",marker:'REJECTED_CANDIDATES:["https://example.invalid/new.webp"]',
      issueStartedAt:"2026-10-20T12:00:00Z",
    });
    const monitor=f.sqlite.prepare("SELECT status,candidate_image_key,active_image_key,review_claim_token FROM media_source_monitors WHERE id=17").get();
    assert.equal(monitor.status,"UNTRACKED");
    assert.equal(monitor.candidate_image_key,null);
    assert.equal(monitor.active_image_key,f.row.activeImageKey);
    assert.equal(monitor.review_claim_token,null);
    assert.equal(f.sqlite.prepare("SELECT image_key FROM directory_profiles WHERE id=17").get().image_key,f.row.activeImageKey);
    const history=await listMediaReviewHistory(f.d1,17);
    assert.equal(history.length,1);
    assert.equal(history[0].action,"reject");
    assert.equal(history[0].reason,"Nesprávny obrázok");
    assert.equal(history[0].actor_ref,"admin@example.invalid");
    assert.throws(()=>f.sqlite.exec("DELETE FROM media_source_review_decisions"),/IMMUTABLE/);
    assert.throws(()=>f.sqlite.exec("UPDATE media_source_review_decisions SET reason='changed'"),/IMMUTABLE/);
  } finally {f.close();}
});

test("0137 makes competing candidate decisions mutually exclusive",async()=>{
  const f=fixture();
  try {
    const token=await claimMediaCandidate(f.d1,f.row,"2026-10-20T18:05:00Z");
    await assert.rejects(claimMediaCandidate(f.d1,f.row,"2026-10-20T18:05:01Z"),/Konflikt/);
    assert.equal(f.sqlite.prepare("SELECT review_claim_token FROM media_source_monitors WHERE id=17").get().review_claim_token,token);
    await releaseMediaCandidateClaim(f.d1,17,token);
    const next=await claimMediaCandidate(f.d1,f.row,"2026-10-20T18:06:00Z");
    assert.notEqual(next,token);
  } finally {f.close();}
});

test("0137 accepted image and history finalize only when canonical image has not changed",async()=>{
  const f=fixture();
  try {
    const token=await claimMediaCandidate(f.d1,f.row,"2026-10-20T18:05:00Z");
    const nextKey="directory/2026/approved-"+randomUUID()+".webp";
    await finalizeAcceptedMediaCandidate({
      database:f.d1,row:f.row,token,now:"2026-10-20T18:05:00Z",
      actorRef:"admin@example.invalid",newImageKey:nextKey,
      oldImageKey:f.row.activeImageKey,rejectedMarker:null,
    });
    assert.equal(f.sqlite.prepare("SELECT image_key FROM directory_profiles WHERE id=17").get().image_key,nextKey);
    assert.equal(f.sqlite.prepare("SELECT status FROM media_source_monitors WHERE id=17").get().status,"OK");
    assert.equal((await listMediaReviewHistory(f.d1,17))[0].action,"accept");
    await assert.rejects(claimMediaCandidate(f.d1,f.row,"2026-10-20T18:06:00Z"),/Konflikt/);
  } finally {f.close();}
});

test("0137 rejects a human-overridden canonical image and rolls back without audit",async()=>{
  const f=fixture();
  try {
    const token=await claimMediaCandidate(f.d1,f.row,"2026-10-20T18:05:00Z");
    f.sqlite.exec("UPDATE directory_profiles SET image_key='directory/human.webp' WHERE id=17");
    await assert.rejects(finalizeAcceptedMediaCandidate({
      database:f.d1,row:f.row,token,now:"2026-10-20T18:05:00Z",
      actorRef:"admin@example.invalid",newImageKey:"directory/approved.webp",
      oldImageKey:f.row.activeImageKey,rejectedMarker:null,
    }),/MEDIA_REVIEW_INCOMPLETE_DECISION|Konflikt/);
    assert.equal(f.sqlite.prepare("SELECT image_key FROM directory_profiles WHERE id=17").get().image_key,"directory/human.webp");
    assert.equal(f.sqlite.prepare("SELECT status FROM media_source_monitors WHERE id=17").get().status,"CHANGED");
    assert.equal((await listMediaReviewHistory(f.d1,17)).length,0);
    await releaseMediaCandidateClaim(f.d1,17,token);
  } finally {f.close();}
});

test("0137 rejects stale candidate and server-side overlong or nontext reason",async()=>{
  const f=fixture();
  try {
    await assert.rejects(claimMediaCandidate(f.d1,{...f.row,candidateImageKey:"outdated.webp"},"2026-10-20T18:05:00Z"),/Konflikt/);
    assert.equal(validateMediaReviewReason(undefined),null);
    assert.equal(validateMediaReviewReason(""),null);
    assert.equal(validateMediaReviewReason("a".repeat(500)).length,500);
    assert.throws(()=>validateMediaReviewReason("a".repeat(501)),/500/);
    assert.throws(()=>validateMediaReviewReason({reason:"no"}),/text/);
  } finally {f.close();}
});

test("0137 rejects incomplete schema even if decision table already exists", async () => {
  const f = fixture();
  try {
    await assertMediaReviewSchema(f.d1);
    f.sqlite.exec("DROP TRIGGER media_review_decision_finalization_guard");
    await assert.rejects(assertMediaReviewSchema(f.d1), /kompletnú D1 migráciu 0137/);
    await assert.rejects(claimMediaCandidate(f.d1, f.row, "2026-10-20T18:05:00Z"), /0137/);
    assert.equal(
      f.sqlite.prepare("SELECT review_claim_token FROM media_source_monitors WHERE id=17").get().review_claim_token,
      null,
    );
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM media_source_review_decisions").get().n, 0);
  } finally { f.close(); }
});

test("0137 rejects missing claim index, audit trigger, and required claim column", async () => {
  for (const dropped of [
    "DROP INDEX media_review_claims_idx",
    "DROP TRIGGER media_review_decisions_no_delete",
  ]) {
    const f = fixture();
    try {
      f.sqlite.exec(dropped);
      await assert.rejects(assertMediaReviewSchema(f.d1), /0137/);
    } finally { f.close(); }
  }
  // Simulate a half-applied migration: the history table exists, but the
  // monitor claim columns (which serialize competing decisions) do not.
  const sqlite = new DatabaseSync(":memory:");
  try {
    sqlite.exec("CREATE TABLE media_source_monitors (id INTEGER PRIMARY KEY)");
    sqlite.exec("CREATE TABLE media_source_review_decisions (id TEXT PRIMARY KEY)");
    const d1 = {prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {async all() {return {results:statement.all()};}};
    }};
    await assert.rejects(assertMediaReviewSchema(d1), /0137/);
  } finally {sqlite.close();}
});

test("0137 fences an abandoned 24-hour claim without allowing stale worker finalization", async () => {
  const f = fixture();
  try {
    const oldToken = await claimMediaCandidate(f.d1, f.row, "2026-10-20T00:00:00.000Z");
    await assert.rejects(
      claimMediaCandidate(f.d1, f.row, "2026-10-20T23:59:59.000Z"),
      /Konflikt/,
    );
    const newToken = await claimMediaCandidate(f.d1, f.row, "2026-10-21T00:00:01.000Z");
    assert.notEqual(newToken, oldToken);
    await releaseMediaCandidateClaim(f.d1, f.row.id, oldToken);
    assert.equal(f.sqlite.prepare(
      "SELECT review_claim_token FROM media_source_monitors WHERE id=17",
    ).get().review_claim_token, newToken);
    await assert.rejects(finalizeRejectedMediaCandidate({
      database:f.d1, row:f.row, token:oldToken, now:"2026-10-21T00:00:02.000Z",
      actorRef:"stale@example.invalid",reason:null,marker:null,issueStartedAt:"2026-10-20T00:00:00.000Z",
    }), /MEDIA_REVIEW_INCOMPLETE_DECISION|Konflikt/);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM media_source_review_decisions").get().n, 0);
    await finalizeRejectedMediaCandidate({
      database:f.d1, row:f.row, token:newToken, now:"2026-10-21T00:00:03.000Z",
      actorRef:"current@example.invalid",reason:"Obrázok nesedí",marker:null,
      issueStartedAt:"2026-10-20T00:00:00.000Z",
    });
    assert.equal((await listMediaReviewHistory(f.d1,17)).length, 1);
    assert.equal(f.sqlite.prepare("SELECT review_claim_token FROM media_source_monitors WHERE id=17").get().review_claim_token,null);
  } finally {f.close();}
});
