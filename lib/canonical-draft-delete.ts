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
  const draftExists = `EXISTS (SELECT 1 FROM ${config.table} c WHERE c.id=? AND c.status=?)`;
  const statements: D1PreparedStatement[] = [];

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

  try {
    await database.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/foreign key|constraint|restrict/i.test(message)) {
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
