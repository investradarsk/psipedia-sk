/**
 * Operational Notion notices belong in /admin/operations, never in a profile
 * editor. Store one current state per profile and clear it upon acknowledged
 * synchronization. This table is optional during migration rollout.
 */
export type DirectoryNotionAlert = {
  profile_id: number;
  name: string;
  category: string;
  direction: string;
  message: string;
  updated_at: string;
};

export async function recordDirectoryNotionAlert(
  db: D1Database,
  profileId: number,
  status: "pending" | "resolved",
  message = "",
  direction = "ADMIN_TO_NOTION",
): Promise<void> {
  try {
    if (status === "resolved") {
      await db.prepare("DELETE FROM directory_notion_sync_alerts WHERE profile_id=?")
        .bind(profileId).run();
      return;
    }
    await db.prepare(`INSERT INTO directory_notion_sync_alerts
      (profile_id,status,direction,message,updated_at)
      VALUES (?, 'pending', ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
      status='pending',direction=excluded.direction,message=excluded.message,
      updated_at=excluded.updated_at`)
      .bind(profileId, direction, message.slice(0, 600), new Date().toISOString()).run();
  } catch (error) {
    // The migration may not have run yet; never block an editorial save.
    console.warn("DIRECTORY_NOTION_ALERT_UNAVAILABLE", profileId, error);
  }
}

export async function loadDirectoryNotionAlerts(db?: D1Database): Promise<DirectoryNotionAlert[]> {
  if (!db) return [];
  try {
    const rows = await db.prepare(`SELECT a.profile_id, a.direction, a.message, a.updated_at,
      COALESCE(dp.name, 'Profil') AS name, COALESCE(dp.category, '') AS category
      FROM directory_notion_sync_alerts a
      LEFT JOIN directory_profiles dp ON dp.id=a.profile_id
      WHERE a.status='pending'
      ORDER BY a.updated_at DESC LIMIT 30`).all<DirectoryNotionAlert>();
    return rows.results ?? [];
  } catch (error) {
    console.warn("DIRECTORY_NOTION_ALERT_LIST_UNAVAILABLE", error);
    return [];
  }
}
