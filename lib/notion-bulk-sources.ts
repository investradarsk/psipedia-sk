import { readDirectoryPublicContacts } from "./directory-profile-metadata.ts";
import type { EditableSeo } from "./content-seo.ts";
import type { CanonicalSourceRecord, ReconciliationValue } from "./notion-bulk-reconciliation.ts";
import { notionSeoSourceProperties } from "./notion-seo-contract.ts";

const SITE_URL = "https://psipedia.sk";

function s(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function n(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function b(value: unknown) {
  return value === true || value === 1 || value === "1";
}

function date(value: unknown) {
  const clean = s(value);
  return clean && Number.isFinite(Date.parse(clean)) ? clean : "";
}

function asset(value: unknown) {
  const clean = s(value);
  return clean.startsWith("/") ? `${SITE_URL}${clean}` : clean;
}

function jsonObject(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function importData(value: unknown) {
  const parsed = jsonObject(value);
  if (!parsed) return null;
  return Object.fromEntries(Object.entries(parsed).filter(([, item]) => (
    item === null || typeof item === "string" || typeof item === "number"
  ))) as Record<string, string | number | null>;
}

function list(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [] as string[];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(s).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function directoryStatus(value: unknown) {
  const clean = s(value).toLowerCase();
  if (clean === "published") return "Publikované";
  if (clean === "archived") return "Archív";
  return "Koncept";
}

function editorialStatus(value: unknown) {
  const clean = s(value).toUpperCase();
  if (clean === "PUBLISHED" || clean === "ACTIVE") return "Publikované";
  if (clean === "RESERVED") return "Rezervované";
  if (clean === "ARCHIVED" || clean === "ADOPTED") return "Archív";
  if (s(value).toLowerCase() === "published") return "Publikované";
  return "Nápad";
}

function source(
  id: unknown,
  title: unknown,
  url: string,
  properties: Record<string, ReconciliationValue>,
  systemOwned: string[] = [],
): CanonicalSourceRecord {
  return {
    id: String(id),
    title: s(title) || `Psipedia #${String(id)}`,
    url,
    properties,
    ownership: Object.fromEntries(systemOwned.map((name) => [name, "system" as const])),
  };
}

async function rows(database: D1Database, sql: string) {
  const result = await database.prepare(sql).all<Record<string, unknown>>();
  return result.results ?? [];
}

export async function loadNotionBulkServices(database: D1Database) {
  const sourceRows = await rows(database, `SELECT id,slug,name,category,status,excerpt,description,services_json,qualifications_json,
    city,district,region,address,postal_code,street,house_number,address_format,service_address_confirmation,price_note,
    website_url,internal_email,image_url,image_key,source_data_json,verified,featured,created_at,updated_at,published_at,archived_at,seo_json
    FROM directory_profiles ORDER BY id ASC`);

  return sourceRows.map((row) => {
    const contacts = readDirectoryPublicContacts(importData(row.source_data_json), s(row.website_url));
    const seo = jsonObject(row.seo_json) ?? {};
    const url = `${SITE_URL}/adresar/${s(row.category)}/${s(row.slug)}`;
    return source(row.id, row.name, url, {
      "Názov": s(row.name),
      "Slug": s(row.slug),
      "Kategória": s(row.category),
      "Psipedia stav": directoryStatus(row.status),
      "Perex": s(row.excerpt),
      "Popis": s(row.description),
      "Služby": list(row.services_json).join("\n"),
      "Kvalifikácie": list(row.qualifications_json).join("\n"),
      "Kraj": s(row.region),
      "Okres": s(row.district),
      "Mesto": s(row.city),
      "Adresa": s(row.address),
      "PSČ": s(row.postal_code),
      "Ulica": s(row.street),
      "Číslo domu": s(row.house_number),
      "Formát adresy": s(row.address_format),
      "Potvrdená prevádzka": s(row.service_address_confirmation) === "CONFIRMED_SERVICE_LOCATION",
      "Cena / poznámka": s(row.price_note),
      "Web": s(contacts.website),
      "Telefón": s(contacts.phone),
      "E-mail": s(contacts.email),
      "Facebook": s(contacts.facebook),
      "Instagram": s(contacts.instagram),
      "Interný e-mail": s(row.internal_email),
      "Obrázok Psipedia": asset(row.image_url),
      "Obrázok key": s(row.image_key),
      "Overené": b(row.verified),
      "Odporúčané": b(row.featured),
      "SEO title": s(seo.title),
      "SEO popis": s(seo.description),
      "SEO kľúčové slovo": s(seo.focusKeyword),
      "Canonical URL": s(seo.canonicalUrl),
      "OG title": s(seo.ogTitle),
      "OG popis": s(seo.ogDescription),
      "OG obrázok": asset(seo.ogImage),
      "Noindex": seo.noindex === true,
      "Vytvorené Psipedia": date(row.created_at),
      "Aktualizované Psipedia": date(row.updated_at),
      "Publikované Psipedia": date(row.published_at),
      "Archivované Psipedia": date(row.archived_at),
    }, [
      "Slug", "Kategória", "Psipedia stav", "Vytvorené Psipedia",
      "Aktualizované Psipedia", "Publikované Psipedia", "Archivované Psipedia",
    ]);
  });
}

export async function loadNotionBulkEvents(database: D1Database) {
  const sourceRows = await rows(database, `SELECT id,slug,title,excerpt,event_type,status,start_date,start_time,end_date,end_time,venue,city,region,address,
    organizer,description,practical_info,website_url,registration_url,image_url,cancelled,seo_json
    FROM managed_events ORDER BY id ASC`);

  return sourceRows.map((row) => {
    const seo = (jsonObject(row.seo_json) ?? {}) as EditableSeo;
    const url = `${SITE_URL}/podujatia/${s(row.slug)}`;
    return source(row.id, row.title, url, {
      "Názov": s(row.title),
      "Slug": s(row.slug),
      "Stav": editorialStatus(row.status),
      "Typ podujatia": s(row.event_type),
      "Začiatok": date(row.start_date),
      "Čas začiatku": s(row.start_time),
      "Koniec": date(row.end_date),
      "Čas konca": s(row.end_time),
      "Miesto": s(row.venue),
      "Mesto": s(row.city),
      "Kraj": s(row.region),
      "Adresa": s(row.address),
      "Organizátor": s(row.organizer),
      "Perex": s(row.excerpt),
      "Popis": s(row.description),
      "Praktické info": s(row.practical_info),
      "Web": s(row.website_url),
      "Registrácia": s(row.registration_url),
      "Hlavný obrázok URL": asset(row.image_url),
      "Zrušené": b(row.cancelled),
      ...notionSeoSourceProperties("events", seo, asset(seo.ogImage)),
    }, ["Slug"]);
  });
}

export async function loadNotionBulkOrganizations(database: D1Database) {
  const sourceRows = await rows(database, `SELECT o.id,o.name,o.slug,o.legal_name,o.registration_number,o.type,o.status,o.short_description,o.description,
    o.website_url,o.facebook_url,o.instagram_url,
    COALESCE(NULLIF((SELECT l.city FROM organization_locations l WHERE l.organization_id=o.id ORDER BY l.is_primary DESC,l.sort_order ASC,l.id ASC LIMIT 1),''),o.city) AS city,
    COALESCE(NULLIF((SELECT l.district FROM organization_locations l WHERE l.organization_id=o.id ORDER BY l.is_primary DESC,l.sort_order ASC,l.id ASC LIMIT 1),''),o.district) AS district,
    COALESCE(NULLIF((SELECT l.region FROM organization_locations l WHERE l.organization_id=o.id ORDER BY l.is_primary DESC,l.sort_order ASC,l.id ASC LIMIT 1),''),o.region) AS region,
    o.image_url,o.source_url
    FROM help_organizations o ORDER BY o.id ASC`);

  return sourceRows.map((row) => {
    const url = `${SITE_URL}/organizacie/${s(row.slug)}`;
    return source(row.id, row.name, url, {
      "Názov": s(row.name),
      "Slug": s(row.slug),
      "Stav": editorialStatus(row.status),
      "Typ": s(row.type),
      "Právny názov": s(row.legal_name),
      "IČO / registračné číslo": s(row.registration_number),
      "Krátky popis": s(row.short_description),
      "Popis": s(row.description),
      "Web": s(row.website_url),
      "Facebook": s(row.facebook_url),
      "Instagram": s(row.instagram_url),
      "Mesto": s(row.city),
      "Okres": s(row.district),
      "Kraj": s(row.region),
      "Hlavný obrázok URL": asset(row.image_url),
      "Zdroj dát": s(row.source_url),
    }, ["Slug"]);
  });
}

export async function loadNotionBulkAdoptions(database: D1Database) {
  const sourceRows = await rows(database, `SELECT id,name,slug,status,sex,birth_date,approximate_age_months,size,weight,breed_name,breed_mix,color,
    region,district,city,organization_name,main_image,short_description,description,temperament,activity_level,health_notes,special_needs,
    external_source_url FROM adoption_dogs ORDER BY id ASC`);

  return sourceRows.map((row) => {
    const url = `${SITE_URL}/pomoc-psom/adopcia/${s(row.slug)}`;
    return source(row.id, row.name, url, {
      "Meno": s(row.name),
      "Slug": s(row.slug),
      "Stav": editorialStatus(row.status),
      "Dátum narodenia": date(row.birth_date),
      "Vek mesiace": n(row.approximate_age_months),
      "Pohlavie": s(row.sex),
      "Veľkosť": s(row.size),
      "Hmotnosť": n(row.weight),
      "Plemeno": s(row.breed_name),
      "Kríženec": b(row.breed_mix),
      "Farba": s(row.color),
      "Mesto": s(row.city),
      "Okres": s(row.district),
      "Kraj": s(row.region),
      "Organizácia": s(row.organization_name),
      "Krátky popis": s(row.short_description),
      "Popis": s(row.description),
      "Povaha": s(row.temperament),
      "Aktivita": s(row.activity_level),
      "Zdravotné poznámky": s(row.health_notes),
      "Špeciálne potreby": s(row.special_needs),
      "Hlavný obrázok URL": asset(row.main_image),
      "Zdroj dát": s(row.external_source_url),
    }, ["Slug"]);
  });
}

export async function loadNotionBulkHelpCases(database: D1Database) {
  const sourceRows = await rows(database, `SELECT id,slug,title,category,status,excerpt,description,organization,dog_name,breed,age_note,city,region,
    location_note,reported_date,deadline_date,action_label,action_url,contact_note,goal_amount,raised_amount,image_url,urgent,resolved,
    created_at,updated_at,published_at,seo_json FROM help_cases ORDER BY id ASC`);

  return sourceRows.map((row) => {
    const category = s(row.category);
    const seo = (jsonObject(row.seo_json) ?? {}) as EditableSeo;
    const url = `${SITE_URL}/pomoc-psom/${category}/${s(row.slug)}`;
    return source(row.id, row.title, url, {
      "Názov": s(row.title),
      "Slug": s(row.slug),
      "Kategória": category,
      "Psipedia stav": s(row.status),
      "Perex": s(row.excerpt),
      "Popis": s(row.description),
      "Organizácia": s(row.organization),
      "Pes": s(row.dog_name),
      "Plemeno": s(row.breed),
      "Vek": s(row.age_note),
      "Mesto": s(row.city),
      "Kraj": s(row.region),
      "Miesto": s(row.location_note),
      "Dátum hlásenia": date(row.reported_date),
      "Deadline": date(row.deadline_date),
      "CTA text": s(row.action_label),
      "CTA URL": s(row.action_url),
      "Kontakt": s(row.contact_note),
      "Cieľ": n(row.goal_amount),
      "Vyzbierané": n(row.raised_amount),
      "Obrázok": asset(row.image_url),
      "Urgentné": b(row.urgent),
      "Vyriešené": b(row.resolved),
      ...notionSeoSourceProperties("help-cases", seo, asset(seo.ogImage)),
      "Vytvorené": date(row.created_at),
      "Aktualizované": date(row.updated_at),
      "Publikované": date(row.published_at),
    }, ["Slug", "Kategória", "Psipedia stav", "Vytvorené", "Aktualizované", "Publikované"]);
  });
}

export async function loadNotionBulkLostFound(database: D1Database) {
  const sourceRows = await rows(database, `SELECT id,type,status,slug,dog_name,sex,breed,color,approximate_age,size,description,distinguishing_marks,
    collar_description,chipped,main_image,event_date,last_seen_date_time,region,district,city,location_description,public_latitude,public_longitude,
    public_location_precision,public_contact_note,source,source_url,updated_at,published_at,expires_at,resolved_at,duplicate_of_id,duplicate_reason
    FROM lost_found_dog_reports ORDER BY id ASC`);

  return sourceRows.map((row) => {
    const type = s(row.type);
    const base = type === "LOST" ? "stratene-psy" : "najdene-psy";
    const url = `${SITE_URL}/pomoc-psom/${base}/${s(row.slug)}`;
    const title = [type === "LOST" ? "Stratený" : "Nájdený", s(row.dog_name) || s(row.breed) || "pes", s(row.city)].filter(Boolean).join(" – ");
    return source(row.id, title, url, {
      "Názov": title,
      "Slug": s(row.slug),
      "Typ": type,
      "Psipedia stav": s(row.status),
      "Meno psa": s(row.dog_name),
      "Pohlavie": s(row.sex),
      "Plemeno": s(row.breed),
      "Farba": s(row.color),
      "Vek": s(row.approximate_age),
      "Veľkosť": s(row.size),
      "Popis": s(row.description),
      "Rozlišovacie znaky": s(row.distinguishing_marks),
      "Obojok": s(row.collar_description),
      "Čip": s(row.chipped),
      "Hlavný obrázok": asset(row.main_image),
      "Dátum udalosti": date(row.event_date),
      "Naposledy videný": date(row.last_seen_date_time),
      "Kraj": s(row.region),
      "Okres": s(row.district),
      "Mesto": s(row.city),
      "Miesto": s(row.location_description),
      "Latitude": n(row.public_latitude),
      "Longitude": n(row.public_longitude),
      "Presnosť lokality": s(row.public_location_precision),
      "Verejný kontakt": s(row.public_contact_note),
      "Zdroj": s(row.source),
      "Zdroj URL": s(row.source_url),
      "Aktualizované": date(row.updated_at),
      "Publikované": date(row.published_at),
      "Expirácia": date(row.expires_at),
      "Vyriešené": date(row.resolved_at),
      "Duplicate of": n(row.duplicate_of_id),
      "Duplicate dôvod": s(row.duplicate_reason),
    }, ["Slug", "Typ", "Psipedia stav", "Aktualizované", "Publikované", "Expirácia", "Vyriešené", "Duplicate of"]);
  });
}

export async function loadNotionBulkRelatedHelpCounts(database: D1Database) {
  const [locations, fundraising] = await Promise.all([
    database.prepare("SELECT COUNT(*) AS count FROM organization_locations").first<{ count: number }>(),
    database.prepare("SELECT COUNT(*) AS count FROM organization_fundraising_methods").first<{ count: number }>(),
  ]);
  return {
    organizationLocations: Number(locations?.count ?? 0),
    organizationFundraisingMethods: Number(fundraising?.count ?? 0),
  };
}
