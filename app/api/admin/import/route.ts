import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { isDirectoryCategory } from "@/lib/directory";
import { normalizeDirectoryRegion, normalizeDirectorySearchText } from "@/lib/directory-store";

export const dynamic = "force-dynamic";

type JsonRecord = Record<string, unknown>;
type RuntimeBindings = { DB?: D1Database };

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_RECORDS_PER_SECTION = 5_000;

function object(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Import obsahuje neplatný záznam.");
  return value as JsonRecord;
}

function list(value: unknown): JsonRecord[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_RECORDS_PER_SECTION) throw new Error("Import obsahuje neplatný počet záznamov.");
  return value.map(object);
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function required(value: unknown, label: string) {
  const result = text(value).trim();
  if (!result) throw new Error(`Chýba povinné pole: ${label}.`);
  return result;
}

function nullableText(value: unknown) {
  const result = text(value).trim();
  return result || null;
}

function integer(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : fallback;
}

function bool(value: unknown) {
  return value === true || value === 1;
}

function jsonArray(value: unknown) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function valueFrom(row: JsonRecord, ...keys: string[]) {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null) return row[key];
  return undefined;
}

function importedText(row: JsonRecord, keys: string[], fallback = "") {
  const value = valueFrom(row, ...keys);
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : fallback;
}

function importedList(row: JsonRecord, listKey: string, fallbackKeys: string[]) {
  const direct = row[listKey];
  if (Array.isArray(direct)) return direct.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim());
  return fallbackKeys.map((key) => importedText(row, [key])).filter(Boolean);
}

function sourceData(row: JsonRecord) {
  return JSON.stringify(Object.fromEntries(Object.entries(row).filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))));
}

function migratedImage(row: JsonRecord) {
  const key = nullableText(row.imageKey);
  if (key) return `/migrated-media/${key}`;
  return nullableText(row.image ?? row.imageUrl);
}

async function runBatches(database: D1Database, statements: D1PreparedStatement[]) {
  for (let index = 0; index < statements.length; index += 50) {
    await database.batch(statements.slice(index, index + 50));
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_IMPORT_BYTES) return Response.json({ error: "Import je príliš veľký." }, { status: 413 });

  const database = (env as RuntimeBindings).DB;
  if (!database) return Response.json({ error: "Databáza D1 nie je pripojená." }, { status: 503 });

  try {
    const payload = object(await request.json());
    const articles = list(payload.articles);
    const profiles = list(payload.profiles);
    const events = list(payload.events);
    const helpItems = list(payload.helpItems);
    const inquiries = list(payload.inquiries);
    const legal = payload.legal ? object(payload.legal) : null;
    const selectedProfileCategory = text(payload.profileCategory);
    const statements: D1PreparedStatement[] = [];

    for (const row of articles) {
      statements.push(database.prepare(`
        INSERT INTO managed_articles (
          slug, title, excerpt, category, portal_section, news_category, status, accent, author, intro,
          takeaway, sections_json, sources_json, image_url, image_key, reading_minutes,
          created_at, updated_at, published_at, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          title=excluded.title, excerpt=excluded.excerpt, category=excluded.category,
          portal_section=excluded.portal_section, news_category=excluded.news_category,
          status=excluded.status, accent=excluded.accent, author=excluded.author, intro=excluded.intro,
          takeaway=excluded.takeaway, sections_json=excluded.sections_json, sources_json=excluded.sources_json,
          image_url=excluded.image_url, reading_minutes=excluded.reading_minutes,
          created_at=excluded.created_at, updated_at=excluded.updated_at, published_at=excluded.published_at,
          created_by=excluded.created_by, updated_by=excluded.updated_by
      `).bind(
        required(row.slug, "adresa článku"), required(row.title, "názov článku"), text(row.excerpt),
        text(row.category, "Život so psom"), text(row.portalSection, "clanky"), nullableText(row.newsCategory),
        text(row.status, "draft"), text(row.accent, "forest"), text(row.author, "Redakcia Psipedia"),
        text(row.intro), text(row.takeaway), jsonArray(row.sections), jsonArray(row.sources), migratedImage(row),
        integer(row.readingMinutes, 5), required(row.createdAt, "dátum vytvorenia"),
        required(row.updatedAt, "dátum úpravy"), nullableText(row.publishedAt),
        text(row.createdBy, user.email), text(row.updatedBy, user.email),
      ));
    }

    for (const row of profiles) {
      const category = importedText(row, ["category", "Kategória"], selectedProfileCategory);
      if (!isDirectoryCategory(category)) throw new Error("Import profilov nemá platnú kategóriu.");
      const name = required(valueFrom(row, "name", "Názov", "Názov klubu"), "názov profilu");
      const slug = required(valueFrom(row, "slug", "Slug"), "adresa profilu");
      const excerpt = importedText(row, ["excerpt", "Krátky popis", "Popis"]);
      const description = importedText(row, ["description", "Popis"], excerpt);
      const services = importedList(row, "services", ["Zameranie"]);
      const qualifications = importedList(row, "qualifications", ["Organizácia"]);
      const city = importedText(row, ["city", "Mesto / obec", "Mesto", "Obec"]);
      const district = importedText(row, ["district", "Okres"]);
      const rawRegion = importedText(row, ["region", "Kraj"]);
      const region = normalizeDirectoryRegion(rawRegion);
      if (!region) throw new Error(`Profil ${name} nemá platný kraj.`);
      const address = importedText(row, ["address", "Adresa / cvičisko", "Adresa"]);
      const websiteUrl = nullableText(valueFrom(row, "websiteUrl", "Web"));
      const internalEmail = nullableText(valueFrom(row, "internalEmail", "E-mail"));
      const importKey = importedText(row, ["importKey", "Import key"]) || null;
      const rawStatus = importedText(row, ["status"]);
      const status = rawStatus === "published" ? "published" : "draft";
      const updateStatus = rawStatus === "published" || rawStatus === "draft";
      const createdAt = importedText(row, ["createdAt"], new Date().toISOString());
      const updatedAt = importedText(row, ["updatedAt", "Dátum overenia"], new Date().toISOString()).replace(/^(\d{4}-\d{2}-\d{2})$/, "$1T00:00:00.000Z");
      const publishedAt = nullableText(row.publishedAt);
      const rawSourceData = sourceData(row);
      const searchText = normalizeDirectorySearchText([name, excerpt, description, services.join(" "), qualifications.join(" "), city, district, region, address].join(" "));
      const conflictTarget = importKey ? "import_key" : "category, slug";
      statements.push(database.prepare(`
        INSERT INTO directory_profiles (
          slug, name, category, status, excerpt, description, services_json, qualifications_json,
          city, district, region, address, online, price_note, website_url, internal_email, image_url, image_key,
          import_key, source_data_json, search_text, verified, featured, created_at, updated_at, published_at, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(${conflictTarget}) DO UPDATE SET
          slug=excluded.slug, name=excluded.name, category=excluded.category,
          status=CASE WHEN ? = 1 THEN excluded.status ELSE directory_profiles.status END,
          excerpt=excluded.excerpt, description=excluded.description,
          services_json=excluded.services_json, qualifications_json=excluded.qualifications_json,
          city=excluded.city, district=excluded.district, region=excluded.region, address=excluded.address, online=excluded.online,
          price_note=excluded.price_note, website_url=excluded.website_url, internal_email=excluded.internal_email,
          image_url=COALESCE(excluded.image_url, directory_profiles.image_url), import_key=COALESCE(excluded.import_key, directory_profiles.import_key),
          source_data_json=excluded.source_data_json, search_text=excluded.search_text,
          verified=excluded.verified, featured=excluded.featured, updated_at=excluded.updated_at,
          published_at=COALESCE(excluded.published_at, directory_profiles.published_at), updated_by=excluded.updated_by
      `).bind(
        slug, name, category, status, excerpt, description, JSON.stringify(services), JSON.stringify(qualifications),
        city, district, region, address, bool(row.online), importedText(row, ["priceNote", "Cena"]), websiteUrl,
        internalEmail, migratedImage(row), importKey, rawSourceData, searchText,
        bool(valueFrom(row, "verified", "Overené")) || importedText(row, ["Stav"]) === "Overené",
        bool(row.featured), createdAt, updatedAt, publishedAt,
        text(row.createdBy, user.email), text(row.updatedBy, `import:${category}`), updateStatus ? 1 : 0,
      ));
    }

    for (const row of events) {
      statements.push(database.prepare(`
        INSERT INTO managed_events (
          slug, title, excerpt, event_type, status, start_date, start_time, end_date, end_time,
          venue, city, region, address, organizer, description, practical_info, website_url,
          registration_url, image_url, image_key, cancelled, created_at, updated_at, published_at,
          created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          title=excluded.title, excerpt=excluded.excerpt, event_type=excluded.event_type, status=excluded.status,
          start_date=excluded.start_date, start_time=excluded.start_time, end_date=excluded.end_date,
          end_time=excluded.end_time, venue=excluded.venue, city=excluded.city, region=excluded.region,
          address=excluded.address, organizer=excluded.organizer, description=excluded.description,
          practical_info=excluded.practical_info, website_url=excluded.website_url,
          registration_url=excluded.registration_url, image_url=excluded.image_url, cancelled=excluded.cancelled,
          created_at=excluded.created_at, updated_at=excluded.updated_at, published_at=excluded.published_at,
          created_by=excluded.created_by, updated_by=excluded.updated_by
      `).bind(
        required(row.slug, "adresa podujatia"), required(row.title, "názov podujatia"), text(row.excerpt),
        text(row.eventType), text(row.status, "draft"), required(row.startDate, "dátum podujatia"),
        text(row.startTime), nullableText(row.endDate), nullableText(row.endTime), text(row.venue),
        text(row.city), text(row.region), text(row.address), text(row.organizer), text(row.description),
        text(row.practicalInfo), nullableText(row.websiteUrl), nullableText(row.registrationUrl), migratedImage(row),
        bool(row.cancelled), required(row.createdAt, "dátum vytvorenia podujatia"),
        required(row.updatedAt, "dátum úpravy podujatia"), nullableText(row.publishedAt),
        text(row.createdBy, user.email), text(row.updatedBy, user.email),
      ));
    }

    for (const row of helpItems) {
      statements.push(database.prepare(`
        INSERT INTO help_cases (
          slug, title, category, status, excerpt, description, organization, dog_name, breed, age_note,
          city, region, location_note, reported_date, deadline_date, action_label, action_url, contact_note,
          goal_amount, raised_amount, image_url, image_key, verified, urgent, resolved,
          created_at, updated_at, published_at, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(category, slug) DO UPDATE SET
          title=excluded.title, status=excluded.status, excerpt=excluded.excerpt, description=excluded.description,
          organization=excluded.organization, dog_name=excluded.dog_name, breed=excluded.breed,
          age_note=excluded.age_note, city=excluded.city, region=excluded.region,
          location_note=excluded.location_note, reported_date=excluded.reported_date,
          deadline_date=excluded.deadline_date, action_label=excluded.action_label, action_url=excluded.action_url,
          contact_note=excluded.contact_note, goal_amount=excluded.goal_amount, raised_amount=excluded.raised_amount,
          image_url=excluded.image_url, verified=excluded.verified, urgent=excluded.urgent, resolved=excluded.resolved,
          created_at=excluded.created_at, updated_at=excluded.updated_at, published_at=excluded.published_at,
          created_by=excluded.created_by, updated_by=excluded.updated_by
      `).bind(
        required(row.slug, "adresa pomoci"), required(row.title, "názov pomoci"), required(row.category, "kategória pomoci"),
        text(row.status, "draft"), text(row.excerpt), text(row.description), text(row.organization),
        text(row.dogName), text(row.breed), text(row.ageNote), text(row.city), text(row.region),
        text(row.locationNote), nullableText(row.reportedDate), nullableText(row.deadlineDate),
        text(row.actionLabel), nullableText(row.actionUrl), text(row.contactNote), integer(row.goalAmount),
        integer(row.raisedAmount), migratedImage(row), bool(row.verified), bool(row.urgent), bool(row.resolved),
        required(row.createdAt, "dátum vytvorenia pomoci"), required(row.updatedAt, "dátum úpravy pomoci"),
        nullableText(row.publishedAt), text(row.createdBy, user.email), text(row.updatedBy, user.email),
      ));
    }

    for (const row of inquiries) {
      statements.push(database.prepare(`
        INSERT INTO directory_inquiries (
          profile_id, profile_name, profile_slug, profile_category, recipient_email, sender_name,
          sender_email, sender_phone, dog_info, message, status, consent, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        integer(row.profileId), text(row.profileName), text(row.profileSlug), text(row.profileCategory),
        nullableText(row.recipientEmail), text(row.senderName), text(row.senderEmail), text(row.senderPhone),
        text(row.dogInfo), text(row.message), text(row.status, "new"), bool(row.consent),
        required(row.createdAt, "dátum dopytu"), required(row.updatedAt, "dátum úpravy dopytu"),
      ));
    }

    if (legal) {
      statements.push(database.prepare(`
        INSERT INTO legal_settings (
          id, operator_type, legal_name, business_name, address, ico, dic, vat_id, email, phone,
          registry_name, registry_number, media_registry_number, media_status, rpvs_status,
          correction_email, privacy_email, updated_at, updated_by
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          operator_type=excluded.operator_type, legal_name=excluded.legal_name,
          business_name=excluded.business_name, address=excluded.address, ico=excluded.ico,
          dic=excluded.dic, vat_id=excluded.vat_id, email=excluded.email, phone=excluded.phone,
          registry_name=excluded.registry_name, registry_number=excluded.registry_number,
          media_registry_number=excluded.media_registry_number, media_status=excluded.media_status,
          rpvs_status=excluded.rpvs_status, correction_email=excluded.correction_email,
          privacy_email=excluded.privacy_email, updated_at=excluded.updated_at, updated_by=excluded.updated_by
      `).bind(
        text(legal.operatorType, "individual"), text(legal.legalName), text(legal.businessName),
        text(legal.address), text(legal.ico), text(legal.dic), text(legal.vatId), text(legal.email),
        text(legal.phone), text(legal.registryName), text(legal.registryNumber),
        text(legal.mediaRegistryNumber), text(legal.mediaStatus, "not_submitted"),
        text(legal.rpvsStatus, "not_registered"), text(legal.correctionEmail), text(legal.privacyEmail),
        text(legal.updatedAt, new Date().toISOString()), user.email,
      ));
    }

    await runBatches(database, statements);
    return Response.json({
      success: true,
      imported: { articles: articles.length, profiles: profiles.length, events: events.length, help: helpItems.length, inquiries: inquiries.length, legal: legal ? 1 : 0 },
    });
  } catch (error) {
    console.error(JSON.stringify({ event: "admin_import_failed", message: error instanceof Error ? error.message : "unknown" }));
    return Response.json({ error: error instanceof Error ? error.message : "Import sa nepodaril." }, { status: 400 });
  }
}
