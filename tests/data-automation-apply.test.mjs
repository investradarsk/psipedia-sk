import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { organizationActionableProposal } from "../lib/data-automation-organization-diff.ts";

const applySource = readFileSync(new URL("../lib/data-automation-apply.ts", import.meta.url), "utf8");
const reviewUi = readFileSync(new URL("../components/admin-automation-finding-review.tsx", import.meta.url), "utf8");
const reviewApi = readFileSync(new URL("../app/api/admin/automation-findings/[id]/route.ts", import.meta.url), "utf8");
const findingStore = readFileSync(new URL("../lib/data-automation-store.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0055_data_automation_apply.sql", import.meta.url), "utf8");

test("AUTOMATION-3 requires explicit authenticated approve-apply", () => {
  assert.match(reviewApi, /getAdminApiUser\(\)/);
  assert.match(reviewApi, /if \(!user\) return unauthorizedAdminResponse\(\)/);
  assert.match(reviewApi, /body\.action === "approve-apply"/);
  assert.match(reviewApi, /applyAutomationFinding/);
  assert.match(reviewUi, /Schváliť a aplikovať/);
  assert.match(reviewUi, /window\.confirm/);
});

test("new automation entities are created as drafts and never auto-published", () => {
  assert.ok((applySource.match(/status: "DRAFT"/g) ?? []).length >= 3);
  assert.ok((applySource.match(/status: "draft"/g) ?? []).length >= 3);
  assert.doesNotMatch(applySource, /status:\s*["'](?:published|PUBLISHED|ACTIVE)["']/);
  assert.ok((applySource.match(/published_at: null/g) ?? []).length >= 6);
  assert.match(reviewUi, /Nový záznam sa vždy vytvorí ako koncept/);
});

test("existing canonical updates cannot change lifecycle status through generic field mapping", () => {
  assert.doesNotMatch(applySource, /status:\s*field\(/);
  assert.match(applySource, /POSSIBLE_INACTIVE/);
  assert.match(applySource, /automatické odpublikovanie alebo archivácia nie sú súčasťou bezpečného apply/);
});

test("apply is concurrency guarded and auditable", () => {
  assert.match(applySource, /assertNoConcurrentChanges/);
  assert.match(applySource, /stableJson\(currentValue\)/);
  assert.match(applySource, /AutomationApplyConflictError/);
  assert.match(migration, /CREATE TABLE `automation_applications`/);
  assert.match(migration, /CREATE UNIQUE INDEX `automation_applications_finding_unique`/);
  assert.match(applySource, /INSERT INTO automation_applications/);
  assert.match(applySource, /reviewer_decision='APPROVE_APPLY'/);
});

test("current SVPS source metadata survives apply and future diff comparison", () => {
  assert.match(findingStore, /importKey: row\.import_key/);
  assert.match(findingStore, /operatorName: sourceData\.operatorName/);
  assert.match(findingStore, /sourceApprovalNumber: sourceData\.sourceApprovalNumber/);
  assert.match(findingStore, /sourceActivity: sourceData\.sourceActivity/);
  assert.match(applySource, /metadataFields: \["operatorName", "sourceApprovalNumber", "sourceActivity"\]/);
  assert.match(applySource, /source_data_json=\?/);
});

test("stale NEW organization findings are safely reclassified before any canonical update", () => {
  assert.match(applySource, /findNewOrganizationCollision/);
  assert.match(applySource, /WHERE slug=\? LIMIT 1/);
  assert.match(applySource, /buildAutomationDiff\(before, finding\.proposed\)/);
  assert.match(applySource, /finding_type='POSSIBLE_UPDATE'/);
  assert.match(applySource, /review_status='IN_REVIEW'/);
  assert.match(applySource, /reclassified: "EXISTING_ORGANIZATION"/);
  assert.match(reviewUi, /Nález som prepojil s existujúcim profilom/);
  assert.match(reviewApi, /help_organizations\\.slug/);
  assert.match(reviewApi, /namiesto vytvorenia duplicity/);
});

test("apply is idempotent per finding and keeps an application audit record", () => {
  assert.match(applySource, /existingApplication\(finding\.id/);
  assert.match(migration, /finding_id.*NOT NULL REFERENCES `automation_findings`/);
  assert.match(migration, /application_type.*CREATE_DRAFT.*UPDATE_EXISTING/);
  assert.match(migration, /before_json/);
  assert.match(migration, /after_json/);
  assert.match(migration, /applied_by/);
});


test("EVENT automation apply cannot bypass centralized GEO lifecycle", () => {
  assert.match(applySource, /reconcileGeoAfterSourceMutation/);
  assert.match(applySource, /targetType: "MANAGED_EVENT"/);
  assert.match(applySource, /EVENT_GEO_SOURCE_FIELDS = new Set\(\["venue", "city", "region", "address"\]\)/);
  assert.match(applySource, /applicationType !== "CREATE_DRAFT"/);
  assert.match(applySource, /await reconcileAutomationEventGeo/);
});


test("ORGANIZATION-DISCOVERY-1A canonical-safe projection removes cosmetic and provenance noise", () => {
  const before = {
    name: "Sloboda zvierat",
    publicPhone: "02/16187",
    publicEmail: "INFO@SLOBODAZVIERAT.SK",
    websiteUrl: "https://www.slobodazvierat.sk/",
    facebookUrl: "https://www.facebook.com/slobodazvierat/",
    sourceUrl: "https://zoznamy.svps.sk/utulky/sloboda-zvierat",
    lastVerifiedAt: "2026-09-09T00:00:00.000Z",
  };
  const proposed = {
    name: "Sloboda Zvierat",
    websiteUrl: "https://slobodazvierat.sk",
    semanticKind: "LEGAL_ORGANIZATION",
    publicPhone: "0216187",
    publicEmail: " info@slobodazvierat.sk ",
    facebookUrl: "https://facebook.com/SlobodaZvierat.sk",
    sourceUrl: "https://slobodazvierat.sk/",
    lastVerifiedAt: "2026-09-27T10:00:00.000Z",
  };

  assert.deepEqual(organizationActionableProposal(proposed, before), {
    facebookUrl: "https://facebook.com/SlobodaZvierat.sk",
  });
});

test("ORGANIZATION-DISCOVERY-1A keeps real canonical organization changes actionable", () => {
  const before = {
    name: "Sloboda zvierat",
    publicPhone: "0216187",
    publicEmail: "info@slobodazvierat.sk",
    websiteUrl: "https://slobodazvierat.sk/",
    facebookUrl: "https://facebook.com/slobodazvierat/",
  };
  const proposed = {
    name: "Sloboda zvierat o.z.",
    publicPhone: "0900123456",
    publicEmail: "kontakt@slobodazvierat.sk",
    websiteUrl: "https://nova-sloboda.sk/",
    facebookUrl: "https://facebook.com/ina-stranka",
  };
  const actionable = organizationActionableProposal(proposed, before);

  assert.equal(actionable.name, "Sloboda zvierat o.z.");
  assert.equal(actionable.publicPhone, "0900123456");
  assert.equal(actionable.publicEmail, "kontakt@slobodazvierat.sk");
  assert.equal(actionable.websiteUrl, "https://nova-sloboda.sk/");
  assert.equal(actionable.facebookUrl, "https://facebook.com/ina-stranka");
});

test("ORGANIZATION-DISCOVERY-1A URL equivalence is canonical but path-aware", () => {
  const before = {
    websiteUrl: "https://www.example.sk/",
    facebookUrl: "https://www.facebook.com/foo/",
    instagramUrl: "https://www.instagram.com/foo/",
  };
  const proposed = {
    websiteUrl: "https://example.sk",
    facebookUrl: "https://facebook.com/foo",
    instagramUrl: "https://instagram.com/bar",
  };

  assert.deepEqual(organizationActionableProposal(proposed, before), {
    instagramUrl: "https://instagram.com/bar",
  });
});

test("ORGANIZATION-DISCOVERY-1A new organizations retain safe canonical fields only", () => {
  const proposed = {
    name: "Nová pomoc psom",
    type: "CIVIC_ASSOCIATION",
    semanticKind: "LEGAL_ORGANIZATION",
    websiteUrl: "https://example.sk/",
    publicEmail: "info@example.sk",
    sourceUrl: "https://example.sk/",
    lastVerifiedAt: "2026-09-27T10:00:00.000Z",
  };

  assert.deepEqual(organizationActionableProposal(proposed, null), {
    name: "Nová pomoc psom",
    type: "CIVIC_ASSOCIATION",
    websiteUrl: "https://example.sk/",
    publicEmail: "info@example.sk",
  });
});

test("ORGANIZATION-DISCOVERY-1A runner preserves full matching payload while findings use projected proposal", () => {
  const runner = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");
  const concept = readFileSync(new URL("../lib/data-automation-organization-discovery-concept.ts", import.meta.url), "utf8");

  assert.match(runner, /const proposedForFinding = findingProposal \?\? record\.proposed/);
  assert.match(runner, /resolveAutomationEntityCluster\([\s\S]*record,/);
  assert.match(runner, /matchAutomationCanonical\(source, record, database\)/);
  assert.match(runner, /classifyAutomationFinding\(\{ match, proposed: proposedForFinding \}\)/);
  assert.match(runner, /proposed: proposedForFinding/);
  assert.match(concept, /matchAutomationCanonical\(source, enriched, options\.database\)/);
  assert.match(concept, /organizationActionableProposal\(enriched\.proposed, match\.before\)/);
  assert.match(concept, /record: enriched,[\s\S]*findingProposal,/);
});

test("ORGANIZATION-DISCOVERY-1A direct discovery excludes unsupported internal fields from apply", () => {
  const projected = organizationActionableProposal({
    name: "Sloboda Zvierat",
    semanticKind: "LEGAL_ORGANIZATION",
    sourceUrl: "https://slobodazvierat.sk/",
    lastVerifiedAt: "2026-09-27T10:00:00.000Z",
    publicPhone: "0900123456",
  }, {
    name: "Sloboda zvierat",
    publicPhone: "0216187",
  });

  assert.equal("semanticKind" in projected, false);
  assert.equal("sourceUrl" in projected, false);
  assert.equal("lastVerifiedAt" in projected, false);
  assert.equal(projected.publicPhone, "0900123456");
  assert.doesNotMatch(applySource, /semanticKind:\s*field\(/);
});
