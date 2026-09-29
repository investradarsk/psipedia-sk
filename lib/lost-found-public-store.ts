import { env } from "cloudflare:workers";
import { encryptPii, hashPii } from "@/lib/pii-crypto";
import {
  LOST_FOUND_PUBLIC_CONTACT_NOTE,
  LOST_FOUND_PUBLIC_SOURCE,
  PublicLostFoundSubmissionError,
  type NormalizedPublicLostFoundSubmission,
} from "@/lib/lost-found-public-submission";

type Bindings = {
  DB?: D1Database;
  PII_ENCRYPTION_KEY?: string;
  PII_HASH_KEY?: string;
};

const PUBLIC_ACTOR = "PUBLIC_REPORTER";

function bindings() {
  return env as unknown as Bindings;
}

export function getPublicLostFoundDatabase(database?: D1Database) {
  const value = database ?? bindings().DB;
  if (!value?.prepare || typeof value.batch !== "function") {
    throw new PublicLostFoundSubmissionError("Odoslanie hlásenia momentálne nie je dostupné.", 503, "SUBMISSION_UNAVAILABLE");
  }
  return value;
}

function cryptoKeys() {
  const runtime = bindings();
  const encryptionKey = runtime.PII_ENCRYPTION_KEY?.trim();
  const hashKey = runtime.PII_HASH_KEY?.trim();
  if (!encryptionKey || !hashKey) {
    throw new PublicLostFoundSubmissionError("Odoslanie hlásenia momentálne nie je dostupné.", 503, "SECURITY_CONFIGURATION");
  }
  return { encryptionKey, hashKey };
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(value: string) {
  return normalizeSearch(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 82);
}

function publicSlug(input: NormalizedPublicLostFoundSubmission) {
  const subject = input.dogName || input.breed || input.city || "pes";
  const prefix = input.type === "LOST" ? "strateny" : "najdeny";
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const base = slugify([prefix, subject, input.city, input.eventDate].join("-")) || prefix;
  return base + "-" + random;
}

async function privateValues(input: NormalizedPublicLostFoundSubmission) {
  const { encryptionKey, hashKey } = cryptoKeys();
  const [
    contactNameEncrypted,
    contactPhoneEncrypted,
    contactPhoneHash,
    contactEmailEncrypted,
    contactEmailHash,
  ] = await Promise.all([
    input.contactName ? encryptPii(input.contactName, encryptionKey) : Promise.resolve(null),
    input.contactPhone ? encryptPii(input.contactPhone, encryptionKey) : Promise.resolve(null),
    input.normalizedPhone ? hashPii(input.normalizedPhone, hashKey) : Promise.resolve(null),
    input.contactEmail ? encryptPii(input.contactEmail, encryptionKey) : Promise.resolve(null),
    input.normalizedEmail ? hashPii(input.normalizedEmail, hashKey) : Promise.resolve(null),
  ]);
  return {
    contactNameEncrypted,
    contactPhoneEncrypted,
    contactPhoneHash,
    contactEmailEncrypted,
    contactEmailHash,
  };
}

export async function createPendingPublicLostFoundDogReport(
  input: NormalizedPublicLostFoundSubmission,
  options: { database?: D1Database; now?: Date } = {},
) {
  const database = getPublicLostFoundDatabase(options.database);
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const privatePii = await privateValues(input);
  const retryThreshold = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

  const existingSql =
    "SELECT r.id,r.slug FROM lost_found_dog_reports r " +
    "JOIN lost_found_dog_private_details p ON p.report_id=r.id " +
    "WHERE r.source=?1 AND r.status IN ('PENDING','DRAFT') AND r.published_at IS NULL " +
    "AND r.type=?2 AND r.event_date=?3 AND lower(r.city)=lower(?4) " +
    "AND COALESCE(r.dog_name,'')=?5 AND r.description=?6 AND r.distinguishing_marks=?7 " +
    "AND r.collar_description=?8 AND r.region=?9 AND r.district=?10 AND r.location_description=?11 " +
    "AND r.sex=?12 AND r.breed=?13 AND r.breed_unknown=?14 AND r.color=?15 AND r.approximate_age=?16 " +
    "AND r.size=?17 AND r.chipped=?18 AND COALESCE(r.last_seen_date_time,'')=COALESCE(?19,'') " +
    "AND r.created_at>=?20 AND ((?21 IS NOT NULL AND p.contact_phone_hash=?21) " +
    "OR (?22 IS NOT NULL AND p.contact_email_hash=?22)) ORDER BY r.id DESC LIMIT 1";

  const existing = await database.prepare(existingSql).bind(
    LOST_FOUND_PUBLIC_SOURCE,
    input.type,
    input.eventDate,
    input.city,
    input.dogName ?? "",
    input.description,
    input.distinguishingMarks,
    input.collarDescription,
    input.region,
    input.district,
    input.locationDescription,
    input.sex,
    input.breed,
    input.breedUnknown ? 1 : 0,
    input.color,
    input.approximateAge,
    input.size,
    input.chipped,
    input.lastSeenDateTime,
    retryThreshold,
    privatePii.contactPhoneHash,
    privatePii.contactEmailHash,
  ).first<{ id: number; slug: string }>();

  if (existing) {
    return { id: Number(existing.id), slug: existing.slug, type: input.type, created: false as const };
  }

  const slug = publicSlug(input);
  const searchText = normalizeSearch([
    input.type,
    input.dogName,
    input.breed,
    input.color,
    input.description,
    input.distinguishingMarks,
    input.region,
    input.district,
    input.city,
    input.locationDescription,
    LOST_FOUND_PUBLIC_SOURCE,
  ].filter(Boolean).join(" "));

  const insertSql =
    "INSERT INTO lost_found_dog_reports (" +
    "type,status,slug,dog_name,sex,breed,breed_unknown,color,approximate_age,size," +
    "description,distinguishing_marks,collar_description,chipped,event_date,last_seen_date_time," +
    "region,district,city,location_description,public_location_precision,public_contact_note," +
    "source,search_text,created_at,updated_at" +
    ") VALUES (" +
    "?1,'PENDING',?2,?3,?4,?5,?6,?7,?8,?9," +
    "?10,?11,?12,?13,?14,?15," +
    "?16,?17,?18,?19,'MUNICIPALITY',?20," +
    "?21,?22,?23,?23" +
    ") RETURNING id";

  const inserted = await database.prepare(insertSql).bind(
    input.type,
    slug,
    input.dogName,
    input.sex,
    input.breed,
    input.breedUnknown ? 1 : 0,
    input.color,
    input.approximateAge,
    input.size,
    input.description,
    input.distinguishingMarks,
    input.collarDescription,
    input.chipped,
    input.eventDate,
    input.lastSeenDateTime,
    input.region,
    input.district,
    input.city,
    input.locationDescription,
    LOST_FOUND_PUBLIC_CONTACT_NOTE,
    LOST_FOUND_PUBLIC_SOURCE,
    searchText,
    nowIso,
  ).first<{ id: number }>();

  const reportId = Number(inserted?.id);
  if (!Number.isSafeInteger(reportId) || reportId < 1) {
    throw new PublicLostFoundSubmissionError("Hlásenie sa momentálne nepodarilo uložiť.", 503, "SUBMISSION_FAILED");
  }

  try {
    const privateSql =
      "INSERT INTO lost_found_dog_private_details (" +
      "report_id,contact_name_encrypted,contact_phone_encrypted,contact_phone_hash," +
      "contact_email_encrypted,contact_email_hash,created_by,updated_by,created_at,updated_at" +
      ") VALUES (?1,?2,?3,?4,?5,?6,?7,?7,?8,?8)";
    await database.prepare(privateSql).bind(
      reportId,
      privatePii.contactNameEncrypted,
      privatePii.contactPhoneEncrypted,
      privatePii.contactPhoneHash,
      privatePii.contactEmailEncrypted,
      privatePii.contactEmailHash,
      PUBLIC_ACTOR,
      nowIso,
    ).run();
  } catch (error) {
    await database.prepare(
      "DELETE FROM lost_found_dog_reports WHERE id=?1 AND status='PENDING' AND published_at IS NULL",
    ).bind(reportId).run().catch(() => undefined);
    throw error;
  }

  return { id: reportId, slug, type: input.type, created: true as const };
}

export async function attachPendingPublicLostFoundImage(
  reportId: number,
  safeKey: string,
  databaseInput?: D1Database,
) {
  if (!safeKey.startsWith("safe/LOST_FOUND_PUBLIC/")) {
    throw new Error("Invalid private LOST/FOUND image key");
  }
  const database = getPublicLostFoundDatabase(databaseInput);
  const result = await database.prepare(
    "UPDATE lost_found_dog_reports SET main_image_key=?1,updated_at=?2 " +
    "WHERE id=?3 AND source=?4 AND status='PENDING' AND published_at IS NULL AND main_image IS NULL",
  ).bind(safeKey, new Date().toISOString(), reportId, LOST_FOUND_PUBLIC_SOURCE).run();
  if (Number(result.meta?.changes ?? 0) !== 1) throw new Error("Pending LOST/FOUND report is not attachable");
}

export async function deleteUnpublishedPublicLostFoundDogReport(
  reportId: number,
  databaseInput?: D1Database,
) {
  const database = getPublicLostFoundDatabase(databaseInput);
  await database.prepare(
    "DELETE FROM lost_found_dog_reports WHERE id=?1 AND source=?2 " +
    "AND status IN ('PENDING','DRAFT') AND published_at IS NULL",
  ).bind(reportId, LOST_FOUND_PUBLIC_SOURCE).run();
}
