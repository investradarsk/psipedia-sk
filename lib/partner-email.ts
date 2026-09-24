import { env } from "cloudflare:workers";
import { SITE_URL } from "@/config/public-site";
import { decryptPii, encryptPii } from "@/lib/pii-crypto";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

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

export const partnerNotificationTypes = [
  "AUTH_MAGIC_LINK",
  "PASSWORD_RESET",
  "CLAIM_SUBMITTED",
  "CLAIM_APPROVED",
  "CLAIM_REJECTED",
  "VERIFICATION_APPROVED",
  "VERIFICATION_REJECTED",
  "PROFILE_CHANGE_SUBMITTED",
  "PROFILE_CHANGE_APPROVED",
  "PROFILE_CHANGE_REJECTED",
  "NEW_PROFILE_SUBMITTED",
  "NEW_PROFILE_CREATED",
  "NEW_PROFILE_LINKED_EXISTING",
  "NEW_PROFILE_REJECTED",
  "EVENT_SUBMITTED",
  "EVENT_CREATED",
  "EVENT_LINKED_EXISTING",
  "EVENT_CHANGE_APPROVED",
  "EVENT_REJECTED",
  "COMMERCIAL_OFFER_CREATED",
  "COMMERCIAL_AGREEMENT_UPDATED",
  "PAYMENT_MARKED_PAID",
  "ENTITLEMENT_ACTIVATED",
  "ENTITLEMENT_EXPIRING",
  "ENTITLEMENT_EXPIRED",
] as const;
export type PartnerNotificationType = (typeof partnerNotificationTypes)[number];

type OutboxRow = {
  id: string;
  partner_account_id: string;
  notification_type: PartnerNotificationType;
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
  returnTo?: string | null;
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
  const returnTo = normalizePartnerReturnTo(input.returnTo);
  const encryptedSecret = await encryptPii(JSON.stringify({ token: input.rawToken, returnTo }), encryptionKey);
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

export async function queuePartnerPasswordResetEmail(input: {
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
  const encryptedSecret = await encryptPii(JSON.stringify({ token: input.rawToken }), encryptionKey);
  const dedupeKey = "partner-password-reset/" + id;

  await database.prepare(
    "UPDATE partner_notification_outbox SET status='EXPIRED',encrypted_secret=NULL,last_error=NULL,updated_at=?2 " +
    "WHERE partner_account_id=?1 AND notification_type='PASSWORD_RESET' AND status NOT IN ('SENT','EXPIRED')",
  ).bind(input.accountId, nowIso).run();

  await database.prepare(
    "INSERT INTO partner_notification_outbox " +
    "(id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at) " +
    "VALUES (?1,?2,'PASSWORD_RESET',?3,'PENDING',?4,?5,0,?6,?6)",
  ).bind(id, input.accountId, dedupeKey, encryptedSecret, input.expiresAt, nowIso).run();

  return id;
}

export async function queuePartnerLifecycleNotification(input: {
  accountId: string;
  notificationType: Exclude<PartnerNotificationType, "AUTH_MAGIC_LINK" | "PASSWORD_RESET">;
  dedupeKey: string;
  database?: D1Database;
  bindings?: PartnerEmailBindings;
  now?: Date;
}) {
  const database = getPartnerDatabase(input.database ?? runtimeBindings(input.bindings).DB);
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const id = crypto.randomUUID();
  await database.prepare(
    "INSERT OR IGNORE INTO partner_notification_outbox " +
    "(id,partner_account_id,notification_type,dedupe_key,status,encrypted_secret,expires_at,attempts,created_at,updated_at) " +
    "VALUES (?1,?2,?3,?4,'PENDING',NULL,?5,0,?6,?6)",
  ).bind(id, input.accountId, input.notificationType, input.dedupeKey, expiresAt, nowIso).run();
  const row = await database.prepare(
    "SELECT id FROM partner_notification_outbox WHERE dedupe_key=?1 LIMIT 1",
  ).bind(input.dedupeKey).first<{ id: string }>();
  if (!row) throw new Error("Partner notification sa nepodarilo zaradiť do outboxu.");
  return row.id;
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

  const account = await input.database.prepare(
    "SELECT email_ciphertext FROM partner_accounts WHERE id=?1 LIMIT 1",
  ).bind(input.row.partner_account_id).first<AccountEmailRow>();
  if (!account) return { ok: false as const, error: "partner_account_missing" };

  let recipient: string;
  try {
    recipient = await decryptPii(account.email_ciphertext, encryptionKey);
  } catch {
    return { ok: false as const, error: "partner_email_decrypt_failed" };
  }

  let subject = "Aktualizácia Partner účtu Psipedia";
  let text = "";
  if (input.row.notification_type === "AUTH_MAGIC_LINK") {
    if (!input.row.encrypted_secret) return { ok: false as const, error: "missing_encrypted_auth_secret" };
    let rawToken = "";
    let returnTo: string | null = null;
    try {
      const decrypted = await decryptPii(input.row.encrypted_secret, encryptionKey);
      try {
        const envelope = JSON.parse(decrypted) as { token?: unknown; returnTo?: unknown };
        rawToken = typeof envelope.token === "string" ? envelope.token : "";
        returnTo = normalizePartnerReturnTo(envelope.returnTo);
      } catch {
        rawToken = decrypted;
      }
    } catch {
      return { ok: false as const, error: "partner_auth_secret_decrypt_failed" };
    }
    if (!rawToken) return { ok: false as const, error: "partner_auth_secret_invalid" };
    const fragment = new URLSearchParams({ token: rawToken });
    if (returnTo) fragment.set("returnTo", returnTo);
    const verifyUrl = SITE_URL + "/partner/overenie#" + fragment.toString();
    subject = "Prihlásenie do Partner účtu Psipedia";
    text = [
      "Dobrý deň,",
      "",
      "kliknutím na odkaz sa bezpečne prihlásite do Partner účtu Psipedia:",
      verifyUrl,
      "",
      "Odkaz je jednorazový a platí 15 minút.",
      "Ak ste o prihlásenie nežiadali, tento e-mail ignorujte.",
    ].join("\n");
  } else if (input.row.notification_type === "PASSWORD_RESET") {
    if (!input.row.encrypted_secret) return { ok: false as const, error: "missing_encrypted_password_reset_secret" };
    let rawToken = "";
    try {
      const decrypted = await decryptPii(input.row.encrypted_secret, encryptionKey);
      const envelope = JSON.parse(decrypted) as { token?: unknown };
      rawToken = typeof envelope.token === "string" ? envelope.token : "";
    } catch {
      return { ok: false as const, error: "partner_password_reset_secret_decrypt_failed" };
    }
    if (!rawToken) return { ok: false as const, error: "partner_password_reset_secret_invalid" };
    const fragment = new URLSearchParams({ token: rawToken });
    const resetUrl = SITE_URL + "/partner/obnova-hesla#" + fragment.toString();
    subject = "Obnovenie hesla Partner účtu Psipedia";
    text = [
      "Dobrý deň,",
      "",
      "heslo Partner účtu môžete bezpečne obnoviť cez tento odkaz:",
      resetUrl,
      "",
      "Odkaz je jednorazový a platí 30 minút.",
      "Ak ste o zmenu hesla nežiadali, tento e-mail ignorujte.",
    ].join("\n");
  } else {
    const copy: Record<Exclude<PartnerNotificationType, "AUTH_MAGIC_LINK" | "PASSWORD_RESET">, { subject: string; lines: string[] }> = {
      CLAIM_SUBMITTED: {
        subject: "Žiadosť o prevzatie profilu sme prijali",
        lines: ["Vašu žiadosť o prevzatie existujúceho profilu sme prijali a čaká na kontrolu."],
      },
      CLAIM_APPROVED: {
        subject: "Žiadosť o prevzatie profilu bola schválená",
        lines: ["Žiadosť bola schválená. Profil teraz môžete spravovať vo svojom Partner účte."],
      },
      CLAIM_REJECTED: {
        subject: "Výsledok žiadosti o prevzatie profilu",
        lines: ["Vaša žiadosť o prevzatie profilu nebola schválená. Ak potrebujete viac informácií, kontaktujte Psipediu."],
      },
      VERIFICATION_APPROVED: {
        subject: "Správca profilu bol overený",
        lines: ["Psipedia overila vaše oprávnenie spravovať profil. Stav overenia sa zobrazí vo vašom Partner účte."],
      },
      VERIFICATION_REJECTED: {
        subject: "Výsledok overenia správcu profilu",
        lines: ["Overenie správcu profilu nebolo schválené. Žiadosť môžete po doplnení podkladov odoslať znova."],
      },
      PROFILE_CHANGE_SUBMITTED: {
        subject: "Návrh úprav profilu sme prijali",
        lines: ["Návrh úprav profilu sme prijali a čaká na kontrolu."],
      },
      PROFILE_CHANGE_APPROVED: {
        subject: "Úpravy profilu boli schválené",
        lines: ["Úpravy profilu boli schválené a zverejnené v canonical profile."],
      },
      PROFILE_CHANGE_REJECTED: {
        subject: "Návrh úprav nebol schválený",
        lines: ["Návrh úprav nebol schválený. Stav a bezpečný dôvod nájdete vo svojom Partner účte."],
      },
      NEW_PROFILE_SUBMITTED: {
        subject: "Návrh nového profilu sme prijali",
        lines: ["Návrh nového profilu sme prijali a čaká na moderátorskú kontrolu. Verejný profil zatiaľ nevznikol."],
      },
      NEW_PROFILE_CREATED: {
        subject: "Nový profil bol vytvorený ako koncept",
        lines: ["Návrh bol schválený a profil bol vytvorený ako koncept. Profil ešte nemusí byť verejne publikovaný."],
      },
      NEW_PROFILE_LINKED_EXISTING: {
        subject: "Návrh bol prepojený s existujúcim profilom",
        lines: ["Návrh bol schválený prepojením s existujúcim profilom. Profil teraz môžete spravovať v Partner účte; overenie správcu zostáva samostatné."],
      },
      NEW_PROFILE_REJECTED: {
        subject: "Návrh nového profilu nebol schválený",
        lines: ["Návrh nového profilu nebol schválený. Bezpečný dôvod nájdete vo svojom Partner účte."],
      },
      EVENT_SUBMITTED: {
        subject: "Návrh podujatia sme prijali",
        lines: ["Podujatie sme prijali a čaká na kontrolu. Zatiaľ nebolo publikované."],
      },
      EVENT_CREATED: {
        subject: "Podujatie bolo vytvorené ako koncept",
        lines: ["Podujatie bolo vytvorené ako koncept a zatiaľ nemusí byť verejne publikované."],
      },
      EVENT_LINKED_EXISTING: {
        subject: "Podujatie bolo prepojené s existujúcim záznamom",
        lines: ["Návrh bol schválený prepojením s existujúcim podujatím. Podujatie teraz nájdete medzi svojimi Partner zdrojmi."],
      },
      EVENT_CHANGE_APPROVED: {
        subject: "Úpravy podujatia boli schválené",
        lines: ["Navrhované úpravy podujatia boli schválené. Stav publikovania podujatia zostal zachovaný."],
      },
      EVENT_REJECTED: {
        subject: "Návrh podujatia nebol schválený",
        lines: ["Návrh podujatia alebo jeho úprav nebol schválený. Bezpečný dôvod nájdete vo svojom Partner účte."],
      },
      COMMERCIAL_OFFER_CREATED: {
        subject: "Nová obchodná ponuka v Partner účte",
        lines: ["V Partner účte máte novú ponuku alebo dohodu k propagácii. Cena, obdobie a platobný režim sú dostupné iba vo vašom Partner účte."],
      },
      COMMERCIAL_AGREEMENT_UPDATED: {
        subject: "Obchodná dohoda bola aktualizovaná",
        lines: ["Stav vašej obchodnej dohody sa zmenil. Aktuálne údaje nájdete v sekcii Propagácia."],
      },
      PAYMENT_MARKED_PAID: {
        subject: "Platba bola zaevidovaná",
        lines: ["Psipedia zaevidovala platbu k vašej obchodnej dohode. Aktivácia plateného benefitu je samostatný administrátorský krok."],
      },
      ENTITLEMENT_ACTIVATED: {
        subject: "Platený benefit bol aktivovaný",
        lines: ["Platený benefit bol administrátorom aktivovaný pre dohodnuté obdobie. Premium a sponzorované zobrazenie nepredstavujú overenie ani odporúčanie Psipedie."],
      },
      ENTITLEMENT_EXPIRING: {
        subject: "Platený benefit sa blíži ku koncu",
        lines: ["Platnosť plateného benefitu sa blíži ku koncu. Ak chcete pokračovať, kontaktujte Psipediu."],
      },
      ENTITLEMENT_EXPIRED: {
        subject: "Platnosť plateného benefitu skončila",
        lines: ["Dohodnuté obdobie plateného benefitu skončilo. Verejné zobrazenie sa po konci obdobia automaticky neuplatňuje."],
      },
    };
    const selected = copy[input.row.notification_type];
    subject = selected.subject;
    text = ["Dobrý deň,", "", ...selected.lines, "", "Psipedia.sk"].join("\n");
  }

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
