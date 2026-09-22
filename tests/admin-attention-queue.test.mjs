import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  ADMIN_ATTENTION_QUERY_COUNT,
  ADMIN_ATTENTION_SOURCE_LIMIT,
  filterAdminAttentionItems,
  isAdminAttentionActive,
  mapAdoptionStaleAttention,
  mapArticleFeedbackAttention,
  mapDirectoryChangeRequestAttention,
  mapDirectoryInquiryAttention,
  mapGeoLocationAttention,
  mapModerationAttention,
  mapNewsTipAttention,
  mapPartnerClaimAttention,
  mapPartnerVerificationAttention,
  mapPartnerCommercialAttention,
  sortAdminAttentionItems,
  summarizeAdminAttention,
} from "../lib/admin-attention-queue.ts";

const NOW = new Date("2026-09-15T12:00:00.000Z");

function manualItem(overrides = {}) {
  return {
    key: "news-tip:1",
    sourceType: "NEWS_TIP",
    sourceId: "1",
    title: "Test",
    reason: "Test",
    priority: "MEDIUM",
    status: "new",
    attentionState: "NEW",
    createdAt: "2026-09-10T12:00:00.000Z",
    relevantAt: "2026-09-10T12:00:00.000Z",
    ageDays: 5,
    targetHref: "/admin/tipy#tip-1",
    ...overrides,
  };
}

test("moderation presentation maps the existing lifecycle and ignores unsupported organization-change UI", () => {
  const quarantined = mapModerationAttention({
    id: "submission-1",
    resourceType: "LOST_FOUND_CASE",
    operation: "CREATE",
    status: "QUARANTINED",
    riskFlagsJson: '["duplicate"]',
    createdAt: "2026-09-12T12:00:00.000Z",
    updatedAt: "2026-09-13T12:00:00.000Z",
  }, NOW);
  const approved = mapModerationAttention({
    id: "submission-2",
    resourceType: "ADOPTION_DOG",
    operation: "UPDATE",
    status: "APPROVED",
    riskFlagsJson: "[]",
    createdAt: "2026-09-11T12:00:00.000Z",
    updatedAt: "2026-09-14T12:00:00.000Z",
  }, NOW);
  assert.equal(quarantined?.attentionState, "IN_PROGRESS");
  assert.equal(quarantined?.priority, "HIGH");
  assert.equal(quarantined?.targetHref, "/admin/stratene-najdene");
  assert.equal(approved?.attentionState, "RESOLVED");
  assert.equal(isAdminAttentionActive(approved), false);
  assert.equal(mapModerationAttention({
    id: "submission-3",
    resourceType: "ORGANIZATION_CHANGE",
    operation: "UPDATE",
    status: "PENDING_REVIEW",
    riskFlagsJson: "[]",
    createdAt: "2026-09-12T12:00:00.000Z",
    updatedAt: "2026-09-12T12:00:00.000Z",
  }, NOW), null);
});

test("news tip lifecycle keeps reviewing active and terminal states in history", () => {
  const fresh = mapNewsTipAttention({ id: 7, title: "Nový tip", topic: "veda", status: "new", createdAt: "2026-09-14T12:00:00.000Z", updatedAt: "2026-09-14T12:00:00.000Z" }, NOW);
  const reviewing = mapNewsTipAttention({ id: 8, title: "Overujem", topic: "veda", status: "reviewing", createdAt: "2026-09-13T12:00:00.000Z", updatedAt: "2026-09-14T12:00:00.000Z" }, NOW);
  const used = mapNewsTipAttention({ id: 9, title: "Hotovo", topic: "veda", status: "used", createdAt: "2026-09-10T12:00:00.000Z", updatedAt: "2026-09-15T08:00:00.000Z" }, NOW);
  assert.equal(fresh.attentionState, "NEW");
  assert.equal(reviewing.attentionState, "IN_PROGRESS");
  assert.equal(isAdminAttentionActive(reviewing), true);
  assert.equal(used.attentionState, "RESOLVED");
  assert.equal(isAdminAttentionActive(used), false);
  assert.equal(fresh.targetHref, "/admin/tipy#tip-7");
});

test("directory change request maps approved/rejected to history", () => {
  const pending = mapDirectoryChangeRequestAttention({ id: 8, profileName: "Psí salón", profileCategory: "salony-a-sluzby", status: "new", createdAt: "2026-09-13T12:00:00.000Z" }, NOW);
  const approved = mapDirectoryChangeRequestAttention({ id: 9, profileName: "Veterina", profileCategory: "veterinari", status: "approved", createdAt: "2026-09-12T12:00:00.000Z", updatedAt: "2026-09-15T10:00:00.000Z" }, NOW);
  const rejected = mapDirectoryChangeRequestAttention({ id: 10, profileName: "Tréner", profileCategory: "treneri", status: "rejected", createdAt: "2026-09-12T12:00:00.000Z", updatedAt: "2026-09-15T09:00:00.000Z" }, NOW);
  assert.equal(pending.attentionState, "NEW");
  assert.equal(approved.attentionState, "RESOLVED");
  assert.equal(rejected.attentionState, "DISMISSED");
  assert.equal(pending.targetHref, "/admin/adresar/navrhy#navrh-8");
});

test("directory inquiry keeps read items active and resolved items only in history", () => {
  const fresh = mapDirectoryInquiryAttention({ id: 9, profileName: "Veterina", profileCategory: "veterinari", status: "new", createdAt: "2026-09-15T06:00:00.000Z" }, NOW);
  const stale = mapDirectoryInquiryAttention({ id: 10, profileName: "Veterina", profileCategory: "veterinari", status: "new", createdAt: "2026-09-13T12:00:00.000Z" }, NOW);
  const read = mapDirectoryInquiryAttention({ id: 11, profileName: "Veterina", profileCategory: "veterinari", status: "read", createdAt: "2026-09-13T12:00:00.000Z", updatedAt: "2026-09-14T12:00:00.000Z" }, NOW);
  const resolved = mapDirectoryInquiryAttention({ id: 12, profileName: "Veterina", profileCategory: "veterinari", status: "resolved", createdAt: "2026-09-13T12:00:00.000Z", updatedAt: "2026-09-15T11:00:00.000Z" }, NOW);
  assert.equal(fresh.priority, "MEDIUM");
  assert.equal(stale.priority, "HIGH");
  assert.equal(read.attentionState, "IN_PROGRESS");
  assert.equal(isAdminAttentionActive(read), true);
  assert.equal(resolved.attentionState, "RESOLVED");
  assert.equal(isAdminAttentionActive(resolved), false);
  assert.equal(stale.targetHref, "/admin/dopyty#dopyt-10");
});

test("negative article feedback has an admin-safe deep link even when the public target is missing", () => {
  const active = mapArticleFeedbackAttention({
    id: 14,
    articleTitle: "Odstránený článok",
    articlePath: "/novinky/uz-neexistuje",
    status: "new",
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: null,
  }, NOW);
  const resolved = mapArticleFeedbackAttention({
    id: 15,
    articleTitle: "Starší podnet",
    articlePath: "/zdravie/starsi-clanok",
    status: "resolved",
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-15T11:00:00.000Z",
  }, NOW);
  assert.equal(active.sourceType, "ARTICLE_FEEDBACK");
  assert.equal(active.targetHref, "/admin/hodnotenia#hodnotenie-14");
  assert.equal(isAdminAttentionActive(active), true);
  assert.equal(isAdminAttentionActive(resolved), false);
});

test("adoption adapter reuses existing stale contracts without inventing urgency", () => {
  const stale = mapAdoptionStaleAttention({ id: 11, name: "Neo", status: "ACTIVE", lastVerifiedAt: "2026-08-11T12:00:00.000Z", createdAt: "2026-05-01T12:00:00.000Z" }, NOW);
  const veryStale = mapAdoptionStaleAttention({ id: 12, name: "Rex", status: "RESERVED", lastVerifiedAt: "2026-07-20T12:00:00.000Z", createdAt: "2026-05-01T12:00:00.000Z" }, NOW);
  const neverVerified = mapAdoptionStaleAttention({ id: 13, name: "Luna", status: "ACTIVE", lastVerifiedAt: null, createdAt: "2026-06-01T12:00:00.000Z" }, NOW);
  assert.equal(stale.priority, "MEDIUM");
  assert.equal(veryStale.priority, "HIGH");
  assert.equal(neverVerified.priority, "HIGH");
  assert.equal(stale.attentionState, "IN_PROGRESS");
  assert.equal(stale.targetHref, "/admin/adopcie/11");
});

test("Partner commercial Attention maps lifecycle, stable key and direct deep link", () => {
  const fresh=mapPartnerCommercialAttention({id:"lead-1",interestType:"PREMIUM_PROFILE",status:"NEW",resourceName:"Veterina",createdAt:"2026-09-15T10:00:00.000Z",updatedAt:"2026-09-15T10:00:00.000Z"},NOW);
  const contacted=mapPartnerCommercialAttention({id:"lead-2",interestType:"AD_CAMPAIGN",status:"CONTACTED",resourceName:null,createdAt:"2026-09-14T10:00:00.000Z",updatedAt:"2026-09-15T11:00:00.000Z"},NOW);
  const notNow=mapPartnerCommercialAttention({id:"lead-3",interestType:"OTHER",status:"NOT_NOW",resourceName:null,createdAt:"2026-09-14T10:00:00.000Z",updatedAt:"2026-09-15T11:00:00.000Z"},NOW);
  assert.equal(fresh.key,"partner-commercial:lead-1");
  assert.equal(fresh.priority,"LOW");
  assert.equal(fresh.attentionState,"NEW");
  assert.equal(fresh.targetHref,"/admin/partners/commercial/lead-1");
  assert.match(fresh.title,/Premium profil/);
  assert.equal(contacted.attentionState,"RESOLVED");
  assert.equal(notNow.attentionState,"DISMISSED");
});

test("geo Attention uses one source with privacy-aware severity and direct deep links", () => {
  const sensitive = mapGeoLocationAttention({
    id: 91,
    targetType: "DIRECTORY_PROFILE",
    targetId: 44,
    organizationId: null,
    label: "Citlivá stanica",
    category: "chovatelske-stanice",
    locationRole: null,
    publicVisibility: null,
    status: "NEEDS_REVIEW",
    errorCode: "PRIVACY_CLASSIFICATION_MISSING",
    manualOverride: 0,
    createdAt: "2026-09-15T09:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
  }, NOW);
  const providerFailure = mapGeoLocationAttention({
    id: 92,
    targetType: "MANAGED_EVENT",
    targetId: 55,
    organizationId: null,
    label: "Podujatie",
    category: null,
    locationRole: null,
    publicVisibility: "EXACT_PUBLIC",
    status: "FAILED",
    errorCode: "PROVIDER_ERROR",
    manualOverride: 0,
    createdAt: "2026-09-15T09:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
  }, NOW);
  assert.equal(sensitive.sourceType, "GEO_LOCATION_ISSUE");
  assert.equal(sensitive.priority, "HIGH");
  assert.equal(sensitive.targetHref, "/admin/adresar/44#geo");
  assert.equal(providerFailure.priority, "LOW");
  assert.equal(providerFailure.targetHref, "/admin/podujatia/55#geo");
});

test("active items sort before history and active priority ordering remains deterministic", () => {
  const sorted = sortAdminAttentionItems([
    manualItem({ key: "resolved", attentionState: "RESOLVED", relevantAt: "2026-09-15T11:00:00.000Z" }),
    manualItem({ key: "low", priority: "LOW" }),
    manualItem({ key: "medium", priority: "MEDIUM" }),
    manualItem({ key: "high", priority: "HIGH" }),
  ]);
  assert.deepEqual(sorted.map((item) => item.key), ["high", "medium", "low", "resolved"]);
});

test("same active priority orders older relevant timestamps first", () => {
  const sorted = sortAdminAttentionItems([
    manualItem({ key: "newer", relevantAt: "2026-09-10T12:00:00.000Z" }),
    manualItem({ key: "older", relevantAt: "2026-09-01T12:00:00.000Z" }),
  ]);
  assert.deepEqual(sorted.map((item) => item.key), ["older", "newer"]);
});

test("history orders newest terminal update first", () => {
  const sorted = sortAdminAttentionItems([
    manualItem({ key: "older", attentionState: "RESOLVED", relevantAt: "2026-09-12T12:00:00.000Z" }),
    manualItem({ key: "newer", attentionState: "DISMISSED", relevantAt: "2026-09-15T10:00:00.000Z" }),
  ]);
  assert.deepEqual(sorted.map((item) => item.key), ["newer", "older"]);
});

test("source, priority and active/history filters compose", () => {
  const items = [
    manualItem({ key: "n1", sourceType: "NEWS_TIP", priority: "MEDIUM" }),
    manualItem({ key: "i1", sourceType: "DIRECTORY_INQUIRY", priority: "HIGH", attentionState: "IN_PROGRESS" }),
    manualItem({ key: "i2", sourceType: "DIRECTORY_INQUIRY", priority: "MEDIUM", attentionState: "RESOLVED" }),
  ];
  assert.deepEqual(filterAdminAttentionItems(items, { sourceType: "DIRECTORY_INQUIRY", priority: "all", view: "active" }).map((item) => item.key), ["i1"]);
  assert.deepEqual(filterAdminAttentionItems(items, { sourceType: "all", priority: "all", view: "history" }).map((item) => item.key), ["i2"]);
  assert.deepEqual(filterAdminAttentionItems(items, { sourceType: "DIRECTORY_INQUIRY", priority: "MEDIUM", view: "all" }).map((item) => item.key), ["i2"]);
});

test("zero, one and multiple-source summaries use the same deterministic active count as the active queue", () => {
  const empty = summarizeAdminAttention([]);
  assert.equal(empty.active, 0);
  assert.equal(empty.history, 0);

  const one = [manualItem()];
  assert.equal(summarizeAdminAttention(one).active, 1);
  assert.equal(filterAdminAttentionItems(one, { view: "active" }).length, 1);

  const mixed = [
    manualItem({ key: "tip", sourceType: "NEWS_TIP", attentionState: "NEW" }),
    manualItem({ key: "inquiry", sourceType: "DIRECTORY_INQUIRY", attentionState: "IN_PROGRESS" }),
    manualItem({ key: "feedback", sourceType: "ARTICLE_FEEDBACK", attentionState: "RESOLVED" }),
  ];
  const summary = summarizeAdminAttention(mixed);
  const active = filterAdminAttentionItems(mixed, { view: "active" });
  assert.equal(summary.active, 2);
  assert.equal(summary.active, active.length);
  assert.equal(summary.history, 1);
  assert.equal(summary.byState.NEW, 1);
  assert.equal(summary.byState.IN_PROGRESS, 1);
  assert.equal(summary.byState.RESOLVED, 1);
});

test("Partner claim and verification Attention lifecycles use stable keys, deep links and conflict priority", () => {
  const claim=mapPartnerClaimAttention({id:"claim-1",status:"PENDING",resourceName:"Veterina ABC",createdAt:"2026-09-15T09:00:00.000Z",updatedAt:"2026-09-15T09:00:00.000Z",conflict:1},NOW);
  assert.equal(claim.key,"partner-claim:claim-1"); assert.equal(claim.targetHref,"/admin/partners/claims/claim-1"); assert.equal(claim.priority,"HIGH"); assert.equal(claim.attentionState,"NEW");
  const cancelled=mapPartnerClaimAttention({...claim,id:"claim-2",status:"CANCELLED",resourceName:"Veterina ABC",conflict:0},NOW);
  assert.equal(cancelled.attentionState,"DISMISSED");
  const verification=mapPartnerVerificationAttention({id:"verify-1",status:"PENDING_VERIFICATION",resourceName:"Klub ABC",createdAt:"2026-09-15T08:00:00.000Z",updatedAt:"2026-09-15T08:00:00.000Z",submittedAt:"2026-09-15T08:00:00.000Z",conflict:0},NOW);
  assert.equal(verification.key,"partner-verification:verify-1"); assert.equal(verification.targetHref,"/admin/partners/verifications/verify-1"); assert.equal(verification.priority,"MEDIUM"); assert.equal(verification.attentionState,"NEW");
  assert.equal(mapPartnerVerificationAttention({...verification,status:"VERIFIED"},NOW).attentionState,"RESOLVED");
  assert.equal(mapPartnerVerificationAttention({...verification,status:"REJECTED"},NOW).attentionState,"DISMISSED");
});

test("all source queries stay bounded and the attention store remains read-only", () => {
  assert.equal(ADMIN_ATTENTION_SOURCE_LIMIT, 50);
  assert.equal(ADMIN_ATTENTION_QUERY_COUNT, 11);
  const store = readFileSync(new URL("../lib/admin-attention-queue-store.ts", import.meta.url), "utf8");
  assert.equal((store.match(/LIMIT \?/g) ?? []).length, ADMIN_ATTENTION_QUERY_COUNT);
  assert.doesNotMatch(store, /\b(?:INSERT|UPDATE|DELETE|REPLACE)\b/i);
  assert.doesNotMatch(store, /sender_email|requester_email|proposed_patch_json|source_data_json|organization_name/i);
});

test("target hrefs point to existing admin route patterns", () => {
  const routes = [
    "../app/admin/tipy/page.tsx",
    "../app/admin/adresar/navrhy/page.tsx",
    "../app/admin/dopyty/page.tsx",
    "../app/admin/hodnotenia/page.tsx",
    "../app/admin/adopcie/[id]/page.tsx",
    "../app/admin/stratene-najdene/page.tsx",
    "../app/admin/partners/claims/[id]/page.tsx",
    "../app/admin/partners/verifications/[id]/page.tsx",
    "../app/admin/partners/commercial/[id]/page.tsx",
    "../app/admin/operations/geo/page.tsx",
  ];
  for (const route of routes) assert.equal(existsSync(new URL(route, import.meta.url)), true, route);
});

test("operations page uses bounded queue while shared bell uses exact summary", () => {
  const page = readFileSync(new URL("../app/admin/operations/page.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/admin-attention-queue.tsx", import.meta.url), "utf8");
  const shell = readFileSync(new URL("../components/admin-shell.tsx", import.meta.url), "utf8");
  assert.match(page, /requireAdminPageUser\("\/admin\/operations"\)/);
  assert.match(page, /summarizeAdminAttention\(allItems\)/);
  assert.match(page, /attentionCount=\{summary\.active\}/);
  assert.match(shell, /loadExactAdminAttentionSummary/);
  assert.match(shell, /href="\/admin\/operations"/);
  assert.doesNotMatch(shell, /getNewDirectoryInquiryCount/);
  assert.match(component, /<form[^>]+method="get"/);
});

test("article feedback lifecycle extends the existing table instead of creating a second inbox", () => {
  const migration = readFileSync(new URL("../drizzle/0048_article_feedback_attention_status.sql", import.meta.url), "utf8");
  assert.match(migration, /ALTER TABLE `article_feedback` ADD COLUMN `status`/);
  assert.match(migration, /ALTER TABLE `article_feedback` ADD COLUMN `attention_updated_at`/);
  assert.doesNotMatch(migration, /CREATE TABLE/i);
});

test("operations presentation does not add a competing mutation endpoint", () => {
  const page = readFileSync(new URL("../app/admin/operations/page.tsx", import.meta.url), "utf8");
  const component = readFileSync(new URL("../components/admin-attention-queue.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page + component, /fetch\(|method=["'](?:post|put|patch|delete)["']/i);
  assert.equal(existsSync(new URL("../app/api/admin/operations", import.meta.url)), false);
});
