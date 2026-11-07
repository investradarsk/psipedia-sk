/**
 * Directory Notion synchronization alerts use the existing admin notification
 * table. There is no extra D1 migration, no additional queue and no
 * notification in the individual profile editor.
 *
 * The stable dedupe key means there is at most one unresolved notice for each
 * profile. A successful acknowledged sync removes only that notice.
 */
export type DirectoryNotionAlert = {
  profile_id: number;
  name: string;
  category: string;
  direction: string;
  message: string;
  updated_at: string;
};

const EVENT_TYPE = "directory_notion_sync_pending";
const SOURCE_TYPE = "DIRECTORY_NOTION_SYNC";
const keyFor = (profileId: number) => `directory-notion-sync/profile/${profileId}`;

export async function recordDirectoryNotionAlert(
  db: D1Database,
  profileId: number,
  status: "pending" | "resolved",
  message = "",
  direction = "ADMIN_TO_NOTION",
): Promise<void> {
  try {
    if (status === "resolved") {
      await db.prepare(`DELETE FROM admin_notification_events
        WHERE dedupe_key=? AND event_type=?`)
        .bind(keyFor(profileId), EVENT_TYPE).run();
      return;
    }

    await db.prepare(`INSERT INTO admin_notification_events
      (event_type, source_type, resource_type, resource_ref, actor_type,
       actor_ref, target_url, title, body, tag, dedupe_key, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(dedupe_key) DO UPDATE SET
        body=excluded.body, actor_ref=excluded.actor_ref,
        created_at=excluded.created_at
      WHERE admin_notification_events.event_type=?`)
      .bind(
        EVENT_TYPE, SOURCE_TYPE, "directory_profile", String(profileId),
        "SYSTEM", direction, "/admin/operations",
        "Synchronizácia Notion",
        (message || "Prenos údajov nie je potvrdený.").slice(0, 160),
        `directory-notion-${profileId}`, keyFor(profileId),
        new Date().toISOString(), EVENT_TYPE,
      ).run();
  } catch (error) {
    // Notifications must never block saving an editorial profile.
    console.warn("DIRECTORY_NOTION_ALERT_UNAVAILABLE", profileId, error);
  }
}

export async function loadDirectoryNotionAlerts(db?: D1Database): Promise<DirectoryNotionAlert[]> {
  if (!db) return [];
  try {
    const rows = await db.prepare(`SELECT CAST(n.resource_ref AS INTEGER) AS profile_id,
      COALESCE(dp.name, 'Profil') AS name, COALESCE(dp.category, '') AS category,
      COALESCE(n.actor_ref, '') AS direction, n.body AS message,
      n.created_at AS updated_at
      FROM admin_notification_events n
      LEFT JOIN directory_profiles dp ON dp.id=CAST(n.resource_ref AS INTEGER)
      WHERE n.event_type=? AND n.source_type=?
      ORDER BY n.created_at DESC LIMIT 30`)
      .bind(EVENT_TYPE, SOURCE_TYPE).all<DirectoryNotionAlert>();
    return rows.results ?? [];
  } catch (error) {
    console.warn("DIRECTORY_NOTION_ALERT_LIST_UNAVAILABLE", error);
    return [];
  }
}
