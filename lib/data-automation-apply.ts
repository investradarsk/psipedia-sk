import { env } from "cloudflare:workers";
import { getAutomationRecordSuppression } from "./automation-record-suppressions.ts";
import {
  automationDraftSlug,
  type AutomationEntityType,
  type AutomationFindingType,
} from "./data-automation.ts";
import {
  getAutomationFindingDetail,
  type AutomationD1Database,
  type AutomationFindingDetail,
} from "./data-automation-store.ts";
import { ensureResourceForDirectoryProfile, ensureResourceForHelpOrganization } from "./canonical-resource.ts";
import { reconcileGeoAfterSourceMutation } from "./geo-store.ts";
import { createCanonicalDraft, CanonicalDraftValidationError } from "./canonical-draft-service.ts";
import { mapAutomationFindingToDraftInput } from "./data-automation-draft-mapper.ts";
import { createAutomationIngestionReceipt, getAutomationIngestionReceipt } from "./data-automation-ingestion-receipts.ts";
import { upsertCanonicalExternalProvenance } from "./data-automation-product-store.ts";
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
    applicationType: "CREATE_DRAFT";
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

async function reconcileAutomationEventGeo(input: {
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  applicationType: "CREATE_DRAFT";
  appliedFields: string[];
  actorRef: string;
}, db: AutomationD1Database) {
  if (input.entityType !== "EVENT") return;
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
    metadataFields: ["category", "semanticKind", "semantic_kind", "publicPhone", "publicEmail", "facebookUrl", "instagramUrl"],
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
      postalCode: field("postal_code"),
      postal_code: field("postal_code", "postalCode"),
      street: field("street"),
      houseNumber: field("house_number"),
      house_number: field("house_number", "houseNumber"),
      addressFormat: field("address_format"),
      address_format: field("address_format", "addressFormat"),
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
    metadataFields: ["category"],
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

async function findNewOrganizationCollision(
  finding: AutomationFindingDetail,
  db: AutomationD1Database,
) {
  if (finding.entityType !== "ORGANIZATION" || finding.findingType !== "NEW_ENTITY") return null;
  const name = textValue(finding.proposed.name);
  if (!name) return null;
  const slug = slugifyDraft(finding.proposed.slug, name);
  const row = await db.prepare(`SELECT id FROM help_organizations WHERE slug=? LIMIT 1`)
    .bind(slug)
    .first<{ id: number }>();
  const id = Number(row?.id ?? 0);
  if (!Number.isInteger(id) || id <= 0) return null;
  return { id, slug };
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
    throw new AutomationApplyUnsupportedError(
      "Legacy automation application je iba historická provenance a už sa nesmie znovu aplikovať do canonical záznamu.",
    );
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
  if (finding.findingType === "NEW_ENTITY" || finding.findingType === "DUPLICATE_CANDIDATE") {
    if (finding.canonicalEntityId) throw new AutomationApplyConflictError("Finding nesmie držať persistent canonical väzbu.");
    const unsupported = unsupportedAutomationApplyFields(finding.entityType, finding.diff);
    if (unsupported.length) {
      throw new AutomationApplyUnsupportedError(`Nový koncept obsahuje nepodporované polia: ${unsupported.join(", ")}.`);
    }

    const organizationCollision = await findNewOrganizationCollision(finding, db);
    if (organizationCollision) {
      if (!finding.sourceRecordId) {
        throw new AutomationApplyConflictError("Finding nemá stabilnú source-record identitu pre ingestion receipt.");
      }
      const receipt = await createAutomationIngestionReceipt({
        sourceId: finding.sourceId,
        entityType: finding.entityType,
        sourceRecordId: finding.sourceRecordId,
        sourceUrl: finding.sourceUrl,
        payloadHash: finding.payloadHash,
        result: "SKIPPED_DUPLICATE",
        firstProcessedAt: at,
      }, db);
      if (!receipt) throw new Error("automation_ingestion_receipt_missing");
      await db.prepare(`UPDATE automation_findings SET
          canonical_entity_id=NULL,canonical_entity_key=NULL,
          review_status='RESOLVED',reviewer_decision='APPROVE_APPLY',reviewer_notes=?,reviewed_by=?,reviewed_at=?,suppressed_until=NULL
        WHERE id=? AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED','APPROVED')`).bind(
          notes, actor, at, finding.id,
        ).run();
      const refreshed = await getAutomationFindingDetail(finding.id, db);
      if (!refreshed) throw new Error("automation_duplicate_resolution_missing");
      return { finding: refreshed, application: null };
    }

    if (!finding.sourceRecordId) {
        throw new AutomationApplyConflictError("Finding nemá stabilnú source-record identitu pre ingestion receipt.");
      }

      const suppression = await getAutomationRecordSuppression({
        entityType: finding.entityType,
        externalSourceUrl: finding.sourceUrl,
        externalRecordId: finding.sourceRecordId,
      }, db);
      if (suppression) {
        const receipt = await createAutomationIngestionReceipt({
          sourceId: finding.sourceId,
          entityType: finding.entityType,
          sourceRecordId: finding.sourceRecordId,
          sourceUrl: finding.sourceUrl,
          payloadHash: finding.payloadHash,
          result: "SKIPPED_DUPLICATE",
          firstProcessedAt: at,
        }, db);
        if (!receipt) throw new Error("automation_ingestion_receipt_missing");
        await db.prepare(`UPDATE automation_findings SET
            canonical_entity_id=NULL,canonical_entity_key=NULL,
            review_status='RESOLVED',reviewer_decision='APPROVE_APPLY',reviewer_notes=?,reviewed_by=?,reviewed_at=?,suppressed_until=NULL
          WHERE id=? AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED','APPROVED')`).bind(
            notes, actor, at, finding.id,
          ).run();
        const refreshed = await getAutomationFindingDetail(finding.id, db);
        if (!refreshed) throw new Error("automation_suppression_resolution_missing");
        return { finding: refreshed, application: null };
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

      await upsertCanonicalExternalProvenance({
        entityType: finding.entityType,
        canonicalEntityId: created.canonicalEntityId,
        externalSourceUrl: finding.sourceUrl,
        externalRecordId: finding.sourceRecordId,
        provenanceType: "AUTOMATION_SOURCE_RECORD",
        detectedAt: at,
      }, db);

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

  throw new AutomationApplyUnsupportedError("Automation canonical update je zakázaný; existujúci canonical záznam sa nemení.");
}
