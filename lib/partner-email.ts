import { env } from "cloudflare:workers";
import { SITE_URL } from "@/config/public-site";
import { decryptPii, encryptPii } from "@/lib/pii-crypto";
import { getPartnerDatabase } from "@/lib/partner-auth-store";

const RESEND_EMAIL_ENDPOINT = "https://api.resend.com/emails";
const RESEND_TIMEOUT_MS = 8_000;
const MAX_ATTEMPTS = 5;
const STALE_SENDING_MS = 5 * 60 * 1000;

export type PartnerEmailBindings = {
  DB?: D1Database;
  RESEND_API_KEY?: string;
  PARTNER_FROM_EMAIL?: string;
  EDITORIAL_FROM_EMAIL?: string;
  PII_ENCRYPTION_KEY?: string;
};

type OutboxRow = {
  id: string;
  partner_account_id: string;
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

type AccountEmailRow = {
  email_ciphertext: string;
};

function runtimeBindings(bindings?: PartnerEmailBindings) {
  return bindings ?? env as unknown as PartnerEmailBindings;
}

function requireEncryptionKey(bindings: PartnerEmailBindings) {
  const value = bindings.PII_ENCRYPTION_KEY?.trim();
  if (!value) throw new Error("PII encryption is unavailable for Partner auth.");
  return value;
}

export async function queuePartnerMagicLinkEmail(input: {
  accountId: string;
  rawToken: string;
  expiresAt: string;
  database?: D1Database;
  bindings?: PartnerEmailBindings;
  now?: Date;
}) {
  const bindings = runtimeBindings(input.bindings);
  const database = getPartnerDatabase(input.database ?? bindings.DB);
  const encryptionKey = requireEncryptionKey(bindings);
  const nowIso = (input.now ?? new Date()).toISOString();
  const id = crypto.randomUUID();
  const encryptedSecret = await encryptPii(input.rawToken, encryptionKey);
  const dedupeKey = "partner-auth/" + id;

  // A newer login request revokes the previous access token. Make the matching
  // unsent retry payload terminal too so a revoked link is never sent later.
  await database.prepare(
    "UPDATE partner_notification_outbox SET status='EXPIRED',encrypted_secret=NULL,last_error=NULL,updated_at=?2 " +
    "WHERE partner_account_id=?1 AND notification_type='AUTH_MAGIC_LINK' " +
    "AND status NOT IN ('SENT','EXPIRED')",
  ).bind(input.accountId, nowIso).run();

  await database.prepare(
    "INSERT INTO partner_notification_outbox " +
    "(id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at) " +
    "VALUES (?1,?2,'AUTH_MAGIC_LINK',?3,'PENDING',?4,?5,0,?6,?6)",
  ).bind(id, input.accountId, dedupeKey, encryptedSecret, input.expiresAt, nowIso).run();

  return id;
}

async function expireOutboxItem(database: D1Database, id: string, nowIso: string) {
  await database.prepare(
    "UPDATE partner_notification_outbox SET status='EXPIRED',encrypted_secret=NULL,last_error=NULL,updated_at=?2 " +
    "WHERE id=?1 AND status<>'SENT'",
  ).bind(id, nowIso).run();
}

async function claimOutboxItem(database: D1Database, id: string, now: Date) {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS).toISOString();
  return database.prepare(
    "UPDATE partner_notification_outbox SET status='SENDING',attempts=attempts+1,last_attempt_at=?2,updated_at=?2 " +
    "WHERE id=?1 AND expires_at>?2 AND attempts<" + MAX_ATTEMPTS + " AND (" +
    "status IN ('PENDING','FAILED') OR (status='SENDING' AND (last_attempt_at IS NULL OR last_attempt_at<?3))" +
    ") RETURNING *",
  ).bind(id, nowIso, staleBefore).first<OutboxRow>();
}

async function sendPartnerAuthEmail(input: {
  row: OutboxRow;
  database: D1Database;
  bindings: PartnerEmailBindings;
}) {
  const apiKey = input.bindings.RESEND_API_KEY?.trim();
  const sender = input.bindings.PARTNER_FROM_EMAIL?.trim() || input.bindings.EDITORIAL_FROM_EMAIL?.trim();
  const encryptionKey = requireEncryptionKey(input.bindings);
  if (!apiKey) return { ok: false as const, error: "missing_resend_api_key" };
  if (!sender) return { ok: false as const, error: "missing_partner_from_email" };
  if (!input.row.encrypted_secret) return { ok: false as const, error: "missing_encrypted_auth_secret" };

  const account = await input.database.prepare(
    "SELECT email_ciphertext FROM partner_accounts WHERE id=?1 LIMIT 1",
  ).bind(input.row.partner_account_id).first<AccountEmailRow>();
  if (!account) return { ok: false as const, error: "partner_account_missing" };

  let recipient: string;
  let rawToken: string;
  try {
    recipient = await decryptPii(account.email_ciphertext, encryptionKey);
    rawToken = await decryptPii(input.row.encrypted_secret, encryptionKey);
  } catch {
    return { ok: false as const, error: "partner_auth_secret_decrypt_failed" };
  }

  const verifyUrl = SITE_URL + "/partner/overenie?token=" + encodeURIComponent(rawToken);
  const subject = "Prihlásenie do Partner účtu Psipedia";
  const text = [
    "Dobrý deň,",
    "",
    "kliknutím na odkaz sa bezpečne prihlásite do Partner účtu Psipedia:",
    verifyUrl,
    "",
    "Odkaz je jednorazový a platí 15 minút.",
    "Ak ste o prihlásenie nežiadali, tento e-mail ignorujte.",
  ].join("\n");

  try {
    const response = await fetch(RESEND_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: "Bearer " + apiKey,
        "content-type": "application/json",
        "Idempotency-Key": input.row.dedupe_key,
      },
      body: JSON.stringify({
        from: sender,
        to: recipient,
        subject,
        text,
      }),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false as const, error: "resend_http_" + response.status };

    try {
      const data = await response.json() as { id?: unknown };
      return {
        ok: true as const,
        providerMessageId: typeof data.id === "string" ? data.id : null,
      };
    } catch {
      return { ok: true as const, providerMessageId: null };
    }
  } catch {
    return { ok: false as const, error: "resend_request_failed" };
  }
}

export async function processPartnerNotificationOutboxItem(
  id: string,
  options: { database?: D1Database; bindings?: PartnerEmailBindings; now?: Date } = {},
) {
  const bindings = runtimeBindings(options.bindings);
  const database = getPartnerDatabase(options.database ?? bindings.DB);
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  const existing = await database.prepare(
    "SELECT * FROM partner_notification_outbox WHERE id=?1 LIMIT 1",
  ).bind(id).first<OutboxRow>();
  if (!existing) return { status: "missing" as const };
  if (existing.status === "SENT") return { status: "sent" as const };
  if (Date.parse(existing.expires_at) <= now.getTime()) {
    await expireOutboxItem(database, id, nowIso);
    return { status: "expired" as const };
  }

  const claimed = await claimOutboxItem(database, id, now);
  if (!claimed) return { status: "skipped" as const };

  const delivery = await sendPartnerAuthEmail({ row: claimed, database, bindings });
  if (delivery.ok) {
    await database.prepare(
      "UPDATE partner_notification_outbox SET status='SENT',provider_message_id=?2,sent_at=?3," +
      "last_error=NULL,encrypted_secret=NULL,updated_at=?3 WHERE id=?1",
    ).bind(id, delivery.providerMessageId, nowIso).run();
    return { status: "sent" as const };
  }

  await database.prepare(
    "UPDATE partner_notification_outbox SET status='FAILED',last_error=?2,updated_at=?3 WHERE id=?1",
  ).bind(id, delivery.error, nowIso).run();
  return { status: "failed" as const, error: delivery.error };
}

export async function runPartnerNotificationSweep(
  options: { database?: D1Database; bindings?: PartnerEmailBindings; now?: Date } = {},
) {
  const bindings = runtimeBindings(options.bindings);
  const database = getPartnerDatabase(options.database ?? bindings.DB);
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - STALE_SENDING_MS).toISOString();

  await database.prepare(
    "UPDATE partner_notification_outbox SET status='EXPIRED',encrypted_secret=NULL,last_error=NULL,updated_at=?1 " +
    "WHERE status<>'SENT' AND status<>'EXPIRED' AND expires_at<=?1",
  ).bind(nowIso).run();

  const rows = await database.prepare(
    "SELECT id FROM partner_notification_outbox WHERE expires_at>?1 AND attempts<" + MAX_ATTEMPTS + " AND (" +
    "status IN ('PENDING','FAILED') OR (status='SENDING' AND (last_attempt_at IS NULL OR last_attempt_at<?2))" +
    ") ORDER BY created_at ASC LIMIT 25",
  ).bind(nowIso, staleBefore).all<{ id: string }>();

  const summary = { candidates: rows.results.length, sent: 0, failed: 0, expired: 0, skipped: 0 };
  for (const row of rows.results) {
    const result = await processPartnerNotificationOutboxItem(row.id, { database, bindings, now });
    if (result.status === "sent") summary.sent += 1;
    else if (result.status === "failed") summary.failed += 1;
    else if (result.status === "expired") summary.expired += 1;
    else summary.skipped += 1;
  }
  return summary;
}
