import { env } from "cloudflare:workers";
import {
  isSafeAutomationSourceUrl,
  sha256Hex,
  stableJson,
  type AutomationDiff,
  type AutomationEntityType,
  type AutomationFindingType,
} from "./data-automation.ts";
import { automationFieldLabel, automationSourceDomain } from "./admin-automation-presentation.ts";
import {
  mergeDirectoryPublicContactData,
  readDirectoryPublicContacts,
  type DirectoryImportData,
} from "./directory-profile-metadata.ts";

export type AutomationUpdateOrigin = "DIRECT_ENTITY" | "FEED_SOURCE";
export type AutomationUpdateDecision = "ACCEPTED" | "REJECTED";
export type AutomationUpdateFieldState = "OPEN" | "STALE" | "UNSUPPORTED" | "LIFECYCLE";

export type CanonicalUpdateSuggestionField = {
  field: string;
  sourceField: string;
  label: string;
  before: unknown;
  current: unknown;
  proposed: unknown;
  proposedValueHash: string;
  state: AutomationUpdateFieldState;
  reviewable: boolean;
  note: string | null;
};

export type CanonicalUpdateSuggestion = {
  origin: AutomationUpdateOrigin;
  id: number;
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  suggestionType: Extract<AutomationFindingType, "POSSIBLE_UPDATE" | "POSSIBLE_INACTIVE" | "POSSIBLE_CANCELLED">;
  sourceUrl: string | null;
  sourceLabel: string;
  detectedAt: string;
  canonicalUpdatedAt: string;
  fields: CanonicalUpdateSuggestionField[];
};

export type AutomationUpdateFieldActionResult = {
  suggestionId: number;
  origin: AutomationUpdateOrigin;
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  field: string;
  decision: AutomationUpdateDecision;
  updatedValues: Record<string, unknown>;
  updatedAt: string;
  remainingOpenFields: number;
};

export class AutomationUpdateReviewNotFoundError extends Error {
  constructor(message = "Návrh zmeny alebo canonical záznam sa nenašiel.") {
    super(message);
    this.name = "AutomationUpdateReviewNotFoundError";
  }
}

export class AutomationUpdateReviewConflictError extends Error {
  constructor(message = "Údaj sa medzitým zmenil. Obnov stránku a skontroluj návrh znova.") {
    super(message);
    this.name = "AutomationUpdateReviewConflictError";
  }
}

export class AutomationUpdateReviewUnsupportedError extends Error {
  constructor(message = "Toto pole nemožno bezpečne prevziať automaticky.") {
    super(message);
    this.name = "AutomationUpdateReviewUnsupportedError";
  }
}

export class AutomationUpdateReviewValidationError extends Error {
  constructor(message = "Navrhovaná hodnota nie je platná.") {
    super(message);
    this.name = "AutomationUpdateReviewValidationError";
  }
}

type Database = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };
type FieldKind = "text" | "url" | "email" | "phone" | "number" | "boolean" | "json";
type FieldSpec = {
  column?: string;
  kind: FieldKind;
  label?: string;
  directoryContact?: "phone" | "email" | "facebook" | "instagram";
  max?: number;
};
type EntityConfig = {
  table: string;
  updatedBy: boolean;
  fields: Record<string, FieldSpec>;
  aliases?: Record<string, string>;
  manualFields?: Set<string>;
};

const commonAliases: Record<string, string> = {
  start_date: "startDate",
  start_time: "startTime",
  end_date: "endDate",
  end_time: "endTime",
  event_type: "eventType",
  practical_info: "practicalInfo",
  website_url: "websiteUrl",
  registration_url: "registrationUrl",
  public_email: "publicEmail",
  public_phone: "publicPhone",
  facebook_url: "facebookUrl",
  instagram_url: "instagramUrl",
  short_description: "shortDescription",
  legal_name: "legalName",
  registration_number: "registrationNumber",
  birth_date: "birthDate",
  approximate_age_months: "approximateAgeMonths",
  breed_name: "breedName",
  breed_mix: "breedMix",
  organization_name: "organizationName",
  dog_name: "dogName",
  age_note: "ageNote",
  location_note: "locationNote",
  reported_date: "reportedDate",
  deadline_date: "deadlineDate",
  action_url: "actionUrl",
  contact_note: "contactNote",
  goal_amount: "goalAmount",
  raised_amount: "raisedAmount",
  event_date: "eventDate",
  approximate_age: "approximateAge",
  location_description: "locationDescription",
  price_note: "priceNote",
  postal_code: "postalCode",
  house_number: "houseNumber",
  address_format: "addressFormat",
  service_address_confirmation: "serviceAddressConfirmation",
};

const text = (column: string, label?: string, max = 10000): FieldSpec => ({ column, kind: "text", label, max });
const url = (column: string, label?: string): FieldSpec => ({ column, kind: "url", label, max: 2048 });
const number = (column: string, label?: string): FieldSpec => ({ column, kind: "number", label });
const bool = (column: string, label?: string): FieldSpec => ({ column, kind: "boolean", label });
const json = (column: string, label?: string): FieldSpec => ({ column, kind: "json", label });
const email = (column: string, label?: string): FieldSpec => ({ column, kind: "email", label, max: 320 });
const phone = (column: string, label?: string): FieldSpec => ({ column, kind: "phone", label, max: 80 });

const addressManualFields = new Set([
  "address", "city", "district", "region", "postalCode", "street", "houseNumber",
  "addressFormat", "serviceAddressConfirmation",
]);

const configs: Record<AutomationEntityType, EntityConfig> = {
  DIRECTORY: {
    table: "directory_profiles",
    updatedBy: true,
    aliases: commonAliases,
    manualFields: addressManualFields,
    fields: {
      name: text("name", "Názov", 240),
      excerpt: text("excerpt", "Krátky popis", 1000),
      description: text("description", "Popis"),
      services: json("services_json", "Služby"),
      qualifications: json("qualifications_json", "Kvalifikácie"),
      online: bool("online", "Online služby"),
      priceNote: text("price_note", "Poznámka k cene", 1000),
      websiteUrl: url("website_url", "Web"),
      publicPhone: { kind: "phone", directoryContact: "phone", label: "Verejný telefón", max: 80 },
      publicEmail: { kind: "email", directoryContact: "email", label: "Verejný e-mail", max: 320 },
      facebookUrl: { kind: "url", directoryContact: "facebook", label: "Facebook", max: 2048 },
      instagramUrl: { kind: "url", directoryContact: "instagram", label: "Instagram", max: 2048 },
    },
  },
  ORGANIZATION: {
    table: "help_organizations",
    updatedBy: true,
    aliases: commonAliases,
    manualFields: new Set(["address", "city", "district", "region", "countryCode"]),
    fields: {
      name: text("name", "Názov", 240),
      legalName: text("legal_name", "Právny názov", 300),
      registrationNumber: text("registration_number", "Registračné číslo", 120),
      type: text("type", "Typ organizácie", 80),
      shortDescription: text("short_description", "Krátky popis", 1000),
      description: text("description", "Popis"),
      publicEmail: email("public_email", "Verejný e-mail"),
      publicPhone: phone("public_phone", "Verejný telefón"),
      websiteUrl: url("website_url", "Web"),
      facebookUrl: url("facebook_url", "Facebook"),
      instagramUrl: url("instagram_url", "Instagram"),
    },
  },
  EVENT: {
    table: "managed_events",
    updatedBy: true,
    aliases: commonAliases,
    manualFields: new Set(["cancelled"]),
    fields: {
      title: text("title", "Názov", 300),
      excerpt: text("excerpt", "Krátky popis", 1000),
      eventType: text("event_type", "Typ podujatia", 120),
      startDate: text("start_date", "Dátum začiatku", 20),
      startTime: text("start_time", "Čas začiatku", 20),
      endDate: text("end_date", "Dátum konca", 20),
      endTime: text("end_time", "Čas konca", 20),
      venue: text("venue", "Miesto", 300),
      city: text("city", "Obec / mesto", 200),
      region: text("region", "Kraj", 120),
      address: text("address", "Adresa", 400),
      organizer: text("organizer", "Organizátor", 300),
      description: text("description", "Popis"),
      practicalInfo: text("practical_info", "Praktické informácie"),
      websiteUrl: url("website_url", "Web podujatia"),
      registrationUrl: url("registration_url", "Registrácia"),
    },
  },
  ADOPTION: {
    table: "adoption_dogs",
    updatedBy: true,
    aliases: commonAliases,
    fields: {
      name: text("name", "Meno", 240),
      sex: text("sex", "Pohlavie", 40),
      birthDate: text("birth_date", "Dátum narodenia", 20),
      approximateAgeMonths: number("approximate_age_months", "Približný vek v mesiacoch"),
      size: text("size", "Veľkosť", 40),
      weight: number("weight", "Hmotnosť"),
      breedName: text("breed_name", "Plemeno", 240),
      breedMix: bool("breed_mix", "Kríženec"),
      color: text("color", "Farba", 160),
      region: text("region", "Kraj", 120),
      district: text("district", "Okres", 160),
      city: text("city", "Mesto", 160),
      organizationName: text("organization_name", "Organizácia", 300),
      shortDescription: text("short_description", "Krátky popis", 1000),
      description: text("description", "Popis"),
    },
  },
  FOSTER: {
    table: "help_cases",
    updatedBy: true,
    aliases: commonAliases,
    manualFields: new Set(["urgent", "resolved"]),
    fields: {
      title: text("title", "Názov", 300),
      excerpt: text("excerpt", "Krátky popis", 1000),
      description: text("description", "Popis"),
      organization: text("organization", "Organizácia", 300),
      dogName: text("dog_name", "Meno psa", 160),
      breed: text("breed", "Plemeno", 240),
      ageNote: text("age_note", "Vek", 240),
      city: text("city", "Mesto", 160),
      region: text("region", "Kraj", 120),
      locationNote: text("location_note", "Lokalita", 500),
      reportedDate: text("reported_date", "Dátum nahlásenia", 20),
      deadlineDate: text("deadline_date", "Termín", 20),
      actionUrl: url("action_url", "Odkaz"),
      contactNote: text("contact_note", "Kontaktná poznámka", 1000),
      goalAmount: number("goal_amount", "Cieľová suma"),
      raisedAmount: number("raised_amount", "Vyzbierané"),
    },
  },
  HELP_ITEM: {
    table: "help_cases",
    updatedBy: true,
    aliases: commonAliases,
    manualFields: new Set(["urgent", "resolved"]),
    fields: {
      title: text("title", "Názov", 300),
      excerpt: text("excerpt", "Krátky popis", 1000),
      description: text("description", "Popis"),
      organization: text("organization", "Organizácia", 300),
      dogName: text("dog_name", "Meno psa", 160),
      breed: text("breed", "Plemeno", 240),
      ageNote: text("age_note", "Vek", 240),
      city: text("city", "Mesto", 160),
      region: text("region", "Kraj", 120),
      locationNote: text("location_note", "Lokalita", 500),
      reportedDate: text("reported_date", "Dátum nahlásenia", 20),
      deadlineDate: text("deadline_date", "Termín", 20),
      actionUrl: url("action_url", "Odkaz"),
      contactNote: text("contact_note", "Kontaktná poznámka", 1000),
      goalAmount: number("goal_amount", "Cieľová suma"),
      raisedAmount: number("raised_amount", "Vyzbierané"),
    },
  },
  LOST_FOUND: {
    table: "lost_found_dog_reports",
    updatedBy: false,
    aliases: commonAliases,
    manualFields: new Set(["type", "status"]),
    fields: {
      dogName: text("dog_name", "Meno psa", 160),
      sex: text("sex", "Pohlavie", 40),
      breed: text("breed", "Plemeno", 240),
      color: text("color", "Farba", 160),
      approximateAge: text("approximate_age", "Približný vek", 160),
      size: text("size", "Veľkosť", 40),
      description: text("description", "Popis"),
      eventDate: text("event_date", "Dátum udalosti", 20),
      region: text("region", "Kraj", 120),
      district: text("district", "Okres", 160),
      city: text("city", "Mesto", 160),
      locationDescription: text("location_description", "Verejný opis miesta", 1000),
    },
  },
};

type SuggestionRow = {
  origin: AutomationUpdateOrigin;
  id: number;
  entity_type: AutomationEntityType;
  canonical_entity_id: number;
  suggestion_type: CanonicalUpdateSuggestion["suggestionType"];
  before_json: string;
  proposed_json: string;
  diff_json: string;
  source_url: string | null;
  source_label: string | null;
  detected_at: string;
};

type ReviewRow = {
  origin_type: AutomationUpdateOrigin;
  suggestion_id: number;
  field_key: string;
  proposed_value_hash: string;
  decision: AutomationUpdateDecision;
};

function database(input?: Database) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Automation update review nemá pripojenú databázu.");
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeField(entityType: AutomationEntityType, raw: string) {
  const config = configs[entityType];
  return config.aliases?.[raw] ?? raw;
}

function normalizedValue(spec: FieldSpec | null, value: unknown) {
  if (!spec) return value ?? null;
  if (spec.kind === "boolean") {
    if (value === true || value === 1 || value === "1" || value === "true") return true;
    if (value === false || value === 0 || value === "0" || value === "false") return false;
    return Boolean(value);
  }
  if (spec.kind === "number") {
    if (value === null || value === undefined || value === "") return null;
    const result = Number(value);
    return Number.isFinite(result) ? result : value;
  }
  if (spec.kind === "json") {
    if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item.trim() : item);
    return value ?? [];
  }
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function valuesEqual(spec: FieldSpec | null, a: unknown, b: unknown) {
  return stableJson(normalizedValue(spec, a)) === stableJson(normalizedValue(spec, b));
}

function currentValue(row: Record<string, unknown>, entityType: AutomationEntityType, field: string, spec: FieldSpec | null) {
  if (!spec) return null;
  if (entityType === "DIRECTORY" && spec.directoryContact) {
    const contacts = readDirectoryPublicContacts(parseRecord(row.source_data_json) as DirectoryImportData, String(row.website_url ?? ""));
    if (spec.directoryContact === "phone") return contacts.phone;
    if (spec.directoryContact === "email") return contacts.email;
    if (spec.directoryContact === "facebook") return contacts.facebook;
    return contacts.instagram;
  }
  const raw = spec.column ? row[spec.column] : null;
  if (spec.kind === "boolean") return Boolean(raw);
  if (spec.kind === "number") return raw === null || raw === undefined ? null : Number(raw);
  if (spec.kind === "json") {
    if (typeof raw !== "string") return [];
    try { return JSON.parse(raw); } catch { return []; }
  }
  return raw ?? "";
}

function safeSourceUrl(value: unknown) {
  return isSafeAutomationSourceUrl(value) ? String(value) : null;
}

function labelForField(field: string, spec: FieldSpec | null) {
  return spec?.label ?? automationFieldLabel(field);
}

function validateValue(field: string, spec: FieldSpec, value: unknown) {
  const normalized = normalizedValue(spec, value);
  if (spec.kind === "number") {
    if (normalized !== null && typeof normalized !== "number") throw new AutomationUpdateReviewValidationError();
    return normalized;
  }
  if (spec.kind === "boolean") return Boolean(normalized);
  if (spec.kind === "json") {
    if (!Array.isArray(normalized)) throw new AutomationUpdateReviewValidationError("Očakáva sa zoznam hodnôt.");
    if (normalized.length > 100) throw new AutomationUpdateReviewValidationError("Návrh obsahuje príliš veľa položiek.");
    return normalized;
  }
  const result = String(normalized ?? "");
  if (spec.max && result.length > spec.max) throw new AutomationUpdateReviewValidationError("Navrhovaná hodnota je príliš dlhá.");
  if (spec.kind === "url" && result) {
    try {
      const parsed = new URL(result);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
    } catch {
      throw new AutomationUpdateReviewValidationError("Navrhovaný odkaz nie je platná HTTP/HTTPS URL.");
    }
  }
  if (spec.kind === "email" && result && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new AutomationUpdateReviewValidationError("Navrhovaný e-mail nemá platný formát.");
  }
  if (spec.kind === "phone" && result && result.length < 5) {
    throw new AutomationUpdateReviewValidationError("Navrhovaný telefón nemá platný formát.");
  }
  if (/Date$/.test(field) && result && !/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new AutomationUpdateReviewValidationError("Navrhovaný dátum nemá platný formát.");
  }
  if (/Time$/.test(field) && result && !/^\d{2}:\d{2}(?::\d{2})?$/.test(result)) {
    throw new AutomationUpdateReviewValidationError("Navrhovaný čas nemá platný formát.");
  }
  return result;
}

async function getCanonicalRow(entityType: AutomationEntityType, canonicalEntityId: number, db: Database) {
  const config = configs[entityType];
  return db.prepare(`SELECT * FROM ${config.table} WHERE id=? LIMIT 1`).bind(canonicalEntityId).first<Record<string, unknown>>();
}

async function proposedHash(field: string, spec: FieldSpec | null, proposed: unknown) {
  return sha256Hex({ field, value: normalizedValue(spec, proposed) });
}

async function loadReviewRows(rows: SuggestionRow[], db: Database) {
  if (!rows.length) return [] as ReviewRow[];
  const directIds = rows.filter((row) => row.origin === "DIRECT_ENTITY").map((row) => row.id);
  const feedIds = rows.filter((row) => row.origin === "FEED_SOURCE").map((row) => row.id);
  const output: ReviewRow[] = [];
  for (const [origin, ids] of [["DIRECT_ENTITY", directIds], ["FEED_SOURCE", feedIds]] as const) {
    if (!ids.length) continue;
    const placeholders = ids.map(() => "?").join(",");
    const result = await db.prepare(`SELECT origin_type,suggestion_id,field_key,proposed_value_hash,decision
      FROM automation_update_field_reviews
      WHERE origin_type=? AND suggestion_id IN (${placeholders})`).bind(origin, ...ids).all<ReviewRow>();
    output.push(...result.results);
  }
  return output;
}

async function materializeSuggestion(row: SuggestionRow, reviews: ReviewRow[], db: Database): Promise<CanonicalUpdateSuggestion | null> {
  const canonical = await getCanonicalRow(row.entity_type, row.canonical_entity_id, db);
  if (!canonical) return null;
  const diff = parseRecord(row.diff_json) as AutomationDiff;
  const reviewMap = new Map(
    reviews.filter((review) => review.origin_type === row.origin && Number(review.suggestion_id) === row.id)
      .map((review) => [`${review.field_key}:${review.proposed_value_hash}`, review]),
  );
  const fields: CanonicalUpdateSuggestionField[] = [];
  for (const [sourceField, rawChange] of Object.entries(diff)) {
    if (!rawChange || typeof rawChange !== "object" || Array.isArray(rawChange)) continue;
    const change = rawChange as { before?: unknown; after?: unknown };
    const field = normalizeField(row.entity_type, sourceField);
    const config = configs[row.entity_type];
    const spec = config.fields[field] ?? null;
    const current = currentValue(canonical, row.entity_type, field, spec);
    const before = change.before;
    const proposed = change.after;
    const hash = await proposedHash(field, spec, proposed);
    if (valuesEqual(spec, current, proposed)) continue;
    if (reviewMap.has(`${field}:${hash}`)) continue;

    let state: AutomationUpdateFieldState = "OPEN";
    let reviewable = row.suggestion_type === "POSSIBLE_UPDATE" && Boolean(spec) && !config.manualFields?.has(field);
    let note: string | null = null;
    if (row.suggestion_type !== "POSSIBLE_UPDATE") {
      state = "LIFECYCLE";
      reviewable = false;
      note = "Automatizácia našla možnú zmenu stavu. Stav skontroluj samostatne v canonical editore.";
    } else if (!spec || config.manualFields?.has(field)) {
      state = "UNSUPPORTED";
      reviewable = false;
      note = config.manualFields?.has(field)
        ? "Toto pole vyžaduje manuálnu kontrolu a nemožno ho prevziať jedným kliknutím."
        : "Pole nie je v bezpečnom allowliste automatického prevzatia.";
    } else if (!valuesEqual(spec, current, before)) {
      state = "STALE";
      reviewable = false;
      note = "Záznam sa medzitým zmenil. Obnov zdroj alebo skontroluj návrh manuálne.";
    }
    fields.push({
      field,
      sourceField,
      label: labelForField(field, spec),
      before,
      current,
      proposed,
      proposedValueHash: hash,
      state,
      reviewable,
      note,
    });
  }
  if (!fields.length) return null;
  return {
    origin: row.origin,
    id: row.id,
    entityType: row.entity_type,
    canonicalEntityId: row.canonical_entity_id,
    suggestionType: row.suggestion_type,
    sourceUrl: safeSourceUrl(row.source_url),
    sourceLabel: row.source_label?.trim() || automationSourceDomain(safeSourceUrl(row.source_url)),
    detectedAt: row.detected_at,
    canonicalUpdatedAt: String(canonical.updated_at ?? ""),
    fields,
  };
}

async function loadSuggestionRows(entityType: AutomationEntityType, canonicalEntityId: number, db: Database) {
  const [direct, feed] = await Promise.all([
    db.prepare(`SELECT id,entity_type,canonical_entity_id,suggestion_type,before_json,proposed_json,diff_json,
        external_source_url AS source_url,NULL AS source_label,last_detected_at AS detected_at
      FROM automation_update_suggestions
      WHERE entity_type=? AND canonical_entity_id=? AND status='OPEN'
      ORDER BY last_detected_at DESC,id DESC LIMIT 50`)
      .bind(entityType, canonicalEntityId).all<Record<string, unknown>>(),
    db.prepare(`SELECT f.id,f.entity_type,f.canonical_entity_id,f.finding_type AS suggestion_type,
        f.before_json,f.proposed_json,f.diff_json,f.source_url,s.label AS source_label,f.last_detected_at AS detected_at
      FROM automation_findings f
      LEFT JOIN automation_sources s ON s.id=f.source_id
      WHERE f.entity_type=? AND f.canonical_entity_id=?
        AND f.finding_type IN ('POSSIBLE_UPDATE','POSSIBLE_INACTIVE','POSSIBLE_CANCELLED')
        AND f.review_status IN ('NEW','IN_REVIEW','SUPPRESSED')
      ORDER BY f.last_detected_at DESC,f.id DESC LIMIT 50`)
      .bind(entityType, canonicalEntityId).all<Record<string, unknown>>(),
  ]);
  return [
    ...direct.results.map((row) => ({ ...row, origin: "DIRECT_ENTITY" as const })),
    ...feed.results.map((row) => ({ ...row, origin: "FEED_SOURCE" as const })),
  ].map((row) => ({
    origin: row.origin,
    id: Number(row.id),
    entity_type: row.entity_type as AutomationEntityType,
    canonical_entity_id: Number(row.canonical_entity_id),
    suggestion_type: row.suggestion_type as CanonicalUpdateSuggestion["suggestionType"],
    before_json: String(row.before_json ?? "{}"),
    proposed_json: String(row.proposed_json ?? "{}"),
    diff_json: String(row.diff_json ?? "{}"),
    source_url: row.source_url ? String(row.source_url) : null,
    source_label: row.source_label ? String(row.source_label) : null,
    detected_at: String(row.detected_at ?? ""),
  } satisfies SuggestionRow));
}

export async function listCanonicalAutomationUpdateSuggestions(
  input: { entityType: AutomationEntityType; canonicalEntityId: number },
  databaseInput?: Database,
) {
  const db = database(databaseInput);
  const rows = await loadSuggestionRows(input.entityType, input.canonicalEntityId, db);
  const reviews = await loadReviewRows(rows, db);
  const suggestions = await Promise.all(rows.map((row) => materializeSuggestion(row, reviews, db)));
  return suggestions.filter((item): item is CanonicalUpdateSuggestion => Boolean(item));
}

async function getSuggestionRow(origin: AutomationUpdateOrigin, id: number, db: Database): Promise<SuggestionRow | null> {
  if (origin === "DIRECT_ENTITY") {
    const row = await db.prepare(`SELECT id,entity_type,canonical_entity_id,suggestion_type,before_json,proposed_json,diff_json,
        external_source_url AS source_url,NULL AS source_label,last_detected_at AS detected_at
      FROM automation_update_suggestions WHERE id=? LIMIT 1`).bind(id).first<Record<string, unknown>>();
    if (!row) return null;
    return {
      origin,
      id: Number(row.id),
      entity_type: row.entity_type as AutomationEntityType,
      canonical_entity_id: Number(row.canonical_entity_id),
      suggestion_type: row.suggestion_type as CanonicalUpdateSuggestion["suggestionType"],
      before_json: String(row.before_json ?? "{}"),
      proposed_json: String(row.proposed_json ?? "{}"),
      diff_json: String(row.diff_json ?? "{}"),
      source_url: row.source_url ? String(row.source_url) : null,
      source_label: null,
      detected_at: String(row.detected_at ?? ""),
    };
  }
  const row = await db.prepare(`SELECT f.id,f.entity_type,f.canonical_entity_id,f.finding_type AS suggestion_type,
      f.before_json,f.proposed_json,f.diff_json,f.source_url,s.label AS source_label,f.last_detected_at AS detected_at
    FROM automation_findings f LEFT JOIN automation_sources s ON s.id=f.source_id WHERE f.id=? LIMIT 1`)
    .bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  return {
    origin,
    id: Number(row.id),
    entity_type: row.entity_type as AutomationEntityType,
    canonical_entity_id: Number(row.canonical_entity_id),
    suggestion_type: row.suggestion_type as CanonicalUpdateSuggestion["suggestionType"],
    before_json: String(row.before_json ?? "{}"),
    proposed_json: String(row.proposed_json ?? "{}"),
    diff_json: String(row.diff_json ?? "{}"),
    source_url: row.source_url ? String(row.source_url) : null,
    source_label: row.source_label ? String(row.source_label) : null,
    detected_at: String(row.detected_at ?? ""),
  };
}

async function existingDecision(
  origin: AutomationUpdateOrigin,
  suggestionId: number,
  field: string,
  hash: string,
  db: Database,
) {
  return db.prepare(`SELECT decision FROM automation_update_field_reviews
    WHERE origin_type=? AND suggestion_id=? AND field_key=? AND proposed_value_hash=? LIMIT 1`)
    .bind(origin, suggestionId, field, hash).first<{ decision: AutomationUpdateDecision }>();
}

async function recordDecision(input: {
  origin: AutomationUpdateOrigin;
  suggestionId: number;
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  field: string;
  hash: string;
  decision: AutomationUpdateDecision;
  actor: string;
  at: string;
  reason?: string | null;
}, db: Database) {
  await db.prepare(`INSERT INTO automation_update_field_reviews (
      origin_type,suggestion_id,entity_type,canonical_entity_id,field_key,proposed_value_hash,
      decision,resolution_reason,reviewed_by,reviewed_at,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(origin_type,suggestion_id,field_key,proposed_value_hash)
    DO UPDATE SET decision=excluded.decision,resolution_reason=excluded.resolution_reason,
      reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,updated_at=excluded.updated_at`)
    .bind(
      input.origin, input.suggestionId, input.entityType, input.canonicalEntityId, input.field,
      input.hash, input.decision, input.reason ?? null, input.actor, input.at, input.at, input.at,
    ).run();
}

async function writeCanonicalField(input: {
  row: Record<string, unknown>;
  entityType: AutomationEntityType;
  canonicalEntityId: number;
  field: string;
  spec: FieldSpec;
  value: unknown;
  actor: string;
  at: string;
}, db: Database) {
  const config = configs[input.entityType];
  const expectedUpdatedAt = String(input.row.updated_at ?? "");
  let updated: Record<string, unknown> | null = null;
  if (input.entityType === "DIRECTORY" && input.spec.directoryContact) {
    const currentData = parseRecord(input.row.source_data_json) as DirectoryImportData;
    const patch: Parameters<typeof mergeDirectoryPublicContactData>[1] = {};
    if (input.spec.directoryContact === "phone") patch.publicPhone = String(input.value ?? "");
    if (input.spec.directoryContact === "email") patch.publicEmail = String(input.value ?? "");
    if (input.spec.directoryContact === "facebook") patch.facebookUrl = String(input.value ?? "");
    if (input.spec.directoryContact === "instagram") patch.instagramUrl = String(input.value ?? "");
    const nextData = mergeDirectoryPublicContactData(currentData, patch);
    updated = await db.prepare(`UPDATE directory_profiles
      SET source_data_json=?,updated_at=?,updated_by=?
      WHERE id=? AND updated_at=? RETURNING *`)
      .bind(JSON.stringify(nextData), input.at, input.actor, input.canonicalEntityId, expectedUpdatedAt)
      .first<Record<string, unknown>>();
  } else {
    if (!input.spec.column) throw new AutomationUpdateReviewUnsupportedError();
    const dbValue = input.spec.kind === "boolean"
      ? (input.value ? 1 : 0)
      : input.spec.kind === "json"
        ? JSON.stringify(input.value)
        : input.value;
    const updatedBySql = config.updatedBy ? ",updated_by=?" : "";
    const statement = db.prepare(`UPDATE ${config.table}
      SET ${input.spec.column}=?,updated_at=?${updatedBySql}
      WHERE id=? AND updated_at=? RETURNING *`);
    updated = config.updatedBy
      ? await statement.bind(dbValue, input.at, input.actor, input.canonicalEntityId, expectedUpdatedAt).first<Record<string, unknown>>()
      : await statement.bind(dbValue, input.at, input.canonicalEntityId, expectedUpdatedAt).first<Record<string, unknown>>();
  }
  if (!updated) throw new AutomationUpdateReviewConflictError();
  return updated;
}

async function remainingFields(row: SuggestionRow, db: Database) {
  const reviews = await loadReviewRows([row], db);
  const materialized = await materializeSuggestion(row, reviews, db);
  return materialized?.fields.length ?? 0;
}

async function resolveParentIfComplete(row: SuggestionRow, actor: string, at: string, db: Database) {
  const remaining = await remainingFields(row, db);
  if (remaining > 0) return remaining;
  if (row.origin === "DIRECT_ENTITY") {
    await db.prepare("UPDATE automation_update_suggestions SET status='RESOLVED' WHERE id=? AND status='OPEN'")
      .bind(row.id).run();
  } else {
    await db.prepare(`UPDATE automation_findings SET review_status='RESOLVED',reviewer_decision='FIELD_REVIEW_COMPLETE',
      reviewed_by=COALESCE(reviewed_by,?),reviewed_at=COALESCE(reviewed_at,?)
      WHERE id=? AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED')`)
      .bind(actor, at, row.id).run();
  }
  return 0;
}

export async function reviewAutomationUpdateField(input: {
  origin: AutomationUpdateOrigin;
  suggestionId: number;
  field: string;
  action: "accept" | "reject";
  expectedProposedValueHash: string;
  expectedUpdatedAt?: string | null;
  actor: string;
  now?: Date;
}, databaseInput?: Database): Promise<AutomationUpdateFieldActionResult> {
  const db = database(databaseInput);
  const row = await getSuggestionRow(input.origin, input.suggestionId, db);
  if (!row || !Number.isSafeInteger(row.canonical_entity_id) || row.canonical_entity_id < 1) {
    throw new AutomationUpdateReviewNotFoundError();
  }
  const diff = parseRecord(row.diff_json) as AutomationDiff;
  const sourceField = Object.keys(diff).find((candidate) => normalizeField(row.entity_type, candidate) === normalizeField(row.entity_type, input.field));
  if (!sourceField) throw new AutomationUpdateReviewUnsupportedError("Pole už nie je súčasťou aktuálneho návrhu.");
  const change = diff[sourceField];
  if (!change || typeof change !== "object") throw new AutomationUpdateReviewUnsupportedError();
  const field = normalizeField(row.entity_type, sourceField);
  const config = configs[row.entity_type];
  const spec = config.fields[field] ?? null;
  const hash = await proposedHash(field, spec, change.after);
  if (!input.expectedProposedValueHash || hash !== input.expectedProposedValueHash) {
    throw new AutomationUpdateReviewConflictError("Návrh sa medzitým zmenil. Obnov stránku a skontroluj novú hodnotu.");
  }

  const actor = input.actor.trim().toLowerCase();
  const at = (input.now ?? new Date()).toISOString();
  const decision = input.action === "accept" ? "ACCEPTED" : "REJECTED";
  const already = await existingDecision(input.origin, row.id, field, hash, db);
  const canonical = await getCanonicalRow(row.entity_type, row.canonical_entity_id, db);
  if (!canonical) throw new AutomationUpdateReviewNotFoundError();

  if (already) {
    if (already.decision === "REJECTED" && decision === "REJECTED") {
      return {
        suggestionId: row.id, origin: row.origin, entityType: row.entity_type, canonicalEntityId: row.canonical_entity_id,
        field, decision, updatedValues: {}, updatedAt: String(canonical.updated_at ?? ""),
        remainingOpenFields: await remainingFields(row, db),
      };
    }
    if (already.decision === "ACCEPTED" && decision === "ACCEPTED" && valuesEqual(spec, currentValue(canonical, row.entity_type, field, spec), change.after)) {
      return {
        suggestionId: row.id, origin: row.origin, entityType: row.entity_type, canonicalEntityId: row.canonical_entity_id,
        field, decision, updatedValues: { [field]: currentValue(canonical, row.entity_type, field, spec) },
        updatedAt: String(canonical.updated_at ?? ""), remainingOpenFields: await remainingFields(row, db),
      };
    }
    throw new AutomationUpdateReviewConflictError("Tento návrh už bol rozhodnutý inak.");
  }

  if (input.action === "reject") {
    await recordDecision({
      origin: row.origin, suggestionId: row.id, entityType: row.entity_type, canonicalEntityId: row.canonical_entity_id,
      field, hash, decision: "REJECTED", actor, at,
    }, db);
    const remaining = await resolveParentIfComplete(row, actor, at, db);
    return {
      suggestionId: row.id, origin: row.origin, entityType: row.entity_type, canonicalEntityId: row.canonical_entity_id,
      field, decision: "REJECTED", updatedValues: {}, updatedAt: String(canonical.updated_at ?? ""), remainingOpenFields: remaining,
    };
  }

  if (row.suggestion_type !== "POSSIBLE_UPDATE") {
    throw new AutomationUpdateReviewUnsupportedError("Zmenu lifecycle stavu nemožno prevziať cez generic field review.");
  }
  if (!spec || config.manualFields?.has(field)) {
    throw new AutomationUpdateReviewUnsupportedError();
  }

  const current = currentValue(canonical, row.entity_type, field, spec);
  if (valuesEqual(spec, current, change.after)) {
    await recordDecision({
      origin: row.origin, suggestionId: row.id, entityType: row.entity_type, canonicalEntityId: row.canonical_entity_id,
      field, hash, decision: "ACCEPTED", actor, at, reason: "CANONICAL_ALREADY_MATCHES",
    }, db);
    const remaining = await resolveParentIfComplete(row, actor, at, db);
    return {
      suggestionId: row.id, origin: row.origin, entityType: row.entity_type, canonicalEntityId: row.canonical_entity_id,
      field, decision: "ACCEPTED", updatedValues: { [field]: current }, updatedAt: String(canonical.updated_at ?? ""),
      remainingOpenFields: remaining,
    };
  }

  if (!valuesEqual(spec, current, change.before)) throw new AutomationUpdateReviewConflictError();
  if (input.expectedUpdatedAt && String(canonical.updated_at ?? "") !== input.expectedUpdatedAt) {
    throw new AutomationUpdateReviewConflictError();
  }

  const value = validateValue(field, spec, change.after);
  const updated = await writeCanonicalField({
    row: canonical, entityType: row.entity_type, canonicalEntityId: row.canonical_entity_id,
    field, spec, value, actor, at,
  }, db);
  await recordDecision({
    origin: row.origin, suggestionId: row.id, entityType: row.entity_type, canonicalEntityId: row.canonical_entity_id,
    field, hash, decision: "ACCEPTED", actor, at,
  }, db);
  const updatedValue = currentValue(updated, row.entity_type, field, spec);
  const remaining = await resolveParentIfComplete(row, actor, at, db);
  return {
    suggestionId: row.id,
    origin: row.origin,
    entityType: row.entity_type,
    canonicalEntityId: row.canonical_entity_id,
    field,
    decision: "ACCEPTED",
    updatedValues: { [field]: updatedValue },
    updatedAt: String(updated.updated_at ?? at),
    remainingOpenFields: remaining,
  };
}
