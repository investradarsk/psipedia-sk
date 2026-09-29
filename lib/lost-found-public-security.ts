import { createD1RateLimitStore, deriveRateLimitKey, enforceRateLimit } from "@/lib/rate-limit";
import { assertPartnerMutationOrigin, PartnerSecurityError } from "@/lib/partner-security";
import { LOST_FOUND_TURNSTILE_ACTION, PublicLostFoundSubmissionError } from "@/lib/lost-found-public-submission";
import { createD1TurnstileReplayStore, verifyTurnstile } from "@/lib/turnstile";

function clientIdentifier(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
}

export function assertPublicLostFoundMutation(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw new PublicLostFoundSubmissionError("Odoslané údaje nie sú platné.", 415, "INVALID_CONTENT_TYPE");
  }
  try {
    assertPartnerMutationOrigin(request);
  } catch (error) {
    if (error instanceof PartnerSecurityError) {
      throw new PublicLostFoundSubmissionError("Požiadavku sa nepodarilo overiť.", error.status, "ORIGIN_REJECTED");
    }
    throw error;
  }
}

export async function enforcePublicLostFoundRateLimits(input: {
  database: D1Database;
  request: Request;
  contactIdentity: string;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const [clientKey, contactKey] = await Promise.all([
    deriveRateLimitKey("lost-found-public-client", clientIdentifier(input.request), input.hashKey),
    deriveRateLimitKey("lost-found-public-contact", input.contactIdentity, input.hashKey),
  ]);
  const [clientResult, contactResult] = await Promise.all([
    enforceRateLimit(store, clientKey, 12, 60 * 60, now),
    enforceRateLimit(store, contactKey, 5, 60 * 60, now),
  ]);
  if (!clientResult.allowed || !contactResult.allowed) {
    throw new PublicLostFoundSubmissionError(
      "Za krátky čas bolo odoslaných priveľa hlásení. Skúste to neskôr.",
      429,
      "RATE_LIMITED",
    );
  }
}

export async function verifyPublicLostFoundTurnstile(input: {
  database: D1Database;
  request: Request;
  token: string;
  secret: string;
  now?: Date;
}) {
  if (
    process.env.PSIPEDIA_E2E_LOCAL_BOOTSTRAP === "1"
    && input.token === "e2e-lost-found-turnstile"
  ) {
    return { ok: true as const, challengeAt: (input.now ?? new Date()).toISOString() };
  }

  const url = new URL(input.request.url);
  const result = await verifyTurnstile({
    token: input.token,
    secret: input.secret,
    expectedHostname: url.hostname,
    expectedAction: LOST_FOUND_TURNSTILE_ACTION,
    remoteIp: input.request.headers.get("cf-connecting-ip")?.trim() || undefined,
    replayStore: createD1TurnstileReplayStore(input.database),
    now: input.now,
  });
  if (!result.ok) {
    throw new PublicLostFoundSubmissionError(
      "Bezpečnostné overenie zlyhalo. Obnovte formulár a skúste to znova.",
      400,
      "SECURITY_CHECK_FAILED",
      "turnstileToken",
    );
  }
  return result;
}
