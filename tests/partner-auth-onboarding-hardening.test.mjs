import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8");
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

const [
  migration, auth, store, authForm, requestRoute, consumeRoute, verification,
  contact, pageAuth, onboardingRoute, onboardingPage, settingsPage, adminStore,
  adminPage, claimPage, claimRoute, profileChangeRoute, newProfileRoute, eventRoute, commercialRoute,
] = await Promise.all([
  "drizzle/0069_partner_auth_onboarding_hardening.sql",
  "lib/partner-auth.ts",
  "lib/partner-auth-store.ts",
  "components/partner-auth-form.tsx",
  "app/api/partner/auth/request-link/route.ts",
  "app/api/partner/auth/consume/route.ts",
  "components/partner-verification.tsx",
  "lib/partner-contact-profile.ts",
  "lib/partner-page-auth.ts",
  "app/api/partner/onboarding/route.ts",
  "app/partner/onboarding/page.tsx",
  "app/partner/nastavenia/page.tsx",
  "lib/partner-admin-store.ts",
  "app/admin/partners/accounts/[id]/page.tsx",
  "app/partner/prevziat-profil/[type]/[id]/page.tsx",
  "app/api/partner/claims/route.ts",
  "app/api/partner/profile-changes/route.ts",
  "app/api/partner/new-profile/route.ts",
  "app/api/partner/events/route.ts",
  "app/api/partner/commercial/route.ts",
].map(read));

test("0069 adds a 1:1 encrypted contact profile and preserves append-only audit rows", () => {
  assert.match(migration, /CREATE TABLE `partner_account_profiles`/);
  assert.match(migration, /`account_id` text PRIMARY KEY NOT NULL REFERENCES `partner_accounts`/);
  assert.match(migration, /`contact_name_ciphertext` text NOT NULL/);
  assert.match(migration, /`phone_ciphertext` text/);
  assert.match(migration, /`relationship_ciphertext` text/);
  assert.doesNotMatch(migration, /`contact_name` text|`phone` text|`relationship` text/);
  assert.match(migration, /CONTACT_PROFILE_COMPLETED/);
  assert.match(migration, /CONTACT_PROFILE_UPDATED/);
  assert.match(migration, /INSERT INTO `partner_audit_events_next`[\s\S]+FROM `partner_audit_events`/);
  assert.match(migration, /partner_audit_events_no_update/);
  assert.match(migration, /partner_audit_events_no_delete/);
});

test("LOGIN and REGISTER are explicit validated server intentions", () => {
  assert.match(authForm, /mode: mode === "login" \? "LOGIN" : "REGISTER"/);
  assert.match(requestRoute, /mode: body\.mode/);
  assert.match(auth, /type PartnerAuthMode = "LOGIN" \| "REGISTER"/);
  assert.match(auth, /value === "LOGIN" \|\| value === "REGISTER"/);
});

test("unknown LOGIN cannot create an account, token or auth outbox entry", () => {
  const start = auth.indexOf("const emailHash");
  const end = auth.indexOf("let account = existing", start);
  const loginBranch = auth.slice(start, end);
  assert.match(loginBranch, /!existing && mode === "LOGIN"/);
  assert.match(loginBranch, /genericPartnerAuthResponse/);
  assert.doesNotMatch(loginBranch, /createPendingPartnerAccountIfMissing|issuePartnerAuthToken|queuePartnerMagicLinkEmail/);
});

test("REGISTER creates once and existing REGISTER reuses the account", () => {
  assert.match(auth, /if \(!account\) \{[\s\S]+createPendingPartnerAccountIfMissing/);
  assert.match(store, /INSERT OR IGNORE INTO partner_accounts[\s\S]+RETURNING id/);
  assert.match(store, /created: Boolean\(inserted\?\.id\)/);
  assert.match(auth, /if \(created\.created\) \{[\s\S]+ACCOUNT_CREATED/);
  assert.doesNotMatch(auth, /mode === "REGISTER"[\s\S]{0,220}createPendingPartnerAccountIfMissing[\s\S]{0,220}createPendingPartnerAccountIfMissing/);
});

test("non-authenticatable lifecycle states remain generic and do not receive a usable token", () => {
  const statusGate = auth.indexOf("if (!partnerAccountCanAuthenticate(account))");
  const tokenIssue = auth.indexOf("issuePartnerAuthToken", statusGate);
  assert.ok(statusGate >= 0);
  assert.ok(tokenIssue > statusGate);
  assert.match(auth.slice(statusGate, tokenIssue), /genericPartnerAuthResponse/);
  assert.match(auth, /account\.status === "PENDING_VERIFICATION" \|\| account\.status === "ACTIVE"/);
});

test("successful auth paths share a minimum response timing floor", () => {
  assert.match(auth, /PARTNER_AUTH_RESPONSE_FLOOR_MS = 750/);
  assert.match(auth, /remaining = PARTNER_AUTH_RESPONSE_FLOOR_MS - \(Date\.now\(\) - startedAtMs\)/);
  assert.ok((auth.match(/genericPartnerAuthResponse\(responseStartedAt\)/g) ?? []).length >= 3);
});

test("contact input is bounded plain text and optional fields stay optional", async () => {
  const { normalizePartnerContactInput, PartnerContactProfileError } = await importTs("lib/partner-contact-profile.ts");
  assert.deepEqual(
    normalizePartnerContactInput({
      contactName: "  Ján   Novák ",
      phone: " +421 900 111 222 ",
      relationship: "  manažér  ",
    }),
    { contactName: "Ján Novák", phone: "+421 900 111 222", relationship: "manažér" },
  );
  assert.deepEqual(
    normalizePartnerContactInput({ contactName: "Ján Novák", phone: "", relationship: "" }),
    { contactName: "Ján Novák", phone: null, relationship: null },
  );
  assert.throws(() => normalizePartnerContactInput({ contactName: "" }), PartnerContactProfileError);
  assert.throws(() => normalizePartnerContactInput({ contactName: "<b>Ján</b>" }), PartnerContactProfileError);
  assert.throws(() => normalizePartnerContactInput({ contactName: "Ján\u0000Novák" }), PartnerContactProfileError);
  assert.throws(() => normalizePartnerContactInput({ contactName: "Ján Novák", phone: "abc" }), PartnerContactProfileError);
});

test("contact PII is encrypted at rest and decrypted only for authenticated/admin presentation", () => {
  assert.match(contact, /encryptPii\(values\.contactName/);
  assert.match(contact, /values\.phone \? await encryptPii/);
  assert.match(contact, /values\.relationship \? await encryptPii/);
  assert.match(contact, /decryptPii\(row\.contactNameCiphertext/);
  assert.match(contact, /contact_name_ciphertext,phone_ciphertext,relationship_ciphertext/);
});

test("mixed-version reads preserve pre-H1 behavior until 0069 exists", () => {
  assert.match(contact, /no such table:\\s\*partner_account_profiles/i);
  assert.match(contact, /if \(isMissingContactProfileTable\(error\)\) return true/);
  assert.match(contact, /if \(isMissingContactProfileTable\(error\)\) return null/);
});

test("magic-link verification routes incomplete accounts through onboarding and preserves safe returnTo", () => {
  assert.match(consumeRoute, /onboardingComplete: result\.onboardingComplete/);
  assert.match(verification, /data\.onboardingComplete === false/);
  assert.match(verification, /\/partner\/onboarding\?returnTo=/);
  assert.match(verification, /normalizePartnerReturnTo\(fragment\.get\("returnTo"\)\)/);
  assert.match(onboardingPage, /normalizePartnerReturnTo/);
  assert.match(onboardingPage, /redirect\(returnTo \|\| "\/partner"\)/);
});

test("page and mutation gates require onboarding while security flows stay reachable", () => {
  assert.match(pageAuth, /!options\.allowIncompleteOnboarding && !identity\.onboardingComplete/);
  assert.match(pageAuth, /partnerAuthHref\("\/partner\/prihlasenie", returnTo\)/);
  assert.match(pageAuth, /\/partner\/onboarding\?returnTo=/);
  assert.match(claimPage, /requirePartnerPageIdentity\(\{ returnTo \}\)/);
  assert.match(onboardingRoute, /allowIncompleteOnboarding: true/);
  assert.match(settingsPage, /allowIncompleteOnboarding: true/);
  for (const route of [claimRoute, profileChangeRoute, newProfileRoute, eventRoute, commercialRoute]) {
    assert.match(route, /requirePartnerAccount/);
    assert.doesNotMatch(route, /allowIncompleteOnboarding: true/);
  }
  assert.match(auth, /deactivateCurrentPartnerAccount[\s\S]+allowIncompleteOnboarding: true/);
});

test("onboarding and settings share one server validation/update path", () => {
  assert.match(onboardingRoute, /assertPartnerJsonMutation/);
  assert.match(onboardingRoute, /upsertPartnerContactProfile/);
  assert.match(onboardingPage, /Dokončite Partner účet/);
  assert.match(onboardingPage, /PartnerContactProfileForm mode="onboarding"/);
  assert.match(settingsPage, /getPartnerContactProfile/);
  assert.match(settingsPage, /PartnerContactProfileForm/);
  assert.match(settingsPage, /mode="settings"/);
});

test("admin account detail decrypts and presents contact identity with legacy-account fallback", () => {
  assert.match(adminStore, /getPartnerContactProfile/);
  assert.match(adminPage, /<h2>Kontakt<\/h2>/);
  assert.match(adminPage, /Meno a priezvisko:/);
  assert.match(adminPage, /Telefón:/);
  assert.match(adminPage, /Úloha \/ vzťah:/);
  assert.match(adminPage, /Partner ešte nedokončil kontaktné údaje\./);
});
