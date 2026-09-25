import { createD1RateLimitStore, deriveRateLimitKey, enforceRateLimit } from "@/lib/rate-limit";
import { createD1TurnstileReplayStore, verifyTurnstile } from "@/lib/turnstile";

export class PartnerSecurityError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function assertPartnerMutationOrigin(request: Request) {
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

export function assertPartnerJsonMutation(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    throw new PartnerSecurityError("Požiadavka musí používať application/json.", 415);
  }
  assertPartnerMutationOrigin(request);
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
  action: "partner_auth_request" | "partner_password_register" | "partner_password_login" | "partner_password_reset_request" | "partner_account_deactivate";
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

export async function enforcePartnerProfileChangeRateLimit(input: {
  database: D1Database;
  accountId: string;
  resourceId: string;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const key = await deriveRateLimitKey(
    "partner-profile-change",
    input.accountId + ":" + input.resourceId,
    input.hashKey,
  );
  const result = await enforceRateLimit(store, key, 6, 60 * 60, now);
  if (!result.allowed) {
    throw new PartnerSecurityError("Za krátky čas bolo odoslaných priveľa návrhov úprav. Skúste to neskôr.", 429);
  }
  return result;
}

export async function enforcePartnerNewProfileRateLimit(input: {
  database: D1Database;
  accountId: string;
  identityFingerprint: string;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const [accountKey, identityKey] = await Promise.all([
    deriveRateLimitKey("partner-new-profile-account", input.accountId, input.hashKey),
    deriveRateLimitKey("partner-new-profile-identity", input.accountId + ":" + input.identityFingerprint, input.hashKey),
  ]);
  const [accountResult, identityResult] = await Promise.all([
    enforceRateLimit(store, accountKey, 8, 60 * 60, now),
    enforceRateLimit(store, identityKey, 3, 60 * 60, now),
  ]);
  if (!accountResult.allowed || !identityResult.allowed) {
    throw new PartnerSecurityError("Za krátky čas bolo odoslaných priveľa návrhov nových profilov. Skúste to neskôr.", 429);
  }
  return { account: accountResult, identity: identityResult };
}

export async function enforcePartnerNewProfileScanRateLimit(input: {
  database: D1Database;
  accountId: string;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const key = await deriveRateLimitKey("partner-new-profile-scan", input.accountId, input.hashKey);
  const result = await enforceRateLimit(store, key, 30, 60 * 60, now);
  if (!result.allowed) {
    throw new PartnerSecurityError("Za krátky čas bolo vykonaných priveľa kontrol nového profilu. Skúste to neskôr.", 429);
  }
  return result;
}


export async function enforcePartnerEventCreateRateLimit(input: {
  database: D1Database;
  accountId: string;
  identityFingerprint: string;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const [accountKey, identityKey] = await Promise.all([
    deriveRateLimitKey("partner-event-create-account", input.accountId, input.hashKey),
    deriveRateLimitKey("partner-event-create-identity", input.accountId + ":" + input.identityFingerprint, input.hashKey),
  ]);
  const [accountResult, identityResult] = await Promise.all([
    enforceRateLimit(store, accountKey, 12, 60 * 60, now),
    enforceRateLimit(store, identityKey, 3, 60 * 60, now),
  ]);
  if (!accountResult.allowed || !identityResult.allowed) {
    throw new PartnerSecurityError("Za krátky čas bolo odoslaných priveľa návrhov podujatí. Skúste to neskôr.", 429);
  }
  return { account: accountResult, identity: identityResult };
}

export async function enforcePartnerEventUpdateRateLimit(input: {
  database: D1Database;
  accountId: string;
  resourceId: string;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const key = await deriveRateLimitKey(
    "partner-event-update",
    input.accountId + ":" + input.resourceId,
    input.hashKey,
  );
  const result = await enforceRateLimit(store, key, 8, 60 * 60, now);
  if (!result.allowed) {
    throw new PartnerSecurityError("Za krátky čas bolo odoslaných priveľa návrhov úprav podujatia. Skúste to neskôr.", 429);
  }
  return result;
}


export async function enforcePartnerMediaUploadRateLimit(input: {
  database: D1Database;
  accountId: string;
  hashKey: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const store = createD1RateLimitStore(input.database);
  const key = await deriveRateLimitKey("partner-media-upload", input.accountId, input.hashKey);
  const result = await enforceRateLimit(store, key, 20, 60 * 60, now);
  if (!result.allowed) {
    throw new PartnerSecurityError("Za krátky čas bolo nahraných priveľa obrázkov. Skúste to neskôr.", 429);
  }
  return result;
}
