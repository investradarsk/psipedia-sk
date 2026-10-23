import {env} from "cloudflare:workers";
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
  try{
    const [events,upcoming,quality]=await Promise.all([
      db.prepare(`SELECT e.id,e.event_type AS eventType,e.source_type AS sourceType,
        e.title,e.body,e.target_url AS href,e.created_at AS createdAt,
        CASE WHEN r.read_at IS NULL THEN 0 ELSE 1 END AS isRead
        FROM admin_notification_events e
        LEFT JOIN admin_notification_read_receipts r ON r.event_id=e.id AND r.admin_email=?
        WHERE e.event_type<>'admin_push_test'
        ORDER BY e.created_at DESC,e.id DESC LIMIT 30`)
        .bind(email.toLowerCase()).all<{id:number;eventType:string;sourceType:string;
          title:string;body:string;href:string;createdAt:string;isRead:number}>(),
      db.prepare(`SELECT stable_key AS stableKey,next_run_at AS nextRunAt
        FROM gemini_automation_settings
        WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at>=?
        ORDER BY next_run_at ASC,stable_key ASC LIMIT 1`)
        .bind(new Date().toISOString()).first<{stableKey:string;nextRunAt:string}>(),
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

export async function markAdminWorkspaceEventRead(email:string,id:number,db=database()){
  if(!db||!Number.isSafeInteger(id)||id<=0)throw Error("Invalid event.");
  // Never allow marking an event outside the canonical admin notification registry.
  const result=await db.prepare(`INSERT INTO admin_notification_read_receipts(event_id,admin_email,read_at)
    SELECT id,?,? FROM admin_notification_events WHERE id=?
    ON CONFLICT(event_id,admin_email) DO NOTHING`)
    .bind(email.toLowerCase(),new Date().toISOString(),id).run();
  return {ok:true,changed:Number(result.meta.changes??0)>0};
}
