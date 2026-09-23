import { env } from "cloudflare:workers";
import { decryptPii, encryptPii } from "@/lib/pii-crypto";
import { getPartnerAccountById, getPartnerDatabase } from "@/lib/partner-auth-store";
import { appendPartnerAuditEvent } from "@/lib/partner-platform";

type Bindings = { DB?: D1Database; PII_ENCRYPTION_KEY?: string };

export type PartnerContactProfile = {
  accountId: string;
  contactName: string;
  phone: string | null;
  relationship: string | null;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  accountId: string;
  contactNameCiphertext: string;
  phoneCiphertext: string | null;
  relationshipCiphertext: string | null;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
};

export class PartnerContactProfileError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function runtimeDatabase(database?: D1Database) {
  return getPartnerDatabase(database ?? (env as unknown as Bindings).DB);
}

function encryptionKey(value?: string) {
  const key = value ?? (env as unknown as Bindings).PII_ENCRYPTION_KEY;
  if (!key?.trim()) throw new PartnerContactProfileError("PII_ENCRYPTION_KEY nie je nakonfigurovaný.", 503);
  return key.trim();
}

function isMissingContactProfileTable(error: unknown) {
  return error instanceof Error && /no such table:\s*partner_account_profiles/i.test(error.message);
}

function plainText(value: unknown, label: string, options: { min?: number; max: number; optional?: boolean }) {
  if (value === null || value === undefined || value === "") {
    if (options.optional) return null;
    throw new PartnerContactProfileError(`${label} je povinné.`);
  }
  if (typeof value !== "string") throw new PartnerContactProfileError(`${label} má neplatný formát.`);
  const normalized = value.normalize("NFKC").trim();
  if (/[\u0000-\u001F\u007F<>]/.test(normalized)) {
    throw new PartnerContactProfileError(`${label} obsahuje nepovolené znaky.`);
  }
  const clean = normalized.replace(/ {2,}/g, " ");
  if (!clean && options.optional) return null;
  if (clean.length < (options.min ?? 1) || clean.length > options.max) {
    throw new PartnerContactProfileError(`${label} má neplatnú dĺžku.`);
  }
  return clean;
}

export function normalizePartnerContactInput(input: {
  contactName: unknown;
  phone?: unknown;
  relationship?: unknown;
}) {
  const contactName = plainText(input.contactName, "Meno a priezvisko", { min: 2, max: 120 })!;
  const phone = plainText(input.phone, "Telefón", { max: 32, optional: true });
  if (phone) {
    if (!/^[0-9+().\-\s/]{5,32}$/.test(phone) || (phone.match(/\d/g) ?? []).length < 5) {
      throw new PartnerContactProfileError("Telefón má neplatný formát.");
    }
  }
  const relationship = plainText(input.relationship, "Vaša úloha / vzťah k profilu", { max: 100, optional: true });
  return { contactName, phone, relationship };
}

export async function isPartnerOnboardingComplete(accountId: string, database?: D1Database) {
  try {
    const row = await runtimeDatabase(database).prepare(
      "SELECT completed_at FROM partner_account_profiles WHERE account_id=?1 LIMIT 1",
    ).bind(accountId).first<{ completed_at: string | null }>();
    return Boolean(row?.completed_at);
  } catch (error) {
    // Mixed-version deploy safety: before 0069 is applied, preserve pre-H1
    // behavior instead of breaking every active Partner session.
    if (isMissingContactProfileTable(error)) return true;
    throw error;
  }
}

export async function getPartnerContactProfile(
  accountId: string,
  input: { database?: D1Database; encryptionKey?: string } = {},
): Promise<PartnerContactProfile | null> {
  const database = runtimeDatabase(input.database);
  let row: Row | null;
  try {
    row = await database.prepare(
      "SELECT account_id accountId,contact_name_ciphertext contactNameCiphertext,phone_ciphertext phoneCiphertext," +
      "relationship_ciphertext relationshipCiphertext,completed_at completedAt,created_at createdAt,updated_at updatedAt " +
      "FROM partner_account_profiles WHERE account_id=?1 LIMIT 1",
    ).bind(accountId).first<Row>();
  } catch (error) {
    if (isMissingContactProfileTable(error)) return null;
    throw error;
  }
  if (!row) return null;
  const key = encryptionKey(input.encryptionKey);
  return {
    accountId: row.accountId,
    contactName: await decryptPii(row.contactNameCiphertext, key),
    phone: row.phoneCiphertext ? await decryptPii(row.phoneCiphertext, key) : null,
    relationship: row.relationshipCiphertext ? await decryptPii(row.relationshipCiphertext, key) : null,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertPartnerContactProfile(input: {
  accountId: string;
  contactName: unknown;
  phone?: unknown;
  relationship?: unknown;
  database?: D1Database;
  encryptionKey?: string;
  now?: Date;
}) {
  const database = runtimeDatabase(input.database);
  const account = await getPartnerAccountById(input.accountId, database);
  if (!account || account.status !== "ACTIVE" || !account.emailVerifiedAt) {
    throw new PartnerContactProfileError("Aktívny Partner účet je potrebný.", 401);
  }
  const values = normalizePartnerContactInput(input);
  const key = encryptionKey(input.encryptionKey);
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const existing = await database.prepare(
    "SELECT completed_at completedAt,created_at createdAt FROM partner_account_profiles WHERE account_id=?1 LIMIT 1",
  ).bind(input.accountId).first<{ completedAt: string; createdAt: string }>();
  const completedAt = existing?.completedAt ?? nowIso;
  const createdAt = existing?.createdAt ?? nowIso;

  await database.prepare(
    "INSERT INTO partner_account_profiles " +
    "(account_id,contact_name_ciphertext,phone_ciphertext,relationship_ciphertext,completed_at,created_at,updated_at) " +
    "VALUES (?1,?2,?3,?4,?5,?6,?7) " +
    "ON CONFLICT(account_id) DO UPDATE SET contact_name_ciphertext=excluded.contact_name_ciphertext," +
    "phone_ciphertext=excluded.phone_ciphertext,relationship_ciphertext=excluded.relationship_ciphertext,updated_at=excluded.updated_at",
  ).bind(
    input.accountId,
    await encryptPii(values.contactName, key),
    values.phone ? await encryptPii(values.phone, key) : null,
    values.relationship ? await encryptPii(values.relationship, key) : null,
    completedAt,
    createdAt,
    nowIso,
  ).run();

  await appendPartnerAuditEvent({
    actorType: "PARTNER",
    actorRef: `partner:${input.accountId}`,
    action: existing ? "CONTACT_PROFILE_UPDATED" : "CONTACT_PROFILE_COMPLETED",
    targetType: "PARTNER_ACCOUNT",
    targetId: input.accountId,
    database,
    now,
  });

  return getPartnerContactProfile(input.accountId, { database, encryptionKey: key });
}
