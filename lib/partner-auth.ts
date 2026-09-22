import { env } from "cloudflare:workers";
import { clearManagementSessionCookie } from "@/lib/resource-access";
import { consumeResourceAccessToken } from "@/lib/resource-access-store";
import { decryptPii, encryptPii, hashPii, normalizeEmail } from "@/lib/pii-crypto";
import {
  PARTNER_ACCOUNT_RESOURCE_TYPE,
  PARTNER_AUTH_PURPOSE,
  PARTNER_SESSION_COOKIE,
  activateVerifiedPartnerAccount,
  createOrGetPendingPartnerAccount,
  createPartnerSession,
  deactivatePartnerAccount,
  getPartnerAccountByEmailHash,
  getPartnerAccountById,
  getPartnerDatabase,
  issuePartnerAuthToken,
  resolvePartnerSessionToken,
  revokeAllPartnerSessions as revokeAllPartnerSessionsStore,
  revokePartnerSessionToken,
  type PartnerAccountRecord,
} from "@/lib/partner-auth-store";
import {
  processPartnerNotificationOutboxItem,
  queuePartnerMagicLinkEmail,
  type PartnerEmailBindings,
} from "@/lib/partner-email";
import {
  PartnerSecurityError,
  enforcePartnerAuthRateLimits,
  verifyPartnerTurnstile,
} from "@/lib/partner-security";
import { appendPartnerAuditEvent } from "@/lib/partner-platform";
import { normalizePartnerReturnTo } from "@/lib/partner-return-to";

export const PARTNER_AUTH_GENERIC_RESPONSE =
  "Ak je možné pokračovať, poslali sme vám prihlasovací odkaz e-mailom.";

export class PartnerAuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type PartnerIdentity = {
  accountId: string;
  email: string;
  status: "ACTIVE";
  emailVerifiedAt: string;
};

export type PartnerAuthBindings = PartnerEmailBindings & {
  TURNSTILE_SECRET_KEY?: string;
  PII_HASH_KEY?: string;
};

function runtimeBindings(bindings?: PartnerAuthBindings) {
  return bindings ?? env as unknown as PartnerAuthBindings;
}

function requireBinding(value: string | undefined, label: string) {
  const clean = value?.trim();
  if (!clean) throw new PartnerAuthError(label + " nie je nakonfigurovaný.", 503);
  return clean;
}

function normalizePartnerEmail(value: unknown) {
  if (typeof value !== "string") throw new PartnerAuthError("Zadajte platný e-mail.");
  const normalized = normalizeEmail(value);
  if (
    normalized.length < 3
    || normalized.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new PartnerAuthError("Zadajte platný e-mail.");
  }
  return normalized;
}

function normalizeTurnstileToken(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) {
    throw new PartnerAuthError("Dokončite bezpečnostné overenie.");
  }
  return value.trim();
}

function normalizeMagicToken(value: unknown) {
  if (typeof value !== "string") throw new PartnerAuthError("Prihlasovací odkaz nie je platný.");
  const clean = value.trim();
  if (clean.length < 32 || clean.length > 512 || !/^[A-Za-z0-9_-]+$/.test(clean)) {
    throw new PartnerAuthError("Prihlasovací odkaz nie je platný.");
  }
  return clean;
}

function cookieValue(cookieHeader: string | null | undefined, name: string) {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function partnerSessionTokenFromCookieHeader(cookieHeader: string | null | undefined) {
  return cookieValue(cookieHeader, PARTNER_SESSION_COOKIE);
}

export function clearPartnerSessionCookie() {
  return clearManagementSessionCookie(PARTNER_SESSION_COOKIE);
}

function isRetryablePartnerEmailError(error: string) {
  return error === "resend_request_failed"
    || error === "resend_http_429"
    || /^resend_http_5\d\d$/.test(error);
}

export async function requestPartnerMagicLink(input: {
  request: Request;
  email: unknown;
  turnstileToken: unknown;
  returnTo?: unknown;
  database?: D1Database;
  bindings?: PartnerAuthBindings;
  now?: Date;
}) {
  const bindings = runtimeBindings(input.bindings);
  const database = getPartnerDatabase(input.database ?? bindings.DB);
  const encryptionKey = requireBinding(bindings.PII_ENCRYPTION_KEY, "PII_ENCRYPTION_KEY");
  const hashKey = requireBinding(bindings.PII_HASH_KEY, "PII_HASH_KEY");
  const turnstileSecret = requireBinding(bindings.TURNSTILE_SECRET_KEY, "TURNSTILE_SECRET_KEY");
  const email = normalizePartnerEmail(input.email);
  const turnstileToken = normalizeTurnstileToken(input.turnstileToken);
  const returnTo = normalizePartnerReturnTo(input.returnTo);
  const now = input.now ?? new Date();

  await verifyPartnerTurnstile({
    database,
    request: input.request,
    token: turnstileToken,
    secret: turnstileSecret,
    action: "partner_auth_request",
    now,
  });
  await enforcePartnerAuthRateLimits({
    database,
    request: input.request,
    normalizedEmail: email,
    hashKey,
    now,
  });

  const emailHash = await hashPii(email, hashKey);
  const existing = await getPartnerAccountByEmailHash(emailHash, database);
  const account = existing ?? await createOrGetPendingPartnerAccount({
    emailCiphertext: await encryptPii(email, encryptionKey),
    emailHash,
    now,
    database,
  });
  if (!existing) {
    await appendPartnerAuditEvent({ actorType: "SYSTEM", actorRef: "partner-auth", action: "ACCOUNT_CREATED", targetType: "PARTNER_ACCOUNT", targetId: account.id, database, now });
  }

  // Public response remains identical for every lifecycle state. Suspended or
  // deactivated accounts do not receive a usable token.
  if (account.status === "SUSPENDED" || account.status === "DEACTIVATED") {
    return { message: PARTNER_AUTH_GENERIC_RESPONSE };
  }

  const authToken = await issuePartnerAuthToken(account.id, database);
  const outboxId = await queuePartnerMagicLinkEmail({
    accountId: account.id,
    rawToken: authToken.token,
    returnTo,
    expiresAt: authToken.expiresAt,
    database,
    bindings,
    now,
  });

  // Magic links are time-sensitive. Attempt delivery immediately; the durable
  // outbox remains retryable if the provider is temporarily unavailable.
  try {
    let delivery = await processPartnerNotificationOutboxItem(outboxId, {
      database,
      bindings,
      now,
    });

    // The scheduled sweep runs hourly, while a magic link lives only 15
    // minutes. Retry one transient provider/network failure immediately with
    // the same idempotency key before leaving the durable outbox as fallback.
    if (delivery.status === "failed" && isRetryablePartnerEmailError(delivery.error)) {
      delivery = await processPartnerNotificationOutboxItem(outboxId, {
        database,
        bindings,
        now: new Date(now.getTime() + 250),
      });
    }

    if (delivery.status === "failed") {
      console.error(JSON.stringify({
        event: "partner_auth_email",
        accountId: account.id,
        outboxId,
        result: "failed",
        error: delivery.error,
      }));
    }
  } catch {
    console.error(JSON.stringify({
      event: "partner_auth_email",
      accountId: account.id,
      outboxId,
      result: "failed",
      error: "outbox_processing_failed",
    }));
  }

  return { message: PARTNER_AUTH_GENERIC_RESPONSE };
}

export async function consumePartnerMagicLink(input: {
  token: unknown;
  database?: D1Database;
  now?: Date;
}) {
  const database = getPartnerDatabase(input.database);
  const now = input.now ?? new Date();
  const token = normalizeMagicToken(input.token);
  const consumed = await consumeResourceAccessToken(database, {
    token,
    purpose: PARTNER_AUTH_PURPOSE,
    now,
  });

  if (!consumed || consumed.resourceType !== PARTNER_ACCOUNT_RESOURCE_TYPE) {
    throw new PartnerAuthError("Prihlasovací odkaz je neplatný alebo už expiroval.");
  }

  const account = await getPartnerAccountById(consumed.subjectId, database);
  if (!account || account.status === "SUSPENDED" || account.status === "DEACTIVATED") {
    if (account) await revokeAllPartnerSessionsStore(account.id, now, database);
    throw new PartnerAuthError("Prihlasovací odkaz je neplatný alebo už expiroval.");
  }

  const active = await activateVerifiedPartnerAccount(account.id, now, database);
  if (!active || active.status !== "ACTIVE" || !active.emailVerifiedAt) {
    throw new PartnerAuthError("Prihlasovací odkaz je neplatný alebo už expiroval.");
  }
  if (!account.emailVerifiedAt) {
    await appendPartnerAuditEvent({ actorType: "PARTNER", actorRef: `partner:${account.id}`, action: "EMAIL_VERIFIED", targetType: "PARTNER_ACCOUNT", targetId: account.id, database, now });
  }

  const session = await createPartnerSession(active.id, database);
  console.info(JSON.stringify({
    event: "partner_auth_session",
    accountId: active.id,
    result: "created",
  }));
  return {
    accountId: active.id,
    cookie: session.cookie,
    expiresAt: session.expiresAt,
  };
}

async function activePartnerIdentity(
  token: string,
  input: { database?: D1Database; bindings?: PartnerAuthBindings; now?: Date } = {},
): Promise<PartnerIdentity | null> {
  const bindings = runtimeBindings(input.bindings);
  const database = getPartnerDatabase(input.database ?? bindings.DB);
  const resolved = await resolvePartnerSessionToken(token, input.now ?? new Date(), database);
  if (!resolved) return null;

  const account = await getPartnerAccountById(resolved.subjectId, database);
  if (!account || account.status !== "ACTIVE" || !account.emailVerifiedAt) {
    await revokePartnerSessionToken(token, input.now ?? new Date(), database);
    return null;
  }

  const encryptionKey = requireBinding(bindings.PII_ENCRYPTION_KEY, "PII_ENCRYPTION_KEY");
  const email = await decryptPii(account.emailCiphertext, encryptionKey);
  return {
    accountId: account.id,
    email,
    status: "ACTIVE",
    emailVerifiedAt: account.emailVerifiedAt,
  };
}

export async function getPartnerSession(
  input: {
    token?: string | null;
    cookieHeader?: string | null;
    database?: D1Database;
    bindings?: PartnerAuthBindings;
    now?: Date;
  } = {},
) {
  const token = input.token ?? partnerSessionTokenFromCookieHeader(input.cookieHeader);
  if (!token) return null;
  return activePartnerIdentity(token, input);
}

export async function requirePartnerAccount(
  input: {
    token?: string | null;
    cookieHeader?: string | null;
    database?: D1Database;
    bindings?: PartnerAuthBindings;
    now?: Date;
  } = {},
) {
  const identity = await getPartnerSession(input);
  if (!identity) throw new PartnerAuthError("Prihlásenie je potrebné.", 401);
  return identity;
}

export async function revokePartnerSession(input: {
  token?: string | null;
  cookieHeader?: string | null;
  database?: D1Database;
  now?: Date;
}) {
  const token = input.token ?? partnerSessionTokenFromCookieHeader(input.cookieHeader);
  if (!token) return;
  await revokePartnerSessionToken(token, input.now ?? new Date(), input.database);
}

export async function revokeAllPartnerSessions(
  accountId: string,
  input: { database?: D1Database; now?: Date } = {},
) {
  await revokeAllPartnerSessionsStore(accountId, input.now ?? new Date(), input.database);
}

export async function deactivateCurrentPartnerAccount(input: {
  request: Request;
  turnstileToken: unknown;
  cookieHeader?: string | null;
  database?: D1Database;
  bindings?: PartnerAuthBindings;
  now?: Date;
}) {
  const bindings = runtimeBindings(input.bindings);
  const database = getPartnerDatabase(input.database ?? bindings.DB);
  const identity = await requirePartnerAccount({
    cookieHeader: input.cookieHeader ?? input.request.headers.get("cookie"),
    database,
    bindings,
    now: input.now,
  });
  const secret = requireBinding(bindings.TURNSTILE_SECRET_KEY, "TURNSTILE_SECRET_KEY");
  await verifyPartnerTurnstile({
    database,
    request: input.request,
    token: normalizeTurnstileToken(input.turnstileToken),
    secret,
    action: "partner_account_deactivate",
    now: input.now,
  });
  await deactivatePartnerAccount(identity.accountId, input.now ?? new Date(), database);
  await appendPartnerAuditEvent({ actorType: "PARTNER", actorRef: `partner:${identity.accountId}`, action: "ACCOUNT_DEACTIVATED", targetType: "PARTNER_ACCOUNT", targetId: identity.accountId, database, now: input.now });
  await appendPartnerAuditEvent({ actorType: "PARTNER", actorRef: `partner:${identity.accountId}`, action: "SESSIONS_REVOKED", targetType: "PARTNER_ACCOUNT", targetId: identity.accountId, metadata: { reason: "deactivated" }, database, now: input.now });
  console.info(JSON.stringify({
    event: "partner_account_lifecycle",
    accountId: identity.accountId,
    result: "deactivated",
  }));
  return identity.accountId;
}

export function isPartnerAuthPublicError(error: unknown): error is PartnerAuthError | PartnerSecurityError {
  return error instanceof PartnerAuthError || error instanceof PartnerSecurityError;
}

export function partnerAccountCanAuthenticate(account: PartnerAccountRecord) {
  return account.status === "PENDING_VERIFICATION" || account.status === "ACTIVE";
}
