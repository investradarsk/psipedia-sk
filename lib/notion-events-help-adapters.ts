import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";
import { mergeNotionSeo, notionSeoEditableFields } from "./notion-seo-contract.ts";
import { notionGeoMirrorProperties } from "./notion-geo-mirror.ts";
import {
  createManagedEvent,
  getManagedEventById,
  updateManagedEvent,
  type ManagedEventInput,
} from "./event-store.ts";
import {
  createOrganizationFromAdmin,
  updateOrganizationFromAdmin,
  changeOrganizationPublicationFromAdmin,
} from "./help-organization-admin-write.ts";
import { getOrganizationPublicationAdminById } from "./help-organization-admin-store.ts";
import {
  createOrganizationLocationFromAdmin,
  updateOrganizationLocationFromAdmin,
} from "./organization-location-admin-write.ts";
import { listOrganizationLocationsAdmin } from "./organization-location-admin-store.ts";
import {
  createAdoptionFromAdmin,
  updateAdoptionFromAdmin,
} from "./adoption-admin-write.ts";
import { getAdoptionById } from "./adoption-store.ts";
import type { ManagedAdoptionInput } from "./adoption.ts";
import {
  createManagedHelpCase,
  getManagedHelpCaseById,
  transitionManagedHelpCaseResolved,
  updateManagedHelpCase,
  type ManagedHelpCaseInput,
} from "./help-store.ts";
import {
  createAdminDogReport,
  getAdminDogReport,
  updateAdminDogReport,
  type ManagedDogReportInput,
} from "./lost-found-dog-store.ts";

export type BidirectionalAgendaKey =
  | "events"
  | "organizations"
  | "adoptions"
  | "help-cases"
  | "lost-found";

export const NOTION_EVENTS_HELP_SYSTEM_ACTOR = "notion-events-help-sync@psipedia.sk";
const SITE_URL = "https://psipedia.sk";

function s(value: ReconciliationValue | undefined) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function n(value: ReconciliationValue | undefined) {
  if (value === null || value === "" || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function b(value: ReconciliationValue | undefined) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function localAsset(value: ReconciliationValue | undefined) {
  const clean = s(value);
  return clean.startsWith(SITE_URL + "/") ? clean.slice(SITE_URL.length) : clean || null;
}

function imageKeyFor(existingUrl: string | null | undefined, existingKey: string | null | undefined, next: string | null) {
  const localizedExisting = existingUrl?.startsWith(SITE_URL + "/") ? existingUrl.slice(SITE_URL.length) : existingUrl ?? null;
  return localizedExisting === next ? existingKey ?? null : null;
}

export const agendaEditableFields: Record<BidirectionalAgendaKey, readonly string[]> = {
  events: [
    "Názov", "Slug", "Stav", "Typ podujatia", "Začiatok", "Čas začiatku", "Koniec", "Čas konca",
    "Miesto", "Mesto", "Kraj", "Adresa", "Organizátor", "Perex", "Popis", "Praktické info",
    "Web", "Registrácia", "Hlavný obrázok URL", "Zrušené", ...notionSeoEditableFields("events"),
  ],
  organizations: [
    "Názov", "Slug", "Stav", "Typ", "Právny názov", "IČO / registračné číslo",
    "Krátky popis", "Popis", "Web", "Facebook", "Instagram", "Mesto", "Okres", "Kraj",
    "Hlavný obrázok URL", "Zdroj dát",
  ],
  adoptions: [
    "Meno", "Slug", "Stav", "Dátum narodenia", "Vek mesiace", "Pohlavie", "Veľkosť", "Hmotnosť",
    "Plemeno", "Kríženec", "Farba", "Mesto", "Okres", "Kraj", "Organizácia",
    "Krátky popis", "Popis", "Povaha", "Aktivita", "Zdravotné poznámky",
    "Špeciálne potreby", "Hlavný obrázok URL", "Zdroj dát",
  ],
  "help-cases": [
    "Názov", "Slug", "Kategória", "Psipedia stav", "Perex", "Popis", "Organizácia", "Pes", "Plemeno",
    "Vek", "Mesto", "Kraj", "Miesto", "Dátum hlásenia", "Deadline", "CTA text", "CTA URL", "Kontakt",
    "Cieľ", "Vyzbierané", "Obrázok", "Urgentné", "Vyriešené", ...notionSeoEditableFields("help-cases"),
  ],
  "lost-found": [
    "Názov", "Slug", "Typ", "Psipedia stav", "Meno psa", "Pohlavie", "Plemeno", "Farba", "Vek",
    "Veľkosť", "Popis", "Rozlišovacie znaky", "Obojok", "Čip", "Hlavný obrázok", "Dátum udalosti",
    "Naposledy videný", "Kraj", "Okres", "Mesto", "Miesto", "Latitude", "Longitude",
    "Presnosť lokality", "Verejný kontakt", "Zdroj", "Zdroj URL",
  ],
};

export function eventStatusFromNotion(value: string) {
  if (value === "Publikované") return "published" as const;
  if (["Nápad", "Na kontrolu", "Ready", "Koncept", ""].includes(value)) return "draft" as const;
  throw new Error(`Nepodporovaný stav podujatia v Notione: ${value}`);
}

export function organizationStatusFromNotion(value: string) {
  if (value === "Publikované") return "PUBLISHED" as const;
  if (value === "Archív") return "ARCHIVED" as const;
  if (["Nápad", "Na kontrolu", "Ready", "Koncept", ""].includes(value)) return "DRAFT" as const;
  throw new Error(`Nepodporovaný stav organizácie v Notione: ${value}`);
}

export function adoptionStatusFromNotion(value: string, current?: string) {
  if (value === "Publikované") return "ACTIVE" as const;
  if (value === "Rezervované") return "RESERVED" as const;
  if (value === "Archív") return current === "ADOPTED" ? "ADOPTED" as const : "ARCHIVED" as const;
  if (["Nápad", "Na kontrolu", "Ready", "Koncept", ""].includes(value)) return "DRAFT" as const;
  throw new Error(`Nepodporovaný stav adopcie v Notione: ${value}`);
}

export function helpStatusFromNotion(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "published") return "published" as const;
  if (normalized === "draft" || !normalized) return "draft" as const;
  throw new Error(`Nepodporovaný stav prípadu Pomoc psom v Notione: ${value}`);
}

const LOST_FOUND_STATUSES = new Set(["DRAFT", "PENDING", "ACTIVE", "RESOLVED", "EXPIRED", "REJECTED", "ARCHIVED"]);
export function lostFoundStatusFromNotion(value: string) {
  const normalized = value.toUpperCase() || "DRAFT";
  if (!LOST_FOUND_STATUSES.has(normalized)) {
    throw new Error(`Nepodporovaný stav Lost/Found v Notione: ${value}`);
  }
  return normalized;
}

export function readyForCreate(agenda: BidirectionalAgendaKey, values: Record<string, ReconciliationValue>) {
  if (agenda === "events" || agenda === "organizations" || agenda === "adoptions") {
    return s(values["Stav"]) === "Ready";
  }
  if (agenda === "help-cases") {
    return Boolean(s(values["Názov"]) && s(values["Slug"]) && s(values["Kategória"]));
  }
  return Boolean(s(values["Názov"]) && s(values["Slug"]) && s(values["Typ"]));
}

function eventInput(
  values: Record<string, ReconciliationValue>,
  existing: Awaited<ReturnType<typeof getManagedEventById>> | null,
  forceDraft = false,
): ManagedEventInput {
  const imageUrl = localAsset(values["Hlavný obrázok URL"]);
  return {
    title: s(values["Názov"]),
    slug: s(values["Slug"]),
    status: forceDraft ? "draft" : eventStatusFromNotion(s(values["Stav"])),
    eventType: s(values["Typ podujatia"]),
    startDate: s(values["Začiatok"]),
    startTime: s(values["Čas začiatku"]),
    endDate: s(values["Koniec"]) || null,
    endTime: s(values["Čas konca"]) || null,
    venue: s(values["Miesto"]),
    city: s(values["Mesto"]),
    region: s(values["Kraj"]),
    address: s(values["Adresa"]),
    organizer: s(values["Organizátor"]),
    excerpt: s(values["Perex"]),
    description: s(values["Popis"]),
    practicalInfo: s(values["Praktické info"]),
    websiteUrl: s(values["Web"]) || null,
    registrationUrl: s(values["Registrácia"]) || null,
    imageUrl,
    imageKey: imageKeyFor(existing?.imageUrl, existing?.imageKey, imageUrl),
    cancelled: b(values["Zrušené"]),
    seo: mergeNotionSeo("events", values, existing?.seo),
  };
}

type ProtectedGeoTarget = "MANAGED_EVENT" | "ORGANIZATION_LOCATION";

/**
 * Google Places selection belongs to the Psipedia administrator. Editorial
 * edits in Notion must not invalidate its canonical location fingerprint.
 */
async function hasCurrentGooglePlace(
  database: D1Database,
  target: ProtectedGeoTarget,
  targetId: number,
) {
  const column = target === "MANAGED_EVENT" ? "managed_event_id" : "organization_location_id";
  const point = await database.prepare(`
    SELECT geocode_status AS geo_status, public_visibility AS geo_public_visibility,
      latitude AS geo_latitude, longitude AS geo_longitude,
      google_place_id AS geo_google_place_id,
      source_fingerprint AS geo_source_fingerprint,
      google_place_source_fingerprint AS geo_google_place_source_fingerprint
    FROM geo_points WHERE target_type=? AND ${column}=? LIMIT 1
  `).bind(target, targetId).first<Record<string, unknown>>();
  return point ? notionGeoMirrorProperties(point)["Google miesto aktuálne"] === true : false;
}

function canonicalOrganizationLocationForNotion<T extends { role: string; isPrimary: boolean; sortOrder: number; id: number }>(
  locations: T[],
) {
  return [...locations].sort((a, b) =>
    Number(b.role === "SITE") - Number(a.role === "SITE")
    || Number(b.isPrimary) - Number(a.isPrimary)
    || a.sortOrder - b.sortOrder || a.id - b.id
  )[0] ?? null;
}

async function assertOrganizationPlaceNotOverwritten(
  database: D1Database,
  organizationId: number,
  values: Record<string, ReconciliationValue>,
) {
  const locations = await listOrganizationLocationsAdmin(organizationId, database);
  const current = canonicalOrganizationLocationForNotion(locations);
  if (!current || !(await hasCurrentGooglePlace(database, "ORGANIZATION_LOCATION", current.id))) return;
  if (current.city !== s(values["Mesto"])
    || current.district !== s(values["Okres"])
    || current.region !== s(values["Kraj"])) {
    throw new Error("GOOGLE_PLACE_LOCATION_LOCKED: Zmena mesta/okresu/kraja v Notione by prepísala potvrdené Google Maps miesto. Uprav adresu v Psipedii.");
  }
}

async function organizationLocationFromNotion(
  database: D1Database,
  organizationId: number,
  values: Record<string, ReconciliationValue>,
) {
  const desired = {
    city: s(values["Mesto"]),
    district: s(values["Okres"]),
    region: s(values["Kraj"]),
  };
  const locations = await listOrganizationLocationsAdmin(organizationId, database);
  const current = canonicalOrganizationLocationForNotion(locations);
  if (!current) {
    if (!(desired.city || desired.district || desired.region)) return;
    await createOrganizationLocationFromAdmin(organizationId, {
      role: "UNSPECIFIED",
      label: "",
      address: "",
      ...desired,
      countryCode: "SK",
      isPrimary: true,
      sortOrder: 0,
    }, database);
    return;
  }
  if (
    current.city === desired.city
    && current.district === desired.district
    && current.region === desired.region
  ) return;
  await updateOrganizationLocationFromAdmin(organizationId, current.id, {
    role: current.role,
    label: current.label,
    address: current.address,
    ...desired,
    countryCode: current.countryCode || "SK",
    isPrimary: true,
    sortOrder: current.sortOrder,
  }, database);
}

function organizationPayload(
  values: Record<string, ReconciliationValue>,
  existing: Awaited<ReturnType<typeof getOrganizationPublicationAdminById>> | null,
) {
  const imageUrl = localAsset(values["Hlavný obrázok URL"]);
  return {
    name: s(values["Názov"]),
    slug: s(values["Slug"]),
    legalName: s(values["Právny názov"]),
    registrationNumber: s(values["IČO / registračné číslo"]) || null,
    type: s(values["Typ"]),
    shortDescription: s(values["Krátky popis"]),
    description: s(values["Popis"]),
    publicEmail: existing?.publicEmail ?? null,
    publicPhone: existing?.publicPhone ?? null,
    websiteUrl: s(values["Web"]) || null,
    facebookUrl: s(values["Facebook"]) || null,
    instagramUrl: s(values["Instagram"]) || null,
    imageUrl,
    imageKey: imageKeyFor(existing?.imageUrl, existing?.imageKey, imageUrl),
    sourceUrl: s(values["Zdroj dát"]) || null,
  };
}

async function reconcileOrganizationStatus(
  id: number,
  desired: "DRAFT" | "PUBLISHED" | "ARCHIVED",
  database: D1Database,
) {
  let current = await getOrganizationPublicationAdminById(id, database);
  if (!current) throw new Error("Organizácia po sync zápise neexistuje.");
  if (current.status === desired) return current;

  if (current.status === "ARCHIVED" && desired !== "ARCHIVED") {
    current = await changeOrganizationPublicationFromAdmin(
      id, "restore", NOTION_EVENTS_HELP_SYSTEM_ACTOR, current.updatedAt, database,
    );
    if (!current) throw new Error("Organizáciu sa nepodarilo obnoviť z archívu.");
  }

  if (desired === "ARCHIVED") {
    current = await getOrganizationPublicationAdminById(id, database);
    if (!current) throw new Error("Organizácia neexistuje.");
    if (current.status !== "ARCHIVED") {
      const archived = await changeOrganizationPublicationFromAdmin(
        id, "archive", NOTION_EVENTS_HELP_SYSTEM_ACTOR, current.updatedAt, database,
      );
      if (!archived) throw new Error("Organizáciu sa nepodarilo archivovať.");
      return archived;
    }
  }

  current = await getOrganizationPublicationAdminById(id, database);
  if (!current) throw new Error("Organizácia neexistuje.");
  if (desired === "PUBLISHED" && current.status === "DRAFT") {
    const published = await changeOrganizationPublicationFromAdmin(
      id, "publish", NOTION_EVENTS_HELP_SYSTEM_ACTOR, current.updatedAt, database,
    );
    if (!published) throw new Error("Organizáciu sa nepodarilo publikovať.");
    return published;
  }
  if (desired === "DRAFT" && current.status === "PUBLISHED") {
    const draft = await changeOrganizationPublicationFromAdmin(
      id, "unpublish", NOTION_EVENTS_HELP_SYSTEM_ACTOR, current.updatedAt, database,
    );
    if (!draft) throw new Error("Organizáciu sa nepodarilo vrátiť do konceptu.");
    return draft;
  }
  return current;
}

async function organizationIdByName(database: D1Database, name: string) {
  if (!name) return null;
  const rows = await database.prepare(
    "SELECT id FROM help_organizations WHERE lower(trim(name))=lower(trim(?)) AND archived_at IS NULL ORDER BY id ASC LIMIT 2",
  ).bind(name).all<{ id: number }>();
  if (rows.results.length > 1) throw new Error(`Organizácia „${name}“ nie je jednoznačná.`);
  return rows.results.length === 1 ? Number(rows.results[0].id) : null;
}

function adoptionPayload(
  values: Record<string, ReconciliationValue>,
  existing: Awaited<ReturnType<typeof getAdoptionById>> | null,
  organizationId: number | null,
  forceDraft = false,
): ManagedAdoptionInput {
  const breedName = s(values["Plemeno"]);
  const organizationName = s(values["Organizácia"]);
  const imageUrl = localAsset(values["Hlavný obrázok URL"]);
  return {
    name: s(values["Meno"]),
    slug: s(values["Slug"]),
    status: forceDraft ? "DRAFT" : adoptionStatusFromNotion(s(values["Stav"]), existing?.status),
    sex: s(values["Pohlavie"]),
    birthDate: s(values["Dátum narodenia"]) || null,
    approximateAgeMonths: n(values["Vek mesiace"]),
    size: s(values["Veľkosť"]),
    weight: n(values["Hmotnosť"]),
    breedId: existing && existing.breedName === breedName ? existing.breedId : null,
    breedName,
    breedMix: b(values["Kríženec"]),
    color: s(values["Farba"]),
    region: s(values["Kraj"]),
    district: s(values["Okres"]),
    city: s(values["Mesto"]),
    organizationId,
    organizationName,
    organizationSlug: existing && existing.organizationId === organizationId ? existing.organizationSlug : null,
    mainImage: imageUrl,
    shortDescription: s(values["Krátky popis"]),
    description: s(values["Popis"]),
    temperament: s(values["Povaha"]),
    activityLevel: s(values["Aktivita"]),
    healthNotes: s(values["Zdravotné poznámky"]),
    specialNeeds: s(values["Špeciálne potreby"]),
    externalSourceUrl: s(values["Zdroj dát"]) || null,
  };
}

function helpPayload(
  values: Record<string, ReconciliationValue>,
  existing: Awaited<ReturnType<typeof getManagedHelpCaseById>> | null,
  forceDraft = false,
): ManagedHelpCaseInput {
  const imageUrl = localAsset(values["Obrázok"]);
  return {
    slug: s(values["Slug"]),
    title: s(values["Názov"]),
    category: s(values["Kategória"]),
    status: forceDraft ? "draft" : helpStatusFromNotion(s(values["Psipedia stav"])),
    excerpt: s(values["Perex"]),
    description: s(values["Popis"]),
    organization: s(values["Organizácia"]),
    dogName: s(values["Pes"]),
    breed: s(values["Plemeno"]),
    ageNote: s(values["Vek"]),
    city: s(values["Mesto"]),
    region: s(values["Kraj"]),
    locationNote: s(values["Miesto"]),
    reportedDate: s(values["Dátum hlásenia"]) || null,
    deadlineDate: s(values["Deadline"]) || null,
    actionLabel: s(values["CTA text"]),
    actionUrl: s(values["CTA URL"]) || null,
    contactNote: s(values["Kontakt"]),
    goalAmount: n(values["Cieľ"]),
    raisedAmount: n(values["Vyzbierané"]),
    imageUrl,
    imageKey: imageKeyFor(existing?.imageUrl, existing?.imageKey, imageUrl),
    verified: existing?.verified ?? false,
    urgent: b(values["Urgentné"]),
    // Resolved has a dedicated optimistic-concurrency lifecycle transition.
    resolved: existing?.resolved ?? false,
    seo: mergeNotionSeo("help-cases", values, existing?.seo),
  };
}

function lostFoundPayload(
  values: Record<string, ReconciliationValue>,
  existing: Awaited<ReturnType<typeof getAdminDogReport>> | null,
  forceDraft = false,
): ManagedDogReportInput {
  const imageUrl = localAsset(values["Hlavný obrázok"]);
  const breed = s(values["Plemeno"]);
  return {
    type: s(values["Typ"]),
    status: forceDraft ? "DRAFT" : lostFoundStatusFromNotion(s(values["Psipedia stav"])),
    slug: s(values["Slug"]),
    dogName: s(values["Meno psa"]) || null,
    sex: s(values["Pohlavie"]),
    breedId: existing && existing.breed === breed ? existing.breedId : null,
    breed,
    breedUnknown: !breed,
    color: s(values["Farba"]),
    approximateAge: s(values["Vek"]),
    size: s(values["Veľkosť"]),
    description: s(values["Popis"]),
    distinguishingMarks: s(values["Rozlišovacie znaky"]),
    collarDescription: s(values["Obojok"]),
    chipped: s(values["Čip"]),
    mainImage: imageUrl,
    mainImageKey: imageKeyFor(existing?.mainImage, existing?.mainImageKey, imageUrl),
    gallery: existing?.gallery ?? [],
    eventDate: s(values["Dátum udalosti"]),
    lastSeenDateTime: s(values["Naposledy videný"]) || null,
    region: s(values["Kraj"]),
    district: s(values["Okres"]),
    city: s(values["Mesto"]),
    locationDescription: s(values["Miesto"]),
    publicLatitude: n(values["Latitude"]),
    publicLongitude: n(values["Longitude"]),
    publicLocationPrecision: s(values["Presnosť lokality"]),
    contactName: existing?.contactName ?? null,
    contactPhone: existing?.contactPhone ?? null,
    contactEmail: existing?.contactEmail ?? null,
    publicContactNote: s(values["Verejný kontakt"]),
    source: s(values["Zdroj"]),
    sourceUrl: s(values["Zdroj URL"]) || null,
    expiresAt: existing?.expiresAt ?? null,
    internalNote: existing?.internalNote ?? "",
  };
}

export async function canonicalUpdatedAt(
  agenda: BidirectionalAgendaKey,
  entityId: number,
  database: D1Database,
) {
  const table = ({
    events: "managed_events",
    organizations: "help_organizations",
    adoptions: "adoption_dogs",
    "help-cases": "help_cases",
    "lost-found": "lost_found_dog_reports",
  } as const)[agenda];
  const row = await database.prepare(`SELECT updated_at FROM ${table} WHERE id=? LIMIT 1`)
    .bind(entityId).first<{ updated_at: string }>();
  return row?.updated_at ?? null;
}

export async function createCanonicalFromNotion(
  agenda: BidirectionalAgendaKey,
  values: Record<string, ReconciliationValue>,
  database: D1Database,
) {
  if (!readyForCreate(agenda, values)) {
    throw new Error("Notion záznam nie je v stave pripravenom na vytvorenie canonical Psipedia záznamu.");
  }
  if (agenda === "events") {
    return createManagedEvent(eventInput(values, null, true), NOTION_EVENTS_HELP_SYSTEM_ACTOR);
  }
  if (agenda === "organizations") {
    const created = await createOrganizationFromAdmin(
      organizationPayload(values, null),
      NOTION_EVENTS_HELP_SYSTEM_ACTOR,
      database,
    );
    if (!created) throw new Error("Organizáciu sa nepodarilo vytvoriť.");
    await organizationLocationFromNotion(database, created.id, values);
    return created;
  }
  if (agenda === "adoptions") {
    const organizationId = await organizationIdByName(database, s(values["Organizácia"]));
    return createAdoptionFromAdmin(
      adoptionPayload(values, null, organizationId, true),
      NOTION_EVENTS_HELP_SYSTEM_ACTOR,
      database,
    );
  }
  if (agenda === "help-cases") {
    return createManagedHelpCase(
      helpPayload(values, null, true),
      NOTION_EVENTS_HELP_SYSTEM_ACTOR,
    );
  }
  return createAdminDogReport(
    lostFoundPayload(values, null, true),
    NOTION_EVENTS_HELP_SYSTEM_ACTOR,
  );
}

export async function applyNotionToCanonical(
  agenda: BidirectionalAgendaKey,
  entityId: number,
  values: Record<string, ReconciliationValue>,
  database: D1Database,
) {
  if (agenda === "events") {
    const existing = await getManagedEventById(entityId);
    if (!existing) throw new Error(`Podujatie #${entityId} neexistuje.`);
    const locationEdited = (
      s(values["Adresa"]) !== (existing.address ?? "")
      || s(values["Miesto"]) !== (existing.venue ?? "")
      || s(values["Mesto"]) !== (existing.city ?? "")
      || s(values["Kraj"]) !== (existing.region ?? "")
    );
    if (locationEdited && await hasCurrentGooglePlace(database, "MANAGED_EVENT", entityId)) {
      throw new Error("GOOGLE_PLACE_LOCATION_LOCKED: Potvrdenú adresu podujatia treba upraviť v Psipedii, nie cez Notion.");
    }
    const updated = await updateManagedEvent(
      entityId,
      eventInput(values, existing),
      NOTION_EVENTS_HELP_SYSTEM_ACTOR,
    );
    if (!updated) throw new Error(`Podujatie #${entityId} sa nepodarilo uložiť.`);
    return updated;
  }

  if (agenda === "organizations") {
    let existing = await getOrganizationPublicationAdminById(entityId, database);
    if (!existing) throw new Error(`Organizácia #${entityId} neexistuje.`);
    const desiredStatus = organizationStatusFromNotion(s(values["Stav"]));
    await assertOrganizationPlaceNotOverwritten(database, entityId, values);

    if (existing.status === "ARCHIVED" && desiredStatus !== "ARCHIVED") {
      const restored = await reconcileOrganizationStatus(entityId, "DRAFT", database);
      if (!restored) throw new Error("Organizáciu sa nepodarilo obnoviť.");
      existing = await getOrganizationPublicationAdminById(entityId, database);
      if (!existing) throw new Error("Organizácia po obnovení neexistuje.");
    }

    if (existing.status === "ARCHIVED" && desiredStatus === "ARCHIVED") {
      throw new Error("Archivovaná organizácia je iba na čítanie; najprv zmeň Stav mimo Archív.");
    }

    const updated = await updateOrganizationFromAdmin(
      entityId,
      organizationPayload(values, existing),
      NOTION_EVENTS_HELP_SYSTEM_ACTOR,
      existing.updatedAt,
      database,
    );
    if (!updated) throw new Error(`Organizácia #${entityId} sa nepodarila uložiť.`);
    await organizationLocationFromNotion(database, entityId, values);
    return reconcileOrganizationStatus(entityId, desiredStatus, database);
  }

  if (agenda === "adoptions") {
    const existing = await getAdoptionById(entityId, database);
    if (!existing) throw new Error(`Adopčný profil #${entityId} neexistuje.`);
    const organizationName = s(values["Organizácia"]);
    const organizationId = organizationName === existing.organizationName
      ? existing.organizationId
      : await organizationIdByName(database, organizationName);
    const updated = await updateAdoptionFromAdmin(
      entityId,
      adoptionPayload(values, existing, organizationId),
      NOTION_EVENTS_HELP_SYSTEM_ACTOR,
      existing.updatedAt,
      database,
    );
    if (!updated) throw new Error(`Adopčný profil #${entityId} sa nepodaril uložiť.`);
    return updated;
  }

  if (agenda === "help-cases") {
    const existing = await getManagedHelpCaseById(entityId);
    if (!existing) throw new Error(`Prípad Pomoc psom #${entityId} neexistuje.`);
    const desiredResolved = b(values["Vyriešené"]);
    const updated = await updateManagedHelpCase(
      entityId,
      helpPayload(values, existing),
      NOTION_EVENTS_HELP_SYSTEM_ACTOR,
      existing,
    );
    if (!updated) throw new Error(`Prípad Pomoc psom #${entityId} sa nepodaril uložiť.`);
    if (updated.resolved !== desiredResolved) {
      const transitioned = await transitionManagedHelpCaseResolved(
        entityId,
        desiredResolved,
        NOTION_EVENTS_HELP_SYSTEM_ACTOR,
        updated.updatedAt,
        database,
      );
      if (!transitioned) throw new Error("Resolved stav prípadu sa nepodarilo zmeniť.");
    }
    return getManagedHelpCaseById(entityId);
  }

  const existing = await getAdminDogReport(entityId);
  if (!existing) throw new Error(`Lost/Found hlásenie #${entityId} neexistuje.`);
  const updated = await updateAdminDogReport(
    entityId,
    lostFoundPayload(values, existing),
    NOTION_EVENTS_HELP_SYSTEM_ACTOR,
  );
  if (!updated) throw new Error(`Lost/Found hlásenie #${entityId} sa nepodarilo uložiť.`);
  return updated;
}
