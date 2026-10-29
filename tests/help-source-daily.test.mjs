import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import test from "node:test";

const file = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const migration = file("drizzle/0146_help_source_daily_checks.sql");
const monitor = file("lib/help-source-daily-check.ts");
const worker = file("worker/index.ts");
const attention = file("lib/admin-attention-queue-store.ts");
const action = file("app/api/admin/attention/ack/route.ts");

test("daily help check is additive and cannot mutate public lifecycle automatically", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration);
    db.prepare("INSERT INTO help_source_checks(entity_type,entity_id,source_url,source_state) VALUES (?,?,?,?)")
      .run("ADOPTION", 7, "https://example.org/adoption/7", "UNCERTAIN");
    const result = db.prepare("SELECT source_state FROM help_source_checks WHERE entity_type=? AND entity_id=?").get("ADOPTION", 7);
    assert.equal(result.source_state, "UNCERTAIN");
    assert.throws(() => db.prepare("INSERT INTO help_source_checks(entity_type,entity_id) VALUES ('OTHER',7)").run());
    assert.throws(() => db.prepare("INSERT INTO help_source_checks(entity_type,entity_id,source_state) VALUES ('ADOPTION',8,'CLOSED')").run());
    assert.match(monitor, /Source checks never modify|never automatic|NEVER written/);
    assert.doesNotMatch(monitor.slice(0, monitor.indexOf("export async function confirmHelpSourceManually")), /UPDATE adoption_dogs SET/);
  } finally {
    db.close();
  }
});

test("one existing hourly cron, bounded safe HTTPS and no paid search", () => {
  assert.match(worker, /runHelpSourceDailySweep/);
  assert.match(monitor, /BATCH_LIMIT = 18/);
  assert.match(monitor, /DAY_MS = 86_400_000/);
  assert.match(monitor, /safeRemoteImageUrl/);
  assert.match(monitor, /redirect: "manual"/);
  assert.match(monitor, /MAX_HTML_BYTES/);
  assert.match(monitor, /AbortSignal\.timeout/);
  assert.doesNotMatch(monitor, /TavilyAutomationSearchProvider|GeminiAutomationSearchProvider/);
});

test("notification read/snooze does not close adoptees, source events have one canonical queue", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(migration);
    db.prepare("INSERT INTO admin_attention_ack (source_type,source_id,relevant_at,read_at,updated_at) VALUES (?,?,?,?,?)")
      .run("ADOPTION_STALE", "7", "2026-10-01T00:00:00.000Z", "2026-10-29T00:00:00.000Z", "2026-10-29T00:00:00.000Z");
    assert.equal(db.prepare("SELECT COUNT(*) total FROM admin_attention_ack").get().total, 1);
    assert.match(attention, /HELP_SOURCE_REVIEW/);
    assert.match(attention, /admin_attention_ack/);
    assert.match(action, /requireAdminMutation/);
    assert.doesNotMatch(action, /UPDATE adoption_dogs|UPDATE lost_found_dog_reports/);
  } finally {
    db.close();
  }
});
