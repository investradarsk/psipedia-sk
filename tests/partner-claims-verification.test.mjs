import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root=new URL("../",import.meta.url);
const read=(path)=>fs.readFile(new URL("../"+path,import.meta.url),"utf8");
const importTs=(path)=>import(pathToFileURL(new URL(path,root).pathname).href);

const [
  migration,claims,admin,email,platform,attention,attentionStore,claimApi,cancelApi,verificationApi,
  claimAdminApi,verificationAdminApi,claimPage,requestsPage,directoryPage,organizationPage,publicOwnership,
]=await Promise.all([
  "drizzle/0063_partner_claims_verification.sql",
  "lib/partner-claims.ts",
  "lib/partner-claims-admin.ts",
  "lib/partner-email.ts",
  "lib/partner-platform.ts",
  "lib/partner-attention.ts",
  "lib/admin-attention-queue-store.ts",
  "app/api/partner/claims/route.ts",
  "app/api/partner/claims/[id]/cancel/route.ts",
  "app/api/partner/verifications/route.ts",
  "app/api/admin/partners/claims/[id]/route.ts",
  "app/api/admin/partners/verifications/[id]/route.ts",
  "app/partner/prevziat-profil/[type]/[id]/page.tsx",
  "app/partner/ziadosti/page.tsx",
  "app/adresar/[category]/[slug]/page.tsx",
  "app/organizacie/[slug]/page.tsx",
  "components/partner-public-ownership.tsx",
].map(read));

test("0063 creates canonical claims and verification with FKs, checks, indexes and append-only audit",()=>{
  assert.match(migration,/CREATE TABLE `partner_claims`/);
  assert.match(migration,/REFERENCES `partner_accounts`\(`id`\) ON DELETE RESTRICT/);
  assert.match(migration,/REFERENCES `partner_resources`\(`id`\) ON DELETE RESTRICT/);
  for(const status of ["PENDING","APPROVED","REJECTED","CANCELLED"])assert.match(migration,new RegExp(status));
  assert.match(migration,/partner_claims_pending_unique/);
  assert.match(migration,/WHERE `status`='PENDING'/);
  assert.match(migration,/CREATE TABLE `partner_resource_verifications`/);
  for(const status of ["PENDING_VERIFICATION","VERIFIED","REJECTED"])assert.match(migration,new RegExp(status));
  assert.match(migration,/partner_resource_verifications_account_resource_unique/);
  for(const action of ["CLAIM_SUBMITTED","CLAIM_APPROVED","CLAIM_REJECTED","CLAIM_CANCELLED","VERIFICATION_REQUESTED","VERIFICATION_VERIFIED","VERIFICATION_REJECTED"])assert.match(migration,new RegExp(action));
  assert.match(migration,/partner_audit_events_no_update/);
  assert.match(migration,/partner_audit_events_no_delete/);
});

test("claim scope is restricted to Directory and Help Organization and never claims managed events",()=>{
  assert.ok(claims.includes('partnerClaimableResourceTypes = ["DIRECTORY_PROFILE", "HELP_ORGANIZATION"]'));
  const submit=claims.slice(claims.indexOf("createPartnerClaim"));
  assert.doesNotMatch(submit,/MANAGED_EVENT/);
  assert.match(claims,/status='published'/);
  assert.match(claims,/status='PUBLISHED'.*published_at IS NOT NULL.*archived_at IS NULL/s);
  assert.match(claims,/INSERT OR IGNORE INTO partner_resources/);
  assert.match(claims,/partner_claims WHERE account_id=.*status='PENDING'/s);
  assert.match(claims,/membership\?\.role === "OWNER"/);
  assert.match(claims,/Tento profil už spravujete/);
  assert.match(claims,/COUNT\(\*\) count FROM partner_claims WHERE account_id/);
});

test("claim input is bounded plain text and Partner mutations require active session plus same-origin guard",()=>{
  assert.match(claims,/PARTNER_CLAIM_MESSAGE_MAX = 1000/);
  assert.match(claims,/bez HTML/);
  for(const route of [claimApi,cancelApi,verificationApi]){
    assert.match(route,/requirePartnerAccount/);
    assert.match(route,/assertPartnerJsonMutation/);
    assert.match(route,/cookieHeader: request\.headers\.get\("cookie"\)/);
  }
  assert.match(cancelApi,/cancelPartnerClaim/);
  assert.match(claims,/WHERE id=\?1 AND account_id=\?2 LIMIT 1/);
  assert.match(claims,/claim\.status !== "PENDING"/);
});

test("claim approval upgrades or creates audited OWNER membership without destructive owner replacement",()=>{
  assert.match(admin,/ensurePartnerOwnerMembershipAdmin/);
  assert.match(platform,/MEMBERSHIP_ROLE_CHANGED/);
  assert.match(admin,/CLAIM_APPROVED/);
  assert.match(admin,/status='APPROVED'/);
  assert.match(admin,/ensurePendingVerification/);
  assert.match(admin,/PENDING_VERIFICATION/);
  assert.doesNotMatch(admin,/DELETE FROM partner_memberships|UPDATE partner_memberships SET revoked_at/i);
  assert.match(claimAdminApi,/requirePartnerAdminMutation/);
  assert.match(claimAdminApi,/APPROVE/);
  assert.match(claimAdminApi,/REJECT/);
});

test("verification is a separate account-resource state and no row means UNVERIFIED",()=>{
  assert.match(claims,/return row\?\.status \?\? "UNVERIFIED"/);
  assert.match(claims,/membership\.role !== "OWNER"/);
  assert.match(claims,/status === "VERIFIED"/);
  assert.match(claims,/status === "PENDING_VERIFICATION"/);
  assert.match(claims,/status='PENDING_VERIFICATION'.*status='REJECTED'/s);
  assert.match(admin,/VERIFICATION_VERIFIED/);
  assert.match(admin,/VERIFICATION_REJECTED/);
  assert.match(verificationAdminApi,/requirePartnerAdminMutation/);
});

test("public Partner badge requires ACTIVE account, active membership and VERIFIED Partner verification",()=>{
  const publicCheck=claims.slice(claims.indexOf("isPublicPartnerResourceVerified"));
  assert.match(publicCheck,/a\.status='ACTIVE'/);
  assert.match(publicCheck,/m\.revoked_at IS NULL/);
  assert.match(publicCheck,/v\.status='VERIFIED'/);
  assert.doesNotMatch(publicCheck,/d\.verified|directory_profiles\.verified/);
  assert.match(directoryPage,/isPublicPartnerResourceVerified\("DIRECTORY_PROFILE", profile\.id\)/);
  assert.match(organizationPage,/isPublicPartnerResourceVerified\("HELP_ORGANIZATION", composition\.organization\.id/);
  assert.match(publicOwnership,/Overený správca/);
  assert.match(publicOwnership,/Nejde o odporúčanie služby ani platené zvýraznenie/);
});

test("public claim CTA and Partner request history implement the PARTNER-2 UX",()=>{
  assert.match(directoryPage,/PartnerPublicOwnership/);
  assert.match(organizationPage,/PartnerPublicOwnership/);
  assert.match(publicOwnership,/Spravujete tento profil\?/);
  assert.match(publicOwnership,/Správa základných údajov profilu je bezplatná/);
  assert.match(claimPage,/Prevziať existujúci profil/);
  assert.match(claimPage,/partnerAuthHref/);
  assert.match(requestsPage,/Prevzatie profilov/);
  assert.match(requestsPage,/Overenie správcu/);
  assert.match(requestsPage,/PartnerClaimCancelButton/);
  assert.match(requestsPage,/PartnerVerificationRequest/);
});

test("safe auth returnTo allows internal paths, blocks external redirects and token remains fragment-only",async()=>{
  const {normalizePartnerReturnTo}=await importTs("lib/partner-return-to.ts");
  assert.equal(normalizePartnerReturnTo("/partner/prevziat-profil/DIRECTORY_PROFILE/1"),"/partner/prevziat-profil/DIRECTORY_PROFILE/1");
  assert.equal(normalizePartnerReturnTo("https://evil.example/path"),null);
  assert.equal(normalizePartnerReturnTo("//evil.example/path"),null);
  assert.equal(normalizePartnerReturnTo("/admin/partners"),null);
  assert.equal(normalizePartnerReturnTo("/api/partner"),null);
  assert.equal(normalizePartnerReturnTo("/partner/ok\\evil"),null);
  assert.match(email,/new URLSearchParams\(\{ token: rawToken \}\)/);
  assert.match(email,/fragment\.set\("returnTo", returnTo\)/);
  assert.match(email,/\/partner\/overenie#" \+ fragment\.toString\(\)/);
  assert.doesNotMatch(email,/\/partner\/overenie\?token=/);
});

test("claim and verification Attention use exact active predicates separate from bounded display queries",()=>{
  assert.match(attention,/partner_claim/);
  assert.match(attention,/partner-verification/);
  const exact=attentionStore.slice(attentionStore.indexOf("loadExactAdminAttentionSummary"));
  assert.match(exact,/PARTNER_CLAIM_REVIEW/);
  assert.match(exact,/partner_claims WHERE status='PENDING'/);
  assert.match(exact,/PARTNER_VERIFICATION_REVIEW/);
  assert.match(exact,/partner_resource_verifications WHERE status='PENDING_VERIFICATION'/);
  assert.equal((attentionStore.match(/LIMIT \?/g)??[]).length,16);
  assert.match(attention,/SELECT COUNT\(\*\) count FROM partner_claims WHERE status='PENDING'/);
  assert.match(attention,/SELECT COUNT\(\*\) count FROM partner_resource_verifications WHERE status='PENDING_VERIFICATION'/);
});

test("reliable Partner notification outbox covers claim and verification decisions with stable dedupe",()=>{
  for(const type of ["CLAIM_SUBMITTED","CLAIM_APPROVED","CLAIM_REJECTED","VERIFICATION_APPROVED","VERIFICATION_REJECTED"])assert.match(email,new RegExp(type));
  assert.match(email,/queuePartnerLifecycleNotification/);
  assert.match(email,/INSERT OR IGNORE INTO partner_notification_outbox/);
  assert.match(email,/Idempotency-Key/);
  assert.match(email,/status='FAILED'/);
  assert.match(email,/attempts</);
  assert.doesNotMatch(email,/decision_note|review_note|adminNote/);
  assert.match(claims,/partner-claim-submitted\//);
  assert.match(admin,/partner-claim-approved\//);
  assert.match(admin,/partner-claim-rejected\//);
});

test("PARTNER-2 does not add direct canonical writes, Premium, Sponsored, billing or payments",()=>{
  const combined=[claims,admin,claimApi,cancelApi,verificationApi,claimAdminApi,verificationAdminApi].join("\n");
  assert.doesNotMatch(combined,/UPDATE\s+directory_profiles|INSERT\s+INTO\s+directory_profiles|UPDATE\s+help_organizations|INSERT\s+INTO\s+help_organizations/i);
  assert.doesNotMatch(combined,/monetization_campaigns|monetization_promotions|premium_entitlement|sponsored_entitlement|stripe|billing|payments|subscriptions/i);
  assert.doesNotMatch(migration,/premium_entitlement|sponsored_entitlement|stripe|billing|payments|subscriptions/i);
});
