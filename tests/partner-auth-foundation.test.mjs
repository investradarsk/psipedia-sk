import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const importTs = async (path) => import(pathToFileURL(new URL(path, root).pathname).href);

const migration = await fs.readFile(new URL("../drizzle/0059_partner_auth_foundation.sql", import.meta.url), "utf8");
const authSource = await fs.readFile(new URL("../lib/partner-auth.ts", import.meta.url), "utf8");
const storeSource = await fs.readFile(new URL("../lib/partner-auth-store.ts", import.meta.url), "utf8");
const emailSource = await fs.readFile(new URL("../lib/partner-email.ts", import.meta.url), "utf8");
const securitySource = await fs.readFile(new URL("../lib/partner-security.ts", import.meta.url), "utf8");
const turnstileClientSource = await fs.readFile(new URL("../components/partner-turnstile.tsx", import.meta.url), "utf8");
const requestRoute = await fs.readFile(new URL("../app/api/partner/auth/request-link/route.ts", import.meta.url), "utf8");
const consumeRoute = await fs.readFile(new URL("../app/api/partner/auth/consume/route.ts", import.meta.url), "utf8");
const logoutRoute = await fs.readFile(new URL("../app/api/partner/auth/logout/route.ts", import.meta.url), "utf8");
const deactivateRoute = await fs.readFile(new URL("../app/api/partner/account/deactivate/route.ts", import.meta.url), "utf8");

function key32(seed = 7) {
  const bytes = Uint8Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

test("partner account migration stores encrypted PII and canonical lifecycle only", () => {
  assert.match(migration, /CREATE TABLE `partner_accounts`/);
  assert.match(migration, /`email_ciphertext` text NOT NULL/);
  assert.match(migration, /`email_hash` text NOT NULL/);
  assert.match(migration, /PENDING_VERIFICATION.*ACTIVE.*SUSPENDED.*DEACTIVATED/);
  assert.doesNotMatch(migration, /`email` text/i);
  assert.doesNotMatch(migration, /password|password_hash|credential/i);
  assert.match(migration, /partner_accounts_email_hash_unique/);
});

test("magic links reuse the 256-bit opaque token primitive and atomic one-time consume", async () => {
  const { createOpaqueToken, hashOpaqueToken, isStoredTokenUsable } = await importTs("lib/resource-access.ts");
  const token = createOpaqueToken();
  assert.ok(token.length >= 43);
  assert.notEqual(await hashOpaqueToken(token), token);
  assert.equal(isStoredTokenUsable({ expiresAt: "2099-01-01T00:00:00.000Z" }, new Date("2026-09-21T00:00:00Z")), true);
  assert.equal(isStoredTokenUsable({ expiresAt: "2020-01-01T00:00:00.000Z" }, new Date("2026-09-21T00:00:00Z")), false);
  assert.equal(isStoredTokenUsable({ expiresAt: "2099-01-01T00:00:00.000Z", usedAt: "2026-09-21T00:00:00Z" }, new Date("2026-09-21T00:00:00Z")), false);
  assert.equal(isStoredTokenUsable({ expiresAt: "2099-01-01T00:00:00.000Z", revokedAt: "2026-09-21T00:00:00Z" }, new Date("2026-09-21T00:00:00Z")), false);

  const genericStore = await fs.readFile(new URL("../lib/resource-access-store.ts", import.meta.url), "utf8");
  assert.match(storeSource, /issueResourceAccessToken/);
  assert.match(authSource, /consumeResourceAccessToken/);
  assert.match(genericStore, /UPDATE resource_access_tokens SET used_at = \?2 WHERE token_hash = \?1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > \?2/);
  assert.doesNotMatch(migration, /raw_token|magic_token|token_plaintext/i);
});

test("magic-link token and session token are distinct, hash-only credentials", () => {
  assert.match(authSource, /consumeResourceAccessToken/);
  assert.match(authSource, /createPartnerSession\(active\.id/);
  assert.match(storeSource, /createResourceManagementSession/);
  assert.match(storeSource, /permissions: \[\]/);
  assert.doesNotMatch(migration, /`session_token`|`token` text/i);
});

test("__Host partner session cookie has the required hardening and seven-day maximum", async () => {
  const { buildManagementSessionCookie } = await importTs("lib/resource-access.ts");
  const cookie = buildManagementSessionCookie("__Host-psipedia_partner_session", "opaque", 7 * 24 * 60 * 60);
  for (const required of ["HttpOnly", "Secure", "SameSite=Strict", "Path=/", "Max-Age=604800"]) {
    assert.match(cookie, new RegExp(required));
  }
  assert.doesNotMatch(cookie, /Domain=/i);
});

test("session authorization reloads account status live and revokes blocked sessions", () => {
  assert.match(authSource, /getPartnerAccountById\(resolved\.subjectId/);
  assert.match(authSource, /account\.status !== "ACTIVE"/);
  assert.match(authSource, /revokePartnerSessionToken/);
  assert.match(storeSource, /revokeAllPartnerSessions/);
  assert.match(storeSource, /status: "SUSPENDED" \| "DEACTIVATED"/);
});

test("anti-enumeration response is one canonical public contract for auth lifecycle states", () => {
  assert.match(authSource, /PARTNER_AUTH_GENERIC_RESPONSE/);
  assert.match(authSource, /!existing && mode === "LOGIN"/);
  assert.match(authSource, /!partnerAccountCanAuthenticate\(account\)/);
  assert.match(authSource, /PARTNER_AUTH_RESPONSE_FLOOR_MS = 750/);
  assert.match(authSource, /genericPartnerAuthResponse\(responseStartedAt\)/);
  assert.doesNotMatch(requestRoute, /Účet neexistuje|email je registrovaný|suspendovaný/i);
  assert.match(requestRoute, /requestPartnerMagicLink/);
  assert.match(requestRoute, /mode: body\.mode/);
});

test("partner JSON mutation guard rejects missing/cross origin and bad content type", async () => {
  const { assertPartnerJsonMutation, PartnerSecurityError } = await importTs("lib/partner-security.ts");
  const make = (headers) => new Request("https://psipedia.sk/api/partner/auth/logout", {
    method: "POST",
    headers,
    body: "{}",
  });

  assert.doesNotThrow(() => assertPartnerJsonMutation(make({
    "content-type": "application/json",
    origin: "https://psipedia.sk",
    "sec-fetch-site": "same-origin",
  })));
  assert.throws(() => assertPartnerJsonMutation(make({
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
  })), PartnerSecurityError);
  assert.throws(() => assertPartnerJsonMutation(make({
    "content-type": "application/json",
    origin: "https://evil.example",
    "sec-fetch-site": "cross-site",
  })), PartnerSecurityError);
  assert.throws(() => assertPartnerJsonMutation(make({
    "content-type": "text/plain",
    origin: "https://psipedia.sk",
    "sec-fetch-site": "same-origin",
  })), PartnerSecurityError);

  for (const route of [requestRoute, consumeRoute, logoutRoute, deactivateRoute]) {
    assert.match(route, /assertPartnerJsonMutation\(request\)/);
  }
});

test("rate limiting uses HMAC-derived email/client/action namespaces and never raw PII keys", async () => {
  const { deriveRateLimitKey } = await importTs("lib/rate-limit.ts");
  const key = await deriveRateLimitKey("partner-auth-email", "person@example.sk", key32(3));
  assert.match(key, /^partner-auth-email:/);
  assert.ok(!key.includes("person@example.sk"));
  assert.match(securitySource, /partner-auth-email/);
  assert.match(securitySource, /partner-auth-client/);
  assert.match(securitySource, /5, 15 \* 60/);
  assert.match(securitySource, /20, 15 \* 60/);
  assert.doesNotMatch(migration, /ip_address|raw_ip|rate_limit_email/i);
});

test("Turnstile validates action, hostname and replay through the existing helper", async () => {
  const { verifyTurnstile } = await importTs("lib/turnstile.ts");
  const now = new Date("2026-09-21T20:00:00.000Z");
  const fetchImpl = async () => new Response(JSON.stringify({
    success: true,
    hostname: "psipedia.sk",
    action: "partner_auth_request",
    challenge_ts: now.toISOString(),
  }), { status: 200, headers: { "content-type": "application/json" } });
  const used = new Set();
  const replayStore = {
    async claim(hash) {
      if (used.has(hash)) return false;
      used.add(hash);
      return true;
    },
  };

  assert.equal((await verifyTurnstile({
    token: "a", secret: "secret", expectedHostname: "psipedia.sk",
    expectedAction: "wrong", fetchImpl, now,
  })).reason, "action_mismatch");
  assert.equal((await verifyTurnstile({
    token: "b", secret: "secret", expectedHostname: "wrong.sk",
    expectedAction: "partner_auth_request", fetchImpl, now,
  })).reason, "hostname_mismatch");
  assert.equal((await verifyTurnstile({
    token: "c", secret: "secret", expectedHostname: "psipedia.sk",
    expectedAction: "partner_auth_request", fetchImpl, now, replayStore,
  })).ok, true);
  assert.equal((await verifyTurnstile({
    token: "c", secret: "secret", expectedHostname: "psipedia.sk",
    expectedAction: "partner_auth_request", fetchImpl, now, replayStore,
  })).reason, "replay_detected");

  assert.match(securitySource, /partner_auth_request/);
  assert.match(securitySource, /partner_account_deactivate/);
});

test("Partner Turnstile explicit rendering uses load + direct render without turnstile.ready()", () => {
  assert.match(turnstileClientSource, /api\.js\?render=explicit/);
  assert.match(turnstileClientSource, /addEventListener\("load", render, \{ once: true \}\)/);
  assert.match(turnstileClientSource, /window\.turnstile\.render\(containerRef\.current/);
  assert.doesNotMatch(turnstileClientSource, /turnstile(?:\?|\.)?\.ready\s*\(/);
  assert.match(turnstileClientSource, /removeEventListener\("load", render\)/);
  assert.match(turnstileClientSource, /window\.turnstile\.remove\(widgetId\)/);
});

test("Partner PII uses shared AES-GCM encryption and deterministic HMAC lookup", async () => {
  const { encryptPii, decryptPii, hashPii, normalizeEmail } = await importTs("lib/pii-crypto.ts");
  const encryptionKey = key32(11);
  const hashKey = key32(77);
  const email = normalizeEmail(" Person@Example.sk ");
  const ciphertext = await encryptPii(email, encryptionKey);
  assert.equal(await decryptPii(ciphertext, encryptionKey), "person@example.sk");
  assert.ok(!ciphertext.includes("person@example.sk"));
  assert.equal(await hashPii(email, hashKey), await hashPii(email, hashKey));
  assert.doesNotMatch(storeSource, /email_plain|normalized_email/);
});

test("auth email outbox encrypts retry secret, is idempotent and clears secret on send/expiry", () => {
  assert.match(migration, /CREATE TABLE `partner_notification_outbox`/);
  assert.match(migration, /`encrypted_secret` text/);
  assert.match(emailSource, /encryptPii\(JSON\.stringify\(\{ token: input\.rawToken, returnTo \}\)/);
  assert.match(emailSource, /new URLSearchParams\(\{ token: rawToken \}\)/);
  assert.match(emailSource, /fragment\.set\("returnTo", returnTo\)/);
  assert.match(emailSource, /\/partner\/overenie#" \+ fragment\.toString\(\)/);
  assert.doesNotMatch(emailSource, /\/partner\/overenie\?token=/);
  assert.match(emailSource, /decryptPii\(input\.row\.encrypted_secret/);
  assert.match(emailSource, /"Idempotency-Key": input\.row\.dedupe_key/);
  assert.match(emailSource, /status='SENT'.*encrypted_secret=NULL/s);
  assert.match(emailSource, /status='EXPIRED'.*encrypted_secret=NULL/s);
  assert.match(emailSource, /status IN \('PENDING','FAILED'\)/);
  assert.match(emailSource, /status NOT IN \('SENT','EXPIRED'\)/);
  assert.match(emailSource, /attempts<" \+ MAX_ATTEMPTS/);
  assert.match(authSource, /processPartnerNotificationOutboxItem/);
  assert.match(authSource, /isRetryablePartnerEmailError/);
  assert.match(authSource, /resend_http_429/);
  assert.match(authSource, /resend_http_5\\d\\d/);
  assert.doesNotMatch(migration, /raw_secret|raw_token|plaintext_secret/i);
});

test("expired magic-link email is never sent by retry sweep", () => {
  assert.match(emailSource, /expires_at<=\?1/);
  assert.match(emailSource, /expires_at>\?1/);
  assert.match(emailSource, /Date\.parse\(existing\.expires_at\) <= now\.getTime\(\)/);
});

test("logs carry stable ids/error classes but not decrypted email or raw credentials", () => {
  assert.doesNotMatch(authSource, /console\.(?:info|error)\([^\n]*token/i);
  assert.doesNotMatch(emailSource, /console\./);
  assert.doesNotMatch(requestRoute, /error:\s*error instanceof Error \? error\.message/);
  assert.match(authSource, /accountId/);
});

test("logout, revoke-all, suspension and deactivation lifecycle are server-side", () => {
  assert.match(logoutRoute, /revokePartnerSession/);
  assert.match(storeSource, /UPDATE resource_management_sessions SET revoked_at/);
  assert.match(storeSource, /suspendPartnerAccount/);
  assert.match(storeSource, /deactivatePartnerAccount/);
  assert.match(storeSource, /revokeOutstandingPartnerAuthTokens\(accountId, now, db\)/);
  assert.match(deactivateRoute, /deactivateCurrentPartnerAccount/);
  assert.match(deactivateRoute, /clearPartnerSessionCookie/);
});

test("Partner auth routes stay outside Cloudflare Access admin perimeter", async () => {
  const worker = await fs.readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.match(worker, /const ADMIN_AUTH_PATHS = \["\/admin", "\/api\/admin"\]/);
  assert.doesNotMatch(worker, /ADMIN_AUTH_PATHS[^\n]*partner/);
});

test("scope guard: PARTNER-1B adds no membership, claim, Attention, billing or payment schema", () => {
  const lower = migration.toLowerCase();
  for (const forbidden of [
    "partner_membership",
    "partner_claim",
    "attention",
    "billing",
    "payment",
    "premium",
    "sponsored",
    "commercial_lead",
    "partner_event",
  ]) {
    assert.equal(lower.includes(forbidden), false, "unexpected PARTNER-1B schema: " + forbidden);
  }
});

test("Partner auth and settings pages stay isolated from management workflows", async () => {
  const pages = await Promise.all([
    "app/partner/registracia/page.tsx",
    "app/partner/prihlasenie/page.tsx",
    "app/partner/nastavenia/page.tsx",
  ].map((path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8")));
  const combined = pages.join("\n");
  assert.doesNotMatch(combined, /Moje profily|Moje podujatia|Žiadosti|Propagácia|membership card|claim CTA/i);
  assert.match(combined, /Nastavenia|Partner účet/);
});

test("Partner UX contract includes accessible labels, disabled states, focus and mobile overflow protection", async () => {
  const form = await fs.readFile(new URL("../components/partner-auth-form.tsx", import.meta.url), "utf8");
  const verification = await fs.readFile(new URL("../components/partner-verification.tsx", import.meta.url), "utf8");
  const settingsActions = await fs.readFile(new URL("../components/partner-settings-actions.tsx", import.meta.url), "utf8");
  const css = await fs.readFile(new URL("../app/partner/partner.css", import.meta.url), "utf8");
  assert.match(form, /<label/);
  assert.match(form, /disabled=\{sending \|\| !turnstileToken \|\| !siteKey\}/);
  assert.match(verification, /aria-live="polite"/);
  assert.match(verification, /URLSearchParams\(window\.location\.hash/);
  assert.match(verification, /normalizePartnerReturnTo\(fragment\.get\("returnTo"\)\)/);
  assert.match(verification, /history\.replaceState\(null, "", "\/partner\/overenie"\)/);
  assert.match(settingsActions, /if \(!response\.ok\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /max-width: 100%/);
  assert.match(css, /@media \(max-width: 760px\)/);
});

test("magic-link URLs are excluded from analytics, ads and referrer propagation", async () => {
  const consent = await fs.readFile(new URL("../components/cookie-consent.tsx", import.meta.url), "utf8");
  const ads = await fs.readFile(new URL("../components/programmatic-ad-loader.tsx", import.meta.url), "utf8");
  const layout = await fs.readFile(new URL("../app/partner/layout.tsx", import.meta.url), "utf8");
  assert.match(consent, /const isPartnerRoute = pathname\.startsWith\("\/partner"\)/);
  assert.match(consent, /!isAdminRoute && !isPartnerRoute/);
  assert.match(consent, /if \(isPartnerRoute\) return null/);
  assert.match(ads, /pathname\.startsWith\("\/partner"\)/);
  assert.match(ads, /if \(isPartnerRoute\) return/);
  assert.match(layout, /referrer: "no-referrer"/);
});
