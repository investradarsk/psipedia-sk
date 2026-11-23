/**
 * Partner-owned LOST/FOUND closure. This is a narrow, one-way lifecycle action,
 * not a general-purpose status editor or an alternative moderation pipeline.
 * A resolved report remains available at its original public URL (noindex).
 */
import { env } from "cloudflare:workers";
import { adminNotificationEventStatement } from "./admin-notifications";
import { getPartnerDatabase } from "./partner-auth-store";
import { parseHelpResourceId } from "./partner-help-claims";
import { requirePartnerPermission } from "./partner-platform";
import { invalidateVersionedPublicHtmlCacheUrl } from "./public-html-cache";
import {
  captureHelpNotionSnapshot, syncSavedNotionRecord,
  type TargetedNotionSaveBindings,
} from "./notion-targeted-admin-save";

export class PartnerLostFoundResolutionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "PartnerLostFoundResolutionError";
  }
}

type Report = {
  status: string;
  type: "LOST" | "FOUND";
  slug: string;
  dogName: string | null;
  updatedAt: string;
  publishedAt: string | null;
  duplicateOfId: number | null;
  expiresAt: string | null;
};

function nextRevision(previous: string, now: Date) {
  const old = Date.parse(previous);
  const proposed = now.getTime();
  return new Date(Number.isFinite(old) && proposed <= old ? old + 1 : proposed).toISOString();
}

export async function resolvePartnerLostFoundReport(input: {
  accountId: string;
  resourceId: string;
  baseRevision: unknown;
  database?: D1Database;
  now?: Date;
  publicOrigin?: string;
  workerVersionId?: string;
  notionBindings?: TargetedNotionSaveBindings;
}) {
  const parsed = parseHelpResourceId(input.resourceId);
  if (!parsed || parsed.entityType !== "LOST_FOUND_DOG")
    throw new PartnerLostFoundResolutionError("Toto nie je hlásenie strateného alebo nájdeného psa.", 404);
  if (typeof input.baseRevision !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(input.baseRevision) ||
      !Number.isFinite(Date.parse(input.baseRevision)) || input.baseRevision.length > 64)
    throw new PartnerLostFoundResolutionError("Obnovte editor a skúste to znovu.", 409);

  const db = getPartnerDatabase(input.database);
  await requirePartnerPermission(input.accountId, input.resourceId, "HELP_EDIT_PUBLIC", db);
  const row = await db.prepare(
    "SELECT status,type,slug,dog_name dogName,updated_at updatedAt,published_at publishedAt,"+
    "duplicate_of_id duplicateOfId,expires_at expiresAt "+
    "FROM lost_found_dog_reports WHERE id=?1 LIMIT 1",
  ).bind(parsed.canonicalId).first<Report>();
  if (!row) throw new PartnerLostFoundResolutionError("Hlásenie neexistuje.", 404);
  if (row.status !== "ACTIVE" || !row.publishedAt || row.duplicateOfId !== null)
    throw new PartnerLostFoundResolutionError("Ukončiť možno iba aktívne zverejnené hlásenie.", 409);
  const now = input.now ?? new Date();
  if (row.expiresAt && row.expiresAt <= now.toISOString())
    throw new PartnerLostFoundResolutionError("Hlásenie už expirovalo. Kontaktujte redakciu.", 409);
  if (row.updatedAt !== input.baseRevision)
    throw new PartnerLostFoundResolutionError("Hlásenie sa medzitým zmenilo. Obnovte editor.", 409);

  // Capture before the D1 write. Notion is a separate best-effort mirror;
  // it must never roll back a successfully resolved case.
  const bindings: TargetedNotionSaveBindings = {
    ...(input.notionBindings ?? (env as unknown as TargetedNotionSaveBindings)),
    DB: db,
  };
  const beforeHelpSnapshot = await captureHelpNotionSnapshot({
    bindings, agenda:"lost-found", entityId:parsed.canonicalId,
  });
  const updatedAt = nextRevision(row.updatedAt, now);
  const actor = "partner:" + input.accountId;
  const eventId = crypto.randomUUID();

  try {
    await db.batch([
      db.prepare(
        "UPDATE lost_found_dog_reports SET status='RESOLVED',resolved_at=?1,updated_at=?1 "+
        "WHERE id=?2 AND status='ACTIVE' AND published_at IS NOT NULL "+
        "AND duplicate_of_id IS NULL AND updated_at=?3 "+
        "AND (expires_at IS NULL OR expires_at>?4) "+
        "AND EXISTS (SELECT 1 FROM partner_help_claims c "+
        "JOIN partner_accounts a ON a.id=c.account_id AND a.status='ACTIVE' "+
        "WHERE c.lost_found_report_id=?2 AND c.entity_type='LOST_FOUND_DOG' "+
        "AND c.account_id=?5 AND c.status='APPROVED')",
      ).bind(updatedAt, parsed.canonicalId, input.baseRevision, now.toISOString(), input.accountId),
      db.prepare("SELECT CASE WHEN changes()=1 THEN 1 "+
        "ELSE json_extract('PARTNER_LOST_FOUND_RESOLVE_CONFLICT',char(36)) END"),
      db.prepare("INSERT INTO partner_audit_events "+
        "(id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at) "+
        "VALUES(?1,'PARTNER',?2,'PROFILE_CHANGE_APPROVED','PARTNER_HELP_CLAIM',?3,?4,?5)")
        .bind(eventId,actor,input.resourceId,JSON.stringify({
          mode:"LOST_FOUND_RESOLVED",canonicalId:parsed.canonicalId,
          fromStatus:"ACTIVE",toStatus:"RESOLVED",fromRevision:row.updatedAt,
          fields:["status","resolved_at"],
        }),updatedAt),
      adminNotificationEventStatement(db,{
        eventType:"partner_lost_found_resolved",sourceType:"PARTNER_LIFECYCLE",
        resourceType:"LOST_FOUND_DOG",resourceRef:parsed.canonicalId,
        actorType:"PARTNER",actorRef:actor,
        targetUrl:"/admin/stratene-najdene/"+parsed.canonicalId,
        title:"Partner uzavrel hlásenie psa",
        body:(row.dogName || "Pes")+" · Prípad je vyriešený",
        tag:"partner-lost-found-resolved",dedupeKey:"partner/lost-found-resolved/"+eventId,
      },updatedAt),
    ]);
  } catch (error) {
    if (error instanceof Error && /PARTNER_LOST_FOUND_RESOLVE_CONFLICT|constraint failed|malformed JSON/i.test(error.message))
      throw new PartnerLostFoundResolutionError("Hlásenie sa zmenilo alebo už nemáte oprávnenie. Obnovte editor.", 409);
    throw error;
  }

  const notionFieldSync = await syncSavedNotionRecord({
    bindings, agenda:"lost-found", entityId:parsed.canonicalId, beforeHelpSnapshot,
  });

  if (input.publicOrigin) {
    const version=input.workerVersionId ??
      (env as unknown as {CF_VERSION_METADATA?:{id?:string}}).CF_VERSION_METADATA?.id;
    const detail="/pomoc-psom/"+(row.type==="FOUND"?"najdene-psy":"stratene-psy")+"/"+row.slug;
    for (const path of [detail,"/pomoc-psom/stratene-psy","/pomoc-psom/najdene-psy","/pomoc-psom"]) {
      try { await invalidateVersionedPublicHtmlCacheUrl(new URL(path,input.publicOrigin),version); }
      catch(error) { console.error("Partner lost-found public HTML invalidation failed",error); }
    }
  }
  return { resourceId:input.resourceId, status:"RESOLVED" as const,
    resolvedAt:updatedAt, baseRevision:updatedAt, notionFieldSync };
}
