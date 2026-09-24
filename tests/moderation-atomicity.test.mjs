import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const importTs = async (path) => import(pathToFileURL(new URL(path, root).pathname).href);

const EXPECTED_TRANSITIONS = {
  SUBMITTED: ["PENDING_REVIEW", "WITHDRAWN"],
  PENDING_REVIEW: ["QUARANTINED", "APPROVED", "REJECTED", "WITHDRAWN"],
  QUARANTINED: ["PENDING_REVIEW", "REJECTED", "WITHDRAWN"],
  APPROVED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

function createD1Harness() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE moderation_submissions (
      id TEXT PRIMARY KEY,
      resource_type TEXT NOT NULL,
      subject_id TEXT,
      status TEXT NOT NULL,
      reviewed_at TEXT,
      reviewed_by TEXT,
      rejection_reason_code TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE moderation_events (
      id TEXT PRIMARY KEY,
      submission_id TEXT,
      resource_type TEXT NOT NULL,
      subject_id TEXT,
      action TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_ref TEXT,
      from_status TEXT,
      to_status TEXT,
      reason_code TEXT,
      changed_fields_json TEXT NOT NULL,
      request_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE canonical_records (
      id TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE decision_side_effects (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL
    );
  `);

  const makeStatement = (sql, params = []) => ({
    sql,
    params,
    bind(...values) { return makeStatement(sql, values); },
  });
  const database = {
    prepare(sql) { return makeStatement(sql); },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(({ sql, params }) => {
          const statement = sqlite.prepare(sql);
          if (/\bRETURNING\b/i.test(sql)) return { success: true, results: statement.all(...params), meta: { changes: 0 } };
          const result = statement.run(...params);
          return { success: true, results: [], meta: { changes: Number(result.changes) } };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { sqlite, database };
}

function seedSubmission(sqlite, id, status) {
  sqlite.prepare(`INSERT INTO moderation_submissions
    (id, resource_type, subject_id, status, updated_at)
    VALUES (?, 'LOST_FOUND_CASE', 'dog-1', ?, '2026-09-15T18:00:00.000Z')`).run(id, status);
}

function transitionInput(id, expectedStatus, toStatus, suffix) {
  return {
    id,
    expectedStatus,
    toStatus,
    actorRef: "admin:test",
    reasonCode: toStatus === "REJECTED" ? "not_eligible" : null,
    requestId: `request-${suffix}`,
    eventId: `event-${suffix}`,
    changedFieldsJson: '["status"]',
    now: `2026-09-15T18:${String(suffix).padStart(2, "0")}:00.000Z`,
  };
}

function readStatus(sqlite, id) {
  return sqlite.prepare("SELECT status FROM moderation_submissions WHERE id = ?").get(id)?.status ?? null;
}

function readEvents(sqlite) {
  return sqlite.prepare("SELECT id, from_status AS fromStatus, to_status AS toStatus FROM moderation_events ORDER BY created_at, id").all();
}

test("moderation transition matrix is unchanged", async () => {
  const { FOUNDATION_SUBMISSION_STATUSES, canTransitionModerationSubmission } = await importTs("lib/moderation-transition.ts");
  assert.deepEqual([...FOUNDATION_SUBMISSION_STATUSES], Object.keys(EXPECTED_TRANSITIONS));
  for (const from of FOUNDATION_SUBMISSION_STATUSES) {
    for (const to of FOUNDATION_SUBMISSION_STATUSES) {
      assert.equal(canTransitionModerationSubmission(from, to), EXPECTED_TRANSITIONS[from].includes(to), `${from} -> ${to}`);
    }
  }
});

test("every existing valid transition succeeds with exactly one moderation event", async () => {
  const { applyAtomicModerationTransition } = await importTs("lib/moderation-transition.ts");
  let suffix = 1;
  for (const [from, targets] of Object.entries(EXPECTED_TRANSITIONS)) {
    for (const to of targets) {
      const { sqlite, database } = createD1Harness();
      const id = `valid-${suffix}`;
      seedSubmission(sqlite, id, from);
      await applyAtomicModerationTransition(database, transitionInput(id, from, to, suffix));
      assert.equal(readStatus(sqlite, id), to, `${from} -> ${to} state`);
      const events = readEvents(sqlite);
      assert.equal(events.length, 1, `${from} -> ${to} event count`);
      assert.equal(events[0].fromStatus, from);
      assert.equal(events[0].toStatus, to);
      sqlite.close();
      suffix += 1;
    }
  }
});

test("invalid transition remains rejected without changing state or creating an event", async () => {
  const { applyAtomicModerationTransition } = await importTs("lib/moderation-transition.ts");
  const { sqlite, database } = createD1Harness();
  seedSubmission(sqlite, "invalid-1", "APPROVED");
  await assert.rejects(
    () => applyAtomicModerationTransition(database, transitionInput("invalid-1", "APPROVED", "PENDING_REVIEW", 20)),
    /Invalid moderation state transition/,
  );
  assert.equal(readStatus(sqlite, "invalid-1"), "APPROVED");
  assert.equal(readEvents(sqlite).length, 0);
  sqlite.close();
});

test("stale expected state is a conflict and writes neither state nor event", async () => {
  const { applyAtomicModerationTransition, ModerationStateConflictError } = await importTs("lib/moderation-transition.ts");
  const { sqlite, database } = createD1Harness();
  seedSubmission(sqlite, "stale-1", "PENDING_REVIEW");
  sqlite.prepare("UPDATE moderation_submissions SET status = 'QUARANTINED' WHERE id = ?").run("stale-1");
  await assert.rejects(
    () => applyAtomicModerationTransition(database, transitionInput("stale-1", "PENDING_REVIEW", "APPROVED", 21)),
    ModerationStateConflictError,
  );
  assert.equal(readStatus(sqlite, "stale-1"), "QUARANTINED");
  assert.equal(readEvents(sqlite).length, 0);
  sqlite.close();
});

test("two moderation requests from the same original state have one deterministic winner", async () => {
  const { applyAtomicModerationTransition, ModerationStateConflictError } = await importTs("lib/moderation-transition.ts");
  const { sqlite, database } = createD1Harness();
  seedSubmission(sqlite, "race-1", "SUBMITTED");
  const first = applyAtomicModerationTransition(database, transitionInput("race-1", "SUBMITTED", "PENDING_REVIEW", 22));
  const second = applyAtomicModerationTransition(database, transitionInput("race-1", "SUBMITTED", "WITHDRAWN", 23));
  const results = await Promise.allSettled([first, second]);
  assert.equal(results[0].status, "fulfilled");
  assert.equal(results[1].status, "rejected");
  assert.ok(results[1].reason instanceof ModerationStateConflictError);
  assert.equal(readStatus(sqlite, "race-1"), "PENDING_REVIEW");
  assert.deepEqual(readEvents(sqlite).map(({ fromStatus, toStatus }) => ({ fromStatus, toStatus })), [
    { fromStatus: "SUBMITTED", toStatus: "PENDING_REVIEW" },
  ]);
  sqlite.close();
});

test("canonical revision guard allows a fresh decision and its guarded side effects exactly once", async () => {
  const { applyAtomicModerationTransition } = await importTs("lib/moderation-transition.ts");
  const { sqlite, database } = createD1Harness();
  seedSubmission(sqlite, "canonical-fresh", "PENDING_REVIEW");
  sqlite.prepare("INSERT INTO canonical_records(id,value,updated_at) VALUES (?,?,?)")
    .run("profile-1", "old", "2026-09-15T17:00:00.000Z");

  const input = transitionInput("canonical-fresh", "PENDING_REVIEW", "APPROVED", 24);
  await applyAtomicModerationTransition(database, {
    ...input,
    transitionGuard: {
      sql: "EXISTS(SELECT 1 FROM canonical_records WHERE id=? AND updated_at=?)",
      bindings: ["profile-1", "2026-09-15T17:00:00.000Z"],
    },
    extraStatements: [
      database.prepare(`UPDATE canonical_records SET value='new',updated_at=?1 WHERE id='profile-1'
        AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?2 AND status='APPROVED' AND updated_at=?1 AND reviewed_by=?3)`)
        .bind(input.now, input.id, input.actorRef),
      database.prepare(`INSERT INTO decision_side_effects(id,submission_id)
        SELECT 'approved','canonical-fresh' WHERE EXISTS(
          SELECT 1 FROM moderation_submissions WHERE id='canonical-fresh' AND status='APPROVED' AND updated_at=?1 AND reviewed_by=?2
        )`).bind(input.now, input.actorRef),
    ],
  });

  assert.equal(readStatus(sqlite, "canonical-fresh"), "APPROVED");
  assert.equal(readEvents(sqlite).length, 1);
  assert.deepEqual(
    sqlite.prepare("SELECT value,updated_at AS updatedAt FROM canonical_records WHERE id='profile-1'").get(),
    { value: "new", updatedAt: input.now },
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM decision_side_effects").get().count, 1);
  sqlite.close();
});

test("canonical revision guard rejects a stale decision without canonical mutation, success event or side effect", async () => {
  const { applyAtomicModerationTransition, ModerationStateConflictError } = await importTs("lib/moderation-transition.ts");
  const { sqlite, database } = createD1Harness();
  seedSubmission(sqlite, "canonical-stale", "PENDING_REVIEW");
  sqlite.prepare("INSERT INTO canonical_records(id,value,updated_at) VALUES (?,?,?)")
    .run("profile-2", "newer", "2026-09-15T17:30:00.000Z");

  const input = transitionInput("canonical-stale", "PENDING_REVIEW", "APPROVED", 25);
  await assert.rejects(
    () => applyAtomicModerationTransition(database, {
      ...input,
      transitionGuard: {
        sql: "EXISTS(SELECT 1 FROM canonical_records WHERE id=? AND updated_at=?)",
        bindings: ["profile-2", "2026-09-15T17:00:00.000Z"],
      },
      extraStatements: [
        database.prepare(`UPDATE canonical_records SET value='overwritten',updated_at=?1 WHERE id='profile-2'
          AND EXISTS(SELECT 1 FROM moderation_submissions WHERE id=?2 AND status='APPROVED' AND updated_at=?1 AND reviewed_by=?3)`)
          .bind(input.now, input.id, input.actorRef),
        database.prepare(`INSERT INTO decision_side_effects(id,submission_id)
          SELECT 'false-success','canonical-stale' WHERE EXISTS(
            SELECT 1 FROM moderation_submissions WHERE id='canonical-stale' AND status='APPROVED' AND updated_at=?1 AND reviewed_by=?2
          )`).bind(input.now, input.actorRef),
      ],
    }),
    ModerationStateConflictError,
  );

  assert.equal(readStatus(sqlite, "canonical-stale"), "PENDING_REVIEW");
  assert.equal(readEvents(sqlite).length, 0);
  assert.deepEqual(
    sqlite.prepare("SELECT value,updated_at AS updatedAt FROM canonical_records WHERE id='profile-2'").get(),
    { value: "newer", updatedAt: "2026-09-15T17:30:00.000Z" },
  );
  assert.equal(sqlite.prepare("SELECT COUNT(*) count FROM decision_side_effects").get().count, 0);
  sqlite.close();
});

test("admin moderation API maps stale CAS conflicts to the existing JSON error shape with HTTP 409", async () => {
  const source = await fs.readFile(new URL("../app/api/admin/moderation/submissions/[id]/route.ts", import.meta.url), "utf8");
  const conflictBranch = source.match(/if \(error instanceof ModerationStateConflictError\)[^\n]+/)?.[0] ?? "";
  assert.match(conflictBranch, /Response\.json\(\{ error:/);
  assert.match(conflictBranch, /medzičasom zmenil/);
  assert.match(conflictBranch, /Obnov záznam/);
  assert.match(conflictBranch, /status: 409/);
  assert.match(source, /Invalid moderation state transition[^\n]+status: 409/);
});
