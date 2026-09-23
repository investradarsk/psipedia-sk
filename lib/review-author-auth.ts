import { env } from "cloudflare:workers";
import { clearManagementSessionCookie } from "@/lib/resource-access";
import { consumeResourceAccessToken } from "@/lib/resource-access-store";
import { encryptPii, hashPii, normalizeEmail } from "@/lib/pii-crypto";
import {
  REVIEW_AUTHOR_AUTH_PURPOSE,
  REVIEW_AUTHOR_RESOURCE_TYPE,
  REVIEW_AUTHOR_SESSION_COOKIE,
  activateVerifiedReviewAuthor,
  createOrGetPendingReviewAuthor,
  createReviewAuthorSession,
  getReviewAuthorByEmailHash,
  getReviewAuthorById,
  getReviewAuthorDatabase,
  issueReviewAuthorAuthToken,
  resolveReviewAuthorSessionToken,
  revokeAllReviewAuthorSessions,
  revokeReviewAuthorSessionToken,
  type ReviewAuthorRecord,
} from "@/lib/review-author-auth-store";
import {
  processReviewAuthorNotificationOutboxItem,
  queueReviewAuthorMagicLinkEmail,
  type ReviewAuthorEmailBindings,
} from "@/lib/review-author-email";
import { normalizeReviewAuthorReturnTo } from "@/lib/review-author-return-to";
import {
  ReviewAuthorSecurityError,
  enforceReviewAuthorAuthRateLimits,
  enforceReviewAuthorConsumeRateLimit,
  verifyReviewAuthorTurnstile,
} from "@/lib/review-author-security";

export const REVIEW_AUTHOR_AUTH_GENERIC_RESPONSE =
  "Ak je možné pokračovať, poslali sme vám overovací odkaz e-mailom.";

export class ReviewAuthorAuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type ReviewAuthorIdentity = {
  authorId: string;
  status: "ACTIVE";
  emailVerifiedAt: string;
  displayName: string | null;
};

export type ReviewAuthorAuthBindings = ReviewAuthorEmailBindings & {
  TURNSTILE_SECRET_KEY?: string;
  PII_HASH_KEY?: string;
};

function runtimeBindings(bindings?: ReviewAuthorAuthBindings) {
  return bindings ?? env as unknown as ReviewAuthorAuthBindings;
}

function requireBinding(value: string | undefined, label: string) {
  const clean = value?.trim();
  if (!clean) throw new ReviewAuthorAuthError(label + " nie je nakonfigurovaný.", 503);
  return clean;
}

export function normalizeReviewAuthorEmail(value: unknown) {
  if (typeof value !== "string") throw new ReviewAuthorAuthError("Zadajte platný e-mail.");
  const normalized = normalizeEmail(value);
  if (
    normalized.length < 3
    || normalized.length > 320
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new ReviewAuthorAuthError("Zadajte platný e-mail.");
  }
  return normalized;
}

function normalizeTurnstileToken(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) {
    throw new ReviewAuthorAuthError("Dokončite bezpečnostné overenie.");
  }
  return value.trim();
}

function normalizeMagicToken(value: unknown) {
  if (typeof value !== "string") throw new ReviewAuthorAuthError("Overovací odkaz nie je platný.");
  const clean = value.trim();
  if (clean.length < 32 || clean.length > 512 || !/^[A-Za-z0-9_-]+$/.test(clean)) {
    throw new ReviewAuthorAuthError("Overovací odkaz nie je platný.");
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

export function reviewAuthorSessionTokenFromCookieHeader(cookieHeader: string | null | undefined) {
  return cookieValue(cookieHeader, REVIEW_AUTHOR_SESSION_COOKIE);
}

export function clearReviewAuthorSessionCookie() {
  return clearManagementSessionCookie(REVIEW_AUTHOR_SESSION_COOKIE);
}

function isRetryableReviewAuthorEmailError(error: string) {
  return error === "resend_request_failed"
    || error === "resend_http_429"
    || /^resend_http_5\d\d$/.test(error);
}

export async function requestReviewAuthorMagicLink(input: {
  request: Request;
  email: unknown;
  turnstileToken: unknown;
  returnTo?: unknown;
  database?: D1Database;
  bindings?: ReviewAuthorAuthBindings;
  now?: Date;
}) {
  const bindings = runtimeBindings(input.bindings);
  const database = getReviewAuthorDatabase(input.database ?? bindings.DB);
  const encryptionKey = requireBinding(bindings.PII_ENCRYPTION_KEY, "PII_ENCRYPTION_KEY");
  const hashKey = requireBinding(bindings.PII_HASH_KEY, "PII_HASH_KEY");
  const turnstileSecret = requireBinding(bindings.TURNSTILE_SECRET_KEY, "TURNSTILE_SECRET_KEY");
  const email = normalizeReviewAuthorEmail(input.email);
  const turnstileToken = normalizeTurnstileToken(input.turnstileToken);
  const returnTo = normalizeReviewAuthorReturnTo(input.returnTo);
  const now = input.now ?? new Date();

  await verifyReviewAuthorTurnstile({
    database,
    request: input.request,
    token: turnstileToken,
    secret: turnstileSecret,
    now,
  });
  await enforceReviewAuthorAuthRateLimits({
    database,
    request: input.request,
    normalizedEmail: email,
    hashKey,
    now,
  });

  const emailHash = await hashPii(email, hashKey);
  const existing = await getReviewAuthorByEmailHash(emailHash, database);
  const author = existing ?? await createOrGetPendingReviewAuthor({
    emailCiphertext: await encryptPii(email, encryptionKey),
    emailHash,
    now,
    database,
  });

  if (author.status === "SUSPENDED" || author.status === "DEACTIVATED") {
    return { message: REVIEW_AUTHOR_AUTH_GENERIC_RESPONSE };
  }

  const authToken = await issueReviewAuthorAuthToken(author.id, database);
  const outboxId = await queueReviewAuthorMagicLinkEmail({
    authorId: author.id,
    rawToken: authToken.token,
    returnTo,
    expiresAt: authToken.expiresAt,
    database,
    bindings,
    now,
  });

  try {
    let delivery = await processReviewAuthorNotificationOutboxItem(outboxId, {
      database,
      bindings,
      now,
    });
    if (delivery.status === "failed" && isRetryableReviewAuthorEmailError(delivery.error)) {
      delivery = await processReviewAuthorNotificationOutboxItem(outboxId, {
        database,
        bindings,
        now: new Date(now.getTime() + 250),
      });
    }
    if (delivery.status === "failed") {
      console.error(JSON.stringify({
        event: "review_author_auth_email",
        authorId: author.id,
        outboxId,
        result: "failed",
        error: delivery.error,
      }));
    }
  } catch {
    console.error(JSON.stringify({
      event: "review_author_auth_email",
      authorId: author.id,
      outboxId,
      result: "failed",
      error: "outbox_processing_failed",
    }));
  }

  console.info(JSON.stringify({
    event: "review_author_auth_request",
    authorId: author.id,
    result: "accepted",
  }));
  return { message: REVIEW_AUTHOR_AUTH_GENERIC_RESPONSE };
}

export async function consumeReviewAuthorMagicLink(input: {
  request?: Request;
  token: unknown;
  database?: D1Database;
  bindings?: ReviewAuthorAuthBindings;
  now?: Date;
}) {
  const bindings = runtimeBindings(input.bindings);
  const database = getReviewAuthorDatabase(input.database ?? bindings.DB);
  const now = input.now ?? new Date();
  if (input.request) {
    const hashKey = requireBinding(bindings.PII_HASH_KEY, "PII_HASH_KEY");
    await enforceReviewAuthorConsumeRateLimit({
      database,
      request: input.request,
      hashKey,
      now,
    });
  }

  const token = normalizeMagicToken(input.token);
  const consumed = await consumeResourceAccessToken(database, {
    token,
    purpose: REVIEW_AUTHOR_AUTH_PURPOSE,
    now,
  });

  if (!consumed || consumed.resourceType !== REVIEW_AUTHOR_RESOURCE_TYPE) {
    throw new ReviewAuthorAuthError("Overovací odkaz je neplatný, expirovaný alebo už bol použitý.");
  }

  const author = await getReviewAuthorById(consumed.subjectId, database);
  if (!author) {
    throw new ReviewAuthorAuthError("Overovací odkaz je neplatný, expirovaný alebo už bol použitý.");
  }
  if (author.status === "SUSPENDED" || author.status === "DEACTIVATED") {
    await revokeAllReviewAuthorSessions(author.id, now, database);
    throw new ReviewAuthorAuthError("Tento účet momentálne nemôže pokračovať.", 403);
  }

  const active = await activateVerifiedReviewAuthor(author.id, now, database);
  if (!active || active.status !== "ACTIVE" || !active.emailVerifiedAt) {
    throw new ReviewAuthorAuthError("Overovací odkaz je neplatný, expirovaný alebo už bol použitý.");
  }

  const session = await createReviewAuthorSession(active.id, database);
  console.info(JSON.stringify({
    event: "review_author_session",
    authorId: active.id,
    result: "created",
  }));

  return {
    authorId: active.id,
    cookie: session.cookie,
    expiresAt: session.expiresAt,
  };
}

async function activeReviewAuthorIdentity(
  token: string,
  input: { database?: D1Database; now?: Date } = {},
): Promise<ReviewAuthorIdentity | null> {
  const database = getReviewAuthorDatabase(input.database);
  const now = input.now ?? new Date();
  const resolved = await resolveReviewAuthorSessionToken(token, now, database);
  if (!resolved) return null;

  const author = await getReviewAuthorById(resolved.subjectId, database);
  if (!author || author.status !== "ACTIVE" || !author.emailVerifiedAt) {
    await revokeReviewAuthorSessionToken(token, now, database);
    return null;
  }

  return {
    authorId: author.id,
    status: "ACTIVE",
    emailVerifiedAt: author.emailVerifiedAt,
    displayName: author.displayName,
  };
}

export async function getReviewAuthorSession(
  input: {
    token?: string | null;
    cookieHeader?: string | null;
    database?: D1Database;
    now?: Date;
  } = {},
) {
  const token = input.token ?? reviewAuthorSessionTokenFromCookieHeader(input.cookieHeader);
  if (!token) return null;
  return activeReviewAuthorIdentity(token, input);
}

export async function requireReviewAuthor(
  input: {
    token?: string | null;
    cookieHeader?: string | null;
    database?: D1Database;
    now?: Date;
  } = {},
) {
  const identity = await getReviewAuthorSession(input);
  if (!identity) throw new ReviewAuthorAuthError("Overenie e-mailu je potrebné.", 401);
  return identity;
}

export async function revokeReviewAuthorSession(input: {
  token?: string | null;
  cookieHeader?: string | null;
  database?: D1Database;
  now?: Date;
}) {
  const token = input.token ?? reviewAuthorSessionTokenFromCookieHeader(input.cookieHeader);
  if (!token) return;
  await revokeReviewAuthorSessionToken(token, input.now ?? new Date(), input.database);
  console.info(JSON.stringify({ event: "review_author_session", result: "revoked" }));
}

export function isReviewAuthorAuthPublicError(
  error: unknown,
): error is ReviewAuthorAuthError | ReviewAuthorSecurityError {
  return error instanceof ReviewAuthorAuthError || error instanceof ReviewAuthorSecurityError;
}

export function reviewAuthorCanAuthenticate(author: ReviewAuthorRecord) {
  return author.status === "PENDING_VERIFICATION" || author.status === "ACTIVE";
}
