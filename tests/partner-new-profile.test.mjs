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
  newForm,locationSelector,partnerCss,profileChanges,
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
  "components/partner-new-profile-form.tsx",
  "components/slovakia-location-selector.tsx",
  "app/partner/partner.css",
  "lib/partner-profile-changes.ts",
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
    services:[],qualifications:[],city:"Nitra",district:"Nitra",region:"Nitriansky kraj",address:"Hlavná 1",
    online:false,priceNote:"",websiteUrl:"",publicPhone:"",publicEmail:"info@example.sk",facebookUrl:"",instagramUrl:"",
  };
  assert.equal(normalizePartnerNewProfile("DIRECTORY_PROFILE",base).categoryOrType,"veterinari");
  for(const category of ["psie-skoly","utulky-a-zachrana"]){
    assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,category}),/podporovanú kategóriu/);
  }
});


test("canonical Slovakia dataset drives dependent region, district and municipality choices", async()=>{
  const locations=await importTs("lib/slovakia-locations.ts");
  assert.equal(locations.SLOVAK_REGIONS.length,8);
  assert.equal(Object.keys(locations.SLOVAK_MUNICIPALITIES_BY_DISTRICT).length,79);
  assert.equal(locations.SLOVAK_MUNICIPALITY_COUNT,2927);
  assert.deepEqual(
    locations.getSlovakDistricts("Nitriansky kraj"),
    ["Komárno","Levice","Nitra","Nové Zámky","Šaľa","Topoľčany","Zlaté Moravce"],
  );
  const zlateMoravce=locations.getSlovakMunicipalities("Zlaté Moravce");
  for(const municipality of ["Zlaté Moravce","Beladice","Neverice","Tesárske Mlyňany"]){
    assert.ok(zlateMoravce.includes(municipality), municipality);
  }
  assert.deepEqual(
    locations.resolveSlovakLocation({region:"Nitriansky kraj",district:"Zlaté Moravce",city:"Neverice"}),
    {region:"Nitriansky kraj",district:"Zlaté Moravce",city:"Neverice"},
  );
  assert.equal(
    locations.resolveSlovakLocation({region:"Trnavský kraj",district:"Poprad",city:"Zlaté Moravce"}),
    null,
  );
  assert.ok(locations.searchSlovakMunicipalities("Zlaté Moravce","tesarske").includes("Tesárske Mlyňany"));
});

test("server rejects inconsistent Slovak new-profile locations", async()=>{
  const {normalizePartnerNewProfile}=await importTs("lib/partner-new-profile.ts");
  const base={
    name:"Test Veterina",category:"veterinari",excerpt:"Krátky popis dostatočnej dĺžky.",
    description:"Toto je dostatočne dlhý verejný popis testovacieho profilu.",
    services:[],qualifications:[],city:"Zlaté Moravce",district:"Zlaté Moravce",region:"Nitriansky kraj",address:"Hlavná 1",
    online:false,priceNote:"",websiteUrl:"",publicPhone:"",publicEmail:"info@example.sk",facebookUrl:"",instagramUrl:"",
  };
  assert.equal(normalizePartnerNewProfile("DIRECTORY_PROFILE",base).values.city,"Zlaté Moravce");
  assert.throws(
    ()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,district:"Poprad",region:"Trnavský kraj"}),
    /platnú obec\/mesto, okres a kraj/,
  );

  const help={
    name:"OZ Test",type:"CIVIC_ASSOCIATION",legalName:"",registrationNumber:"",shortDescription:"",description:"",
    publicEmail:"info@example.sk",publicPhone:"",websiteUrl:"",facebookUrl:"",instagramUrl:"",address:"Hlavná 1",
    city:"Neverice",district:"Zlaté Moravce",region:"Nitriansky kraj",countryCode:"SK",
  };
  assert.equal(normalizePartnerNewProfile("HELP_ORGANIZATION",help).values.city,"Neverice");
  assert.throws(
    ()=>normalizePartnerNewProfile("HELP_ORGANIZATION",{...help,district:"Poprad"}),
    /platnú obec\/mesto, okres a kraj/,
  );
  assert.equal(
    normalizePartnerNewProfile("HELP_ORGANIZATION",{...help,countryCode:"CZ",city:"Praha",district:"Praha",region:"Hlavní město Praha"}).values.region,
    "Hlavní město Praha",
  );
});

test("server field allowlist rejects system and unknown fields",async()=>{
  const {normalizePartnerNewProfile}=await importTs("lib/partner-new-profile.ts");
  const base={
    name:"Test Veterina",category:"veterinari",excerpt:"Krátky popis dostatočnej dĺžky.",
    description:"Toto je dostatočne dlhý verejný popis testovacieho profilu.",
    services:[],qualifications:[],city:"Nitra",district:"Nitra",region:"Nitriansky kraj",address:"Hlavná 1",
    online:false,priceNote:"",websiteUrl:"",publicPhone:"",publicEmail:"info@example.sk",facebookUrl:"",instagramUrl:"",
  };
  for(const key of ["slug","status","verified","featured","sourceDataJson","searchText","imageUrl","publishedAt","unknownField"]){
    assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,[key]:"x"}),/nie je možné/);
  }
});


test("CREATE required contract enforces directory address, full Slovak location and email OR phone OR web", async()=>{
  const {normalizePartnerNewProfile}=await importTs("lib/partner-new-profile.ts");
  const base={
    name:"Test Veterina",category:"veterinari",excerpt:"Krátky popis dostatočnej dĺžky.",description:"",
    services:[],qualifications:[],city:"Nitra",district:"Nitra",region:"Nitriansky kraj",address:"Hlavná 1",
    online:false,priceNote:"",websiteUrl:"",publicPhone:"",publicEmail:"info@example.sk",facebookUrl:"",instagramUrl:"",
  };
  assert.equal(normalizePartnerNewProfile("DIRECTORY_PROFILE",base).values.description,"");
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,name:""}),/Názov/);
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,category:""}),/kategóriu/);
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,excerpt:"príliš krátke"}),/príliš krátky/);
  assert.doesNotThrow(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,excerpt:"12345678901234567890"}));
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,address:""}),/Adresa je povinná/);
  for(const key of ["region","district","city"]) {
    assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,[key]:""}),/Vyberte/);
  }
  const noContact={...base,publicEmail:"",publicPhone:"",websiteUrl:""};
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",noContact),/aspoň jeden verejný kontakt/);
  assert.doesNotThrow(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...noContact,publicEmail:"a@b.sk"}));
  assert.doesNotThrow(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...noContact,publicPhone:"+421 900 111 222"}));
  assert.doesNotThrow(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...noContact,websiteUrl:"https://example.sk"}));
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...noContact,facebookUrl:"https://facebook.com/test"}),/aspoň jeden verejný kontakt/);
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...noContact,instagramUrl:"https://instagram.com/test"}),/aspoň jeden verejný kontakt/);
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,publicEmail:"zly-email"}),/platný formát/);
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,publicPhone:"CALL-ME"}),/platný formát/);
  assert.throws(()=>normalizePartnerNewProfile("DIRECTORY_PROFILE",{...base,websiteUrl:"example.sk"}),/platná URL/);
});

test("CREATE required contract enforces help organization SK fields and preserves non-SK fallback", async()=>{
  const {normalizePartnerNewProfile}=await importTs("lib/partner-new-profile.ts");
  const base={
    name:"OZ Test",type:"CIVIC_ASSOCIATION",legalName:"",registrationNumber:"",shortDescription:"",description:"",
    publicEmail:"info@example.sk",publicPhone:"",websiteUrl:"",facebookUrl:"",instagramUrl:"",address:"Hlavná 1",
    city:"Neverice",district:"Zlaté Moravce",region:"Nitriansky kraj",countryCode:"SK",
  };
  assert.doesNotThrow(()=>normalizePartnerNewProfile("HELP_ORGANIZATION",base));
  assert.throws(()=>normalizePartnerNewProfile("HELP_ORGANIZATION",{...base,address:""}),/Adresa je povinná/);
  assert.throws(()=>normalizePartnerNewProfile("HELP_ORGANIZATION",{...base,city:""}),/Vyberte obec alebo mesto/);
  assert.throws(()=>normalizePartnerNewProfile("HELP_ORGANIZATION",{...base,publicEmail:"",publicPhone:"",websiteUrl:""}),/aspoň jeden verejný kontakt/);
  assert.doesNotThrow(()=>normalizePartnerNewProfile("HELP_ORGANIZATION",{
    ...base,countryCode:"CZ",city:"",district:"",region:"",address:"Pražská 1",publicEmail:"",websiteUrl:"https://example.cz",
  }));
});

test("new-profile UX mirrors limits, exposes inline errors and preserves media state on validation failures",()=>{
  assert.match(newForm,/Polia označené/);
  assert.match(newForm,/Krátky popis<RequiredMark/);
  assert.match(newForm,/Adresa<RequiredMark/);
  assert.match(newForm,/Kontakt<RequiredMark/);
  assert.match(newForm,/Vyplňte aspoň jeden: e-mail, telefón alebo web\./);
  assert.match(newForm,/20–700 znakov/);
  assert.match(newForm,/Max\. 20 000 znakov/);
  assert.match(newForm,/maxLength=\{180\}/);
  assert.match(newForm,/maxLength=\{300\}/);
  assert.match(newForm,/maxLength=\{1200\}/);
  assert.match(newForm,/maxLength=\{320\}/);
  assert.match(newForm,/maxLength=\{100\}/);
  assert.match(newForm,/Skontrolujte označené polia\./);
  assert.match(newForm,/aria-invalid/);
  assert.match(newForm,/aria-describedby/);
  assert.match(newForm,/data-field-error/);
  assert.match(newForm,/querySelector<HTMLElement>\('\[data-field-error="true"\]'\)/);
  assert.match(newForm,/noValidate/);
  assert.match(newForm,/PartnerMediaField/);
  assert.doesNotMatch(newForm,/setMediaAssetId\(null\)/);
  assert.match(locationSelector,/Kraj\{requiredMark\}/);
  assert.match(locationSelector,/Okres\{requiredMark\}/);
  assert.match(locationSelector,/Obec \/ mesto\{requiredMark\}/);
  assert.match(locationSelector,/ArrowDown/);
  assert.match(locationSelector,/ArrowUp/);
  assert.match(locationSelector,/Escape/);
  assert.match(partnerCss,/@media\(max-width:760px\)/);
  assert.match(partnerCss,/partner-contact-grid\{grid-template-columns:1fr\}/);
  assert.match(partnerCss,/partner-field input\[aria-invalid="true"\]/);
});

test("directory long description is optional for CREATE and remains bounded at 20k in shared validation",()=>{
  assert.match(profileChanges,/\{ key: "description", label: "Popis", kind: "textarea" \}/);
  assert.match(profileChanges,/textValue\(value, "Popis", 20_000\)/);
  assert.doesNotMatch(profileChanges,/textValue\(value, "Popis", 20_000, true, 40\)/);
});

test("Partner admin canonical draft preserves optional directory description without weakening default canonical validation", async()=>{
  const {normalizeManagedDirectoryProfileInput}=await importTs("lib/directory-store.ts");
  const payload={
    slug:"partner-optional-description",
    name:"Partner Optional Description",
    category:"veterinari",
    status:"draft",
    excerpt:"Krátky popis má určite aspoň dvadsať znakov.",
    description:"",
    city:"Nitra",
    district:"Nitra",
    region:"Nitriansky kraj",
    address:"Hlavná 1",
    services:[],
    qualifications:[],
    websiteUrl:"https://example.sk",
    publicEmail:"info@example.sk",
    publicPhone:"",
    facebookUrl:"",
    instagramUrl:"",
  };
  assert.throws(()=>normalizeManagedDirectoryProfileInput(payload),/Podrobný popis/);
  const normalized=normalizeManagedDirectoryProfileInput(payload,null,{descriptionOptional:true});
  assert.equal(normalized.description,"");
  assert.match(admin,/descriptionOptional: true/);
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
  assert.match(directoryCreate,/guardedSelectValues = \[/);
  assert.match(directoryCreate,/"\?", "\?", "\?", "'draft'"/);
  assert.match(directoryCreate,/"NULL", "\?", "\?"/);
  assert.match(directoryCreate,/WHERE id=\? AND status='APPROVED' AND reviewed_at=\? AND reviewed_by=\?/);
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



test("external directory submission keeps address verification non-blocking and routes unresolved addresses to review",()=> {
  assert.match(domain,/verifyExternalDirectoryAddressBestEffort/);
  assert.match(domain,/ADDRESS_NEEDS_REVIEW/);
  assert.match(domain,/addressVerification/);
  assert.match(domain,/patch:\s*PartnerProfilePatch|let patch: PartnerProfilePatch/);
  assert.match(domain,/status:\s*"SUBMITTED"/);
  assert.match(domain,/PARTNER_NEW_PROFILE_REVIEW/);
  assert.match(newForm,/Adresu sa nepodarilo jednoznačne overiť\. Profil môžete odoslať; adresu skontroluje redakcia\./);
  assert.doesNotMatch(domain,/EXACT_PUBLIC/);
});

test("GEO, legacy and commercial invariants stay intact while Partner media remains moderated",()=>{
  const combined=[domain,admin,partnerApi,scanApi,withdrawApi,adminApi].join("\n");
  assert.doesNotMatch(combined,/MANAGED_EVENT|PARTNER_EVENT_REVIEW/);
  assert.match(domain,/media_asset_id/);
  assert.match(admin,/publishPartnerSubmissionMedia/);
  assert.doesNotMatch(combined,/\/api\/admin\/uploads|x-upload-folder|R2Bucket/i);
  assert.doesNotMatch(combined,/organization_fundraising_methods|bank_account|donation|checkout/i);
  assert.doesNotMatch(combined,/premium_entitlement|sponsored_entitlement|stripe|billing|payments|subscriptions/i);
  assert.doesNotMatch(combined,/latitude|longitude|lat\b|lng\b|geocoder/i);
  assert.match(legacyDirectory,/createDirectoryProfileChangeRequest/);
  assert.match(legacyDirectory,/archived_at/);
});

test("Partner new-profile schema does not expose system publication/media fields",()=>{
  assert.doesNotMatch(domain,/partnerNewProfile.*slug/i);
  const submit=domain.slice(domain.indexOf("export async function submitPartnerNewProfile"),domain.indexOf("function statusLabel"));
  assert.doesNotMatch(submit,/published_at|archived_at|featured|image_url|image_key|seo_json|search_text/i);
  assert.doesNotMatch(submit,/(?:^|[,{]\s*)verified\s*:/im);
});
