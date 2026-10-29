import {env} from "cloudflare:workers";
import {ADOPTION_STALE_DAYS} from "@/lib/adoption";
import {getGeminiCatalogItem} from "@/lib/gemini-automation-catalog";
import {normalizeAdminNotificationPath} from "@/lib/admin-web-push";

export type WorkspaceEvent={
  id:number;eventType:string;sourceType:string;title:string;body:string;
  href:string;createdAt:string;read:boolean;
};
export type WorkspaceNextGemini={label:string;stableKey:string;nextRunAt:string}|null;
export type WorkspaceFeed={items:WorkspaceEvent[];nextGemini:WorkspaceNextGemini;
  qualityPending:number;status:"OK"|"UNAVAILABLE"};

function database(){return (env as unknown as {DB?:D1Database}).DB;}

/** Read-only home projection: no duplicate event queue and no technical log feed. */
export async function loadAdminWorkspaceFeed(email:string,db=database()):Promise<WorkspaceFeed>{
  const empty:WorkspaceFeed={items:[],nextGemini:null,qualityPending:0,status:"UNAVAILABLE"};
  if(!db)return empty;
  const now = new Date();
  const nowIso = now.toISOString();
  const staleAdoptionAt = new Date(now.getTime() - ADOPTION_STALE_DAYS * 86_400_000).toISOString();
  const agreementHorizon = new Date(now.getTime() + 14 * 86_400_000).toISOString();
  try{
    const [events,upcoming,quality]=await Promise.all([
      db.prepare(`SELECT e.id,e.event_type AS eventType,e.source_type AS sourceType,
        e.title,e.body,e.target_url AS href,e.created_at AS createdAt,
        CASE WHEN r.read_at IS NULL THEN 0 ELSE 1 END AS isRead
        FROM admin_notification_events e
        LEFT JOIN admin_notification_read_receipts r ON r.event_id=e.id AND r.admin_email=?
        WHERE r.read_at IS NULL
          AND e.event_type<>'admin_push_test'
          -- Keep hourly Notion sync receipts out of user-facing alerts;
          -- their D1 rows remain available to the technical history/audit.
          AND NOT (e.source_type='AUTOMATION_RUN' AND e.resource_type='notion')
          AND (e.event_type NOT LIKE 'automation_run_%'
            OR e.event_type IN ('automation_run_failed','automation_run_partial_success'))
          -- Only live, unfinished canonical work belongs in the inbox.
          -- Unmapped information events remain until explicitly read.
          AND (CASE
            WHEN e.source_type IN ('MODERATION_SUBMISSION','PARTNER_PROPOSAL')
              THEN EXISTS (SELECT 1 FROM moderation_submissions s
                WHERE s.id=e.resource_ref
                  AND s.status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED'))
            WHEN e.source_type='PROFILE_REVIEW_MODERATION'
              THEN EXISTS (SELECT 1 FROM profile_reviews p
                WHERE p.id=CAST(e.resource_ref AS INTEGER) AND p.status='PENDING_REVIEW')
            WHEN e.source_type='PARTNER_CLAIM_REVIEW'
              THEN EXISTS (SELECT 1 FROM partner_claims p
                WHERE p.id=e.resource_ref AND p.status='PENDING')
            WHEN e.source_type='NEWS_TIP'
              THEN EXISTS (SELECT 1 FROM news_tips n
                WHERE n.id=CAST(e.resource_ref AS INTEGER) AND n.status IN ('new','reviewing'))
            WHEN e.source_type='DIRECTORY_CHANGE_REQUEST'
              THEN EXISTS (SELECT 1 FROM directory_profile_change_requests d
                WHERE d.id=CAST(e.resource_ref AS INTEGER) AND d.status='new')
            WHEN e.source_type='DIRECTORY_INQUIRY'
              THEN EXISTS (SELECT 1 FROM directory_inquiries d
                WHERE d.id=CAST(e.resource_ref AS INTEGER) AND d.status IN ('new','read'))
            WHEN e.source_type='ARTICLE_FEEDBACK'
              THEN EXISTS (SELECT 1 FROM article_feedback a
                WHERE a.id=CAST(e.resource_ref AS INTEGER)
                  AND a.helpful=0 AND a.status IN ('new','reviewing'))
            WHEN e.source_type='ADOPTION_STALE'
              THEN EXISTS (SELECT 1 FROM adoption_dogs a
                WHERE a.id=CAST(e.resource_ref AS INTEGER)
                  AND a.status IN ('ACTIVE','RESERVED')
                  AND (a.last_verified_at IS NULL OR a.last_verified_at<?))
            WHEN e.source_type='PARTNER_COMMERCIAL_AGREEMENT'
              THEN EXISTS (SELECT 1 FROM partner_commercial_agreements a
                WHERE a.id=CAST(e.resource_ref AS INTEGER)
                  AND a.status='ACTIVE' AND a.end_at>? AND a.end_at<=?)
            WHEN e.source_type='QUALITY_MISSING' AND e.event_type='quality_missing_found'
              THEN EXISTS (SELECT 1 FROM quality_missing_proposals q
                WHERE q.entity_id=CAST(e.resource_ref AS INTEGER)
                  AND q.area=e.resource_type AND q.status='OPEN')
            WHEN e.source_type='FACEBOOK_IMAGE' AND e.event_type='facebook_image_imported'
              THEN EXISTS (SELECT 1 FROM facebook_image_posts f
                WHERE f.id=e.resource_ref
                  AND f.status='draft' AND f.approval_status='UNREVIEWED')
            WHEN e.source_type='FACEBOOK_IMAGE' AND e.event_type='facebook_image_failed'
              THEN EXISTS (SELECT 1 FROM facebook_image_posts f
                WHERE f.id=e.resource_ref AND f.status<>'published')
            WHEN e.source_type='GEMINI_CREATED' AND e.resource_type='DIRECTORY'
              THEN EXISTS (SELECT 1 FROM directory_profiles d
                WHERE d.id=CAST(e.resource_ref AS INTEGER) AND d.status='draft')
            WHEN e.source_type='GEMINI_CREATED' AND e.resource_type='EVENT'
              THEN EXISTS (SELECT 1 FROM managed_events m
                WHERE m.id=CAST(e.resource_ref AS INTEGER) AND m.status='draft')
            WHEN e.event_type='automation_draft_created'
              AND e.target_url LIKE '/admin/adresar/%'
              THEN EXISTS (SELECT 1 FROM directory_profiles d
                WHERE d.id=CAST(e.resource_ref AS INTEGER) AND d.status='draft')
            WHEN e.event_type='automation_draft_created'
              AND e.target_url LIKE '/admin/podujatia/%'
              THEN EXISTS (SELECT 1 FROM managed_events m
                WHERE m.id=CAST(e.resource_ref AS INTEGER) AND m.status='draft')
            ELSE 1
          END)
        ORDER BY e.created_at DESC,e.id DESC LIMIT 30`)
        .bind(email.toLowerCase(),staleAdoptionAt,nowIso,agreementHorizon).all<{id:number;eventType:string;sourceType:string;
          title:string;body:string;href:string;createdAt:string;isRead:number}>(),
      db.prepare(`SELECT stable_key AS stableKey,next_run_at AS nextRunAt
        FROM gemini_automation_settings
        WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at>=?
        ORDER BY next_run_at ASC,stable_key ASC LIMIT 1`)
        .bind(nowIso).first<{stableKey:string;nextRunAt:string}>(),
      db.prepare("SELECT COUNT(*) AS n FROM quality_missing_proposals WHERE status='OPEN'")
        .first<{n:number}>(),
    ]);
    return {
      status:"OK",
      items:events.results.map(row=>({
        id:row.id,eventType:row.eventType,sourceType:row.sourceType,
        title:row.title,body:row.body,
        href:normalizeAdminNotificationPath(row.href),createdAt:row.createdAt,read:Boolean(row.isRead),
      })),
      nextGemini:upcoming?{stableKey:upcoming.stableKey,
        label:getGeminiCatalogItem(upcoming.stableKey)?.label??upcoming.stableKey,
        nextRunAt:upcoming.nextRunAt}:null,
      qualityPending:Number(quality?.n??0),
    };
  }catch(error){
    console.warn(JSON.stringify({event:"admin_workspace_feed_unavailable",reason:error instanceof Error?error.name:"unknown"}));
    return empty;
  }
}

/**
 * Lightweight read-only home summary. The workspace no longer renders a list
 * of notifications, so it must not execute the notification/event history
 * query on every visit. Keep loadAdminWorkspaceFeed for the existing API.
 */
export async function loadAdminWorkspaceOverview(db=database()):Promise<WorkspaceFeed>{
  const empty:WorkspaceFeed={items:[],nextGemini:null,qualityPending:0,status:"UNAVAILABLE"};
  if(!db)return empty;
  try{
    const [upcoming,quality]=await Promise.all([
      db.prepare(`SELECT stable_key AS stableKey,next_run_at AS nextRunAt
        FROM gemini_automation_settings
        WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at>=?
        ORDER BY next_run_at ASC,stable_key ASC LIMIT 1`)
        .bind(new Date().toISOString()).first<{stableKey:string;nextRunAt:string}>(),
      db.prepare("SELECT COUNT(*) AS n FROM quality_missing_proposals WHERE status='OPEN'")
        .first<{n:number}>(),
    ]);
    return {
      items:[],
      status:"OK",
      nextGemini:upcoming?{
        stableKey:upcoming.stableKey,
        label:getGeminiCatalogItem(upcoming.stableKey)?.label??upcoming.stableKey,
        nextRunAt:upcoming.nextRunAt,
      }:null,
      qualityPending:Number(quality?.n??0),
    };
  }catch(error){
    console.warn(JSON.stringify({event:"admin_workspace_overview_unavailable",reason:error instanceof Error?error.name:"unknown"}));
    return empty;
  }
}

export async function markAdminWorkspaceEventRead(email:string,id:number,db=database()){
  if(!db||!Number.isSafeInteger(id)||id<=0)throw Error("Invalid event.");
  // Never allow marking an event outside the canonical admin notification registry.
  const result=await db.prepare(`INSERT INTO admin_notification_read_receipts(event_id,admin_email,read_at)
    SELECT id,?,? FROM admin_notification_events WHERE id=?
    ON CONFLICT(event_id,admin_email) DO NOTHING`)
    .bind(email.toLowerCase(),new Date().toISOString(),id).run();
  return {ok:true,changed:Number(result.meta.changes??0)>0};
}
