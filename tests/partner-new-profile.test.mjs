import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const root=new URL("../",import.meta.url);
const read=(path)=>fs.readFile(new URL("../"+path,import.meta.url),"utf8");
const importTs=(path)=>import(pathToFileURL(new URL(path,root).pathname).href);

const [
  migration,domain,admin,partnerApi,scanApi,withdrawApi,adminApi,attention,attentionStore,
  partnerAttention,email,platform,directory,helpWrite,profilesPage,requestsPage,newPage,legacyDirectory,
]=await Promise.all([
  "drizzle/0066_partner_new_profile_submissions.sql",
  "lib/partner-new-profile.ts",
  "lib/partner-new-profile-admin.ts",
  "app/api/partner/new-profile/route.ts",
  "app/api/partner/new-profile/scan/route.ts",
  "app/api/partner/new-profile/[id]/withdraw/route.ts",
  "app/api/admin/partners/submissions/[id]/route.ts",
  "lib/admin-attention-queue.ts",
  "lib/admin-attention-queue-store.ts",
  "lib/partner-attention.ts",
  "lib/partner-email.ts",
  "lib/partner-platform.ts",
  "lib/directory-store.ts",
  "lib/help-organization-admin-write.ts",
  "app/partner/profily/page.tsx",
  "app/partner/ziadosti/page.tsx",
  "app/partner/profily/novy/page.tsx",
  "lib/directory-store.ts",
].map(read));

test("0066 is a 1:1 metadata extension without a parallel workflow status",()=>{
  assert.match(migration,/CREATE TABLE `partner_new_profile_metadata`/);
  assert.match(migration,/`submission_id` text PRIMARY KEY NOT NULL REFERENCES `moderation_submissions`/);
  assert.match(migration,/partner_new_profile_active_identity_unique/);
  assert.match(migration,/WHERE `dedupe_active`=1/);
  assert.match(migration,/CREATED_NEW/);
  assert.match(migration,/LINKED_EXISTING/);
  const ddl=migration.slice(migration.indexOf("CREATE TABLE `partner_new_profile_metadata`"),migration.indexOf(");",migration.indexOf("CREATE TABLE `partner_new_profile_metadata`"))+2);
  assert.doesNotMatch(ddl,/`status`/);
  assert.match(migration,/partner_audit_events_no_update/);
  assert.match(migration,/partner_audit_events_no_delete/);
});

test("new profile submission reuses generic CREATE moderation and never writes canonical rows",()=>{
  const submit=domain.slice(domain.indexOf("export async function submitPartnerNewProfile"),domain.indexOf("function statusLabel"));
  assert.match(submit,/INSERT INTO moderation_submissions/);
  assert.match(submit,/NULL,'CREATE','SUBMITTED','PARTNER_ACCOUNT'/);
  assert.match(submit,/INSERT INTO partner_new_profile_metadata/);
  assert.match(submit,/NEW_PROFILE_SUBMITTED/);
  assert.match(submit,/scanPartnerNewProfileForAccount/);
  assert.match(submit,/duplicate_resource_type,duplicate_subject_id/);
  assert.doesNotMatch(submit,/INSERT INTO directory_profiles|INSERT INTO help_organizations|UPDATE directory_profiles|UPDATE help_organizations/i);
});

test("new profile Partner mutations require active session and same-origin guard",()=>{
  for(const route of [partnerApi,scanApi,withdrawApi]){
    assert.match(route,/requirePartnerAccount/);
    assert.match(route,/assertPartnerJsonMutation/);
    assert.match(route,/cookieHeader: request\.headers\.get\("cookie"\)/);
  }
  assert.match(adminApi,/requirePartnerAdminMutation/);
  assert.doesNotMatch(adminApi,/requirePartnerAccount/);
});

test("Directory self-service categories use current public list and reject legacy categories",async()=>{
  const {normalizePartnerNewProfile}=await importTs("lib/partner-new-profile.ts");
  const base={
    name:"Test Veterina",category:"veterinari",excerpt:"Krátky popis dostatočnej dĺžky.",
    description:"Toto je dostatočne dlhý verejný popis testovacieho profilu.",
    services:[],qualifications:[],city:"Nitra",district:"Nitra",region:"Nitriansky kraj",address:"",
    online:false,priceNote:"",websiteUrl:"",publicPhone:"",publicEmail:"",facebookUrl:"",instagramUrl:"",
  };
  assert.equal(normalizePartnerNewProfile("DIRECTORY_PROFILE",base).categoryOrType,"veterinari");
  for(const category of ["psie-skoly","utulky-a-zachrana"]){
    assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,category}),/podporovanú kategóriu/);
  }
});

test("server field allowlist rejects system and unknown fields",async()=>{
  const {normalizePartnerNewProfile}=await importTs("lib/partner-new-profile.ts");
  const base={
    name:"Test Veterina",category:"veterinari",excerpt:"Krátky popis dostatočnej dĺžky.",
    description:"Toto je dostatočne dlhý verejný popis testovacieho profilu.",
    services:[],qualifications:[],city:"Nitra",district:"",region:"Nitriansky kraj",address:"",
    online:false,priceNote:"",websiteUrl:"",publicPhone:"",publicEmail:"",facebookUrl:"",instagramUrl:"",
  };
  for(const key of ["slug","status","verified","featured","sourceDataJson","searchText","imageUrl","publishedAt","unknownField"]){
    assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,[key]:"x"}),/nie je možné/);
  }
});

test("duplicate normalizers are deterministic and conservative",async()=>{
  const mod=await importTs("lib/partner-new-profile.ts");
  assert.equal(mod.normalizeDuplicateName("  Veterína ÁBC, s.r.o. "),"veterina abc s r o");
  assert.equal(mod.normalizeDuplicateDomain("https://www.Example.SK/path"),"example.sk");
  assert.equal(mod.normalizeDuplicatePhone("+421 905 123 456"),"421905123456");
  assert.equal(mod.normalizeDuplicatePhone("0905 123 456"),"421905123456");
  assert.equal(mod.normalizeDuplicateEmail(" INFO@Example.SK "),"info@example.sk");
  assert.equal(mod.normalizeDuplicateRegistration(" IČO 12-34 "),"ICO1234");
});

function score(mod,overrides={},candidateOverrides={}){
  const incoming={
    name:"Veterina ABC",websiteUrl:"https://veterina-abc.sk",publicPhone:"+421905123456",
    publicEmail:"info@veterina-abc.sk",registrationNumber:"12345678",address:"Hlavná 1",city:"Nitra",
    ...overrides,
  };
  return mod.evaluatePartnerDuplicateCandidate({
    resourceType:"DIRECTORY_PROFILE",incoming,categoryOrType:"veterinari",canonicalId:42,
    name:"Iný názov",categoryOrTypeCandidate:"veterinari",city:"Bratislava",address:"Iná 2",
    websiteUrl:"https://other.sk",publicPhone:"+421911000000",publicEmail:"other@example.sk",
    registrationNumber:"",status:"published",slug:"profil",published:true,...candidateOverrides,
  });
}

test("exact website, phone and email are HIGH duplicate signals",async()=>{
  const mod=await importTs("lib/partner-new-profile.ts");
  assert.equal(score(mod,{}, {websiteUrl:"https://www.veterina-abc.sk/iné"}).confidence,"HIGH");
  assert.equal(score(mod,{}, {publicPhone:"0905 123 456"}).confidence,"HIGH");
  assert.equal(score(mod,{}, {publicEmail:"INFO@VETERINA-ABC.SK"}).confidence,"HIGH");
});

test("organization registration number is a HIGH signal",async()=>{
  const mod=await importTs("lib/partner-new-profile.ts");
  const candidate=mod.evaluatePartnerDuplicateCandidate({
    resourceType:"HELP_ORGANIZATION",
    incoming:{name:"OZ Pes",registrationNumber:"12 345 678",websiteUrl:"",publicPhone:"",publicEmail:"",address:"",city:""},
    categoryOrType:"CIVIC_ASSOCIATION",canonicalId:7,name:"Iné OZ",categoryOrTypeCandidate:"CIVIC_ASSOCIATION",
    city:"",address:"",websiteUrl:"",publicPhone:"",publicEmail:"",registrationNumber:"12345678",
    status:"PUBLISHED",slug:"ine-oz",published:true,
  });
  assert.equal(candidate.confidence,"HIGH");
  assert.ok(candidate.reasons.includes("Rovnaké registračné číslo"));
});

test("name plus address is HIGH, exact name plus city/category is MEDIUM, weak name-only is not a match",async()=>{
  const mod=await importTs("lib/partner-new-profile.ts");
  assert.equal(score(mod,{websiteUrl:"",publicPhone:"",publicEmail:""},{
    name:"Veterína ABC",address:"Hlavna 1",city:"Košice",websiteUrl:"",publicPhone:"",publicEmail:"",
  }).confidence,"HIGH");
  assert.equal(score(mod,{websiteUrl:"",publicPhone:"",publicEmail:"",address:"Iná adresa"},{
    name:"Veterína ABC",address:"Úplne iná",city:"Nitra",websiteUrl:"",publicPhone:"",publicEmail:"",
  }).confidence,"MEDIUM");
  assert.equal(score(mod,{websiteUrl:"",publicPhone:"",publicEmail:"",address:"",city:"Nitra"},{
    name:"Veterina ABC Plus",address:"",city:"Košice",websiteUrl:"",publicPhone:"",publicEmail:"",
  }),null);
});

test("HIGH duplicate requires explicit Partner confirmation and server rescans on submit",()=>{
  assert.match(domain,/scanPartnerNewProfileForAccount\(\{/);
  assert.match(domain,/scan\.confidence === "HIGH" && input\.confirmDuplicate !== true/);
  assert.match(domain,/DUPLICATE_CONFIRMATION_REQUIRED/);
  assert.match(domain,/Rovnaký návrh nového profilu už čaká/);
  assert.match(newPage,/PartnerNewProfileForm/);
});

test("admin CREATE resolution is atomic, DRAFT-only and reuses canonical create primitives",()=>{
  const create=admin.slice(admin.indexOf("export async function createPartnerNewProfileAdmin"),admin.indexOf("export async function linkPartnerNewProfileAdmin"));
  const membershipHelper=admin.slice(admin.indexOf("function membershipStatements"),admin.indexOf("function verificationStatements"));
  const verificationHelper=admin.slice(admin.indexOf("function verificationStatements"),admin.indexOf("function resolutionMetadataStatement"));
  const directoryCreate=directory.slice(directory.indexOf("export function buildManagedDirectoryProfileCreateStatement"),directory.indexOf("export async function getPublishedDirectoryProfiles"));
  const organizationCreate=helpWrite.slice(helpWrite.indexOf("export function buildOrganizationCreateStatement"),helpWrite.indexOf("export async function createOrganizationFromAdmin"));
  assert.match(create,/buildManagedDirectoryProfileCreateStatement/);
  assert.match(create,/buildOrganizationCreateStatement/);
  assert.match(create,/status:"draft"/);
  assert.match(create,/membershipStatements/);
  assert.match(create,/assertNewProfileIndependentOwnershipApprover/);
  assert.ok(create.indexOf("assertNewProfileIndependentOwnershipApprover")<create.indexOf("applyAtomicModerationTransition"));
  assert.match(membershipHelper,/MEMBERSHIP_CREATED/);
  assert.match(create,/verificationStatements/);
  assert.match(verificationHelper,/VERIFICATION_REQUESTED/);
  assert.match(verificationHelper,/PENDING_VERIFICATION/);
  assert.match(create,/applyAtomicModerationTransition/);
  assert.match(create,/toStatus:"APPROVED"/);
  assert.match(create,/extraStatements:canonicalStatements/);
  assert.match(create,/NEW_PROFILE_CREATED/);
  assert.match(create,/resolution:"CREATED_NEW"/);
  assert.doesNotMatch(create,/status:"published"|status:'published'|status:"PUBLISHED"/);
  assert.match(directoryCreate,/SELECT \?, \?, \?, 'draft'/);
  assert.match(directoryCreate,/NULL, \?, \?/);
  assert.match(organizationCreate,/VALUES \(\?, \?, \?, \?, \?, 'DRAFT'/);
  assert.match(organizationCreate,/SELECT \?, \?, \?, \?, \?, 'DRAFT'/);
});

test("LINK EXISTING creates no canonical row, preserves owner semantics and hands off verification",()=>{
  const link=admin.slice(admin.indexOf("export async function linkPartnerNewProfileAdmin"),admin.indexOf("export async function rejectPartnerNewProfileAdmin"));
  assert.match(link,/canonicalExists/);
  assert.match(link,/resourceAnchorStatement/);
  assert.match(link,/assertNewProfileIndependentOwnershipApprover/);
  assert.match(link,/targetResource/);
  assert.ok(link.indexOf("assertNewProfileIndependentOwnershipApprover")<link.indexOf("applyAtomicModerationTransition"));
  assert.match(link,/membershipStatements/);
  assert.match(link,/verificationStatements/);
  assert.match(link,/resolution:"LINKED_EXISTING"/);
  assert.match(link,/NEW_PROFILE_LINKED_EXISTING/);
  assert.doesNotMatch(link,/buildManagedDirectoryProfileCreateStatement|buildOrganizationCreateStatement/);
  assert.doesNotMatch(link,/DELETE FROM partner_memberships|revoked_at=/i);
});

test("REJECT and WITHDRAW never create canonical rows or memberships",()=>{
  const reject=admin.slice(admin.indexOf("export async function rejectPartnerNewProfileAdmin"));
  const withdraw=domain.slice(domain.indexOf("export async function withdrawPartnerNewProfile"));
  assert.match(reject,/toStatus:"REJECTED"/);
  assert.match(reject,/NEW_PROFILE_REJECTED/);
  assert.doesNotMatch(reject,/buildManagedDirectoryProfileCreateStatement|buildOrganizationCreateStatement|INSERT INTO directory_profiles|INSERT INTO help_organizations/);
  assert.match(withdraw,/toStatus:"WITHDRAWN"/);
  assert.match(withdraw,/row\.accountId!==input\.accountId/);
  assert.match(withdraw,/NEW_PROFILE_WITHDRAWN/);
  assert.doesNotMatch(withdraw,/INSERT INTO directory_profiles|INSERT INTO help_organizations|partner_memberships/);
});

test("Attention new-profile source is safe, stable, deep-linked and exact-counted",()=>{
  assert.match(attention,/PARTNER_NEW_PROFILE_REVIEW/);
  assert.match(attention,/partnerAttentionKey\("PARTNER_NEW_PROFILE_REVIEW",row\.id\)/);
  assert.match(attention,/Nový profil: \$\{row\.displayName\} čaká na kontrolu/);
  assert.match(attention,/priority:row\.duplicateConfidence==="HIGH"\?"HIGH":"MEDIUM"/);
  assert.match(attentionStore,/partner_new_profile_metadata/);
  assert.match(attentionStore,/mapPartnerNewProfileAttention/);
  assert.doesNotMatch(attentionStore,/proposed_patch_json/);
  const exact=attentionStore.slice(attentionStore.indexOf("loadExactAdminAttentionSummary"));
  assert.match(exact,/PARTNER_NEW_PROFILE_REVIEW/);
  assert.match(exact,/s\.status IN \('SUBMITTED','PENDING_REVIEW','QUARANTINED'\)/);
  assert.match(partnerAttention,/newProfileRow/);
  assert.match(partnerAttention,/newProfiles/);
});

test("Partner UX exposes new profile, history and claim-existing handoff",()=>{
  assert.match(profilesPage,/Pridať nový profil/);
  assert.match(profilesPage,/Spravujete tento profil\?/);
  assert.match(requestsPage,/Moje návrhy nových profilov/);
  assert.match(requestsPage,/PartnerNewProfileWithdrawButton/);
  assert.match(newPage,/Pridať nový profil/);
});

test("notifications and Partner audit cover complete 3B lifecycle",()=>{
  for(const type of ["NEW_PROFILE_SUBMITTED","NEW_PROFILE_CREATED","NEW_PROFILE_LINKED_EXISTING","NEW_PROFILE_REJECTED"])assert.match(email,new RegExp(type));
  for(const action of ["NEW_PROFILE_SUBMITTED","NEW_PROFILE_WITHDRAWN","NEW_PROFILE_CREATED","NEW_PROFILE_LINKED_EXISTING","NEW_PROFILE_REJECTED"])assert.match(platform,new RegExp(action));
  assert.match(email,/profil bol vytvorený ako koncept/i);
});

test("GEO, legacy and scope invariants stay intact",()=>{
  const combined=[domain,admin,partnerApi,scanApi,withdrawApi,adminApi].join("\n");
  assert.doesNotMatch(combined,/MANAGED_EVENT|PARTNER_EVENT_REVIEW/);
  assert.doesNotMatch(combined,/media_assets|upload|R2/i);
  assert.doesNotMatch(combined,/organization_fundraising_methods|bank_account|donation|checkout/i);
  assert.doesNotMatch(combined,/premium_entitlement|sponsored_entitlement|stripe|billing|payments|subscriptions/i);
  assert.doesNotMatch(combined,/latitude|longitude|lat\b|lng\b|geocoder/i);
  assert.match(legacyDirectory,/createDirectoryProfileChangeRequest/);
  assert.match(legacyDirectory,/archived_at/);
});

test("Partner new-profile schema does not expose system publication/media fields",()=>{
  assert.doesNotMatch(domain,/partnerNewProfile.*slug/i);
  const submit=domain.slice(domain.indexOf("export async function submitPartnerNewProfile"),domain.indexOf("function statusLabel"));
  assert.doesNotMatch(submit,/published_at|archived_at|verified|featured|image_url|image_key|seo_json|search_text/i);
});
