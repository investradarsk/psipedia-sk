import {
  breedSeoFallback,
  directorySeoFallback,
  eventSeoFallback,
  helpSeoFallback,
} from "@/lib/content-seo";
import { eventTypePortalHref, eventTypes, type EventType } from "@/lib/events";
import { searchResultTitle } from "@/lib/seo";
import {
  parseSeoAuditJson,
  seoAuditText,
  seoStringsFromJson,
  type AdminSeoQualityEntity,
} from "@/lib/admin-seo-quality-rules";

type RawRow = Record<string, unknown>;

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function withImageContract(
  input: Omit<AdminSeoQualityEntity, "imageAlt"> & { imageAlt?: unknown },
): AdminSeoQualityEntity {
  return {
    ...input,
    imageAlt: seoAuditText(input.imageAlt),
  };
}

function directoryEntity(row: RawRow): AdminSeoQualityEntity {
  const seo = parseSeoAuditJson(row.seo_json);
  const name = seoAuditText(row.name);
  const slug = seoAuditText(row.slug);
  const category = seoAuditText(row.category);
  const city = seoAuditText(row.city);
  const fallback = directorySeoFallback(name, city, category);
  return withImageContract({
    agenda: "directory",
    id: num(row.id),
    title: name,
    slug,
    adminHref: `/admin/adresar/${num(row.id)}`,
    expectedCanonicalPath: `/adresar/${category}/${slug}`,
    parentPath: category ? `/adresar/${category}` : null,
    excerpt: seoAuditText(row.excerpt),
    description: seoAuditText(row.description),
    uniqueContentParts: [
      seoAuditText(row.excerpt),
      seoAuditText(row.description),
      ...seoStringsFromJson(row.services_json),
      ...seoStringsFromJson(row.qualifications_json),
    ],
    imageUrl: seoAuditText(row.image_url),
    imageAlt: name ? `Fotografia služby ${name}` : "",
    imageAltMode: "derived-public",
    imageAltSource: "DirectoryProfileDetail: Fotografia služby {name}",
    city,
    cityRequired: num(row.online) !== 1,
    category,
    categoryRequired: true,
    customSeoSupported: true,
    customSeoTitle: seoAuditText(seo.title),
    customSeoDescription: seoAuditText(seo.description),
    customCanonical: seoAuditText(seo.canonicalUrl),
    noindex: Boolean(seo.noindex),
    resultTitle: seoAuditText(seo.title) || fallback.title,
    resultDescription: seoAuditText(seo.description) || fallback.description,
  });
}

function eventParentPath(eventType: string) {
  if (!(eventTypes as readonly string[]).includes(eventType)) return null;
  return eventTypePortalHref(eventType as EventType);
}

export function eventEntity(row: RawRow): AdminSeoQualityEntity {
  const seo = parseSeoAuditJson(row.seo_json);
  const title = seoAuditText(row.title);
  const slug = seoAuditText(row.slug);
  const eventType = seoAuditText(row.event_type);
  const city = seoAuditText(row.city);
  const fallback = eventSeoFallback(title, eventType, city);
  return withImageContract({
    agenda: "events",
    id: num(row.id),
    title,
    slug,
    adminHref: `/admin/podujatia/${num(row.id)}`,
    expectedCanonicalPath: `/podujatia/${slug}`,
    parentPath: eventParentPath(eventType),
    excerpt: seoAuditText(row.excerpt),
    description: seoAuditText(row.description),
    uniqueContentParts: [
      seoAuditText(row.excerpt),
      seoAuditText(row.description),
      seoAuditText(row.practical_info),
    ],
    imageUrl: seoAuditText(row.image_url),
    imageAlt: title,
    imageAltMode: "derived-public",
    imageAltSource: "EventDetail: event.title",
    city,
    cityRequired: true,
    category: eventType,
    categoryRequired: true,
    customSeoSupported: true,
    customSeoTitle: seoAuditText(seo.title),
    customSeoDescription: seoAuditText(seo.description),
    customCanonical: seoAuditText(seo.canonicalUrl),
    noindex: Boolean(seo.noindex),
    resultTitle: seoAuditText(seo.title) || fallback.title,
    resultDescription: seoAuditText(seo.description) || fallback.description,
  });
}

function helpEntity(row: RawRow): AdminSeoQualityEntity {
  const seo = parseSeoAuditJson(row.seo_json);
  const title = seoAuditText(row.title);
  const slug = seoAuditText(row.slug);
  const category = seoAuditText(row.category);
  const city = seoAuditText(row.city);
  const fallback = helpSeoFallback(title, category, city);
  const dogName = seoAuditText(row.dog_name);
  const publicImageAlt = dogName ? `${dogName} – ${title}` : title;
  return withImageContract({
    agenda: "help",
    id: num(row.id),
    title,
    slug,
    adminHref: `/admin/pomoc/${num(row.id)}`,
    expectedCanonicalPath: `/pomoc-psom/${category}/${slug}`,
    parentPath: category ? `/pomoc-psom/${category}` : null,
    excerpt: seoAuditText(row.excerpt),
    description: seoAuditText(row.description),
    uniqueContentParts: [
      seoAuditText(row.excerpt),
      seoAuditText(row.description),
      seoAuditText(row.location_note),
      seoAuditText(row.contact_note),
    ],
    imageUrl: seoAuditText(row.image_url),
    imageAlt: publicImageAlt,
    imageAltMode: "derived-public",
    imageAltSource: "HelpDetailShell: dogName ? dogName – title : title",
    city,
    cityRequired: true,
    category,
    categoryRequired: true,
    customSeoSupported: true,
    customSeoTitle: seoAuditText(seo.title),
    customSeoDescription: seoAuditText(seo.description),
    customCanonical: seoAuditText(seo.canonicalUrl),
    noindex: Boolean(seo.noindex),
    resultTitle: seoAuditText(seo.title) || fallback.title,
    resultDescription: seoAuditText(seo.description) || fallback.description,
  });
}

function lostFoundEntity(row: RawRow): AdminSeoQualityEntity {
  const type = seoAuditText(row.type);
  const lost = type === "LOST";
  const dogName = seoAuditText(row.dog_name);
  const breed = seoAuditText(row.breed);
  const city = seoAuditText(row.city);
  const slug = seoAuditText(row.slug);
  const subject = dogName || breed || "pes";
  const title = `${lost ? "Stratený" : "Nájdený"} ${subject}${city ? ` – ${city}` : ""}`;
  const basePath = lost ? "/pomoc-psom/stratene-psy" : type === "FOUND" ? "/pomoc-psom/najdene-psy" : "";
  const description = seoAuditText(row.description);
  const resultDescription = `${lost ? "Stratený pes" : "Nájdený pes"} · ${city}. ${description}`.slice(0, 158);
  return withImageContract({
    agenda: "help",
    id: num(row.id),
    title,
    slug,
    adminHref: `/admin/stratene-najdene/${num(row.id)}`,
    expectedCanonicalPath: basePath ? `${basePath}/${slug}` : "",
    parentPath: basePath || null,
    excerpt: "",
    description,
    uniqueContentParts: [
      description,
      seoAuditText(row.distinguishing_marks),
      seoAuditText(row.collar_description),
      seoAuditText(row.location_description),
      seoAuditText(row.public_contact_note),
    ],
    imageUrl: seoAuditText(row.main_image),
    imageAlt: dogName ? `${lost ? "Stratený" : "Nájdený"} pes ${dogName}` : (lost ? "Stratený pes" : "Nájdený pes"),
    imageAltMode: "derived-public",
    imageAltSource: "LostFoundDogDetail: dogName/type label",
    city,
    cityRequired: true,
    category: type,
    categoryRequired: true,
    customSeoSupported: false,
    customSeoTitle: null,
    customSeoDescription: null,
    customCanonical: "",
    noindex: false,
    resultTitle: title,
    resultDescription,
  });
}

function organizationEntity(row: RawRow): AdminSeoQualityEntity {
  const name = seoAuditText(row.name);
  const slug = seoAuditText(row.slug);
  const shortDescription = seoAuditText(row.short_description);
  const description = seoAuditText(row.description);
  return withImageContract({
    agenda: "organizations",
    id: num(row.id),
    title: name,
    slug,
    adminHref: `/admin/organizacie/${num(row.id)}`,
    expectedCanonicalPath: `/organizacie/${slug}`,
    parentPath: "/pomoc-psom/utulky",
    excerpt: shortDescription,
    description,
    uniqueContentParts: [shortDescription, description],
    imageUrl: seoAuditText(row.image_url),
    imageAlt: name,
    imageAltMode: "derived-public",
    imageAltSource: "buildOrganizationMetadata: organization.name",
    city: seoAuditText(row.resolved_city),
    cityRequired: true,
    category: seoAuditText(row.type),
    categoryRequired: true,
    customSeoSupported: false,
    customSeoTitle: null,
    customSeoDescription: null,
    customCanonical: "",
    noindex: false,
    resultTitle: name,
    resultDescription: shortDescription || description || `Verejný profil organizácie ${name} na Psipedia.sk.`,
  });
}

function adoptionEntity(row: RawRow): AdminSeoQualityEntity {
  const name = seoAuditText(row.name);
  const slug = seoAuditText(row.slug);
  const city = seoAuditText(row.city);
  const shortDescription = seoAuditText(row.short_description);
  const description = seoAuditText(row.description);
  return withImageContract({
    agenda: "adoptions",
    id: num(row.id),
    title: name,
    slug,
    adminHref: `/admin/adopcie/${num(row.id)}`,
    expectedCanonicalPath: `/pomoc-psom/adopcia/${slug}`,
    parentPath: "/pomoc-psom/adopcia",
    excerpt: shortDescription,
    description,
    uniqueContentParts: [
      shortDescription,
      description,
      seoAuditText(row.temperament),
      seoAuditText(row.health_notes),
      seoAuditText(row.adoption_requirements),
    ],
    imageUrl: seoAuditText(row.main_image),
    imageAlt: name ? `${name} – pes na adopciu` : "",
    imageAltMode: "derived-public",
    imageAltSource: "AdoptionDetail: name – pes na adopciu",
    city,
    cityRequired: true,
    category: "adopcia",
    categoryRequired: false,
    customSeoSupported: false,
    customSeoTitle: null,
    customSeoDescription: null,
    customCanonical: "",
    noindex: false,
    resultTitle: name ? `${name} – pes na adopciu` : "",
    resultDescription: shortDescription || (name ? `${name}${city ? ` hľadá nový domov v lokalite ${city}` : " hľadá nový domov"}.` : ""),
  });
}

function breedEntity(row: RawRow): AdminSeoQualityEntity {
  const seo = parseSeoAuditJson(row.seo_json);
  const name = seoAuditText(row.name);
  const slug = seoAuditText(row.slug);
  const fallback = breedSeoFallback(name);
  const editorialText = seoStringsFromJson(row.editorial_json);
  return withImageContract({
    agenda: "breeds",
    id: num(row.id),
    title: name,
    slug,
    adminHref: `/admin/plemena/${num(row.id)}`,
    expectedCanonicalPath: `/plemena/${slug}`,
    parentPath: "/plemena",
    excerpt: seoAuditText(row.intro),
    description: editorialText[0] || seoAuditText(row.intro),
    uniqueContentParts: [
      seoAuditText(row.intro),
      seoAuditText(row.character),
      seoAuditText(row.needs),
      seoAuditText(row.history),
      seoAuditText(row.exercise),
      seoAuditText(row.training),
      seoAuditText(row.health),
      ...editorialText,
    ],
    imageUrl: seoAuditText(row.image_url),
    imageAlt: name ? `${name} – profilová fotografia plemena` : "",
    imageAltMode: "derived-public",
    imageAltSource: "Breed profile hero: name – profilová fotografia plemena",
    cityRequired: false,
    categoryRequired: false,
    customSeoSupported: true,
    customSeoTitle: seoAuditText(seo.title),
    customSeoDescription: seoAuditText(seo.description),
    customCanonical: seoAuditText(seo.canonicalUrl),
    noindex: Boolean(seo.noindex),
    resultTitle: seoAuditText(seo.title) || fallback.title,
    resultDescription: seoAuditText(seo.description) || fallback.description,
  });
}

export function articleEntity(row: RawRow): AdminSeoQualityEntity {
  const title = seoAuditText(row.title);
  const slug = seoAuditText(row.slug);
  const portalSection = seoAuditText(row.portal_section) || "clanky";
  const excerpt = seoAuditText(row.excerpt);
  const intro = seoAuditText(row.intro);
  const customTitle = seoAuditText(row.seo_title);
  const customDescription = seoAuditText(row.meta_description);
  const expectedCanonicalPath = portalSection === "clanky"
    ? `/clanky/${slug}`
    : `/${portalSection}/${slug}`;
  return withImageContract({
    agenda: "articles",
    id: num(row.id),
    title,
    slug,
    adminHref: `/admin/clanky/${num(row.id)}`,
    expectedCanonicalPath,
    parentPath: portalSection === "clanky" ? "/clanky" : portalSection ? `/${portalSection}` : null,
    excerpt,
    description: intro,
    uniqueContentParts: [
      excerpt,
      intro,
      seoAuditText(row.takeaway),
      ...seoStringsFromJson(row.sections_json),
      ...seoStringsFromJson(row.blocks_json),
    ],
    imageUrl: seoAuditText(row.image_url),
    imageAlt: seoAuditText(row.image_alt),
    imageAltMode: "stored",
    imageAltSource: "managed_articles.image_alt",
    cityRequired: false,
    category: seoAuditText(row.category),
    categoryRequired: true,
    customSeoSupported: true,
    customSeoTitle: customTitle,
    customSeoDescription: customDescription,
    customCanonical: seoAuditText(row.canonical_url),
    noindex: num(row.noindex) === 1,
    resultTitle: customTitle || searchResultTitle(title),
    resultDescription: customDescription || excerpt,
  });
}

export async function loadPublishedSeoQualityEntities(database: D1Database): Promise<AdminSeoQualityEntity[]> {
  const now = new Date().toISOString();
  const entities: AdminSeoQualityEntity[] = [];

  const directory = await database.prepare(`
    SELECT id, slug, name, category, excerpt, description, services_json, qualifications_json,
      city, online, image_url, seo_json
    FROM directory_profiles
    WHERE status = 'published'
    ORDER BY id
  `).all<RawRow>();
  entities.push(...directory.results.map(directoryEntity));

  const events = await database.prepare(`
    SELECT id, slug, title, excerpt, event_type, city, description, practical_info, image_url, seo_json
    FROM managed_events
    WHERE status = 'published'
    ORDER BY id
  `).all<RawRow>();
  entities.push(...events.results.map(eventEntity));

  const help = await database.prepare(`
    SELECT id, slug, title, category, excerpt, description, dog_name, city, location_note, contact_note, image_url, seo_json
    FROM help_cases
    WHERE status = 'published' AND category NOT IN ('adopcia', 'utulky', 'stratene-a-najdene')
    ORDER BY id
  `).all<RawRow>();
  entities.push(...help.results.map(helpEntity));

  const lostFound = await database.prepare(`
    SELECT id, type, slug, dog_name, breed, description, distinguishing_marks, collar_description,
      main_image, city, location_description, public_contact_note
    FROM lost_found_dog_reports
    WHERE status = 'ACTIVE'
      AND published_at IS NOT NULL
      AND duplicate_of_id IS NULL
      AND (expires_at IS NULL OR expires_at > ?)
    ORDER BY id
  `).bind(now).all<RawRow>();
  entities.push(...lostFound.results.map(lostFoundEntity));

  const organizations = await database.prepare(`
    SELECT o.id, o.name, o.slug, o.type, o.short_description, o.description, o.image_url,
      COALESCE(
        NULLIF((SELECT l.city FROM organization_locations l
          WHERE l.organization_id = o.id
          ORDER BY l.is_primary DESC, l.sort_order ASC, l.id ASC LIMIT 1), ''),
        o.city
      ) AS resolved_city
    FROM help_organizations o
    WHERE o.status = 'PUBLISHED' AND o.published_at IS NOT NULL AND o.archived_at IS NULL
    ORDER BY o.id
  `).all<RawRow>();
  entities.push(...organizations.results.map(organizationEntity));

  const adoptions = await database.prepare(`
    SELECT id, name, slug, city, main_image, short_description, description, temperament,
      health_notes, adoption_requirements
    FROM adoption_dogs
    WHERE status IN ('ACTIVE', 'RESERVED')
    ORDER BY id
  `).all<RawRow>();
  entities.push(...adoptions.results.map(adoptionEntity));

  const breeds = await database.prepare(`
    SELECT id, slug, name, image_url, intro, character, needs, history, exercise, training, health,
      editorial_json, seo_json
    FROM managed_breeds
    WHERE status = 'published'
    ORDER BY id
  `).all<RawRow>();
  entities.push(...breeds.results.map(breedEntity));

  const articles = await database.prepare(`
    SELECT id, slug, title, excerpt, category, portal_section, intro, takeaway, sections_json, blocks_json,
      image_url, image_alt, seo_title, meta_description, canonical_url, noindex
    FROM managed_articles
    WHERE status = 'published' OR (status = 'scheduled' AND published_at <= ?)
    ORDER BY id
  `).bind(now).all<RawRow>();
  entities.push(...articles.results.map(articleEntity));

  return entities;
}
