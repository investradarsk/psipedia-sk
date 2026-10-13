import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { acquireGeminiNotionLock } from '../lib/gemini-notion-review-lock.ts';

test('additive migration and canonicalized page locks serialize independent connections', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    const migration = readFileSync(new URL('../drizzle/0124_gemini_notion_review_locks.sql', import.meta.url), 'utf8');
    sqlite.exec(migration); sqlite.exec(migration);
    const database = { prepare(sql) { return { bind(...args) { return { async run() {
      return { meta: { changes: sqlite.prepare(sql).run(...args).changes } };
    } }; } }; } };
    const release = await acquireGeminiNotionLock(database, 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA');
    assert.ok(release);
    assert.equal(await acquireGeminiNotionLock(database, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), null);
    await release();
    const next = await acquireGeminiNotionLock(database, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.ok(next);
    await release(); // stale owner cannot release another request's lock
    assert.equal(await acquireGeminiNotionLock(database, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), null);
    await next();
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM gemini_notion_review_locks').get().count, 0);
  } finally { sqlite.close(); }
});
