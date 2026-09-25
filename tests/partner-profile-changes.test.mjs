import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (path) => fs.readFile(new URL("../" + path, import.meta.url), "utf8");
const importTs = (path) => import(pathToFileURL(new URL(path, root).pathname).href);

const [
  migration, domain, admin, moderation, transition, platform, email, attention, attentionStore,
  partnerApi, withdrawApi, adminApi, profilesPage, requestsPage, editPage, legacyDirectory,
] = await Promise.all([
  "drizzle/0065_partner_profile_changes.sql",
  "lib/partner-profile-changes.ts",
  "lib/partner-profile-changes-admin.ts",
  "lib/moderation-store.ts",
  "lib/moderation-transition.ts",
  "lib/partner-platform.ts",
  "lib/partner-email.ts",
  "lib/admin-attention-queue.ts",
  "lib/admin-attention-queue-store.ts",
  "app/api/partner/profile-changes/route.ts",
  "app/api/partner/profile-changes/[id]/withdraw/route.ts",
  "app/api/admin/partners/changes/[id]/route.ts",
  "app/partner/profily/page.tsx",
  "app/partner/ziadosti/page.tsx",
  "app/partner/profily/[resourceId]/upravit/page.tsx",
  "lib/directory-store.ts",
].map(read));

test("0065 adds only a metadata extension and expands existing Partner lifecycle enums", () => {
  assert.match(migration, /CREATE TABLE `partner_profile_change_metadata`/);
  assert.match(migration, /`submission_id` text PRIMARY KEY NOT NULL REFERENCES `moderation_submissions`/);
  assert.match(migration, /partner_profile_change_active_unique/);
  assert.match(migration, /WHERE `dedupe_active`=1/);
  const metadataTableDdl = migration.slice(
    migration.indexOf("CREATE TABLE `partner_profile_change_metadata`"),
    migration.indexOf(");", migration.indexOf("CREATE TABLE `partner_profile_change_metadata`")) + 2,
  );
  assert.doesNotMatch(metadataTableDdl, /`status`/);
  for (const type of ["PROFILE_CHANGE_SUBMITTED","PROFILE_CHANGE_APPROVED","PROFILE_CHANGE_REJECTED"]) {
    assert.match(migration, new RegExp(type));
    assert.match(email, new RegExp(type));
  }
  for (const action of ["PROFILE_CHANGE_SUBMITTED","PROFILE_CHANGE_WITHDRAWN","PROFILE_CHANGE_APPROVED","PROFILE_CHANGE_REJECTED"]) {
    assert.match(migration, new RegExp(action));
    assert.match(platform, new RegExp(action));
  }
  assert.match(migration, /partner_audit_events_no_update/);
  assert.match(migration, /partner_audit_events_no_delete/);
});

test("generic moderation is the only workflow state machine for Partner profile changes", () => {
  assert.match(moderation, /"DIRECTORY_PROFILE", "HELP_ORGANIZATION"/);
  assert.match(moderation, /"PARTNER_ACCOUNT"/);
  assert.match(domain, /INSERT INTO moderation_submissions/);
  assert.match(domain, /submitter_type.*PARTNER_ACCOUNT/s);
  assert.match(domain, /operation,status.*'UPDATE','SUBMITTED'/s);
  assert.match(domain, /partner_profile_change_metadata/);
  assert.doesNotMatch(migration, /CREATE TABLE `partner_profile_changes`/);
  assert.match(admin, /applyAtomicModerationTransition/);
  assert.match(transition, /extraStatements/);
});

test("permission model stays membership-based and verification is not an edit entitlement", () => {
  assert.match(platform, /EDITOR: new Set\(\["RESOURCE_VIEW", "MEMBERSHIP_VIEW", "PROFILE_SUBMIT_CHANGE"/);
  assert.match(domain, /requirePartnerPermission\(accountId, resourceId, "PROFILE_SUBMIT_CHANGE"/);
  assert.doesNotMatch(domain, /VERIFIED|verificationStatus|partner_resource_verifications/);
  assert.match(profilesPage, /partnerRoleHasPermission\(item\.role, "PROFILE_SUBMIT_CHANGE"\)/);
});

test("Partner profile mutations require active Partner session and same-origin JSON guards", () => {
  for (const route of [partnerApi, withdrawApi]) {
    assert.match(route, /requirePartnerAccount/);
    assert.match(route, /assertPartnerJsonMutation/);
    assert.match(route, /cookieHeader: request\.headers\.get\("cookie"\)/);
  }
  assert.match(adminApi, /requirePartnerAdminMutation/);
  assert.doesNotMatch(adminApi, /requirePartnerAccount/);
});

test("central field registry excludes system, ranking, media and source fields", async () => {
  const { getPartnerEditableFields } = await importTs("lib/partner-profile-changes.ts");
  const forbidden = [
    "id","slug","status","category","importKey","sourceDataJson","searchText","verified","featured",
    "seoJson","imageUrl","imageKey","publishedAt","archivedAt","createdAt","updatedAt","createdBy","updatedBy",
  ];
  for (const type of ["DIRECTORY_PROFILE","HELP_ORGANIZATION"]) {
    const keys = getPartnerEditableFields(type).map((field) => field.key);
    for (const key of forbidden) assert.equal(keys.includes(key), false, `${type} must not expose ${key}`);
  }
  assert.deepEqual(getPartnerEditableFields("DIRECTORY_PROFILE").map((field) => field.key), [
    "name","excerpt","description","services","qualifications","city","district","region","address","online",
    "priceNote","websiteUrl","publicPhone","publicEmail","facebookUrl","instagramUrl",
  ]);
  assert.deepEqual(getPartnerEditableFields("HELP_ORGANIZATION").map((field) => field.key), [
    "name","legalName","registrationNumber","type","shortDescription","description","publicEmail","publicPhone",
    "websiteUrl","facebookUrl","instagramUrl","address","city","district","region","countryCode",
  ]);
});

test("mass assignment, malformed URL, XSS and oversized arrays are rejected server-side", async () => {
  const { normalizePartnerProfilePatch } = await importTs("lib/partner-profile-changes.ts");
  const current = {
    name: "Test profil",
    excerpt: "Dostatočne dlhý krátky popis profilu.",
    description: "Toto je dostatočne dlhý bezpečný popis testovacieho profilu.",
    services: ["Vyšetrenie"], qualifications: [], city: "Nitra", district: "Nitra",
    region: "Nitriansky kraj", address: "Test 1", online: false, priceNote: "",
    websiteUrl: "https://example.sk/", publicPhone: "+421900000000", publicEmail: "test@example.sk",
    facebookUrl: "", instagramUrl: "",
  };
  for (const key of ["status","featured","verified","sourceDataJson","unknownField"]) {
    await assert.rejects(
      async () => normalizePartnerProfilePatch("DIRECTORY_PROFILE", { [key]: "x" }, current),
      /nie je možné upravovať/,
    );
  }
  await assert.rejects(
    async () => normalizePartnerProfilePatch("DIRECTORY_PROFILE", { websiteUrl: "javascript:alert(1)" }, current),
    /http alebo https/,
  );
  await assert.rejects(
    async () => normalizePartnerProfilePatch("DIRECTORY_PROFILE", { description: "<script>alert(1)</script>" }, current),
    /HTML/,
  );
  await assert.rejects(
    async () => normalizePartnerProfilePatch("DIRECTORY_PROFILE", { services: Array.from({length:21},(_,i)=>"Služba "+i) }, current),
    /najviac 20/,
  );
  assert.deepEqual(
    normalizePartnerProfilePatch("DIRECTORY_PROFILE", {
      city: " Trnava ", district: "Trnava", region: "Trnavský kraj",
    }, current),
    { city: "Trnava", district: "Trnava", region: "Trnavský kraj" },
  );
  assert.throws(
    () => normalizePartnerProfilePatch("DIRECTORY_PROFILE", { city: "Zlaté Moravce" }, current),
    /platnú obec\/mesto, okres a kraj/,
  );
});

test("submission is field-level, deduped, rate-limited and never writes canonical data", () => {
  const submit = domain.slice(domain.indexOf("export async function submitPartnerProfileChange"), domain.indexOf("function profileChangeStatusLabel"));
  assert.match(submit, /baseRevision/);
  assert.match(submit, /enforcePartnerProfileChangeRateLimit/);
  assert.match(submit, /partner_profile_change_active_unique|dedupe_active=1/);
  assert.match(submit, /INSERT INTO moderation_submissions/);
  assert.match(submit, /INSERT INTO partner_profile_change_metadata/);
  assert.match(submit, /INSERT INTO moderation_events/);
  assert.match(submit, /PROFILE_CHANGE_SUBMITTED/);
  assert.doesNotMatch(submit, /UPDATE directory_profiles|UPDATE help_organizations/i);
});

test("stale-base review and explicit patch apply are visible and atomic with moderation decision", () => {
  assert.match(admin, /baseSnapshot/);
  assert.match(admin, /currentValues/);
  assert.match(admin, /proposedValue/);
  assert.match(admin, /STALE_BASE/);
  assert.match(admin, /buildDirectoryApplyStatement/);
  assert.match(admin, /buildHelpApplyStatements/);
  assert.match(admin, /extraStatements:\[/);
  assert.match(admin, /terminalMetadataStatement/);
  assert.match(admin, /PROFILE_CHANGE_APPROVED/);
  assert.match(admin, /PROFILE_CHANGE_REJECTED/);
  assert.match(admin, /canonical\.updatedAt!==row\.baseUpdatedAt/);
  assert.match(admin, /partnerProfileChangeIsStale\(row\.baseSnapshotJson,canonical\.values\)/);
  assert.match(admin, /transitionGuard/);
  assert.match(admin, /directory_profiles WHERE id=\? AND updated_at=\?/);
  assert.match(admin, /help_organizations WHERE id=\? AND updated_at=\?/);
  assert.match(admin, /organization_locations WHERE organization_id=\?/);
  assert.match(admin, /ORDER BY is_primary DESC,sort_order ASC,id ASC LIMIT 1/);
  assert.match(admin, /country_code IS \?/);
  assert.match(admin, /ModerationStateConflictError/);
  assert.match(admin, /Verejný profil sa od vytvorenia žiadosti zmenil/);
  assert.match(adminApi, /invalidateVersionedPublicHtmlCacheUrl/);
  assert.match(adminApi, /partner_profile_change_public_cache_invalidation_failed/);
});

test("withdraw uses the generic moderation transition and only active own submissions are eligible", () => {
  const withdraw = domain.slice(domain.indexOf("export async function withdrawPartnerProfileChange"), domain.indexOf("export function publicPartnerProfileChangeReason"));
  assert.match(withdraw, /m\.partner_account_id accountId/);
  assert.match(withdraw, /row\.accountId !== input\.accountId/);
  assert.match(withdraw, /canTransitionModerationSubmission\(row\.status, "WITHDRAWN"\)/);
  assert.match(withdraw, /actorType: "PARTNER"/);
  assert.match(withdraw, /PROFILE_CHANGE_WITHDRAWN/);
  assert.match(withdrawApi, /withdrawPartnerProfileChange/);
});

test("Attention representation is unique, stable, deep-linked and exact-counted", () => {
  assert.match(attention, /PARTNER_PROFILE_CHANGE_REVIEW/);
  assert.match(attention, /partnerAttentionKey\("PARTNER_PROFILE_CHANGE_REVIEW",row\.id\)/);
  assert.match(attention, /partnerAttentionHref\("PARTNER_PROFILE_CHANGE_REVIEW",row\.id\)/);
  assert.match(attention, /title:`\$\{row\.resourceName\} čaká na schválenie úprav`/);
  assert.match(attention, /priority:stale\?"HIGH":"MEDIUM"/);
  assert.match(attentionStore, /PARTNER_PROFILE_CHANGE_REVIEW/);
  const exact = attentionStore.slice(attentionStore.indexOf("loadExactAdminAttentionSummary"));
  assert.match(exact, /partner_profile_change_metadata/);
  assert.match(exact, /s\.status IN \('SUBMITTED','PENDING_REVIEW','QUARANTINED'\)/);
  assert.match(attentionStore, /mapPartnerProfileChangeAttention/);
});

test("Partner and admin UX expose edit, history, OLD NEW diff and no direct-save language", () => {
  assert.match(profilesPage, /Upraviť údaje/);
  assert.match(editPage, /PartnerProfileEditForm/);
  assert.match(requestsPage, /Úpravy profilov/);
  assert.match(requestsPage, /PartnerProfileChangeWithdrawButton/);
  assert.doesNotMatch(editPage, /Uložiť profil/);
  assert.match(adminApi, /APPROVE/);
  assert.match(adminApi, /REJECT/);
});

test("legacy public Directory correction flow remains present and independent", () => {
  assert.match(legacyDirectory, /createDirectoryProfileChangeRequest/);
  assert.match(legacyDirectory, /INSERT INTO directory_profile_change_requests/);
  assert.match(legacyDirectory, /reviewDirectoryProfileChangeRequest/);
  assert.doesNotMatch(domain, /directory_profile_change_requests/);
});

test("PARTNER-3A stays within scope", () => {
  const mutationSurface = [domain, admin, partnerApi, withdrawApi, adminApi, editPage].join("\n");
  assert.doesNotMatch(mutationSurface, /MANAGED_EVENT|EVENT_SUBMIT/);
  assert.match(profilesPage, /item\.entityType !== "MANAGED_EVENT"/);
  assert.doesNotMatch(mutationSurface, /stripe|billing|payment|subscription|premium_entitlement|sponsored_entitlement/i);
  assert.doesNotMatch(domain, /media_assets|R2|upload/i);
  assert.doesNotMatch(domain, /organization_fundraising_methods|fundraising/i);
});
