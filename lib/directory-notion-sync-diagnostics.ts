/**
 * Read-only, per-profile evidence of the Directory Notion transport.
 * A shared legacy mapping timestamp or a V3 receipt is NOT proof that an
 * independent signed editorial webhook was received.
 */
export type DirectoryNotionSyncDiagnostic = {
  linked: boolean;
  mappingAt: string | null;
  editorialBaselineAt: string | null;
  serviceV3BaselineAt: string | null;
  v3ConfirmedIds: number | null;
  v3YesInAdmin: number | null;
  inbox: {
    status: string; count: number;
  }[] | null;
  lastInbox: {
    status: string; outcome: string | null; errorCode: string | null;
    attempts: number; receivedAt: string | null;
  } | null;
  alert: { direction: string; message: string; createdAt: string } | null;
};

async function optional<T>(work: () => Promise<T>): Promise<T | null> {
  try { return await work(); } catch { return null; }
}

export async function readDirectoryNotionSyncDiagnostic(
  db: D1Database,
  profileId: number,
): Promise<DirectoryNotionSyncDiagnostic> {
  if (!Number.isSafeInteger(profileId) || profileId <= 0)
    throw new Error("DIRECTORY_NOTION_DIAGNOSTIC_ID_INVALID");
  const mapping = await db.prepare(
    "SELECT notion_page_id,last_synced_at FROM directory_notion_sync " +
    "WHERE directory_profile_id=? LIMIT 1",
  ).bind(profileId).first<{ notion_page_id: string; last_synced_at: string | null }>();
  if (!mapping?.notion_page_id)
    return {
      linked: false, mappingAt: null, editorialBaselineAt: null,
      serviceV3BaselineAt: null, v3ConfirmedIds: null,
      v3YesInAdmin: null, inbox: null, lastInbox: null, alert: null,
    };

  const [editorial, v3, yes, inbox, lastInbox, alert] = await Promise.all([
    optional(() => db.prepare(
      "SELECT recorded_at FROM notion_profile_field_baselines " +
      "WHERE agenda='directory' AND entity_id=? AND notion_page_id=? LIMIT 1",
    ).bind(profileId, mapping.notion_page_id).first<{ recorded_at: string }>()),
    optional(() => db.prepare(
      "SELECT synced_at,confirmed_ids_json FROM directory_service_notion_relation_sync " +
      "WHERE directory_profile_id=? AND notion_page_id=? LIMIT 1",
    ).bind(profileId, mapping.notion_page_id).first<{ synced_at: string; confirmed_ids_json: string }>()),
    optional(() => db.prepare(
      "SELECT COUNT(*) AS n FROM service_profile_option_choices WHERE profile_id=? AND choice='yes'",
    ).bind(profileId).first<{ n: number }>()),
    optional(() => db.prepare(
      "SELECT status,COUNT(*) AS count FROM notion_webhook_inbox " +
      "WHERE REPLACE(LOWER(page_id),'-','')=REPLACE(LOWER(?),'-','') " +
      "GROUP BY status ORDER BY status",
    ).bind(mapping.notion_page_id).all<{ status: string; count: number }>()),
    optional(() => db.prepare(
      "SELECT status,outcome,last_error_code AS errorCode,attempts," +
      "datetime(received_at,'unixepoch') AS receivedAt " +
      "FROM notion_webhook_inbox " +
      "WHERE REPLACE(LOWER(page_id),'-','')=REPLACE(LOWER(?),'-','') " +
      "ORDER BY received_at DESC,event_key DESC LIMIT 1",
    ).bind(mapping.notion_page_id)
      .first<{status:string;outcome:string|null;errorCode:string|null;attempts:number;receivedAt:string|null}>()),
    optional(() => db.prepare(
      "SELECT COALESCE(actor_ref,'') AS direction,COALESCE(body,'') AS message, " +
      "created_at AS createdAt FROM admin_notification_events " +
      "WHERE dedupe_key=? AND event_type='directory_notion_sync_pending' LIMIT 1",
    ).bind("directory-notion-sync/profile/" + profileId)
      .first<{direction:string;message:string;createdAt:string}>()),
  ]);

  let v3ConfirmedIds: number | null = null;
  if (v3?.confirmed_ids_json) {
    try {
      const parsed: unknown = JSON.parse(v3.confirmed_ids_json);
      if (Array.isArray(parsed) && parsed.every(value => typeof value === "string"))
        v3ConfirmedIds = parsed.length;
    } catch { /* An invalid receipt is unknown, never zero. */ }
  }
  return {
    linked: true,
    mappingAt: mapping.last_synced_at ?? null,
    editorialBaselineAt: editorial?.recorded_at ?? null,
    serviceV3BaselineAt: v3?.synced_at ?? null,
    v3ConfirmedIds,
    v3YesInAdmin: yes?.n ?? null,
    inbox: inbox?.results ?? null,
    lastInbox: lastInbox ?? null,
    alert: alert ?? null,
  };
}
