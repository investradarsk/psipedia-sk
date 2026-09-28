export type CanonicalDraftEntityType =
  | "EVENT"
  | "ORGANIZATION"
  | "HELP_ITEM"
  | "ADOPTION"
  | "FOSTER"
  | "LOST_FOUND"
  | "DIRECTORY";

export type CanonicalDraftInput = {
  entityType: CanonicalDraftEntityType;
  data: Record<string, unknown>;
  externalSourceUrl?: string | null;
  slugSuffix?: string | null;
};

export type CanonicalDraftDatabase = Pick<D1Database, "prepare">;

export class CanonicalDraftValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalDraftValidationError";
  }
}

function textValue(value: unknown) {
  return typeof value === "string"
    ? value.trim()
    : value === null || value === undefined
      ? ""
      : String(value).trim();
}

function nullableText(value: unknown) {
  const valueText = textValue(value);
  return valueText || null;
}

function normalizeSlugPart(value: unknown) {
  return textValue(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
}

function canonicalDraftSlug(value: unknown, fallback: string, suffix?: string | null) {
  const base = normalizeSlugPart(value) || normalizeSlugPart(fallback) || "koncept";
  const normalizedSuffix = normalizeSlugPart(suffix);
  if (!normalizedSuffix) return base;
  return `${base.slice(0, Math.max(1, 89 - normalizedSuffix.length))}-${normalizedSuffix}`.slice(0, 90);
}

function validOrganizationType(value: unknown) {
  const type = textValue(value);
  return ["SHELTER","CIVIC_ASSOCIATION","RESCUE_ORGANIZATION","MUNICIPAL_ORGANIZATION","NONPROFIT","OTHER"].includes(type)
    ? type
    : "OTHER";
}

function validLostFoundType(value: unknown) {
  const type = textValue(value).toUpperCase();
  if (type !== "LOST" && type !== "FOUND") {
    throw new CanonicalDraftValidationError("Nové Lost/Found hlásenie nemá platný typ LOST/FOUND.");
  }
  return type;
}

function searchText(values: unknown[]) {
  return values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => textValue(value).toLowerCase())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function insertCanonicalRow(
  database: CanonicalDraftDatabase,
  table: string,
  values: Record<string, unknown>,
) {
  const entries = Object.entries(values);
  const columns = entries.map(([column]) => column);
  const row = await database.prepare(
    `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) RETURNING id`,
  ).bind(...entries.map(([, value]) => value)).first<{ id: number }>();
  if (!row?.id) throw new Error("canonical_draft_create_failed");
  return Number(row.id);
}

export async function createCanonicalDraft(
  input: CanonicalDraftInput,
  options: { actor: string; createdAt: string },
  database: CanonicalDraftDatabase,
) {
  const p = input.data;
  const at = options.createdAt;
  const actor = options.actor;

  if (input.entityType === "EVENT") {
    const title = textValue(p.title);
    const startDate = textValue(p.startDate ?? p.start_date);
    if (!title || !startDate) throw new CanonicalDraftValidationError("Nový koncept podujatia potrebuje názov a dátum začiatku.");
    const after = {
      slug: canonicalDraftSlug(p.slug, title + "-" + startDate, input.slugSuffix),
      title,
      excerpt: textValue(p.excerpt),
      eventType: textValue(p.eventType ?? p.event_type),
      status: "draft",
      startDate,
      startTime: textValue(p.startTime ?? p.start_time),
      endDate: nullableText(p.endDate ?? p.end_date),
      endTime: nullableText(p.endTime ?? p.end_time),
      venue: textValue(p.venue),
      city: textValue(p.city),
      region: textValue(p.region),
      address: textValue(p.address),
      organizer: textValue(p.organizer),
      description: textValue(p.description),
      practicalInfo: textValue(p.practicalInfo),
      websiteUrl: nullableText(p.websiteUrl ?? p.website_url ?? input.externalSourceUrl),
      registrationUrl: nullableText(p.registrationUrl ?? p.registration_url),
      imageUrl: nullableText(p.imageUrl ?? p.image_url),
      cancelled: Boolean(p.cancelled),
    };
    const canonicalEntityId = await insertCanonicalRow(database, "managed_events", {
      slug: after.slug,
      title: after.title,
      excerpt: after.excerpt,
      event_type: after.eventType,
      status: "draft",
      start_date: after.startDate,
      start_time: after.startTime,
      end_date: after.endDate,
      end_time: after.endTime,
      venue: after.venue,
      city: after.city,
      region: after.region,
      address: after.address,
      organizer: after.organizer,
      description: after.description,
      practical_info: after.practicalInfo,
      website_url: after.websiteUrl,
      registration_url: after.registrationUrl,
      image_url: after.imageUrl,
      cancelled: after.cancelled ? 1 : 0,
      created_at: at,
      updated_at: at,
      published_at: null,
      created_by: actor,
      updated_by: actor,
    });
    return { canonicalEntityId, after };
  }

  if (input.entityType === "ORGANIZATION") {
    const name = textValue(p.name);
    if (!name) throw new CanonicalDraftValidationError("Nový koncept organizácie potrebuje názov.");
    const sourceData: Record<string, unknown> = {};
    for (const key of ["operatorName", "sourceApprovalNumber", "sourceActivity"]) {
      if (Object.prototype.hasOwnProperty.call(p, key)) sourceData[key] = p[key];
    }
    const after = {
      name,
      slug: canonicalDraftSlug(p.slug, name, input.slugSuffix),
      legalName: textValue(p.legalName ?? p.legal_name),
      registrationNumber: nullableText(p.registrationNumber ?? p.registration_number),
      type: validOrganizationType(p.type),
      status: "DRAFT",
      shortDescription: textValue(p.shortDescription ?? p.short_description),
      description: textValue(p.description),
      publicEmail: nullableText(p.publicEmail ?? p.public_email),
      publicPhone: nullableText(p.publicPhone ?? p.public_phone),
      websiteUrl: nullableText(p.websiteUrl ?? p.website_url),
      facebookUrl: nullableText(p.facebookUrl ?? p.facebook_url),
      instagramUrl: nullableText(p.instagramUrl ?? p.instagram_url),
      imageUrl: nullableText(p.imageUrl ?? p.image_url),
      address: textValue(p.address),
      city: textValue(p.city),
      district: textValue(p.district),
      region: textValue(p.region),
      countryCode: textValue(p.countryCode ?? p.country_code),
      importKey: nullableText(p.importKey ?? p.import_key),
      sourceUrl: nullableText(p.sourceUrl ?? p.source_url ?? input.externalSourceUrl),
      sourceData,
      lastVerifiedAt: nullableText(p.lastVerifiedAt ?? p.last_verified_at),
    };
    const canonicalEntityId = await insertCanonicalRow(database, "help_organizations", {
      name: after.name,
      slug: after.slug,
      legal_name: after.legalName,
      registration_number: after.registrationNumber,
      type: after.type,
      status: "DRAFT",
      short_description: after.shortDescription,
      description: after.description,
      public_email: after.publicEmail,
      public_phone: after.publicPhone,
      website_url: after.websiteUrl,
      facebook_url: after.facebookUrl,
      instagram_url: after.instagramUrl,
      image_url: after.imageUrl,
      image_key: null,
      address: after.address,
      city: after.city,
      district: after.district,
      region: after.region,
      country_code: after.countryCode,
      import_key: after.importKey,
      source_url: after.sourceUrl,
      source_data_json: JSON.stringify(after.sourceData),
      published_at: null,
      last_verified_at: after.lastVerifiedAt,
      archived_at: null,
      created_at: at,
      updated_at: at,
      created_by: actor,
      updated_by: actor,
    });
    return { canonicalEntityId, after };
  }

  if (input.entityType === "DIRECTORY") {
    const name = textValue(p.name);
    const category = textValue(p.category);
    if (!name || !category) throw new CanonicalDraftValidationError("Nový koncept adresára potrebuje názov a kategóriu.");
    const after = {
      slug: canonicalDraftSlug(p.slug, name, input.slugSuffix),
      name,
      category,
      status: "draft",
      excerpt: textValue(p.excerpt),
      description: textValue(p.description),
      services: Array.isArray(p.services) ? p.services : [],
      qualifications: Array.isArray(p.qualifications) ? p.qualifications : [],
      city: textValue(p.city),
      district: textValue(p.district),
      region: textValue(p.region),
      address: textValue(p.address),
      online: Boolean(p.online),
      priceNote: textValue(p.priceNote ?? p.price_note),
      websiteUrl: nullableText(p.websiteUrl ?? p.website_url),
      importKey: nullableText(p.importKey ?? p.import_key),
      verified: Boolean(p.verified),
    };
    const canonicalEntityId = await insertCanonicalRow(database, "directory_profiles", {
      slug: after.slug,
      name: after.name,
      category: after.category,
      status: "draft",
      excerpt: after.excerpt,
      description: after.description,
      services_json: JSON.stringify(after.services),
      qualifications_json: JSON.stringify(after.qualifications),
      city: after.city,
      region: after.region,
      address: after.address,
      online: after.online ? 1 : 0,
      price_note: after.priceNote,
      website_url: after.websiteUrl,
      import_key: after.importKey,
      source_data_json: "{}",
      verified: after.verified ? 1 : 0,
      featured: 0,
      district: after.district,
      search_text: searchText([after.name, after.category, after.city, after.district, after.region]),
      created_at: at,
      updated_at: at,
      published_at: null,
      created_by: actor,
      updated_by: actor,
    });
    return { canonicalEntityId, after };
  }

  if (input.entityType === "ADOPTION") {
    const name = textValue(p.name);
    if (!name) throw new CanonicalDraftValidationError("Nový koncept adopcie potrebuje meno psa.");
    const after = {
      name,
      slug: canonicalDraftSlug(p.slug, name, input.slugSuffix),
      status: "DRAFT",
      sex: textValue(p.sex) || "UNKNOWN",
      birthDate: nullableText(p.birthDate ?? p.birth_date),
      approximateAgeMonths: p.approximateAgeMonths ?? p.approximate_age_months ?? null,
      size: textValue(p.size) || "UNKNOWN",
      weight: p.weight ?? null,
      breedName: textValue(p.breedName ?? p.breed_name),
      breedMix: Boolean(p.breedMix ?? p.breed_mix),
      color: textValue(p.color),
      region: textValue(p.region),
      district: textValue(p.district),
      city: textValue(p.city),
      organizationName: textValue(p.organizationName ?? p.organization),
      shortDescription: textValue(p.shortDescription ?? p.short_description),
      description: textValue(p.description),
      externalSourceUrl: nullableText(p.externalSourceUrl ?? p.external_source_url ?? input.externalSourceUrl),
      lastVerifiedAt: nullableText(p.lastVerifiedAt ?? p.last_verified_at),
    };
    const canonicalEntityId = await insertCanonicalRow(database, "adoption_dogs", {
      name: after.name,
      slug: after.slug,
      status: "DRAFT",
      sex: after.sex,
      birth_date: after.birthDate,
      approximate_age_months: after.approximateAgeMonths === null || after.approximateAgeMonths === "" ? null : Number(after.approximateAgeMonths),
      size: after.size,
      weight: after.weight === null || after.weight === "" ? null : Number(after.weight),
      breed_name: after.breedName,
      breed_mix: after.breedMix ? 1 : 0,
      color: after.color,
      region: after.region,
      district: after.district,
      city: after.city,
      organization_name: after.organizationName,
      short_description: after.shortDescription,
      description: after.description,
      external_source_url: after.externalSourceUrl,
      search_text: searchText([after.name, after.breedName, after.organizationName, after.city, after.region]),
      published_at: null,
      last_verified_at: after.lastVerifiedAt,
      created_at: at,
      updated_at: at,
      created_by: actor,
      updated_by: actor,
    });
    return { canonicalEntityId, after };
  }

  if (input.entityType === "LOST_FOUND") {
    const type = validLostFoundType(p.type);
    const dogName = nullableText(p.dogName ?? p.name);
    const city = textValue(p.city);
    const eventDate = textValue(p.eventDate ?? p.event_date);
    const fallbackSlug = (type === "LOST" ? "strateny" : "najdeny") + "-" + (dogName || city || "pes") + "-" + (eventDate || "koncept");
    const after = {
      type,
      status: "DRAFT",
      slug: canonicalDraftSlug(p.slug, fallbackSlug, input.slugSuffix),
      dogName,
      sex: textValue(p.sex) || "UNKNOWN",
      breed: textValue(p.breed),
      color: textValue(p.color),
      approximateAge: textValue(p.approximateAge ?? p.approximate_age),
      size: textValue(p.size) || "UNKNOWN",
      description: textValue(p.description),
      eventDate,
      region: textValue(p.region),
      district: textValue(p.district),
      city,
      locationDescription: textValue(p.locationDescription ?? p.location_description),
      source: textValue(p.source),
      sourceUrl: nullableText(p.sourceUrl ?? p.source_url ?? input.externalSourceUrl),
    };
    const canonicalEntityId = await insertCanonicalRow(database, "lost_found_dog_reports", {
      type: after.type,
      status: "DRAFT",
      slug: after.slug,
      dog_name: after.dogName,
      sex: after.sex,
      breed: after.breed,
      color: after.color,
      approximate_age: after.approximateAge,
      size: after.size,
      description: after.description,
      event_date: after.eventDate,
      region: after.region,
      district: after.district,
      city: after.city,
      location_description: after.locationDescription,
      source: after.source,
      source_url: after.sourceUrl,
      search_text: searchText([after.type, after.dogName, after.breed, after.color, after.description, after.region, after.district, after.city]),
      created_at: at,
      updated_at: at,
      published_at: null,
    });
    return { canonicalEntityId, after };
  }

  const isFoster = input.entityType === "FOSTER";
  const title = textValue(p.title ?? p.name ?? p.dogName);
  const category = isFoster ? "docasna-opatera" : textValue(p.category);
  if (!title || !category) throw new CanonicalDraftValidationError("Nový koncept Pomoc psom potrebuje názov a kategóriu.");
  const after = {
    slug: canonicalDraftSlug(p.slug, title, input.slugSuffix),
    title,
    category,
    status: "draft",
    excerpt: textValue(p.excerpt),
    description: textValue(p.description),
    organization: textValue(p.organization ?? p.organizationName),
    dogName: textValue(p.dogName ?? p.name),
    breed: textValue(p.breed),
    ageNote: textValue(p.ageNote ?? p.age_note),
    city: textValue(p.city),
    region: textValue(p.region),
    locationNote: textValue(p.locationNote ?? p.location_note),
    reportedDate: nullableText(p.reportedDate ?? p.reported_date),
    deadlineDate: nullableText(p.deadlineDate ?? p.deadline_date),
    actionLabel: textValue(p.actionLabel),
    actionUrl: nullableText(p.actionUrl ?? p.action_url ?? input.externalSourceUrl),
    contactNote: textValue(p.contactNote ?? p.contact_note),
    goalAmount: p.goalAmount ?? p.goal_amount ?? null,
    raisedAmount: p.raisedAmount ?? p.raised_amount ?? null,
    verified: Boolean(p.verified),
    urgent: Boolean(p.urgent),
    resolved: Boolean(p.resolved),
  };
  const canonicalEntityId = await insertCanonicalRow(database, "help_cases", {
    slug: after.slug,
    title: after.title,
    category: after.category,
    status: "draft",
    excerpt: after.excerpt,
    description: after.description,
    organization: after.organization,
    dog_name: after.dogName,
    breed: after.breed,
    age_note: after.ageNote,
    city: after.city,
    region: after.region,
    location_note: after.locationNote,
    reported_date: after.reportedDate,
    deadline_date: after.deadlineDate,
    action_label: after.actionLabel,
    action_url: after.actionUrl,
    contact_note: after.contactNote,
    goal_amount: after.goalAmount === null || after.goalAmount === "" ? null : Number(after.goalAmount),
    raised_amount: after.raisedAmount === null || after.raisedAmount === "" ? null : Number(after.raisedAmount),
    verified: after.verified ? 1 : 0,
    urgent: after.urgent ? 1 : 0,
    resolved: after.resolved ? 1 : 0,
    created_at: at,
    updated_at: at,
    published_at: null,
    created_by: actor,
    updated_by: actor,
  });
  return { canonicalEntityId, after };
}
