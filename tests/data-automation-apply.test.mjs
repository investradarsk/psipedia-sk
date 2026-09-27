import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { organizationActionableProposal } from "../lib/data-automation-organization-diff.ts";

const applySource = readFileSync(new URL("../lib/data-automation-apply.ts", import.meta.url), "utf8");
const reviewUi = readFileSync(new URL("../components/admin-automation-finding-review.tsx", import.meta.url), "utf8");
const reviewApi = readFileSync(new URL("../app/api/admin/automation-findings/[id]/route.ts", import.meta.url), "utf8");
const findingStore = readFileSync(new URL("../lib/data-automation-store.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../drizzle/0055_data_automation_apply.sql", import.meta.url), "utf8");
const detachMigration = readFileSync(new URL("../drizzle/0091_automation_detach_drafts.sql", import.meta.url), "utf8");
const draftService = readFileSync(new URL("../lib/canonical-draft-service.ts", import.meta.url), "utf8");
const draftMapper = readFileSync(new URL("../lib/data-automation-draft-mapper.ts", import.meta.url), "utf8");
const receipts = readFileSync(new URL("../lib/data-automation-ingestion-receipts.ts", import.meta.url), "utf8");
const flags = readFileSync(new URL("../lib/canonical-draft-flags.ts", import.meta.url), "utf8");
const runnerSource = readFileSync(new URL("../lib/data-automation-runner.ts", import.meta.url), "utf8");

test("AUTOMATION-3 requires explicit authenticated approve-apply", () => {
  assert.match(reviewApi, /getAdminApiUser\(\)/);
  assert.match(reviewApi, /if \(!user\) return unauthorizedAdminResponse\(\)/);
  assert.match(reviewApi, /body\.action === "approve-apply"/);
  assert.match(reviewApi, /applyAutomationFinding/);
  assert.doesNotMatch(reviewUi, /Prijať zmenu/);
  assert.match(reviewUi, /window\.confirm/);
});

test("new automation entities are created through the canonical draft service and never auto-published", () => {
  assert.ok((draftService.match(/status: "DRAFT"/g) ?? []).length >= 3);
  assert.ok((draftService.match(/status: "draft"/g) ?? []).length >= 3);
  assert.ok((draftService.match(/published_at: null/g) ?? []).length >= 6);
  assert.doesNotMatch(draftService, /status:\s*["'](?:published|PUBLISHED|ACTIVE)["']/);
  assert.match(applySource, /createCanonicalDraft\(/);
  assert.match(applySource, /mapAutomationFindingToDraftInput/);
  assert.doesNotMatch(applySource, /function createDraftStatement/);
});

test("automation runtime has no UPDATE_EXISTING canonical mutation path", () => {
  assert.doesNotMatch(applySource, /function updateExistingStatement/);
  assert.doesNotMatch(applySource, /INSERT INTO automation_applications[\s\S]*UPDATE_EXISTING/);
  assert.doesNotMatch(applySource, /UPDATE \$\{config\.table\}/);
  assert.match(applySource, /Automation canonical update je zakázaný/);
  assert.match(migration, /CREATE TABLE `automation_applications`/);
});

test("CREATE_DRAFT remains receipt-based and detached", () => {
  assert.doesNotMatch(applySource, /VALUES \(\?,\?,last_insert_rowid\(\),'CREATE_DRAFT'/);
  assert.match(applySource, /createAutomationIngestionReceipt/);
  assert.match(applySource, /canonical_entity_id=NULL,canonical_entity_key=NULL/);
});

test("current SVPS source metadata survives apply and future diff comparison", () => {
  assert.match(findingStore, /importKey: row\.import_key/);
  assert.match(findingStore, /operatorName: sourceData\.operatorName/);
  assert.match(findingStore, /sourceApprovalNumber: sourceData\.sourceApprovalNumber/);
  assert.match(findingStore, /sourceActivity: sourceData\.sourceActivity/);
  assert.match(applySource, /metadataFields: \["operatorName", "sourceApprovalNumber", "sourceActivity"\]/);
  assert.match(applySource, /source_data_json=\?/);
});

test("existing organization collision is processed as SKIPPED_DUPLICATE without canonical update", () => {
  assert.match(applySource, /findNewOrganizationCollision/);
  assert.match(applySource, /SELECT id FROM help_organizations WHERE slug=\? LIMIT 1/);
  assert.match(applySource, /result: "SKIPPED_DUPLICATE"/);
  assert.doesNotMatch(applySource, /finding_type='POSSIBLE_UPDATE'/);
  assert.doesNotMatch(reviewUi, /Návrh som prepojil s existujúcim profilom/);
});

test("CREATE_DRAFT idempotency is receipt-based without canonical linkage", () => {
  assert.match(detachMigration, /CREATE TABLE `automation_ingestion_receipts`/);
  assert.match(detachMigration, /UNIQUE INDEX `automation_ingestion_receipts_identity_unique`/);
  const receiptTable = detachMigration.match(/CREATE TABLE `automation_ingestion_receipts` \(([\s\S]*?)\n\);/);
  assert.ok(receiptTable);
  assert.match(receiptTable[1], /source_id/);
  assert.match(receiptTable[1], /entity_type/);
  assert.match(receiptTable[1], /source_record_id/);
  assert.doesNotMatch(receiptTable[1], /canonical_entity|draft_id|finding_id|cluster_id|observation_id/);
  assert.match(runnerSource, /getAutomationIngestionReceipt/);
  assert.match(runnerSource, /processedReceipt/);
  assert.match(applySource, /getAutomationIngestionReceipt/);
  assert.match(receipts, /ON CONFLICT\(source_id,entity_type,source_record_id\) DO NOTHING/);
});


test("EVENT automation GEO reconciliation is draft-only", () => {
  assert.match(applySource, /reconcileGeoAfterSourceMutation/);
  assert.match(applySource, /targetType: "MANAGED_EVENT"/);
  assert.match(applySource, /applicationType: "CREATE_DRAFT"/);
  assert.doesNotMatch(applySource, /EVENT_GEO_SOURCE_FIELDS/);
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


test("HELP-INGEST-1D LOST_FOUND type is canonical-safe in the canonical draft service", () => {
  assert.match(draftService, /input\.entityType === "LOST_FOUND"/);
  assert.match(draftService, /function validLostFoundType/);
  assert.match(draftService, /type !== "LOST" && type !== "FOUND"/);
  assert.match(draftService, /CanonicalDraftValidationError/);
  assert.match(draftService, /source_url: after\.sourceUrl/);
});

test("HELP-INGEST-1D LOST_FOUND CREATE_DRAFT keeps semantic type separate from lifecycle", () => {
  const createMatch = draftService.match(/if \(input\.entityType === "LOST_FOUND"\) \{([\s\S]*?)\n\s*\}\n\n\s*const isFoster/);
  assert.ok(createMatch, "LOST_FOUND canonical draft branch must exist");
  const createDraft = createMatch[1];
  assert.match(createDraft, /const type = validLostFoundType\(p\.type\)/);
  assert.match(createDraft, /status: "DRAFT"/);
  assert.match(createDraft, /type: after\.type/);
  assert.match(createDraft, /published_at: null/);
  assert.doesNotMatch(createDraft, /status:\s*(?:after\.)?type/);
});


test("AUTOMATION-DETACH-1 enforces the UI-independent draft boundary", () => {
  assert.doesNotMatch(draftService, /admin-|components\/|app\/admin|next\/|React|className|route\.ts|page\.tsx/);
  assert.match(draftMapper, /CanonicalDraftInput/);
  assert.match(draftMapper, /finding\.proposed/);
  assert.match(draftMapper, /externalSourceUrl: finding\.sourceUrl/);
  assert.doesNotMatch(draftMapper, /canonicalEntityId|canonical_entity_id/);
});

test("possible duplicate warning is canonical-local and has no automation provenance foreign keys", () => {
  assert.match(detachMigration, /CREATE TABLE `canonical_draft_flags`/);
  assert.match(detachMigration, /POSSIBLE_DUPLICATE/);
  assert.doesNotMatch(detachMigration, /canonical_draft_flags[\s\S]*(finding_id|cluster_id|source_id|observation_id)/);
  assert.match(flags, /getCanonicalDraftFlag/);
  assert.match(applySource, /upsertCanonicalPossibleDuplicateFlag/);
});

test("CREATE_DRAFT leaves no persistent automation-to-draft link", () => {
  const createBranch = applySource.match(/if \(finding\.findingType === "NEW_ENTITY" \|\| finding\.findingType === "DUPLICATE_CANDIDATE"\)[\s\S]*?Automation canonical update je zakázaný/);
  assert.ok(createBranch, "CREATE_DRAFT branch should be present");
  const source = createBranch[0];
  assert.doesNotMatch(source, /INSERT INTO automation_applications[\s\S]*CREATE_DRAFT/);
  assert.doesNotMatch(source, /automation_cluster_canonical_claims/);
  assert.doesNotMatch(source, /canonical_entity_key=.*created\.canonicalEntityId/);
  assert.match(source, /canonical_entity_id=NULL,canonical_entity_key=NULL/);
});

test("exact existing match ends in SKIPPED_DUPLICATE receipt before finding classification", () => {
  assert.match(runnerSource, /match\.entityId && match\.quality !== "UNCERTAIN" && match\.quality !== "NONE"/);
  assert.match(runnerSource, /createAutomationIngestionReceipt/);
  assert.match(runnerSource, /result: "SKIPPED_DUPLICATE"/);
  assert.doesNotMatch(runnerSource, /linkAutomationClusterCanonical/);
});
