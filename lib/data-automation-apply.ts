import { env } from "cloudflare:workers";
import {
  automationDraftSlug,
  buildAutomationDiff,
  stableJson,
  type AutomationEntityType,
  type AutomationFindingType,
} from "./data-automation.ts";
import {
  getAutomationFindingDetail,
  type AutomationD1Database,
  type AutomationFindingDetail,
} from "./data-automation-store.ts";
import { ensureResourceForDirectoryProfile, ensureResourceForHelpOrganization } from "./canonical-resource.ts";
import { getAutomationClusterForFinding, linkAutomationClusterCanonical } from "./data-automation-clustering.ts";
import { reconcileGeoAfterSourceMutation } from "./geo-store.ts";
import { createCanonicalDraft, CanonicalDraftValidationError } from "./canonical-draft-service.ts";
import { mapAutomationFindingToDraftInput } from "./data-automation-draft-mapper.ts";
import { createAutomationIngestionReceipt, getAutomationIngestionReceipt } from "./data-automation-ingestion-receipts.ts";
import { upsertCanonicalPossibleDuplicateFlag } from "./canonical-draft-flags.ts";

type RuntimeBindings = { DB?: D1Database };

type FieldKind = "text" | "boolean" | "json" | "number";
type FieldSpec = {
  column: string;
  kind?: FieldKind;
  canonicalKey?: string;
};

type EntityConfig = {
  table: string;
  fields: Record<string, FieldSpec>;
  metadataFields?: readonly string[];
  updatedBy: boolean;
  keyPrefix: string;
};

export type AutomationApplicationResult = {
  finding: AutomationFindingDetail;
  application: {
    canonicalEntityId: number;
    applicationType: "CREATE_DRAFT" | "UPDATE_EXISTING";
    appliedFields: string[];
  } | null;
  reclassified?: "EXISTING_ORGANIZATION";
};

export class AutomationApplyConflictError extends Error {
  constructor(message = "Canonical záznam sa od vytvorenia findingu zmenil. Obnov finding novým automation runom a skontroluj diff znova.") {
    super(message);
    this.name = "AutomationApplyConflictError";
  }
}

export class AutomationApplyUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutomationApplyUnsupportedError";
  }
}

const EVENT_GEO_SOURCE_FIELDS = new Set(["venue", "city", "region", "address"]);

async function reconcileAutomationEventGeo(input: {
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  applicationType: "CREATE_DRAFT" | "UPDATE_EXISTING";
  appliedFields: string[];
  actorRef: string;
}, db: AutomationD1Database) {
  if (input.entityType !== "EVENT") return;
  if (input.applicationType !== "CREATE_DRAFT" && !input.appliedFields.some((field) => EVENT_GEO_SOURCE_FIELDS.has(field))) return;
  await reconcileGeoAfterSourceMutation({
    targetType: "MANAGED_EVENT",
    targetId: input.canonicalEntityId,
    actorRef: input.actorRef,
    actorType: "ADMIN",
  }, db);
}

const bool = (column: string, canonicalKey?: string): FieldSpec => ({ column, kind: "boolean", canonicalKey });
const jsonField = (column: string, canonicalKey?: string): FieldSpec => ({ column, kind: "json", canonicalKey });
const field = (column: string, canonicalKey?: string): FieldSpec => ({ column, kind: "text", canonicalKey });
const numberField = (column: string, canonicalKey?: string): FieldSpec => ({ column, kind: "number", canonicalKey });

const entityConfigs: Record<AutomationEntityType, EntityConfig> = {
  EVENT: {
    table: "managed_events",
    keyPrefix: "event",
    updatedBy: true,
    fields: {
      title: field("title"),
      excerpt: field("excerpt"),
      eventType: field("event_type"),
      event_type: field("event_type", "eventType"),
      startDate: field("start_date"),
      start_date: field("start_date", "startDate"),
      startTime: field("start_time"),
      start_time: field("start_time", "startTime"),
      endDate: field("end_date"),
      end_date: field("end_date", "endDate"),
      endTime: field("end_time"),
      end_time: field("end_time", "endTime"),
      venue: field("venue"),
      city: field("city"),
      region: field("region"),
      address: field("address"),
      organizer: field("organizer"),
      description: field("description"),
      practicalInfo: field("practical_info"),
      websiteUrl: field("website_url"),
      website_url: field("website_url", "websiteUrl"),
      registrationUrl: field("registration_url"),
      registration_url: field("registration_url", "registrationUrl"),
      imageUrl: field("image_url"),
      image_url: field("image_url", "imageUrl"),
      cancelled: bool("cancelled"),
    },
  },
  ORGANIZATION: {
    table: "help_organizations",
    keyPrefix: "organization",
    updatedBy: true,
    metadataFields: ["operatorName", "sourceApprovalNumber", "sourceActivity"],
    fields: {
      name: field("name"),
      legalName: field("legal_name"),
      legal_name: field("legal_name", "legalName"),
      registrationNumber: field("registration_number"),
      registration_number: field("registration_number", "registrationNumber"),
      type: field("type"),
      shortDescription: field("short_description"),
      short_description: field("short_description", "shortDescription"),
      description: field("description"),
      publicEmail: field("public_email"),
      public_email: field("public_email", "publicEmail"),
      publicPhone: field("public_phone"),
      public_phone: field("public_phone", "publicPhone"),
      websiteUrl: field("website_url"),
      website_url: field("website_url", "websiteUrl"),
      facebookUrl: field("facebook_url"),
      facebook_url: field("facebook_url", "facebookUrl"),
      instagramUrl: field("instagram_url"),
      instagram_url: field("instagram_url", "instagramUrl"),
      imageUrl: field("image_url"),
      image_url: field("image_url", "imageUrl"),
      address: field("address"),
      city: field("city"),
      district: field("district"),
      region: field("region"),
      countryCode: field("country_code"),
      country_code: field("country_code", "countryCode"),
      importKey: field("import_key"),
      import_key: field("import_key", "importKey"),
      sourceUrl: field("source_url"),
      source_url: field("source_url", "sourceUrl"),
      lastVerifiedAt: field("last_verified_at"),
      last_verified_at: field("last_verified_at", "lastVerifiedAt"),
    },
  },
  DIRECTORY: {
    table: "directory_profiles",
    keyPrefix: "directory",
    updatedBy: true,
    fields: {
      name: field("name"),
      excerpt: field("excerpt"),
      description: field("description"),
      services: jsonField("services_json"),
      qualifications: jsonField("qualifications_json"),
      city: field("city"),
      district: field("district"),
      region: field("region"),
      address: field("address"),
      online: bool("online"),
      priceNote: field("price_note"),
      price_note: field("price_note", "priceNote"),
      websiteUrl: field("website_url"),
      website_url: field("website_url", "websiteUrl"),
      importKey: field("import_key"),
      import_key: field("import_key", "importKey"),
      verified: bool("verified"),
    },
  },
  ADOPTION: {
    table: "adoption_dogs",
    keyPrefix: "adoption",
    updatedBy: true,
    fields: {
      name: field("name"),
      sex: field("sex"),
      birthDate: field("birth_date"),
      birth_date: field("birth_date", "birthDate"),
      approximateAgeMonths: numberField("approximate_age_months"),
      approximate_age_months: numberField("approximate_age_months", "approximateAgeMonths"),
      size: field("size"),
      weight: numberField("weight"),
      breedName: field("breed_name"),
      breed_name: field("breed_name", "breedName"),
      breedMix: bool("breed_mix"),
      breed_mix: bool("breed_mix", "breedMix"),
      color: field("color"),
      region: field("region"),
      district: field("district"),
      city: field("city"),
      organizationName: field("organization_name"),
      organization_name: field("organization_name", "organizationName"),
      shortDescription: field("short_description"),
      short_description: field("short_description", "shortDescription"),
      description: field("description"),
      externalSourceUrl: field("external_source_url"),
      external_source_url: field("external_source_url", "externalSourceUrl"),
      lastVerifiedAt: field("last_verified_at"),
      last_verified_at: field("last_verified_at", "lastVerifiedAt"),
    },
  },
  FOSTER: {
    table: "help_cases",
    keyPrefix: "help",
    updatedBy: true,
    fields: {
      title: field("title"),
      excerpt: field("excerpt"),
      description: field("description"),
      organization: field("organization"),
      dogName: field("dog_name"),
      dog_name: field("dog_name", "dogName"),
      breed: field("breed"),
      ageNote: field("age_note"),
      age_note: field("age_note", "ageNote"),
      city: field("city"),
      region: field("region"),
      locationNote: field("location_note"),
      location_note: field("location_note", "locationNote"),
      reportedDate: field("reported_date"),
      reported_date: field("reported_date", "reportedDate"),
      deadlineDate: field("deadline_date"),
      deadline_date: field("deadline_date", "deadlineDate"),
      actionUrl: field("action_url"),
      action_url: field("action_url", "actionUrl"),
      contactNote: field("contact_note"),
      contact_note: field("contact_note", "contactNote"),
      goalAmount: numberField("goal_amount"),
      goal_amount: numberField("goal_amount", "goalAmount"),
      raisedAmount: numberField("raised_amount"),
      raised_amount: numberField("raised_amount", "raisedAmount"),
      verified: bool("verified"),
      urgent: bool("urgent"),
      resolved: bool("resolved"),
    },
  },
  HELP_ITEM: {
    table: "help_cases",
    keyPrefix: "help",
    updatedBy: true,
    fields: {
      title: field("title"),
      excerpt: field("excerpt"),
      description: field("description"),
      organization: field("organization"),
      dogName: field("dog_name"),
      dog_name: field("dog_name", "dogName"),
      breed: field("breed"),
      ageNote: field("age_note"),
      age_note: field("age_note", "ageNote"),
      city: field("city"),
      region: field("region"),
      locationNote: field("location_note"),
      location_note: field("location_note", "locationNote"),
      reportedDate: field("reported_date"),
      reported_date: field("reported_date", "reportedDate"),
      deadlineDate: field("deadline_date"),
      deadline_date: field("deadline_date", "deadlineDate"),
      actionUrl: field("action_url"),
      action_url: field("action_url", "actionUrl"),
      contactNote: field("contact_note"),
      contact_note: field("contact_note", "contactNote"),
      goalAmount: numberField("goal_amount"),
      goal_amount: numberField("goal_amount", "goalAmount"),
      raisedAmount: numberField("raised_amount"),
      raised_amount: numberField("raised_amount", "raisedAmount"),
      verified: bool("verified"),
      urgent: bool("urgent"),
      resolved: bool("resolved"),
    },
  },
  LOST_FOUND: {
    table: "lost_found_dog_reports",
    keyPrefix: "lost-found",
    updatedBy: false,
    fields: {
      type: field("type"),
      dogName: field("dog_name"),
      dog_name: field("dog_name", "dogName"),
      sex: field("sex"),
      breed: field("breed"),
      color: field("color"),
      approximateAge: field("approximate_age"),
      approximate_age: field("approximate_age", "approximateAge"),
      size: field("size"),
      description: field("description"),
      eventDate: field("event_date"),
      event_date: field("event_date", "eventDate"),
      region: field("region"),
      district: field("district"),
      city: field("city"),
      locationDescription: field("location_description"),
      location_description: field("location_description", "locationDescription"),
      source: field("source"),
      sourceUrl: field("source_url"),
      source_url: field("source_url", "sourceUrl"),
    },
  },
};

const applicableFindingTypes = new Set<AutomationFindingType>([
  "NEW_ENTITY",
  "DUPLICATE_CANDIDATE",
  "POSSIBLE_UPDATE",
  "POSSIBLE_CANCELLED",
]);

function database(input?: AutomationD1Database) {
  if (input?.prepare && input.batch) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare && bound.batch) return bound;
  throw new Error("Data automation nemá pripojenú databázu.");
}

async function ensureAutomationResourceAnchor(
  entityType: AutomationEntityType,
  canonicalEntityId: number,
  db: AutomationD1Database,
  now: Date,
) {
  if (entityType === "DIRECTORY") {
    await ensureResourceForDirectoryProfile(canonicalEntityId, db, now);
  } else if (entityType === "ORGANIZATION") {
    await ensureResourceForHelpOrganization(canonicalEntityId, db, now);
  }
}

function own(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function parseObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function encodeValue(spec: FieldSpec, value: unknown) {
  if (value === undefined) return null;
  if (spec.kind === "boolean") return value === null ? null : (Boolean(value) ? 1 : 0);
  if (spec.kind === "json") return JSON.stringify(value ?? []);
  if (spec.kind === "number") {
    if (value === null || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new AutomationApplyUnsupportedError(`Hodnota pre ${spec.canonicalKey ?? spec.column} nie je platné číslo.`);
    return number;
  }
  if (value === null) return null;
  return String(value).trim();
}

function decodeValue(spec: FieldSpec, value: unknown) {
  if (spec.kind === "boolean") return value === null || value === undefined ? null : Boolean(value);
  if (spec.kind === "json") {
    if (typeof value !== "string") return [];
    try { return JSON.parse(value); } catch { return []; }
  }
  if (spec.kind === "number") return value === null || value === undefined ? null : Number(value);
  return value ?? null;
}

function textValue(value: unknown) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function slugifyDraft(value: unknown, fallback: string) {
  return automationDraftSlug(value, fallback);
}

async function possibleDuplicateCandidateIds(
  finding: AutomationFindingDetail,
  db: AutomationD1Database,
) {
  const ids = new Set<number>();
  for (const match of String(finding.reason ?? "").matchAll(/(?:event|organization|directory|adoption|lost-found|help):(\\d+)/gi)) {
    const id = Number(match[1]);
    if (Number.isSafeInteger(id) && id > 0) ids.add(id);
  }
  const clusterMatch = String(finding.reason ?? "").match(/kandidátne clustre:\\s*([0-9,\\s]+)/i);
  if (clusterMatch) {
    for (const raw of clusterMatch[1].split(",")) {
      const clusterId = Number(raw.trim());
      if (!Number.isSafeInteger(clusterId) || clusterId < 1) continue;
      const cluster = await db.prepare(`SELECT canonical_entity_id FROM automation_entity_clusters WHERE id=? LIMIT 1`)
        .bind(clusterId).first<{ canonical_entity_id: number | null }>();
      const canonicalId = Number(cluster?.canonical_entity_id ?? 0);
      if (Number.isSafeInteger(canonicalId) && canonicalId > 0) ids.add(canonicalId);
    }
  }
  return [...ids];
}

function allowedReviewStatus(status: string) {
  return ["NEW", "IN_REVIEW", "SUPPRESSED", "APPROVED"].includes(status);
}

export function canApplyAutomationFinding(input: Pick<AutomationFindingDetail, "findingType" | "entityType">) {
  return applicableFindingTypes.has(input.findingType) && Boolean(entityConfigs[input.entityType]);
}

export function unsupportedAutomationApplyFields(
  entityType: AutomationEntityType,
  diff: Record<string, unknown>,
) {
  const config = entityConfigs[entityType];
  const metadata = new Set(config.metadataFields ?? []);
  return Object.keys(diff).filter((key) => !config.fields[key] && !metadata.has(key));
}

async function existingApplication(findingId: number, db: AutomationD1Database) {
  return db.prepare(`SELECT canonical_entity_id,application_type,applied_fields_json
    FROM automation_applications WHERE finding_id=? LIMIT 1`).bind(findingId)
    .first<{ canonical_entity_id: number; application_type: "CREATE_DRAFT" | "UPDATE_EXISTING"; applied_fields_json: string }>();
}

async function loadCurrentRow(finding: AutomationFindingDetail, db: AutomationD1Database) {
  const config = entityConfigs[finding.entityType];
  if (!finding.canonicalEntityId) return null;
  return db.prepare(`SELECT * FROM ${config.table} WHERE id=? LIMIT 1`).bind(finding.canonicalEntityId).first<Record<string, unknown>>();
}

function canonicalBeforeFromCurrent(entityType: AutomationEntityType, current: Record<string, unknown>) {
  const config = entityConfigs[entityType];
  const before: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(config.fields)) {
    const value = decodeValue(spec, current[spec.column]);
    before[key] = value;
    before[spec.canonicalKey ?? key] = value;
  }
  const sourceData = parseObject(current.source_data_json);
  for (const key of config.metadataFields ?? []) {
    before[key] = sourceData[key] ?? null;
  }
  return before;
}

async function findNewOrganizationCollision(
  finding: AutomationFindingDetail,
  db: AutomationD1Database,
) {
  if (finding.entityType !== "ORGANIZATION" || finding.findingType !== "NEW_ENTITY") return null;
  const name = textValue(finding.proposed.name);
  if (!name) return null;
  const slug = slugifyDraft(finding.proposed.slug, name);
  const row = await db.prepare(`SELECT * FROM help_organizations WHERE slug=? LIMIT 1`)
    .bind(slug)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const id = Number(row.id);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, row, slug };
}

function assertNoConcurrentChanges(
  finding: AutomationFindingDetail,
  current: Record<string, unknown>,
) {
  const config = entityConfigs[finding.entityType];
  const metadata = parseObject(current.source_data_json);
  for (const key of Object.keys(finding.diff)) {
    if (!own(finding.before, key)) continue;
    const spec = config.fields[key];
    const currentValue = spec
      ? decodeValue(spec, current[spec.column])
      : (config.metadataFields ?? []).includes(key)
        ? (metadata[key] ?? null)
        : undefined;
    if (stableJson(currentValue) !== stableJson(finding.before[key] ?? null)) {
      throw new AutomationApplyConflictError();
    }
  }
}

function updateExistingStatement(
  finding: AutomationFindingDetail,
  current: Record<string, unknown>,
  actor: string,
  at: string,
  db: AutomationD1Database,
) {
  const config = entityConfigs[finding.entityType];
  const unsupported = unsupportedAutomationApplyFields(finding.entityType, finding.diff);
  if (unsupported.length) {
    throw new AutomationApplyUnsupportedError(`Automatické aplikovanie zatiaľ nepodporuje polia: ${unsupported.join(", ")}.`);
  }
  assertNoConcurrentChanges(finding, current);

  const assignments: string[] = [];
  const args: unknown[] = [];
  const appliedFields: string[] = [];
  const after: Record<string, unknown> = { ...finding.before };
  const sourceData = parseObject(current.source_data_json);
  let sourceDataChanged = false;
  const metadata = new Set(config.metadataFields ?? []);

  for (const key of Object.keys(finding.diff)) {
    const spec = config.fields[key];
    if (spec) {
      assignments.push(`${spec.column}=?`);
      args.push(encodeValue(spec, finding.proposed[key]));
      const canonicalKey = spec.canonicalKey ?? key;
      after[canonicalKey] = finding.proposed[key] ?? null;
      appliedFields.push(key);
      continue;
    }
    if (metadata.has(key)) {
      sourceData[key] = finding.proposed[key] ?? null;
      sourceDataChanged = true;
      after[key] = finding.proposed[key] ?? null;
      appliedFields.push(key);
    }
  }

  if (sourceDataChanged) {
    assignments.push("source_data_json=?");
    args.push(JSON.stringify(sourceData));
  }
  if (!assignments.length) throw new AutomationApplyUnsupportedError("Finding neobsahuje žiadne bezpečne aplikovateľné pole.");

  assignments.push("updated_at=?");
  args.push(at);
  if (config.updatedBy) {
    assignments.push("updated_by=?");
    args.push(actor);
  }
  args.push(finding.canonicalEntityId);

  return {
    statement: db.prepare(`UPDATE ${config.table} SET ${assignments.join(",")} WHERE id=?`).bind(...args),
    appliedFields,
    after,
  };
}

export async function applyAutomationFinding(input: {
  id: number;
  reviewerEmail: string;
  notes?: string | null;
  now?: Date;
}, databaseInput?: AutomationD1Database): Promise<AutomationApplicationResult | null> {
  const db = database(databaseInput);
  const finding = await getAutomationFindingDetail(input.id, db);
  if (!finding) return null;

  const already = await existingApplication(finding.id, db);
  if (already) {
    await ensureAutomationResourceAnchor(finding.entityType, Number(already.canonical_entity_id), db, input.now ?? new Date());
    if (finding.entityType === "DIRECTORY") {
      await reconcileGeoAfterSourceMutation({
        targetType: "DIRECTORY_PROFILE",
        targetId: Number(already.canonical_entity_id),
        actorRef: input.reviewerEmail.trim().toLowerCase(),
        actorType: "ADMIN",
      }, db);
    }
    const refreshed = await getAutomationFindingDetail(finding.id, db);
    if (!refreshed) return null;
    let appliedFields: string[] = [];
    try { appliedFields = JSON.parse(already.applied_fields_json) as string[]; } catch {}
    await reconcileAutomationEventGeo({
      entityType: finding.entityType,
      canonicalEntityId: Number(already.canonical_entity_id),
      applicationType: already.application_type,
      appliedFields,
      actorRef: input.reviewerEmail.trim().toLowerCase(),
    }, db);
    return {
      finding: refreshed,
      application: {
        canonicalEntityId: Number(already.canonical_entity_id),
        applicationType: already.application_type,
        appliedFields,
      },
    };
  }

  if (!allowedReviewStatus(finding.reviewStatus)) {
    throw new AutomationApplyConflictError("Finding je už uzavretý a nemožno ho aplikovať.");
  }
  if (!canApplyAutomationFinding(finding)) {
    throw new AutomationApplyUnsupportedError(
      finding.findingType === "POSSIBLE_INACTIVE"
        ? "Možnú neaktivitu treba zatiaľ potvrdiť cez canonical profil; automatické odpublikovanie alebo archivácia nie sú súčasťou bezpečného apply."
        : "Tento typ findingu nemožno automaticky aplikovať.",
    );
  }

  const actor = input.reviewerEmail.trim().toLowerCase();
  const at = (input.now ?? new Date()).toISOString();
  const notes = input.notes?.trim().slice(0, 2000) || null;
  const config = entityConfigs[finding.entityType];
  const cluster = await getAutomationClusterForFinding(finding.id, db);

  if (finding.findingType === "NEW_ENTITY" || finding.findingType === "DUPLICATE_CANDIDATE") {
    if (finding.canonicalEntityId) throw new AutomationApplyConflictError("Finding už má canonical záznam.");
    if (finding.findingType === "NEW_ENTITY" && cluster?.canonicalEntityId) {
      throw new AutomationApplyConflictError(
        `Multi-source cluster už je naviazaný na canonical ${cluster.canonicalEntityKey ?? cluster.canonicalEntityId}; druhý draft sa nevytvorí.`,
      );
    }
    const unsupported = unsupportedAutomationApplyFields(finding.entityType, finding.diff);
    if (unsupported.length) {
      throw new AutomationApplyUnsupportedError(`Nový koncept obsahuje nepodporované polia: ${unsupported.join(", ")}.`);
    }

    const organizationCollision = await findNewOrganizationCollision(finding, db);
    if (organizationCollision) {
      const before = canonicalBeforeFromCurrent("ORGANIZATION", organizationCollision.row);
      const diff = buildAutomationDiff(before, finding.proposed);
      await db.prepare(`UPDATE automation_findings SET
          finding_type='POSSIBLE_UPDATE',canonical_entity_id=?,canonical_entity_key=?,match_quality='EXACT_CANONICAL_KEY',
          before_json=?,diff_json=?,reason=?,review_status='IN_REVIEW',reviewer_decision=NULL,reviewed_by=NULL,reviewed_at=NULL,
          suppressed_until=NULL
        WHERE id=? AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED','APPROVED')`).bind(
          organizationCollision.id,
          `organization:${organizationCollision.id}`,
          JSON.stringify(before),
          JSON.stringify(diff),
          `Existujúca organizácia bola rozpoznaná podľa canonical slugu ${organizationCollision.slug}.`,
          finding.id,
        ).run();
      const refreshed = await getAutomationFindingDetail(finding.id, db);
      if (!refreshed) throw new Error("automation_reclassified_finding_missing");
      return {
        finding: refreshed,
        application: null,
        reclassified: "EXISTING_ORGANIZATION",
      };
    } else {
      if (!finding.sourceRecordId) {
        throw new AutomationApplyConflictError("Finding nemá stabilnú source-record identitu pre ingestion receipt.");
      }

      const priorReceipt = await getAutomationIngestionReceipt({
        sourceId: finding.sourceId,
        entityType: finding.entityType,
        sourceRecordId: finding.sourceRecordId,
      }, db);
      if (priorReceipt) {
        await db.prepare(`UPDATE automation_findings SET
            canonical_entity_id=NULL,canonical_entity_key=NULL,
            review_status='RESOLVED',reviewer_decision='APPROVE_APPLY',reviewer_notes=?,reviewed_by=?,reviewed_at=?,suppressed_until=NULL
          WHERE id=? AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED','APPROVED')`).bind(
            notes, actor, at, finding.id,
          ).run();
        const refreshed = await getAutomationFindingDetail(finding.id, db);
        if (!refreshed) throw new Error("automation_receipt_resolution_missing");
        return { finding: refreshed, application: null };
      }

      let created: Awaited<ReturnType<typeof createCanonicalDraft>>;
      try {
        created = await createCanonicalDraft(
          mapAutomationFindingToDraftInput(finding, at),
          { actor, createdAt: at },
          db,
        );
      } catch (error) {
        if (error instanceof CanonicalDraftValidationError) {
          throw new AutomationApplyUnsupportedError(error.message);
        }
        throw error;
      }

      if (finding.findingType === "DUPLICATE_CANDIDATE") {
        await upsertCanonicalPossibleDuplicateFlag({
          entityType: finding.entityType,
          canonicalEntityId: created.canonicalEntityId,
          candidateIds: await possibleDuplicateCandidateIds(finding, db),
          sourceUrl: finding.sourceUrl,
          createdAt: at,
        }, db);
      }

      const receipt = await createAutomationIngestionReceipt({
        sourceId: finding.sourceId,
        entityType: finding.entityType,
        sourceRecordId: finding.sourceRecordId,
        sourceUrl: finding.sourceUrl,
        payloadHash: finding.payloadHash,
        result: "DRAFT_CREATED",
        firstProcessedAt: at,
      }, db);
      if (!receipt) throw new Error("automation_ingestion_receipt_missing");

      await db.prepare(`UPDATE automation_findings SET
          canonical_entity_id=NULL,canonical_entity_key=NULL,
          review_status='RESOLVED',reviewer_decision='APPROVE_APPLY',reviewer_notes=?,reviewed_by=?,reviewed_at=?,suppressed_until=NULL
        WHERE id=? AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED','APPROVED')`).bind(
          notes, actor, at, finding.id,
        ).run();

      await ensureAutomationResourceAnchor(finding.entityType, created.canonicalEntityId, db, input.now ?? new Date());
      if (finding.entityType === "DIRECTORY") {
        await reconcileGeoAfterSourceMutation({
          targetType: "DIRECTORY_PROFILE",
          targetId: created.canonicalEntityId,
          actorRef: actor,
          actorType: "ADMIN",
        }, db);
      }
      const appliedFields = Object.keys(finding.diff);
      await reconcileAutomationEventGeo({
        entityType: finding.entityType,
        canonicalEntityId: created.canonicalEntityId,
        applicationType: "CREATE_DRAFT",
        appliedFields,
        actorRef: actor,
      }, db);
      const refreshed = await getAutomationFindingDetail(finding.id, db);
      if (!refreshed) throw new Error("automation_create_draft_result_missing");
      return {
        finding: refreshed,
        application: {
          canonicalEntityId: created.canonicalEntityId,
          applicationType: "CREATE_DRAFT",
          appliedFields,
        },
      };
    }
  } else {
    if (!finding.canonicalEntityId) throw new AutomationApplyConflictError("Finding nemá jednoznačný canonical záznam.");
    if (cluster?.canonicalEntityId && cluster.canonicalEntityId !== finding.canonicalEntityId) {
      throw new AutomationApplyConflictError("Multi-source cluster je naviazaný na iný canonical záznam; automatický apply je blokovaný.");
    }
    const current = await loadCurrentRow(finding, db);
    if (!current) throw new AutomationApplyConflictError("Canonical záznam už neexistuje.");
    const update = updateExistingStatement(finding, current, actor, at, db);
    const application = db.prepare(`INSERT INTO automation_applications (
        finding_id,entity_type,canonical_entity_id,application_type,applied_fields_json,before_json,after_json,applied_by,applied_at
      ) VALUES (?,?,?,'UPDATE_EXISTING',?,?,?,?,?)`).bind(
        finding.id, finding.entityType, finding.canonicalEntityId, JSON.stringify(update.appliedFields),
        JSON.stringify(finding.before), JSON.stringify(update.after), actor, at,
      );
    const closeFinding = db.prepare(`UPDATE automation_findings SET
        review_status='RESOLVED',reviewer_decision='APPROVE_APPLY',reviewer_notes=?,reviewed_by=?,reviewed_at=?,suppressed_until=NULL
      WHERE id=? AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED','APPROVED')`).bind(
        notes, actor, at, finding.id,
      );
    await db.batch([update.statement, application, closeFinding]);
    if (cluster && finding.canonicalEntityId) {
      const linked = await linkAutomationClusterCanonical({
        clusterId: cluster.id,
        entityType: finding.entityType,
        canonicalEntityId: finding.canonicalEntityId,
        canonicalEntityKey: finding.canonicalEntityKey,
        at,
      }, db);
    }
  }

  const application = await existingApplication(finding.id, db);
  const refreshed = await getAutomationFindingDetail(finding.id, db);
  if (!application || !refreshed) throw new Error("automation_apply_result_missing");
  await ensureAutomationResourceAnchor(finding.entityType, Number(application.canonical_entity_id), db, input.now ?? new Date());
  if (finding.entityType === "DIRECTORY") {
    await reconcileGeoAfterSourceMutation({
      targetType: "DIRECTORY_PROFILE",
      targetId: Number(application.canonical_entity_id),
      actorRef: actor,
      actorType: "ADMIN",
    }, db);
  }
  let appliedFields: string[] = [];
  try { appliedFields = JSON.parse(application.applied_fields_json) as string[]; } catch {}
  await reconcileAutomationEventGeo({
    entityType: finding.entityType,
    canonicalEntityId: Number(application.canonical_entity_id),
    applicationType: application.application_type,
    appliedFields,
    actorRef: actor,
  }, db);
  return {
    finding: refreshed,
    application: {
      canonicalEntityId: Number(application.canonical_entity_id),
      applicationType: application.application_type,
      appliedFields,
    },
  };
}
