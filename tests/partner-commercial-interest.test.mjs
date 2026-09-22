import assert from "node:assert/strict";import fs from "node:fs/promises";import test from "node:test";import {pathToFileURL} from "node:url";
const root=new URL("../",import.meta.url),read=p=>fs.readFile(new URL("../"+p,import.meta.url),"utf8"),importTs=p=>import(pathToFileURL(new URL(p,root).pathname).href);
const migration=await read("drizzle/0061_partner_commercial_interests.sql"),commercial=await read("lib/partner-commercial.ts"),admin=await read("lib/partner-commercial-admin.ts"),partnerApi=await read("app/api/partner/commercial/route.ts"),adminApi=await read("app/api/admin/partners/commercial/[id]/route.ts"),attentionStore=await read("lib/admin-attention-queue-store.ts"),partnerPage=await read("app/partner/propagacia/page.tsx"),adminList=await read("app/admin/partners/commercial/page.tsx"),adminDetail=await read("app/admin/partners/commercial/[id]/page.tsx");

test("commercial migration enforces types, statuses, FKs and active NEW dedupe",()=>{
  assert.match(migration,/partner_commercial_interests/);
  assert.match(migration,/REFERENCES `partner_accounts`\(`id`\) ON DELETE RESTRICT/);
  assert.match(migration,/REFERENCES `partner_resources`\(`id`\) ON DELETE RESTRICT/);
  for(const type of ["PREMIUM_PROFILE","PROMOTED_PROFILE","AD_CAMPAIGN","OTHER"])assert.match(migration,new RegExp(type));
  for(const status of ["NEW","CONTACTED","INTERESTED","NOT_NOW","CLOSED"])assert.match(migration,new RegExp(status));
  assert.match(migration,/partner_commercial_new_resource_unique/);
  assert.match(migration,/partner_commercial_new_account_unique/);
  assert.match(migration,/resource_id.*REFERENCES/);
  assert.match(migration,/COMMERCIAL_INTEREST_CREATED/);
  assert.match(migration,/COMMERCIAL_INTEREST_STATUS_CHANGED/);
  assert.match(migration,/COMMERCIAL_INTEREST_NOTE_UPDATED/);
  assert.match(migration,/partner_audit_events_no_update/);
  assert.match(migration,/partner_audit_events_no_delete/);
});

test("input contract rejects unknown type, HTML and oversized text and keeps NULL resource path",async()=>{
  const mod=await importTs("lib/partner-commercial.ts");
  assert.equal(mod.normalizePartnerCommercialText("  ahoj\r\nsvet  "),"ahoj\nsvet");
  assert.equal(mod.normalizePartnerCommercialText(""),null);
  assert.throws(()=>mod.normalizePartnerCommercialText("<script>alert(1)</script>"),/HTML/);
  assert.throws(()=>mod.normalizePartnerCommercialText("x".repeat(1001)),/najviac/);
  assert.equal(mod.isPartnerCommercialInterestType("OTHER"),true);
  assert.equal(mod.isPartnerCommercialInterestType("INVALID"),false);
  assert.match(commercial,/getPartnerAccountById/);
  assert.match(commercial,/account\.status!==\"ACTIVE\"/);
  assert.match(commercial,/resourceId:string\|null=null/);
  assert.match(commercial,/requirePartnerPermission\(input\.accountId,resourceId,\"COMMERCIAL_INTEREST_CREATE\"/);
  assert.match(commercial,/m\.revoked_at IS NULL|revoked_at IS NULL/);
  assert.match(commercial,/INSERT OR IGNORE/);
  assert.match(commercial,/deduplicated:true/);
  assert.match(commercial,/COUNT\(\*\) count FROM partner_commercial_interests WHERE account_id/);
});

function membershipDb(row){return{prepare(){return{bind(){return{first:async()=>row}}}}}}
test("commercial permission matrix allows OWNER/MANAGER and denies EDITOR/foreign/revoked/suspended",async()=>{
  const {requirePartnerPermission,PartnerAuthorizationError}=await importTs("lib/partner-platform.ts");
  for(const role of ["OWNER","MANAGER"]){const m=await requirePartnerPermission("a","r","COMMERCIAL_INTEREST_CREATE",membershipDb({membershipId:"m",accountId:"a",resourceId:"r",role,accountStatus:"ACTIVE",revokedAt:null}));assert.equal(m.role,role);}
  await assert.rejects(()=>requirePartnerPermission("a","r","COMMERCIAL_INTEREST_CREATE",membershipDb({membershipId:"m",accountId:"a",resourceId:"r",role:"EDITOR",accountStatus:"ACTIVE",revokedAt:null})),PartnerAuthorizationError);
  await assert.rejects(()=>requirePartnerPermission("a","foreign","COMMERCIAL_INTEREST_CREATE",membershipDb(null)),PartnerAuthorizationError);
  await assert.rejects(()=>requirePartnerPermission("a","r","COMMERCIAL_INTEREST_CREATE",membershipDb({membershipId:"m",accountId:"a",resourceId:"r",role:"OWNER",accountStatus:"SUSPENDED",revokedAt:null})),PartnerAuthorizationError);
});

test("Partner API reuses session auth and same-origin mutation protection",()=>{
  assert.match(partnerApi,/requirePartnerAccount/);
  assert.match(partnerApi,/assertPartnerJsonMutation/);
  assert.match(partnerApi,/cookieHeader:request\.headers\.get\(\"cookie\"\)/);
  assert.doesNotMatch(partnerApi,/status\s*:\s*body\.status|adminNote\s*:\s*body\.adminNote/);
});

test("admin uses validated transitions, audit and protects internal note from Partner history",()=>{
  for(const transition of ['NEW:["CONTACTED","NOT_NOW","CLOSED"]','CONTACTED:["INTERESTED","NOT_NOW","CLOSED"]','INTERESTED:["NOT_NOW","CLOSED"]'])assert.ok(admin.includes(transition));
  assert.match(admin,/COMMERCIAL_INTEREST_STATUS_CHANGED/);
  assert.match(admin,/COMMERCIAL_INTEREST_NOTE_UPDATED/);
  assert.match(adminApi,/requirePartnerAdminMutation/);
  assert.match(adminApi,/PATCH/);
  const publicSelect=commercial.slice(commercial.indexOf("listPartnerCommercialInterests"));
  assert.doesNotMatch(publicSelect,/admin_note|adminNote/);
  assert.match(partnerPage,/listPartnerCommercialInterests/);
  assert.match(adminList,/status/);assert.match(adminList,/interestType/);assert.match(adminList,/q/);
  assert.match(adminDetail,/Partner účet/);assert.match(adminDetail,/Verejný profil/);assert.match(adminDetail,/Audit/);
});

test("Attention canonical predicate and Partner admin pending predicate both count exactly NEW",()=>{
  const exact=attentionStore.slice(attentionStore.indexOf("loadExactAdminAttentionSummary"));
  assert.match(exact,/PARTNER_COMMERCIAL_LEAD/);
  assert.match(exact,/partner_commercial_interests WHERE status='NEW'/);
  assert.equal((attentionStore.match(/LIMIT \?/g)??[]).length,10);
});

test("commercial workflow stays pre-sales and does not mutate monetization or organic state",()=>{
  const combined=commercial+"\n"+admin+"\n"+partnerApi+"\n"+adminApi;
  assert.doesNotMatch(combined,/monetization_campaigns|monetization_promotions|premium_entitlement|sponsored_entitlement/i);
  assert.doesNotMatch(combined,/UPDATE\s+directory_profiles|UPDATE\s+help_organizations|UPDATE\s+managed_events/i);
  assert.doesNotMatch(migration,/partner_campaigns|partner_promotions|payments|subscriptions|invoices|stripe/i);
});
