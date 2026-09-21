import { createD1RateLimitStore, deriveRateLimitKey, enforceRateLimit } from "@/lib/rate-limit";
import { createD1TurnstileReplayStore, verifyTurnstile } from "@/lib/turnstile";

export class PartnerSecurityError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function assertPartnerJsonMutation(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new PartnerSecurityError("Požiadavka musí používať application/json.", 415);
  }

  const url = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!origin || origin !== url.origin) {
    throw new PartnerSecurityError("Cross-origin mutation bola zablokovaná.", 403);
  }

  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    throw new PartnerSecurityError("Cross-site mutation bola zablokovaná.", 403);
  }
}

function clientIdentifier(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
}

export async function enforcePartnerAuthRateLimits(input: {
  database: D1Database;
  request: Request;
  normalizedEmail: string;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const emailKey = await deriveRateLimitKey("partner-auth-email", input.normalizedEmail, input.hashKey);
  const clientKey = await deriveRateLimitKey("partner-auth-client", clientIdentifier(input.request), input.hashKey);
  const [emailResult, clientResult] = await Promise.all([
    enforceRateLimit(store, emailKey, 5, 15 * 60, now),
    enforceRateLimit(store, clientKey, 20, 15 * 60, now),
  ]);
  if (!emailResult.allowed || !clientResult.allowed) {
    throw new PartnerSecurityError("Za krátky čas bolo odoslaných priveľa požiadaviek. Skúste to neskôr.", 429);
  }
}

export async function verifyPartnerTurnstile(input: {
  database: D1Database;
  request: Request;
  token: string;
  secret: string;
  action: "partner_auth_request" | "partner_account_deactivate";
  now?: Date;
}) {
  const url = new URL(input.request.url);
  const result = await verifyTurnstile({
    token: input.token,
    secret: input.secret,
    expectedHostname: url.hostname,
    expectedAction: input.action,
    remoteIp: input.request.headers.get("cf-connecting-ip")?.trim() || undefined,
    replayStore: createD1TurnstileReplayStore(input.database),
    now: input.now,
  });
  if (!result.ok) throw new PartnerSecurityError("Bezpečnostné overenie zlyhalo. Obnovte formulár a skúste to znova.", 400);
  return result;
}
