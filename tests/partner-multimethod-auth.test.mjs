import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8");
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

const [
  migration, schema, passwordAuth, methods, googleAuth, email, security,
  loginPage, registerPage, settingsPage, adminPage, resetClient,
] = await Promise.all([
  "drizzle/0070_partner_multimethod_auth.sql",
  "db/partner-schema.ts",
  "lib/partner-password-auth.ts",
  "lib/partner-auth-methods.ts",
  "lib/partner-google-auth.ts",
  "lib/partner-email.ts",
  "lib/partner-security.ts",
  "app/partner/prihlasenie/page.tsx",
  "app/partner/registracia/page.tsx",
  "app/partner/nastavenia/page.tsx",
  "app/admin/partners/accounts/[id]/page.tsx",
  "components/partner-password-reset-form.tsx",
].map(read));

test("0070 adds credentials and Google identities without modifying legacy account identity", () => {
  assert.match(migration, /CREATE TABLE `partner_password_credentials`/);
  assert.match(migration, /`account_id` text PRIMARY KEY NOT NULL REFERENCES `partner_accounts`/);
  assert.match(migration, /`password_hash` text NOT NULL/);
  assert.match(migration, /`hash_version` integer NOT NULL DEFAULT 1/);
  assert.match(migration, /CREATE TABLE `partner_auth_identities`/);
  assert.match(migration, /provider.*GOOGLE/s);
  assert.match(migration, /partner_auth_identities_provider_subject_unique/);
  assert.match(migration, /partner_auth_identities_account_provider_unique/);
  assert.doesNotMatch(migration, /ALTER TABLE `partner_accounts` ADD.*password|ALTER TABLE `partner_accounts` ADD.*google/is);
});

test("0070 preserves outbox and append-only audit rows while extending explicit enums", () => {
  assert.match(migration, /partner_notification_outbox_next/);
  assert.match(migration, /INSERT INTO `partner_notification_outbox_next`[\s\S]+FROM `partner_notification_outbox`/);
  assert.match(migration, /'PASSWORD_RESET'/);
  assert.match(migration, /INSERT INTO `partner_audit_events_next`[\s\S]+FROM `partner_audit_events`/);
  for (const action of ["PASSWORD_SET","PASSWORD_CHANGED","PASSWORD_RESET_COMPLETED","GOOGLE_IDENTITY_LINKED"]) {
    assert.equal(migration.includes("'" + action + "'"), true);
  }
  assert.match(migration, /partner_audit_events_no_update/);
  assert.match(migration, /partner_audit_events_no_delete/);
  assert.match(schema, /partnerPasswordCredentials/);
  assert.match(schema, /partnerAuthIdentities/);
});

test("password KDF is versioned scrypt with random salt and Unicode/passphrase support", async () => {
  const password = await importTs("lib/partner-password.ts");
  assert.equal(password.PARTNER_PASSWORD_MIN_LENGTH, 12);
  assert.equal(password.PARTNER_PASSWORD_SCRYPT_N, 16384);
  assert.equal(password.PARTNER_PASSWORD_SCRYPT_R, 8);
  assert.equal(password.PARTNER_PASSWORD_SCRYPT_P, 5);
  const phrase = "dlhá fráza 🐕 bez povinného čísla";
  const encoded = await password.hashPartnerPassword(phrase);
  assert.match(encoded, /^scrypt\$1\$16384\$8\$5\$/);
  assert.equal(await password.verifyPartnerPassword(phrase, encoded), true);
  assert.equal(await password.verifyPartnerPassword(phrase + "x", encoded), false);
  const second = await password.hashPartnerPassword(phrase);
  assert.notEqual(encoded, second, "per-password random salt must change the stored hash");
  assert.throws(() => password.validatePartnerPassword("short pass"), password.PartnerPasswordError);
  assert.equal(password.validatePartnerPassword("  leading spaces stay  "), "  leading spaces stay  ");
});

test("password registration never overwrites an existing credential and activation still uses magic verification", () => {
  assert.match(methods, /INSERT INTO partner_accounts[\s\S]+PENDING_VERIFICATION/);
  assert.match(methods, /INSERT INTO partner_password_credentials/);
  assert.doesNotMatch(passwordAuth, /UPDATE partner_password_credentials[\s\S]{0,300}registerPartnerWithPassword/);
  assert.match(passwordAuth, /issuePartnerAuthToken/);
  assert.match(passwordAuth, /queuePartnerMagicLinkEmail/);
  assert.match(passwordAuth, /PASSWORD_SET/);
});

test("password login is enumeration-resistant and shares the canonical Partner session", () => {
  assert.match(passwordAuth, /PARTNER_PASSWORD_GENERIC_ERROR = "E-mail alebo heslo nie sú správne\."/);
  assert.match(passwordAuth, /PARTNER_DUMMY_PASSWORD_HASH/);
  assert.match(passwordAuth, /record\?\.passwordHash\?\?PARTNER_DUMMY_PASSWORD_HASH/);
  assert.match(passwordAuth, /record\.status==="ACTIVE"/);
  assert.match(passwordAuth, /createPartnerSession\(record\.id,database\)/);
  assert.match(passwordAuth, /RESPONSE_FLOOR_MS = 750/);
  assert.match(security, /partner_password_login/);
});

test("password reset uses a distinct purpose, one-time shared token store and revokes all Partner sessions", () => {
  assert.match(passwordAuth, /PARTNER_PASSWORD_RESET_PURPOSE = "PARTNER_PASSWORD_RESET"/);
  assert.match(passwordAuth, /PARTNER_PASSWORD_RESET_TTL_SECONDS = 30 \* 60/);
  assert.match(passwordAuth, /issueResourceAccessToken/);
  assert.match(passwordAuth, /consumeResourceAccessToken/);
  assert.match(passwordAuth, /purpose:PARTNER_PASSWORD_RESET_PURPOSE/);
  assert.match(passwordAuth, /revokeAllPartnerSessions\(account\.id/);
  assert.match(passwordAuth, /PASSWORD_RESET_COMPLETED/);
  assert.match(email, /notification_type='PASSWORD_RESET'/);
  assert.match(email, /\/partner\/obnova-hesla#/);
  assert.doesNotMatch(email, /\/partner\/obnova-hesla\?token=/);
  assert.match(resetClient, /history\.replaceState\(null,"","\/partner\/obnova-hesla"\)/);
});

test("password settings require the current session and preserve it while revoking other sessions", () => {
  assert.match(passwordAuth, /requireCurrentPartnerSessionToken/);
  assert.match(passwordAuth, /verifyPartnerPassword\(input\.currentPassword,current\.passwordHash\)/);
  assert.match(passwordAuth, /revokeOtherPartnerSessions/);
  assert.match(passwordAuth, /current\?"PASSWORD_CHANGED":"PASSWORD_SET"/);
  assert.match(settingsPage, /PartnerSecuritySettings/);
});

test("Google uses authorization code + PKCE + state + nonce and JOSE remote JWKS verification", () => {
  assert.match(googleAuth, /createRemoteJWKSet/);
  assert.match(googleAuth, /jwtVerify/);
  assert.match(googleAuth, /response_type","code"/);
  assert.match(googleAuth, /scope","openid email profile"/);
  assert.match(googleAuth, /code_challenge_method","S256"/);
  assert.match(googleAuth, /state/);
  assert.match(googleAuth, /nonce/);
  assert.match(googleAuth, /algorithms:\["RS256"\]/);
  assert.match(googleAuth, /issuer:\["https:\/\/accounts\.google\.com","accounts\.google\.com"\]/);
  assert.match(googleAuth, /audience:config\.clientId/);
  assert.match(googleAuth, /payload\.email_verified!==true/);
  assert.match(googleAuth, /payload\.sub/);
});

test("Google identity uses sub, never email, and existing-email collision requires authenticated confirmation", () => {
  assert.match(methods, /provider_subject/);
  assert.match(methods, /WHERE provider='GOOGLE' AND provider_subject=\?1/);
  assert.match(googleAuth, /getPartnerAccountByEmailHash/);
  assert.match(googleAuth, /GOOGLE_PENDING_LINK_COOKIE/);
  assert.match(googleAuth, /\/partner\/prepojit-google/);
  assert.match(googleAuth, /pending\.accountId!==input\.accountId/);
  assert.match(googleAuth, /getPartnerGoogleIdentityBySubject/);
  assert.match(googleAuth, /getPartnerGoogleIdentityForAccount/);
  assert.match(googleAuth, /GOOGLE_IDENTITY_LINKED/);
  assert.doesNotMatch(googleAuth, /linkGoogleIdentity\(\{[^}]*email/i);
});

test("Google tokens and OAuth secrets are transient and never persisted", () => {
  assert.match(googleAuth, /client_secret:config\.clientSecret/);
  assert.match(googleAuth, /id_token/);
  assert.doesNotMatch(googleAuth, /INSERT[^\n]*(access_token|refresh_token|id_token|authorization_code)/i);
  assert.doesNotMatch(schema, /accessToken|refreshToken|idToken|authorizationCode/);
  assert.doesNotMatch(migration, /access_token|refresh_token|id_token|authorization_code|pkce_verifier|nonce/i);
});

test("login and registration retain visible magic-link alternatives and distinct semantics", () => {
  assert.match(loginPage, /PartnerPasswordAuthForm mode="login"/);
  assert.match(loginPage, /Prihlásiť sa odkazom na e-mail/);
  assert.match(loginPage, /PartnerAuthForm mode="login"/);
  assert.match(registerPage, /PartnerPasswordAuthForm mode="register"/);
  assert.match(registerPage, /Registrovať sa pomocou odkazu na e-mail/);
  assert.match(registerPage, /PartnerAuthForm mode="register"/);
  assert.match(loginPage, /Pokračovať cez Google/);
  assert.match(registerPage, /Pokračovať cez Google/);
});

test("admin account detail exposes only auth-method status, never secrets", () => {
  assert.match(adminPage, /Prihlasovacie metódy/);
  assert.match(adminPage, /Magic link:/);
  assert.match(adminPage, /Heslo:/);
  assert.match(adminPage, /Google:/);
  assert.doesNotMatch(adminPage, /passwordHash|providerSubject|clientSecret|resetToken/);
});
