import type { AutomationEntityType } from "./data-automation.ts";

export type CanonicalDraftDeleteEntityType = AutomationEntityType;
export type CanonicalDraftDeleteDatabase = Pick<D1Database, "prepare" | "batch">;

type EntityConfig = {
  table: string;
  draftStatus: string;
  resourceColumn?: "directory_profile_id" | "help_organization_id" | "managed_event_id";
  moderationResourceType?: string;
  labelColumn: string;
};

// The lifecycle migration (0164) allows a hard delete only after a durable
// READY_LOCAL receipt. Canonical draft deletion is local-only: mapped Notion
// records must instead use the owner-controlled lifecycle flow. The predicates
// are checked again inside the D1 batch, so a newly inserted link cannot race
// the preflight check and be deleted locally.
const localOnlyNotionGuards: Record<CanonicalDraftDeleteEntityType, string> = {
  EVENT: "NOT EXISTS (SELECT 1 FROM event_notion_sync WHERE event_id=c.id) AND NOT EXISTS (SELECT 1 FROM notion_agenda_sync WHERE agenda='events' AND entity_id=c.id)",
  DIRECTORY: "NOT EXISTS (SELECT 1 FROM directory_notion_sync WHERE directory_profile_id=c.id)",
  ORGANIZATION: "NOT EXISTS (SELECT 1 FROM notion_agenda_sync WHERE agenda='organizations' AND entity_id=c.id)",
  HELP_ITEM: "NOT EXISTS (SELECT 1 FROM notion_agenda_sync WHERE agenda='help-cases' AND entity_id=c.id)",
  FOSTER: "NOT EXISTS (SELECT 1 FROM notion_agenda_sync WHERE agenda='help-cases' AND entity_id=c.id)",
  ADOPTION: "NOT EXISTS (SELECT 1 FROM notion_agenda_sync WHERE agenda='adoptions' AND entity_id=c.id)",
  LOST_FOUND: "NOT EXISTS (SELECT 1 FROM notion_agenda_sync WHERE agenda='lost-found' AND entity_id=c.id)",
};

const lifecycleKind: Record<CanonicalDraftDeleteEntityType, string> = {
  EVENT: "events", DIRECTORY: "directory", ORGANIZATION: "organizations",
  HELP_ITEM: "help", FOSTER: "help", ADOPTION: "adoptions", LOST_FOUND: "lost-found",
};

const entityConfigs: Record<CanonicalDraftDeleteEntityType, EntityConfig> = {
  EVENT: {
    table: "managed_events",
    draftStatus: "draft",
    resourceColumn: "managed_event_id",
    moderationResourceType: "MANAGED_EVENT",
    labelColumn: "title",
  },
  ORGANIZATION: {
    table: "help_organizations",
    draftStatus: "DRAFT",
    resourceColumn: "help_organization_id",
    moderationResourceType: "HELP_ORGANIZATION",
    labelColumn: "name",
  },
  HELP_ITEM: {
    table: "help_cases",
    draftStatus: "draft",
    labelColumn: "title",
  },
  ADOPTION: {
    table: "adoption_dogs",
    draftStatus: "DRAFT",
    moderationResourceType: "ADOPTION_DOG",
    labelColumn: "name",
  },
  FOSTER: {
    table: "help_cases",
    draftStatus: "draft",
    labelColumn: "title",
  },
  LOST_FOUND: {
    table: "lost_found_dog_reports",
    draftStatus: "DRAFT",
    moderationResourceType: "LOST_FOUND_CASE",
    labelColumn: "dog_name",
  },
  DIRECTORY: {
    table: "directory_profiles",
    draftStatus: "draft",
    resourceColumn: "directory_profile_id",
    moderationResourceType: "DIRECTORY_PROFILE",
    labelColumn: "name",
  },
};

export class CanonicalDraftDeleteError extends Error {
  constructor(
    message: string,
    public readonly code: "NOT_FOUND" | "NOT_DRAFT" | "PROTECTED_DEPENDENCY" | "INVALID_ENTITY",
  ) {
    super(message);
    this.name = "CanonicalDraftDeleteError";
  }
}

function nonEmpty(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function galleryHasItems(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return true;
  }
}

async function safeAuditActorRef(actor: string) {
  const normalized = actor.trim().toLowerCase() || "admin";
  if (!normalized.includes("@")) return normalized.slice(0, 120);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, "0")).join("");
  return `admin:${hash.slice(0, 24)}`;
}

async function canonicalRow(
  entityType: CanonicalDraftDeleteEntityType,
  canonicalEntityId: number,
  database: CanonicalDraftDeleteDatabase,
) {
  const config = entityConfigs[entityType];
  if (!config) throw new CanonicalDraftDeleteError("Neplatný typ konceptu.", "INVALID_ENTITY");
  return database.prepare(`SELECT * FROM ${config.table} WHERE id=? LIMIT 1`)
    .bind(canonicalEntityId)
    .first<Record<string, unknown>>();
}

function assertNoOwnedMedia(entityType: CanonicalDraftDeleteEntityType, row: Record<string, unknown>) {
  const hasOwnedKey = nonEmpty(row.image_key) || nonEmpty(row.main_image_key);
  const adoptionMedia = entityType === "ADOPTION"
    && (nonEmpty(row.main_image) || galleryHasItems(row.gallery_json));
  const lostFoundMedia = entityType === "LOST_FOUND"
    && (nonEmpty(row.main_image) || galleryHasItems(row.gallery_json));
  if (hasOwnedKey || adoptionMedia || lostFoundMedia) {
    throw new CanonicalDraftDeleteError(
      "Koncept má naviazané vlastné médiá a nemožno ho bezpečne úplne vymazať.",
      "PROTECTED_DEPENDENCY",
    );
  }
}

async function hasProtectedModerationData(
  config: EntityConfig,
  canonicalEntityId: number,
  database: CanonicalDraftDeleteDatabase,
) {
  if (!config.moderationResourceType) return false;
  const row = await database.prepare(`SELECT 1 AS protected
    FROM moderation_submissions
    WHERE resource_type=? AND subject_id=?
    LIMIT 1`).bind(
      config.moderationResourceType,
      String(canonicalEntityId),
    ).first<{ protected: number }>();
  return Boolean(row?.protected);
}

async function hasLostFoundPrivateData(
  entityType: CanonicalDraftDeleteEntityType,
  canonicalEntityId: number,
  database: CanonicalDraftDeleteDatabase,
) {
  if (entityType !== "LOST_FOUND") return false;
  const row = await database.prepare(`SELECT 1 AS protected
    FROM lost_found_dog_private_details
    WHERE report_id=?
    LIMIT 1`).bind(canonicalEntityId).first<{ protected: number }>();
  return Boolean(row?.protected);
}

async function hasProtectedCanonicalRelation(
  entityType: CanonicalDraftDeleteEntityType,
  canonicalEntityId: number,
  database: CanonicalDraftDeleteDatabase,
) {
  if (entityType !== "DIRECTORY") return false;
  const row = await database.prepare(`SELECT 1 AS protected
    FROM help_organizations
    WHERE directory_profile_id=?
    LIMIT 1`).bind(canonicalEntityId).first<{ protected: number }>();
  return Boolean(row?.protected);
}

async function partnerResource(
  config: EntityConfig,
  canonicalEntityId: number,
  database: CanonicalDraftDeleteDatabase,
) {
  if (!config.resourceColumn) return null;
  return database.prepare(`SELECT id FROM partner_resources
    WHERE ${config.resourceColumn}=?
    LIMIT 1`).bind(canonicalEntityId).first<{ id: string }>();
}

async function hasProtectedPartnerData(
  resourceId: string,
  database: CanonicalDraftDeleteDatabase,
) {
  const row = await database.prepare(`SELECT 1 AS protected
    WHERE EXISTS (SELECT 1 FROM partner_memberships WHERE resource_id=?1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM partner_claims WHERE resource_id=?1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM partner_resource_verifications WHERE resource_id=?1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM partner_commercial_interests WHERE resource_id=?1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM partner_commercial_agreements WHERE resource_id=?1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM partner_entitlements WHERE resource_id=?1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM partner_profile_change_metadata WHERE partner_resource_id=?1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM partner_new_profile_metadata WHERE resolved_resource_id=?1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM partner_event_submission_metadata WHERE partner_resource_id=?1 LIMIT 1)
       OR EXISTS (SELECT 1 FROM profile_reviews WHERE resource_id=?1 LIMIT 1)
    LIMIT 1`).bind(resourceId).first<{ protected: number }>();
  return Boolean(row?.protected);
}

function conditionalDelete(
  database: CanonicalDraftDeleteDatabase,
  sql: string,
  bindings: unknown[],
) {
  return database.prepare(sql).bind(...bindings);
}

export async function deleteCanonicalDraft(input: {
  entityType: CanonicalDraftDeleteEntityType;
  canonicalEntityId: number;
  actor: string;
  now?: Date;
}, database: CanonicalDraftDeleteDatabase) {
  if (!Number.isSafeInteger(input.canonicalEntityId) || input.canonicalEntityId < 1) {
    throw new CanonicalDraftDeleteError("Neplatné ID konceptu.", "NOT_FOUND");
  }
  const config = entityConfigs[input.entityType];
  if (!config) throw new CanonicalDraftDeleteError("Neplatný typ konceptu.", "INVALID_ENTITY");

  const current = await canonicalRow(input.entityType, input.canonicalEntityId, database);
  if (!current) throw new CanonicalDraftDeleteError("Koncept sa nenašiel.", "NOT_FOUND");
  if (String(current.status ?? "") !== config.draftStatus) {
    throw new CanonicalDraftDeleteError("Úplne vymazať možno iba koncept.", "NOT_DRAFT");
  }

  assertNoOwnedMedia(input.entityType, current);

  if (
    await hasProtectedModerationData(config, input.canonicalEntityId, database)
    || await hasLostFoundPrivateData(input.entityType, input.canonicalEntityId, database)
    || await hasProtectedCanonicalRelation(input.entityType, input.canonicalEntityId, database)
  ) {
    throw new CanonicalDraftDeleteError(
      "Koncept má naviazané používateľské údaje a nemožno ho bezpečne úplne vymazať.",
      "PROTECTED_DEPENDENCY",
    );
  }

  const resource = await partnerResource(config, input.canonicalEntityId, database);
  if (resource && await hasProtectedPartnerData(resource.id, database)) {
    throw new CanonicalDraftDeleteError(
      "Koncept má naviazané partnerské údaje a nemožno ho bezpečne úplne vymazať.",
      "PROTECTED_DEPENDENCY",
    );
  }

  const at = (input.now ?? new Date()).toISOString();
  const actorRef = await safeAuditActorRef(input.actor);
  const id = input.canonicalEntityId;
  const kind = lifecycleKind[input.entityType];
  const localOnlyGuard = localOnlyNotionGuards[input.entityType];

  // Never silently transform a pending owner-controlled deletion into a local
  // draft deletion. Nor may a linked Notion page be left behind after D1 delete.
  const [existingReceipt, linkedNotionPage] = await Promise.all([
    database.prepare("SELECT 1 AS present FROM admin_record_tombstones WHERE kind=? AND record_id=? LIMIT 1")
      .bind(kind, id).first<{ present: number }>(),
    database.prepare(`SELECT 1 AS linked FROM ${config.table} c WHERE c.id=? AND NOT (${localOnlyGuard}) LIMIT 1`)
      .bind(id).first<{ linked: number }>(),
  ]);
  if (existingReceipt || linkedNotionPage) {
    throw new CanonicalDraftDeleteError(
      "Koncept má rozpracované odstránenie alebo prepojenie s Notion. Použite bezpečné odstránenie záznamu.",
      "PROTECTED_DEPENDENCY",
    );
  }

  const draftExists = `EXISTS (SELECT 1 FROM ${config.table} c WHERE c.id=? AND c.status=?)`;
  const statements: D1PreparedStatement[] = [];

  // The receipt and the actual delete live in one atomic D1 batch. The
  // conditional INSERT independently rechecks status + all Notion mappings;
  // if either changed, the guarded DELETE aborts and rolls the batch back.
  const label = String(current[config.labelColumn] ?? "").trim() || "Bez názvu";
  const category = String(current.category ?? current.event_type ?? current.type ?? kind).trim() || kind;
  const externalKey = input.entityType === "DIRECTORY" || input.entityType === "ORGANIZATION"
    ? String(current.import_key ?? "").trim() || null : null;
  statements.push(database.prepare(`INSERT INTO admin_record_tombstones
      (kind,record_id,record_slug,record_external_key,record_name,record_category,
       notion_targets_json,state,created_by,created_at,updated_at)
    SELECT ?,c.id,c.slug,?,?,?,'[]','READY_LOCAL',?,?,?
    FROM ${config.table} c
    WHERE c.id=? AND c.status=? AND ${localOnlyGuard}`).bind(
      kind, externalKey, label, category, actorRef, at, at, id, config.draftStatus,
    ));

  statements.push(database.prepare(`INSERT OR IGNORE INTO automation_record_suppressions
      (entity_type,external_source_url,external_record_id,suppression_reason,created_by,created_at)
    SELECT p.entity_type,p.external_source_url,p.external_record_id,'ADMIN_DRAFT_DELETE',?,?
    FROM canonical_external_provenance p
    JOIN ${config.table} c ON c.id=p.canonical_entity_id AND c.status=?
    WHERE p.entity_type=? AND p.canonical_entity_id=?`).bind(
      actorRef,
      at,
      config.draftStatus,
      input.entityType,
      id,
    ));

  statements.push(conditionalDelete(
    database,
    `DELETE FROM automation_update_suggestions
      WHERE entity_type=? AND canonical_entity_id=? AND ${draftExists}`,
    [input.entityType, id, id, config.draftStatus],
  ));
  statements.push(conditionalDelete(
    database,
    `DELETE FROM canonical_draft_flags
      WHERE entity_type=? AND canonical_entity_id=? AND ${draftExists}`,
    [input.entityType, id, id, config.draftStatus],
  ));
  statements.push(conditionalDelete(
    database,
    `DELETE FROM canonical_external_provenance
      WHERE entity_type=? AND canonical_entity_id=? AND ${draftExists}`,
    [input.entityType, id, id, config.draftStatus],
  ));

  if (input.entityType === "DIRECTORY") {
    statements.push(conditionalDelete(
      database,
      `DELETE FROM breed_directory_relations
        WHERE profile_id=? AND ${draftExists}`,
      [id, id, config.draftStatus],
    ));
    statements.push(conditionalDelete(
      database,
      `DELETE FROM directory_breeder_club_relations
        WHERE (station_profile_id=? OR club_profile_id=?) AND ${draftExists}`,
      [id, id, id, config.draftStatus],
    ));
    statements.push(conditionalDelete(
      database,
      `DELETE FROM geo_points
        WHERE directory_profile_id=? AND ${draftExists}`,
      [id, id, config.draftStatus],
    ));
  } else if (input.entityType === "EVENT") {
    statements.push(conditionalDelete(
      database,
      `DELETE FROM geo_points
        WHERE managed_event_id=? AND ${draftExists}`,
      [id, id, config.draftStatus],
    ));
  }

  if (resource && config.resourceColumn) {
    statements.push(conditionalDelete(
      database,
      `DELETE FROM partner_resources
        WHERE id=? AND ${config.resourceColumn}=? AND ${draftExists}`,
      [resource.id, id, id, config.draftStatus],
    ));
  }

  statements.push(database.prepare(`INSERT INTO moderation_events
      (id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,from_status,to_status,
       reason_code,changed_fields_json,request_id,created_at)
    SELECT ?,NULL,?,?,?,'ADMIN',?,?,NULL,?,'[]',NULL,?
    FROM ${config.table}
    WHERE id=? AND status=?`).bind(
      crypto.randomUUID(),
      config.moderationResourceType ?? `CANONICAL_${input.entityType}`,
      String(id),
      "CANONICAL_DRAFT_DELETED",
      actorRef,
      config.draftStatus,
      "ADMIN_PERMANENT_DRAFT_DELETE",
      at,
      id,
      config.draftStatus,
    ));

  statements.push(database.prepare(`DELETE FROM ${config.table}
    WHERE id=? AND status=?`).bind(id, config.draftStatus));
  statements.push(database.prepare(`UPDATE admin_record_tombstones
      SET state='COMPLETE',completed_at=?,updated_at=?
      WHERE kind=? AND record_id=? AND state='READY_LOCAL'`).bind(at, at, kind, id));

  try {
    await database.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/foreign key|constraint|restrict|USE_VERIFIED_LIFECYCLE_DELETE|RECORD_TOMBSTONED|RECORD_REMOVAL_PENDING/i.test(message)) {
      throw new CanonicalDraftDeleteError(
        "Koncept má naviazané chránené údaje a nemožno ho bezpečne úplne vymazať.",
        "PROTECTED_DEPENDENCY",
      );
    }
    throw error;
  }

  const remaining = await canonicalRow(input.entityType, id, database);
  if (remaining) {
    throw new CanonicalDraftDeleteError("Úplne vymazať možno iba koncept.", "NOT_DRAFT");
  }

  return {
    entityType: input.entityType,
    canonicalEntityId: id,
    label: String(current[config.labelColumn] ?? "").trim() || null,
    deletedAt: at,
  };
}
