import { createD1RateLimitStore, deriveRateLimitKey, enforceRateLimit } from "@/lib/rate-limit";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";
import { createD1TurnstileReplayStore, verifyTurnstile } from "@/lib/turnstile";

export class ReviewAuthorSecurityError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function assertReviewAuthorJsonMutation(request: Request) {
  try {
    assertPartnerJsonMutation(request);
  } catch (error) {
    if (error instanceof PartnerSecurityError) {
      throw new ReviewAuthorSecurityError(error.message, error.status);
    }
    throw error;
  }
}

function clientIdentifier(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
}

export async function enforceReviewAuthorAuthRateLimits(input: {
  database: D1Database;
  request: Request;
  normalizedEmail: string;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const emailKey = await deriveRateLimitKey("review-auth-email", input.normalizedEmail, input.hashKey);
  const clientKey = await deriveRateLimitKey("review-auth-client", clientIdentifier(input.request), input.hashKey);
  const [emailResult, clientResult] = await Promise.all([
    enforceRateLimit(store, emailKey, 5, 15 * 60, now),
    enforceRateLimit(store, clientKey, 20, 15 * 60, now),
  ]);
  if (!emailResult.allowed || !clientResult.allowed) {
    throw new ReviewAuthorSecurityError("Za krátky čas bolo odoslaných priveľa požiadaviek. Skúste to neskôr.", 429);
  }
}

export async function enforceReviewAuthorConsumeRateLimit(input: {
  database: D1Database;
  request: Request;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const clientKey = await deriveRateLimitKey("review-auth-consume-client", clientIdentifier(input.request), input.hashKey);
  const result = await enforceRateLimit(store, clientKey, 30, 15 * 60, now);
  if (!result.allowed) {
    throw new ReviewAuthorSecurityError("Odkaz sa momentálne nedá overiť. Skúste to neskôr.", 429);
  }
}

export async function verifyReviewAuthorTurnstile(input: {
  database: D1Database;
  request: Request;
  token: string;
  secret: string;
  now?: Date;
}) {
  const url = new URL(input.request.url);
  const result = await verifyTurnstile({
    token: input.token,
    secret: input.secret,
    expectedHostname: url.hostname,
    expectedAction: "review_author_auth_request",
    remoteIp: input.request.headers.get("cf-connecting-ip")?.trim() || undefined,
    replayStore: createD1TurnstileReplayStore(input.database),
    now: input.now,
  });
  if (!result.ok) {
    throw new ReviewAuthorSecurityError("Bezpečnostné overenie zlyhalo. Obnovte formulár a skúste to znova.", 400);
  }
  return result;
}
