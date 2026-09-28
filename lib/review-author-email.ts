import { env } from "cloudflare:workers";
import { SITE_URL } from "@/config/public-site";
import { decryptPii, encryptPii } from "@/lib/pii-crypto";
import { getReviewAuthorDatabase } from "@/lib/review-author-auth-store";
import { normalizeReviewAuthorReturnTo } from "@/lib/review-author-return-to";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 5;
const STALE_SENDING_MS = 5 * 60 * 1000;

export type ReviewAuthorEmailBindings = {
  DB?: D1Database;
  RESEND_API_KEY?: string;
  PARTNER_FROM_EMAIL?: string;
  EDITORIAL_FROM_EMAIL?: string;
  PII_ENCRYPTION_KEY?: string;
};

type ReviewAuthOutboxRow = {
  id: string;
  review_author_id: string;
  notification_type: "AUTH_MAGIC_LINK";
  dedupe_key: string;
  status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "EXPIRED";
  encrypted_secret: string | null;
  expires_at: string;
  attempts: number;
  last_attempt_at: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

type ReviewAuthorEmailRow = {
  email_ciphertext: string;
};

function runtimeBindings(bindings?: ReviewAuthorEmailBindings) {
  return bindings ?? env as unknown as ReviewAuthorEmailBindings;
}

function requireEncryptionKey(bindings: ReviewAuthorEmailBindings) {
  const value = bindings.PII_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("PII encryption is unavailable for review auth.");
  return value;
}

export async function queueReviewAuthorMagicLinkEmail(input: {
  authorId: string;
  rawToken: string;
  returnTo?: string | null;
  expiresAt: string;
  database?: D1Database;
  bindings?: ReviewAuthorEmailBindings;
  now?: Date;
}) {
  const bindings = runtimeBindings(input.bindings);
  const database = getReviewAuthorDatabase(input.database ?? bindings.DB);
  const encryptionKey = requireEncryptionKey(bindings);
  const nowIso = (input.now ?? new Date()).toISOString();
  const id = crypto.randomUUID();
  const returnTo = normalizeReviewAuthorReturnTo(input.returnTo);
  const encryptedSecret = await encryptPii(JSON.stringify({ token: input.rawToken, returnTo }), encryptionKey);
  const dedupeKey = "review-auth/" + id;

  await database.prepare(
    "UPDATE review_auth_notification_outbox SET status='EXPIRED',encrypted_secret=NULL,last_error=NULL,updated_at=?2 " +
    "WHERE review_author_id=?1 AND notification_type='AUTH_MAGIC_LINK' " +
    "AND status NOT IN ('SENT','EXPIRED')",
  ).bind(input.authorId, nowIso).run();

  await database.prepare(
    "INSERT INTO review_auth_notification_outbox " +
    "(id,review_author_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at) " +
    "VALUES (?1,?2,'AUTH_MAGIC_LINK',?3,'PENDING',?4,?5,0,?6,?6)",
  ).bind(id, input.authorId, dedupeKey, encryptedSecret, input.expiresAt, nowIso).run();

  return id;
}

async function expireOutboxItem(database: D1Database, id: string, nowIso: string) {
  await database.prepare(
    "UPDATE review_auth_notification_outbox SET status='EXPIRED',encrypted_secret=NULL,last_error=NULL,updated_at=?2 " +
    "WHERE id=?1 AND status<>'SENT'",
  ).bind(id, nowIso).run();
}

async function claimOutboxItem(database: D1Database, id: string, now: Date) {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS).toISOString();
  return database.prepare(
    "UPDATE review_auth_notification_outbox SET status='SENDING',attempts=attempts+1,last_attempt_at=?2,updated_at=?2 " +
    "WHERE id=?1 AND expires_at>?2 AND attempts<" + MAX_ATTEMPTS + " AND (" +
    "status IN ('PENDING','FAILED') OR (status='SENDING' AND (last_attempt_at IS NULL OR last_attempt_at<?3))" +
    ") RETURNING *",
  ).bind(id, nowIso, staleBefore).first<ReviewAuthOutboxRow>();
}

async function sendReviewAuthorAuthEmail(input: {
  row: ReviewAuthOutboxRow;
  database: D1Database;
  bindings: ReviewAuthorEmailBindings;
}) {
  const apiKey = input.bindings.RESEND_API_KEY?.trim();
  const sender = input.bindings.PARTNER_FROM_EMAIL?.trim() || input.bindings.EDITORIAL_FROM_EMAIL?.trim();
  const encryptionKey = requireEncryptionKey(input.bindings);
  if (!apiKey) return { ok: false as const, error: "missing_resend_api_key" };
  if (!sender) return { ok: false as const, error: "missing_review_from_email" };

  const author = await input.database.prepare(
    "SELECT email_ciphertext FROM review_authors WHERE id=?1 LIMIT 1",
  ).bind(input.row.review_author_id).first<ReviewAuthorEmailRow>();
  if (!author) return { ok: false as const, error: "review_author_missing" };

  let recipient = "";
  try {
    recipient = await decryptPii(author.email_ciphertext, encryptionKey);
  } catch {
    return { ok: false as const, error: "review_author_email_decrypt_failed" };
  }

  if (!input.row.encrypted_secret) return { ok: false as const, error: "missing_encrypted_auth_secret" };

  let rawToken = "";
  let returnTo: string | null = null;
  try {
    const decrypted = await decryptPii(input.row.encrypted_secret, encryptionKey);
    const envelope = JSON.parse(decrypted) as { token?: unknown; returnTo?: unknown };
    rawToken = typeof envelope.token === "string" ? envelope.token : "";
    returnTo = normalizeReviewAuthorReturnTo(envelope.returnTo);
  } catch {
    return { ok: false as const, error: "review_auth_secret_decrypt_failed" };
  }
  if (!rawToken) return { ok: false as const, error: "review_auth_secret_invalid" };

  const fragment = new URLSearchParams({ token: rawToken });
  if (returnTo) fragment.set("returnTo", returnTo);
  const verifyUrl = SITE_URL + "/recenzia/overenie#" + fragment.toString();

  const subject = "Psipedia.sk — overenie emailu pre recenziu";
  const text = [
    "Dobrý deň,",
    "",
    "kliknutím na odkaz overíte svoj e-mail pre napísanie recenzie na Psipedia.sk:",
    verifyUrl,
    "",
    "Odkaz je jednorazový a platí 15 minút.",
    "Overenie e-mailu samo osebe recenziu nevytvorí ani nezverejní.",
    "Ak ste o tento odkaz nežiadali, e-mail môžete ignorovať.",
    "",
    "Psipedia.sk",
  ].join("\n");

  try {
    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
        "Idempotency-Key": input.row.dedupe_key,
      },
      body: JSON.stringify({ from: sender, to: recipient, subject, text }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false as const, error: "resend_http_" + response.status };
    try {
      const data = await response.json() as { id?: unknown };
      return { ok: true as const, providerMessageId: typeof data.id === "string" ? data.id : null };
    } catch {
      return { ok: true as const, providerMessageId: null };
    }
  } catch {
    return { ok: false as const, error: "resend_request_failed" };
  }
}

export async function processReviewAuthorNotificationOutboxItem(
  id: string,
  options: { database?: D1Database; bindings?: ReviewAuthorEmailBindings; now?: Date } = {},
) {
  const bindings = runtimeBindings(options.bindings);
  const database = getReviewAuthorDatabase(options.database ?? bindings.DB);
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  const existing = await database.prepare(
    "SELECT * FROM review_auth_notification_outbox WHERE id=?1 LIMIT 1",
  ).bind(id).first<ReviewAuthOutboxRow>();
  if (!existing) return { status: "missing" as const };
  if (existing.status === "SENT") return { status: "sent" as const };
  if (Date.parse(existing.expires_at) <= now.getTime()) {
    await expireOutboxItem(database, id, nowIso);
    return { status: "expired" as const };
  }

  const claimed = await claimOutboxItem(database, id, now);
  if (!claimed) return { status: "skipped" as const };

  const delivery = await sendReviewAuthorAuthEmail({ row: claimed, database, bindings });
  if (delivery.ok) {
    await database.prepare(
      "UPDATE review_auth_notification_outbox SET status='SENT',provider_message_id=?2,sent_at=?3," +
      "last_error=NULL,encrypted_secret=NULL,updated_at=?3 WHERE id=?1",
    ).bind(id, delivery.providerMessageId, nowIso).run();
    return { status: "sent" as const };
  }

  await database.prepare(
    "UPDATE review_auth_notification_outbox SET status='FAILED',last_error=?2,updated_at=?3 WHERE id=?1",
  ).bind(id, delivery.error, nowIso).run();
  return { status: "failed" as const, error: delivery.error };
}

export async function runReviewAuthorNotificationSweep(
  options: { database?: D1Database; bindings?: ReviewAuthorEmailBindings; now?: Date } = {},
) {
  const bindings = runtimeBindings(options.bindings);
  const database = getReviewAuthorDatabase(options.database ?? bindings.DB);
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS).toISOString();

  await database.prepare(
    "UPDATE review_auth_notification_outbox SET status='EXPIRED',encrypted_secret=NULL,last_error=NULL,updated_at=?1 " +
    "WHERE status<>'SENT' AND status<>'EXPIRED' AND expires_at<=?1",
  ).bind(nowIso).run();

  const rows = await database.prepare(
    "SELECT id FROM review_auth_notification_outbox WHERE expires_at>?1 AND attempts<" + MAX_ATTEMPTS + " AND (" +
    "status IN ('PENDING','FAILED') OR (status='SENDING' AND (last_attempt_at IS NULL OR last_attempt_at<?2))" +
    ") ORDER BY created_at ASC LIMIT 25",
  ).bind(nowIso, staleBefore).all<{ id: string }>();

  const summary = { candidates: rows.results.length, sent: 0, failed: 0, expired: 0, skipped: 0 };
  for (const row of rows.results) {
    const result = await processReviewAuthorNotificationOutboxItem(row.id, { database, bindings, now });
    if (result.status === "sent") summary.sent += 1;
    else if (result.status === "failed") summary.failed += 1;
    else if (result.status === "expired") summary.expired += 1;
    else summary.skipped += 1;
  }
  return summary;
}
