import type { FieldSnapshot } from "./notion-profile-field-reconciliation.ts";

export async function profileFieldBaselineTableReady(database: D1Database): Promise<boolean> {
  const row = await database.prepare(
    "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='notion_profile_field_baselines' LIMIT 1",
  ).first<{ ok: number }>();
  return Boolean(row?.ok);
}

/** A hash or mapping mismatch invalidates the baseline instead of guessing. */
export async function readProfileFieldBaseline(input: {
  database: D1Database; agenda: string; entityId: number; pageId: string; expectedHash: string;
}): Promise<FieldSnapshot | null> {
  if (!await profileFieldBaselineTableReady(input.database)) return null;
  const row = await input.database.prepare(
    "SELECT snapshot_json,snapshot_hash,notion_page_id FROM notion_profile_field_baselines WHERE agenda=? AND entity_id=? LIMIT 1",
  ).bind(input.agenda, input.entityId).first<{
    snapshot_json: string; snapshot_hash: string; notion_page_id: string;
  }>();
  if (!row || row.notion_page_id !== input.pageId || row.snapshot_hash !== input.expectedHash) return null;
  try {
    const snapshot: unknown = JSON.parse(row.snapshot_json);
    return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
      ? snapshot as FieldSnapshot : null;
  } catch { return null; }
}

export async function recordProfileFieldBaseline(input: {
  database: D1Database; agenda: string; entityId: number; pageId: string;
  hash: string; snapshot: FieldSnapshot; syncedAt: string;
}): Promise<void> {
  if (!await profileFieldBaselineTableReady(input.database)) return;
  await input.database.prepare(`
    INSERT INTO notion_profile_field_baselines
      (agenda,entity_id,notion_page_id,snapshot_hash,snapshot_json,recorded_at)
    VALUES (?,?,?,?,?,?)
    ON CONFLICT(agenda,entity_id) DO UPDATE SET
      notion_page_id=excluded.notion_page_id,
      snapshot_hash=excluded.snapshot_hash,
      snapshot_json=excluded.snapshot_json,
      recorded_at=excluded.recorded_at
  `).bind(
    input.agenda, input.entityId, input.pageId, input.hash,
    JSON.stringify(input.snapshot), input.syncedAt,
  ).run();
}
