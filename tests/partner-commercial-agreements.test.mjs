import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const read=(path)=>fs.readFile(new URL("../"+path,import.meta.url),"utf8");
const migration=await read("drizzle/0068_partner_commercial_activation.sql");
const agreements=await read("lib/partner-commercial-agreements.ts");
const partnerPage=await read("app/partner/propagacia/page.tsx");
const partnerProfiles=await read("app/partner/profily/page.tsx");
const adminCreate=await read("app/api/admin/partners/commercial/agreements/route.ts");
const adminMutation=await read("app/api/admin/partners/commercial/agreements/[id]/route.ts");
const header=await read("components/site-header.tsx");
const directoryDetail=await read("components/directory-profile-detail.tsx");
const orgDetail=await read("components/organization-profile-detail.tsx");
const directoryStore=await read("lib/directory-store.ts");
const attention=await read("lib/partner-attention.ts");
const attentionQueue=await read("lib/admin-attention-queue.ts");
const partnerApi=await read("app/api/partner/commercial/route.ts");

test("0068 separates lead, agreement, payment and entitlement lifecycles",()=>{
  assert.match(migration,/CREATE TABLE `partner_commercial_agreements`/);
  assert.match(migration,/CREATE TABLE `partner_entitlements`/);
  for(const status of ["DRAFT","OFFERED","AGREED","ACTIVE","EXPIRED","CANCELLED"])assert.match(migration,new RegExp(status));
  for(const method of ["BANK_TRANSFER","BY_AGREEMENT"])assert.match(migration,new RegExp(method));
  for(const status of ["NOT_REQUIRED","AWAITING_PAYMENT","PAID","WAIVED"])assert.match(migration,new RegExp(status));
  for(const entitlement of ["PREMIUM_PROFILE","PROMOTED_PROFILE"])assert.match(migration,new RegExp(entitlement));
  assert.match(migration,/price_cents.*integer/i);
  assert.match(migration,/currency.*EUR/i);
  assert.match(migration,/paid_at/);assert.match(migration,/paid_by/);
  assert.match(migration,/partner_entitlement_current_resource_type_unique/);
  assert.match(migration,/partner_commercial_promotion_provenance_unique/);
  assert.match(migration,/partner_commercial_agreement_interest_active_unique/);
});

test("money and period inputs are validated without floating-point persistence",()=>{
  assert.match(agreements,/Number\.isSafeInteger/);
  assert.match(agreements,/value<0/);
  assert.match(agreements,/PARTNER-5 podporuje iba menu EUR/);
  assert.match(agreements,/assertValidWindow/);
  assert.match(migration,/price_cents/);
  assert.doesNotMatch(migration,/price_real|price_float|REAL/i);
});

test("manual payment authority stays admin-only and activation is separate",()=>{
  assert.match(adminCreate,/requirePartnerAdminMutation/);
  assert.match(adminMutation,/requirePartnerAdminMutation/);
  assert.match(adminMutation,/mark_paid/);
  assert.match(adminMutation,/activate/);
  assert.match(agreements,/COMMERCIAL_PAYMENT_MARKED_PAID/);
  assert.match(agreements,/paymentSatisfied/);
  assert.doesNotMatch(partnerApi,/PAID|priceCents|activatePartnerCommercialAgreement|markPartnerCommercialAgreementPaid/);
  assert.doesNotMatch(partnerPage,/adminNote|paidBy/);
});

test("Premium is commercial only and never changes organic ranking",()=>{
  assert.match(directoryDetail,/Premium profil/);
  assert.match(directoryDetail,/Platené rozšírenie profilu\./);
  assert.match(orgDetail,/Premium profil/);
  assert.match(agreements,/PREMIUM_PROFILE/);
  const premiumBranch=agreements.slice(agreements.indexOf('if(current.agreementType==="AD_CAMPAIGN")'));
  assert.match(premiumBranch,/partner_entitlements/);
  assert.doesNotMatch(directoryStore,/partner_entitlements|partner_commercial_agreements/);
  assert.doesNotMatch(directoryDetail,/Premium profil[^\n]*(?:Overené Psipediou|Odporúčame|najlepší)/i);
});

test("Promoted reuses canonical monetization promotions with mandatory Sponsored label",()=>{
  assert.match(agreements,/monetization_promotions/);
  assert.match(agreements,/SPONSORED_LABEL/);
  assert.match(agreements,/entityType:"directory"/);
  assert.match(agreements,/entityType:"organization"/);
  assert.match(agreements,/isPromotionVisible/);
  assert.match(agreements,/INSERT OR IGNORE INTO monetization_promotions/);
  assert.match(agreements,/INSERT OR IGNORE INTO partner_entitlements/);
  assert.match(directoryDetail,/Sponzorované/);
  assert.match(orgDetail,/Sponzorované/);
  assert.match(agreements,/priority,provenance/);
});

test("AD campaign links an existing monetization campaign and never invents creative",()=>{
  assert.match(agreements,/SELECT id,status,start_at startAt,end_at endAt FROM monetization_campaigns/);
  assert.match(agreements,/Najprv vytvorte bezpečnú reklamnú kampaň/);
  assert.match(agreements,/Obdobie reklamnej kampane musí byť celé v rámci obdobia obchodnej dohody/);
  assert.doesNotMatch(agreements,/createDirectCampaign|creative_image_url|destination_url/);
});

test("profile eligibility excludes managed events from Premium and Promoted",()=>{
  assert.match(agreements,/DIRECTORY_PROFILE/);
  assert.match(agreements,/HELP_ORGANIZATION/);
  assert.match(agreements,/Premium a propagovaný profil sú dostupné iba pre profilové zdroje/);
  assert.doesNotMatch(migration,/entitlement_type.*MANAGED_EVENT/i);
});

test("Partner commercial history exposes safe fields and CTA deep-link is constrained",()=>{
  assert.match(partnerPage,/Moje ponuky \/ dohody/);
  assert.match(partnerPage,/Bankový prevod/);
  assert.match(partnerPage,/Podľa dohody/);
  assert.match(partnerPage,/Platobné údaje vám zašleme po dohode/);
  assert.match(partnerProfiles,/Možnosti propagácie/);
  assert.match(partnerProfiles,/COMMERCIAL_INTEREST_CREATE/);
  assert.match(partnerPage,/eligible\.some\(r=>r\.resourceId===requestedResource\)/);
  assert.doesNotMatch(partnerPage,/adminNote|paidBy/);
});

test("public Partner login is a utility link beside Contact and not main navigation",()=>{
  assert.match(header,/href="\/o-nas#kontakt"[^>]*>Kontakt<\/Link>\s*<Link href="\/partner\/prihlasenie"[^>]*>Prihlásiť sa<\/Link>/);
  assert.match(header,/data-partner-login-entry/);
  const mainNav=header.slice(header.indexOf('<nav className="main-nav"'),header.indexOf('</nav>',header.indexOf('<nav className="main-nav"'))+6);
  assert.doesNotMatch(mainNav,/partner\/prihlasenie|Prihlásiť sa|Pre partnerov|Partner Portal/);
});

test("Attention has distinct agreement source and stable operational key",()=>{
  assert.match(attention,/PARTNER_COMMERCIAL_AGREEMENT/);
  assert.match(attention,/key:"partner-agreement"/);
  assert.match(attentionQueue,/PARTNER_COMMERCIAL_AGREEMENT/);
  assert.match(attentionQueue,/Dohoda spĺňa platobné podmienky/);
  assert.match(attentionQueue,/končí približne/);
});

test("notification and append-only audit contracts cover manual commercial lifecycle",()=>{
  for(const event of ["COMMERCIAL_OFFER_CREATED","COMMERCIAL_AGREEMENT_UPDATED","PAYMENT_MARKED_PAID","ENTITLEMENT_ACTIVATED","ENTITLEMENT_EXPIRED"])assert.match(migration,new RegExp(event));
  for(const action of ["COMMERCIAL_AGREEMENT_CREATED","COMMERCIAL_PAYMENT_MARKED_PAID","ENTITLEMENT_ACTIVATED","ENTITLEMENT_PAUSED","ENTITLEMENT_CANCELLED","ENTITLEMENT_EXPIRED"])assert.match(migration,new RegExp(action));
  assert.match(migration,/partner_audit_events_no_update/);
  assert.match(migration,/partner_audit_events_no_delete/);
});

test("PARTNER-5 adds no online payment or Partner media-upload surface",()=>{
  const implementation=migration+"\n"+agreements+"\n"+adminCreate+"\n"+adminMutation+"\n"+partnerPage;
  assert.doesNotMatch(implementation,/stripe|apple pay|google pay|payment webhook|checkout session|recurring billing|automatic renewal/i);
  assert.doesNotMatch(implementation,/partner.*upload|upload.*partner/i);
});


test("public paid markers fail closed on optional commercial read failures",()=>{
  assert.match(agreements,/Public partner commercial flags read failed/);
  assert.match(agreements,/return fallback/);
  assert.match(agreements,/premium:false,promoted:false/);
});


test("state-changing admin retries are CAS protected",()=>{
  assert.match(agreements,/payment_status<>'PAID' RETURNING id/);
  assert.match(agreements,/status='AGREED' RETURNING id/);
  assert.match(agreements,/if\(!changed\)return getPartnerCommercialAgreementAdmin/);
  assert.match(agreements,/if\(!activated\)return getPartnerCommercialAgreementAdmin/);
});
