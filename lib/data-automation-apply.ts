import { env } from "cloudflare:workers";
import {
  normalizeAutomationIdentity,
  stableJson,
  type AutomationEntityType,
  type AutomationFindingType,
} from "./data-automation.ts";
import {
  getAutomationFindingDetail,
  type AutomationD1Database,
  type AutomationFindingDetail,
} from "./data-automation-store.ts";

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
  };
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
  "POSSIBLE_UPDATE",
  "POSSIBLE_CANCELLED",
]);

function database(input?: AutomationD1Database) {
  if (input?.prepare && input.batch) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare && bound.batch) return bound;
  throw new Error("Data automation nemá pripojenú databázu.");
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

function nullableText(value: unknown) {
  const text = textValue(value);
  return text || null;
}

function slugifyDraft(value: unknown, fallback: string) {
  const normalized = normalizeAutomationIdentity(value || fallback)
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return normalized || fallback;
}

function validOrganizationType(value: unknown) {
  const type = textValue(value);
  return ["SHELTER","CIVIC_ASSOCIATION","RESCUE_ORGANIZATION","MUNICIPAL_ORGANIZATION","NONPROFIT","OTHER"].includes(type)
    ? type
    : "OTHER";
}

function validLostFoundType(value: unknown) {
  const type = textValue(value).toUpperCase();
  if (type !== "LOST" && type !== "FOUND") throw new AutomationApplyUnsupportedError("Nové Lost/Found hlásenie nemá platný typ LOST/FOUND.");
  return type;
}

function searchText(values: unknown[]) {
  return normalizeAutomationIdentity(values.filter((value) => value !== null && value !== undefined && value !== "").join(" "));
}

function sourceMetadata(entityType: AutomationEntityType, proposed: Record<string, unknown>) {
  if (entityType !== "ORGANIZATION") return {};
  const metadata: Record<string, unknown> = {};
  for (const key of entityConfigs.ORGANIZATION.metadataFields ?? []) {
    if (own(proposed, key)) metadata[key] = proposed[key];
  }
  return metadata;
}

function createDraftStatement(
  finding: AutomationFindingDetail,
  actor: string,
  at: string,
  db: AutomationD1Database,
) {
  const p = finding.proposed;
  if (finding.entityType === "EVENT") {
    const title = textValue(p.title);
    const startDate = textValue(p.startDate ?? p.start_date);
    if (!title || !startDate) throw new AutomationApplyUnsupportedError("Nový koncept podujatia potrebuje názov a dátum začiatku.");
    const slug = slugifyDraft(p.slug, `${title}-${startDate}`);
    const city = textValue(p.city);
    const organizer = textValue(p.organizer);
    const websiteUrl = nullableText(p.websiteUrl ?? p.website_url ?? finding.sourceUrl);
    const after = {
      slug, title, excerpt: textValue(p.excerpt), eventType: textValue(p.eventType ?? p.event_type) || "Iné",
      status: "draft", startDate, startTime: textValue(p.startTime ?? p.start_time),
      endDate: nullableText(p.endDate ?? p.end_date), endTime: nullableText(p.endTime ?? p.end_time),
      venue: textValue(p.venue), city: city || "Online", region: textValue(p.region) || "Online",
      address: textValue(p.address), organizer: organizer || finding.sourceLabel,
      description: textValue(p.description), practicalInfo: textValue(p.practicalInfo),
      websiteUrl, registrationUrl: nullableText(p.registrationUrl ?? p.registration_url),
      imageUrl: nullableText(p.imageUrl ?? p.image_url), cancelled: Boolean(p.cancelled),
    };
    return {
      statement: db.prepare(`INSERT INTO managed_events (
        slug,title,excerpt,event_type,status,start_date,start_time,end_date,end_time,venue,city,region,address,organizer,
        description,practical_info,website_url,registration_url,image_url,image_key,cancelled,seo_json,
        created_at,updated_at,published_at,created_by,updated_by
      ) VALUES (?,?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,'{}',?,?,NULL,?,?)`).bind(
        after.slug, after.title, after.excerpt, after.eventType, after.startDate, after.startTime, after.endDate, after.endTime,
        after.venue, after.city, after.region, after.address, after.organizer, after.description, after.practicalInfo,
        after.websiteUrl, after.registrationUrl, after.imageUrl, after.cancelled ? 1 : 0, at, at, actor, actor,
      ),
      after,
    };
  }

  if (finding.entityType === "ORGANIZATION") {
    const name = textValue(p.name);
    if (!name) throw new AutomationApplyUnsupportedError("Nový koncept organizácie potrebuje názov.");
    const slug = slugifyDraft(p.slug, name);
    const metadata = sourceMetadata("ORGANIZATION", p);
    const after = {
      name, slug, legalName: textValue(p.legalName ?? p.legal_name), registrationNumber: nullableText(p.registrationNumber ?? p.registration_number),
      type: validOrganizationType(p.type), status: "DRAFT", shortDescription: textValue(p.shortDescription ?? p.short_description),
      description: textValue(p.description), publicEmail: nullableText(p.publicEmail ?? p.public_email),
      publicPhone: nullableText(p.publicPhone ?? p.public_phone), websiteUrl: nullableText(p.websiteUrl ?? p.website_url),
      facebookUrl: nullableText(p.facebookUrl ?? p.facebook_url), instagramUrl: nullableText(p.instagramUrl ?? p.instagram_url),
      address: textValue(p.address), city: textValue(p.city), district: textValue(p.district), region: textValue(p.region),
      countryCode: textValue(p.countryCode ?? p.country_code) || "SK", importKey: nullableText(p.importKey ?? p.import_key),
      sourceUrl: nullableText(p.sourceUrl ?? p.source_url ?? finding.sourceUrl), sourceData: metadata,
    };
    return {
      statement: db.prepare(`INSERT INTO help_organizations (
        name,slug,legal_name,registration_number,type,status,short_description,description,public_email,public_phone,
        website_url,facebook_url,instagram_url,address,city,district,region,country_code,image_url,image_key,
        directory_profile_id,import_key,source_url,source_data_json,seo_json,published_at,last_verified_at,archived_at,
        created_at,updated_at,created_by,updated_by
      ) VALUES (?,?,?,?,?,'DRAFT',?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,?,?,?,'{}',NULL,NULL,NULL,?,?,?,?)`).bind(
        after.name, after.slug, after.legalName, after.registrationNumber, after.type, after.shortDescription, after.description,
        after.publicEmail, after.publicPhone, after.websiteUrl, after.facebookUrl, after.instagramUrl, after.address, after.city,
        after.district, after.region, after.countryCode, after.importKey, after.sourceUrl, JSON.stringify(after.sourceData),
        at, at, actor, actor,
      ),
      after,
    };
  }

  if (finding.entityType === "DIRECTORY") {
    const name = textValue(p.name);
    const category = textValue(p.category);
    if (!name || !category) throw new AutomationApplyUnsupportedError("Nový koncept adresára potrebuje názov a kategóriu.");
    const slug = slugifyDraft(p.slug, name);
    const after = {
      slug, name, category, status: "draft", excerpt: textValue(p.excerpt), description: textValue(p.description),
      services: Array.isArray(p.services) ? p.services : [], qualifications: Array.isArray(p.qualifications) ? p.qualifications : [],
      city: textValue(p.city), district: textValue(p.district), region: textValue(p.region) || "Online",
      address: textValue(p.address), online: Boolean(p.online), priceNote: textValue(p.priceNote ?? p.price_note),
      websiteUrl: nullableText(p.websiteUrl ?? p.website_url), verified: Boolean(p.verified),
    };
    return {
      statement: db.prepare(`INSERT INTO directory_profiles (
        slug,name,category,status,excerpt,description,services_json,qualifications_json,city,region,address,online,price_note,
        website_url,internal_email,image_url,image_key,verified,featured,created_at,updated_at,published_at,created_by,updated_by,
        seo_json,district,search_text
      ) VALUES (?,?,?,'draft',?,?,?,?,?,?,?,?,?, ?,NULL,NULL,NULL,?,0,?,?,NULL,?,?,'{}',?,?)`).bind(
        after.slug, after.name, after.category, after.excerpt, after.description, JSON.stringify(after.services), JSON.stringify(after.qualifications),
        after.city, after.region, after.address, after.online ? 1 : 0, after.priceNote, after.websiteUrl, after.verified ? 1 : 0,
        at, at, actor, actor, after.district, searchText([after.name, after.category, after.city, after.district, after.region]),
      ),
      after,
    };
  }

  if (finding.entityType === "ADOPTION") {
    const name = textValue(p.name);
    if (!name) throw new AutomationApplyUnsupportedError("Nový koncept adopcie potrebuje meno psa.");
    const slug = slugifyDraft(p.slug, name);
    const organizationName = textValue(p.organizationName ?? p.organization);
    const after = {
      name, slug, status: "DRAFT", sex: textValue(p.sex) || "UNKNOWN", birthDate: nullableText(p.birthDate ?? p.birth_date),
      approximateAgeMonths: p.approximateAgeMonths ?? p.approximate_age_months ?? null,
      size: textValue(p.size) || "UNKNOWN", weight: p.weight ?? null, breedName: textValue(p.breedName ?? p.breed_name),
      breedMix: Boolean(p.breedMix ?? p.breed_mix), color: textValue(p.color), region: textValue(p.region),
      district: textValue(p.district), city: textValue(p.city), organizationName,
      shortDescription: textValue(p.shortDescription ?? p.short_description), description: textValue(p.description),
      externalSourceUrl: nullableText(p.externalSourceUrl ?? p.external_source_url ?? finding.sourceUrl),
    };
    return {
      statement: db.prepare(`INSERT INTO adoption_dogs (
        name,slug,status,sex,birth_date,approximate_age_months,size,weight,breed_id,breed_name,breed_mix,color,region,district,city,
        organization_id,organization_name,organization_slug,main_image,gallery_json,short_description,description,temperament,
        activity_level,suitable_for_children,suitable_for_dogs,suitable_for_cats,suitable_for_other_animals,apartment_suitable,
        beginner_suitable,needs_experienced_owner,vaccination_status,chipped,neutered,health_notes,special_needs,
        adoption_requirements,external_source_url,contact_email,contact_phone,contact_url,search_text,published_at,last_verified_at,
        created_at,updated_at,created_by,updated_by
      ) VALUES (?,?,'DRAFT',?,?,?,?,?,NULL,?,?,?, ?,?,?,NULL,?,NULL,NULL,'[]',?,?,'','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN','UNKNOWN',
        NULL,NULL,0,'UNKNOWN',NULL,NULL,'','','',?,NULL,NULL,NULL,?,NULL,NULL,?,?,?,?)`).bind(
        after.name, after.slug, after.sex, after.birthDate,
        after.approximateAgeMonths === null || after.approximateAgeMonths === "" ? null : Number(after.approximateAgeMonths),
        after.size, after.weight === null || after.weight === "" ? null : Number(after.weight),
        after.breedName, after.breedMix ? 1 : 0, after.color, after.region, after.district, after.city,
        after.organizationName, after.shortDescription, after.description, after.externalSourceUrl,
        searchText([after.name, after.breedName, after.organizationName, after.city, after.region]), at, at, actor, actor,
      ),
      after,
    };
  }

  if (finding.entityType === "LOST_FOUND") {
    const type = validLostFoundType(p.type);
    const dogName = nullableText(p.dogName ?? p.name);
    const city = textValue(p.city);
    const eventDate = textValue(p.eventDate ?? p.event_date);
    const slug = slugifyDraft(p.slug, `${type === "LOST" ? "strateny" : "najdeny"}-${dogName || city || "pes"}-${eventDate || finding.id}`);
    const sourceUrl = nullableText(p.sourceUrl ?? p.source_url ?? finding.sourceUrl);
    const after = {
      type, status: "DRAFT", slug, dogName, sex: textValue(p.sex) || "UNKNOWN", breed: textValue(p.breed),
      color: textValue(p.color), approximateAge: textValue(p.approximateAge ?? p.approximate_age),
      size: textValue(p.size) || "UNKNOWN", description: textValue(p.description), eventDate,
      region: textValue(p.region), district: textValue(p.district), city,
      locationDescription: textValue(p.locationDescription ?? p.location_description),
      source: textValue(p.source) || finding.sourceLabel, sourceUrl,
    };
    return {
      statement: db.prepare(`INSERT INTO lost_found_dog_reports (
        type,status,slug,dog_name,sex,breed_id,breed,breed_unknown,color,approximate_age,size,description,distinguishing_marks,
        collar_description,chipped,main_image,main_image_key,gallery_json,event_date,last_seen_date_time,region,district,city,
        location_description,public_latitude,public_longitude,public_location_precision,public_contact_note,source,source_url,
        search_text,duplicate_of_id,duplicate_reason,created_at,updated_at,published_at,expires_at,resolved_at,archived_at
      ) VALUES (?,'DRAFT',?,?,?,NULL,?,0,?,?,?,?,'','','UNKNOWN',NULL,NULL,'[]',?,NULL,?,?,?,?,NULL,NULL,'MUNICIPALITY','',?,?,?,
        NULL,'',?,?,NULL,NULL,NULL,NULL)`).bind(
        after.type, after.slug, after.dogName, after.sex, after.breed, after.color, after.approximateAge, after.size,
        after.description, after.eventDate, after.region, after.district, after.city, after.locationDescription,
        after.source, after.sourceUrl, searchText([after.type, after.dogName, after.breed, after.color, after.description, after.region, after.district, after.city]),
        at, at,
      ),
      after,
    };
  }

  const isFoster = finding.entityType === "FOSTER";
  const title = textValue(p.title ?? p.name ?? p.dogName);
  const category = isFoster ? "docasna-opatera" : textValue(p.category);
  if (!title || !category) throw new AutomationApplyUnsupportedError("Nový koncept Pomoc psom potrebuje názov a kategóriu.");
  const slug = slugifyDraft(p.slug, title);
  const actionLabel = textValue(p.actionLabel) || (isFoster ? "Ponúknuť dočasnú opateru" : "Otvoriť zdroj");
  const after = {
    slug, title, category, status: "draft", excerpt: textValue(p.excerpt), description: textValue(p.description),
    organization: textValue(p.organization ?? p.organizationName), dogName: textValue(p.dogName ?? p.name),
    breed: textValue(p.breed), ageNote: textValue(p.ageNote ?? p.age_note), city: textValue(p.city) || "Online",
    region: textValue(p.region) || "Online", locationNote: textValue(p.locationNote ?? p.location_note),
    reportedDate: nullableText(p.reportedDate ?? p.reported_date), deadlineDate: nullableText(p.deadlineDate ?? p.deadline_date),
    actionLabel, actionUrl: nullableText(p.actionUrl ?? p.action_url ?? finding.sourceUrl),
    contactNote: textValue(p.contactNote ?? p.contact_note), goalAmount: p.goalAmount ?? p.goal_amount ?? null,
    raisedAmount: p.raisedAmount ?? p.raised_amount ?? null, verified: Boolean(p.verified), urgent: Boolean(p.urgent),
    resolved: Boolean(p.resolved),
  };
  return {
    statement: db.prepare(`INSERT INTO help_cases (
      slug,title,category,status,excerpt,description,organization,dog_name,breed,age_note,city,region,location_note,reported_date,
      deadline_date,action_label,action_url,contact_note,goal_amount,raised_amount,image_url,image_key,verified,urgent,resolved,
      created_at,updated_at,published_at,created_by,updated_by,seo_json
    ) VALUES (?,?,?,'draft',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,NULL,NULL,?,?,?, ?,?,NULL,?,?,'{}')`).bind(
      after.slug, after.title, after.category, after.excerpt, after.description, after.organization, after.dogName, after.breed,
      after.ageNote, after.city, after.region, after.locationNote, after.reportedDate, after.deadlineDate, after.actionLabel,
      after.actionUrl, after.contactNote,
      after.goalAmount === null || after.goalAmount === "" ? null : Number(after.goalAmount),
      after.raisedAmount === null || after.raisedAmount === "" ? null : Number(after.raisedAmount),
      after.verified ? 1 : 0, after.urgent ? 1 : 0, after.resolved ? 1 : 0, at, at, actor, actor,
    ),
    after,
  };
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
    const refreshed = await getAutomationFindingDetail(finding.id, db);
    if (!refreshed) return null;
    let appliedFields: string[] = [];
    try { appliedFields = JSON.parse(already.applied_fields_json) as string[]; } catch {}
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

  if (finding.findingType === "NEW_ENTITY") {
    if (finding.canonicalEntityId) throw new AutomationApplyConflictError("Finding už má canonical záznam.");
    const unsupported = unsupportedAutomationApplyFields(finding.entityType, finding.diff);
    if (unsupported.length) {
      throw new AutomationApplyUnsupportedError(`Nový koncept obsahuje nepodporované polia: ${unsupported.join(", ")}.`);
    }
    const draft = createDraftStatement(finding, actor, at, db);
    const appliedFields = Object.keys(finding.diff);
    const application = db.prepare(`INSERT INTO automation_applications (
        finding_id,entity_type,canonical_entity_id,application_type,applied_fields_json,before_json,after_json,applied_by,applied_at
      ) VALUES (?,?,last_insert_rowid(),'CREATE_DRAFT',?,?,?,?,?)`).bind(
        finding.id, finding.entityType, JSON.stringify(appliedFields), JSON.stringify(finding.before),
        JSON.stringify(draft.after), actor, at,
      );
    const closeFinding = db.prepare(`UPDATE automation_findings SET
        canonical_entity_id=(SELECT canonical_entity_id FROM automation_applications WHERE finding_id=?),
        canonical_entity_key=? || ':' || (SELECT canonical_entity_id FROM automation_applications WHERE finding_id=?),
        review_status='RESOLVED',reviewer_decision='APPROVE_APPLY',reviewer_notes=?,reviewed_by=?,reviewed_at=?,suppressed_until=NULL
      WHERE id=? AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED','APPROVED')`).bind(
        finding.id, config.keyPrefix, finding.id, notes, actor, at, finding.id,
      );
    await db.batch([draft.statement, application, closeFinding]);
  } else {
    if (!finding.canonicalEntityId) throw new AutomationApplyConflictError("Finding nemá jednoznačný canonical záznam.");
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
  }

  const application = await existingApplication(finding.id, db);
  const refreshed = await getAutomationFindingDetail(finding.id, db);
  if (!application || !refreshed) throw new Error("automation_apply_result_missing");
  let appliedFields: string[] = [];
  try { appliedFields = JSON.parse(application.applied_fields_json) as string[]; } catch {}
  return {
    finding: refreshed,
    application: {
      canonicalEntityId: Number(application.canonical_entity_id),
      applicationType: application.application_type,
      appliedFields,
    },
  };
}
