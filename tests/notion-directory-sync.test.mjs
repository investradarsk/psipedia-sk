import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
// Focused NOTION-SYNC CI runs this suite; include webhook security/field-delta regressions.
import "./notion-targeted-webhook.test.mjs";
import { directorySyncErrorMetadataNeedsWrite, notionDirectoryUpdateSafety, notionDirectoryPageBelongsToSource, NotionDirectoryUnsafeTargetError } from "../lib/notion-directory-update-safety.ts";
import { canRecoverNotionDirectoryMapping } from "../lib/notion-directory-update-safety.ts";
import { mergeGeminiDirectoryPriority } from "../lib/notion-gemini-22-priority.ts";
import { externalWorkerCategorySupported } from "../scripts/gemini-notion-category.mjs";

const syncSource = await readFile(new URL("../lib/notion-directory-sync.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const storeSource = await readFile(new URL("../lib/directory-store.ts", import.meta.url), "utf8");
const addressSaveSource = await readFile(new URL("../lib/directory-address-save.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0098_directory_notion_bidirectional_sync.sql", import.meta.url), "utf8");
const wranglerSource = await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8");

test("directory Notion mirror covers the complete managed profile contract", () => {
  for (const field of [
    "Názov",
    "Psipedia ID",
    "Slug",
    "Kategória",
    "Psipedia stav",
    "Perex",
    "Popis",
    "Služby",
    "Kvalifikácie",
    "Kraj",
    "Okres",
    "Mesto",
    "Adresa",
    "PSČ",
    "Ulica",
    "Číslo domu",
    "Formát adresy",
    "Potvrdená prevádzka",
    "Cena / poznámka",
    "Web",
    "Telefón",
    "E-mail",
    "Facebook",
    "Instagram",
    "Interný e-mail",
    "Hlavný obrázok URL",
    "Kvalita · Telefón",
    "Kvalita · E-mail",
    "Kvalita · Web",
    "Kvalita · Obrázok",
    "Kvalita · Adresa",
    "Kvalita skontrolované",
    "Overené",
    "Odporúčané",
    "SEO title",
    "SEO popis",
    "SEO kľúčové slovo",
    "Canonical URL",
    "OG title",
    "OG popis",
    "OG obrázok",
    "Noindex",
  ]) {
    assert.ok(syncSource.includes(`"${field}"`), `missing Notion directory field ${field}`);
  }
});

test("Notion quality resolution fields map to Psipedia quality metadata and carry an explicit review date", () => {
  assert.match(syncSource, /notionQualityStatusMap/);
  assert.match(syncSource, /"Nemá": "DOES_NOT_EXIST"/);
  assert.match(syncSource, /"Verejne nezverejnené": "NOT_PUBLIC"/);
  assert.match(syncSource, /"Nedohľadateľné": "NOT_FOUND"/);
  assert.match(syncSource, /"Nevzťahuje sa": "NOT_APPLICABLE"/);
  assert.match(syncSource, /qualityResolutions: notionQualityResolutions\(page\)/);
  assert.match(syncSource, /qualityCheckedAt: propertyDateStart\(page, "Kvalita skontrolované"\)/);
  assert.match(syncSource, /qualityResolutions: desired\.qualityResolutions/);
  assert.match(syncSource, /qualityCheckedAt: desired\.qualityCheckedAt/);
});

test("technical GEO and sync state are mirrored from Psipedia without becoming editable profile input", () => {
  for (const field of [
    "Latitude",
    "Longitude",
    "GEO stav",
    "GEO provider",
    "Google Place ID",
    "Google miesto aktuálne",
    "Google Maps cieľ",
    "Vytvorené Psipedia",
    "Aktualizované Psipedia",
    "Publikované Psipedia",
    "Archivované Psipedia",
    "Vytvoril",
    "Upravil",
    "Sync hash",
    "Sync stav",
    "Sync chyba",
    "Posledný sync",
  ]) {
    assert.ok(syncSource.includes(`"${field}"`), `missing technical mirror field ${field}`);
  }
  const notionSnapshotBody = syncSource.slice(
    syncSource.indexOf("function notionSnapshot"),
    syncSource.indexOf("async function snapshotHash"),
  );
  assert.doesNotMatch(notionSnapshotBody, /Google Place ID|Latitude|Longitude|GEO stav|GEO provider/);
});


test("multiline rich text stays lossless so services do not collapse into one item", () => {
  assert.match(syncSource, /function richTextPlainText/);
  assert.match(syncSource, /\.join\(""\)\.replace\(\/\\r\\n\?\/g, "\\n"\)\.trim\(\)/);
  assert.doesNotMatch(syncSource, /notionRichTextPlainText/);
  assert.match(syncSource, /split\(\/\\n\|;\/g\)/);
});

test("mapping recovery uses identical current snapshots, never a Notion-supplied Sync hash", () => {
  assert.equal(canRecoverNotionDirectoryMapping("same-hash", "same-hash"), true);
  assert.equal(canRecoverNotionDirectoryMapping("canonical", "different"), false);
  assert.equal(canRecoverNotionDirectoryMapping("", ""), false);

  const recovery = syncSource.slice(
    syncSource.indexOf("async function recoverMappingFromPage("),
    syncSource.indexOf("export async function ensureDirectoryProfileInNotion("),
  );
  const guard = recovery.indexOf("if (!canRecoverNotionDirectoryMapping(hash, notionHash))");
  const mappingWrite = recovery.indexOf("await saveMapping(");
  assert.ok(guard >= 0 && mappingWrite > guard,
    "the divergence guard must run before any recovered D1 mapping write");
  assert.match(recovery, /contentHash: hash,/);
  assert.doesNotMatch(recovery, /contentHash: propertyText\(input\.page, "Sync hash"\)/);
  assert.match(recovery, /DIRECTORY_RECOVERY_BASELINE_MISMATCH/);
});

test("a duplicate Notion row cannot silently steal an existing profile mapping", () => {
  assert.match(syncSource, /existingMapping\.notion_page_id !== input\.page\.id/);
  assert.match(syncSource, /už je prepojený s iným Notion záznamom/);
});

test("directory Notion mapping is one-to-one and idempotent", () => {
  assert.match(migrationSource, /notion_page_id TEXT PRIMARY KEY/);
  assert.match(migrationSource, /directory_profile_id INTEGER NOT NULL UNIQUE/);
  assert.match(migrationSource, /FOREIGN KEY \(directory_profile_id\) REFERENCES directory_profiles\(id\) ON DELETE CASCADE/);
  assert.match(syncSource, /content_hash/);
  assert.match(syncSource, /sha256Text\(JSON\.stringify\(snapshot\)\)/);
  assert.match(syncSource, /ON CONFLICT\(directory_profile_id\) DO UPDATE SET/);
});

test("bidirectional conflict resolution protects simultaneous editor and Notion changes", () => {
  assert.match(syncSource, /profileHash !== lastHash/);
  assert.match(syncSource, /pageHash !== lastHash/);
  assert.match(syncSource, /if \(notionChanged && profileChanged\)/);
  assert.match(syncSource, /throw new Error\("CONFLICT: Notion aj Psipedia/);
  assert.match(syncSource, /forcePsipediaPush/);
});

test("Notion address edits use canonical verification and exact GEO lifecycle", () => {
  assert.match(syncSource, /directoryPhysicalAddressChanged/);
  assert.match(syncSource, /verifyDirectoryCanonicalAddress/);
  assert.match(syncSource, /withVerifiedDirectoryAddress/);
  assert.match(syncSource, /applyVerifiedDirectoryAddressGeo/);
  assert.match(syncSource, /autoAssignGooglePlaceForDirectoryProfile/);
  assert.ok(
    syncSource.indexOf("applyVerifiedDirectoryAddressGeo") < syncSource.lastIndexOf("autoAssignGooglePlaceForDirectoryProfile"),
    "Google Place auto-match must run after verified exact GEO is applied",
  );
  assert.match(addressSaveSource, /applyGeocoderResolution/);
  assert.match(addressSaveSource, /setGeoVisibility/);
  assert.match(storeSource, /reconcileGeoAfterSourceMutation/);
});

test("Notion Ready creates canonical drafts; publication requires explicit Psipedia state", () => {
  assert.match(syncSource, /createManagedDirectoryProfile/);
  assert.match(syncSource, /if \(propertyText\(page, "Psipedia ID"\)\) return false/);
  assert.match(syncSource, /editorialState === "Ready" \|\| editorialState === "Publikované"/);
  assert.match(syncSource, /function newProfileInput/);
  assert.match(syncSource.slice(syncSource.indexOf("function newProfileInput"), syncSource.indexOf("function notionProfileReadyForCreate")), /status: "draft"/);
  assert.match(syncSource, /createManagedDirectoryProfile\(payload, SYSTEM_ACTOR, input\.database\)/);
  assert.match(syncSource, /summary\.createdFromNotion \+= 1/);
  assert.match(syncSource, /await writeProfileToNotion\(\{/);
});


test("signed Gemini imports keep a private D1 profile despite optional media or mirror errors", () => {
  const createBody = syncSource.slice(
    syncSource.indexOf("async function createProfileFromNotion("),
    syncSource.indexOf("async function applyNotionToProfile("),
  );
  assert.match(createBody, /if \(!input\.trustedGemini\) throw error/);
  assert.match(createBody, /imageWarning = error instanceof Error/);
  assert.match(createBody, /status: "draft"/);

  const sweep = syncSource.slice(syncSource.indexOf("export async function runNotionDirectorySyncSweep"));
  const mapping = sweep.indexOf("await saveMapping({", sweep.indexOf("const creation = await createProfileFromNotion"));
  const nonBlocking = sweep.indexOf("const warnings = creation.imageWarning", mapping);
  const ready = sweep.indexOf("summary.createdFromNotion += 1", nonBlocking);
  assert.ok(mapping >= 0 && nonBlocking > mapping && ready > nonBlocking,
    "a durable private D1 mapping precedes optional warning-only post-create work");
  assert.match(sweep.slice(nonBlocking, ready), /if \(!trustedGemini\) throw error/g);
  assert.match(sweep.slice(nonBlocking, ready), /markPageError/);
});

test("Admin-owned service choices cannot cause a Notion delete conflict", () => {
  const mapped = syncSource.slice(
    syncSource.indexOf("async function syncMappedPage("),
    syncSource.indexOf("async function recoverMappingFromPage("),
  );
  assert.match(mapped, /"slug", "category", "status", "services", "confirmedServiceLocation"/);
  assert.match(mapped, /canonicalFieldsWin: true/);
});

test("Notion-first creation uses the durable R2 image pipeline from MEDIA-SOURCE-QUALITY-1", () => {
  assert.match(syncSource, /prepareNotionMainImage\(\{/);
  assert.match(syncSource, /folder: "directory"/);
  assert.match(syncSource, /sourceContentHash: creation\.prepared\.sourceContentHash/);
  assert.match(syncSource, /upsertMediaSourceMonitor\(\{/);
  assert.doesNotMatch(
    syncSource.slice(syncSource.indexOf("function newProfileInput"), syncSource.indexOf("function notionProfileReadyForCreate")),
    /imageUrl: desired\.imageUrl/,
  );
});

test("Notion-first creation persists mapping before post-create GEO work and can recover a failed write-back", () => {
  const sweepBody = syncSource.slice(
    syncSource.indexOf("export async function runNotionDirectorySyncSweep"),
  );
  assert.ok(
    sweepBody.indexOf("await saveMapping({") < sweepBody.indexOf("await autoAssignGooglePlaceForDirectoryProfile({"),
    "mapping must exist before post-create Google Place work",
  );
  assert.match(syncSource, /propertyText\(page, "Psipedia ID"\) !== String\(profile\.id\)/);
  assert.match(syncSource, /return "pushed" as const/);
});

test("existing Psipedia profiles bootstrap into Notion in bounded batches", () => {
  assert.match(syncSource, /const BOOTSTRAP_BATCH = 20/);
  assert.match(syncSource, /LEFT JOIN directory_notion_sync dns/);
  assert.match(syncSource, /WHERE dns\.directory_profile_id IS NULL/);
  assert.match(syncSource, /createNotionPage/);
  assert.match(syncSource, /bootstrapped \+= 1/);
  assert.match(syncSource, /export async function runNotionDirectoryBootstrapSweep/);
  assert.match(syncSource, /summary\.selected = bootstrapIds\.length/);
  assert.match(syncSource, /summary\.hasMore = \(await bootstrapProfileIds\(input\.database\)\)\.length > 0/);
});

test("directory mirror runs full bidirectional sync hourly and bootstrap-only backfill every five minutes", () => {
  assert.match(workerSource, /runNotionDirectorySyncSweep/);
  assert.match(workerSource, /event: "notion_directory_sync_sweep"/);
  const boundedFiveMinuteBranch = workerSource.split("if (!isFullHourlyScheduledSweep(controller)) {")[1]?.split("const [summary,")[0] ?? "";
  assert.doesNotMatch(boundedFiveMinuteBranch, /runNotionDirectorySyncSweep/);
  assert.match(boundedFiveMinuteBranch, /runNotionDirectoryBootstrapSweep/);
  assert.match(boundedFiveMinuteBranch, /event: "notion_directory_backfill_sweep"/);
  assert.match(boundedFiveMinuteBranch, /cadence: "five_minute"/);
  assert.match(wranglerSource, /"NOTION_DIRECTORY_SYNC_ENABLED": "true"/);
  assert.match(wranglerSource, /"NOTION_DIRECTORY_DATA_SOURCE_ID": "84e0664c-ca47-405f-9d54-31b20287bc8c"/);
});

test("unconfirmed service-area edits never request provider exact verification", () => {
  const policy = notionDirectoryUpdateSafety({
    physicalAddressChanged: true,
    notionConfirmedLocation: false,
    canonicalConfirmedLocation: false,
    notionPublicPhone: "",
    canonicalPublicPhone: "",
  });
  assert.equal(policy.verifyExactAddress, false);
  assert.equal(policy.blocksConfirmedAddressDowngrade, false);
});

test("only explicitly confirmed new or changed exact service addresses are verified", () => {
  const base = {
    physicalAddressChanged: false,
    notionConfirmedLocation: true,
    canonicalConfirmedLocation: true,
    notionPublicPhone: "unchanged value",
    canonicalPublicPhone: "unchanged value",
  };
  assert.equal(notionDirectoryUpdateSafety(base).verifyExactAddress, false);
  assert.equal(notionDirectoryUpdateSafety({ ...base, physicalAddressChanged: true }).verifyExactAddress, true);
  assert.equal(notionDirectoryUpdateSafety({ ...base, canonicalConfirmedLocation: false }).verifyExactAddress, true);
});

test("an unconfirmed Notion row cannot deconfirm existing canonical exact place", () => {
  const result = notionDirectoryUpdateSafety({
    physicalAddressChanged: true,
    notionConfirmedLocation: false,
    canonicalConfirmedLocation: true,
    notionPublicPhone: "",
    canonicalPublicPhone: "",
  });
  assert.equal(result.blocksConfirmedAddressDowngrade, true);
  assert.equal(result.verifyExactAddress, false);
});

test("legacy multi-value contact stays untouched during unrelated edits", () => {
  const legacy = "entry A; entry B";
  const base = {
    physicalAddressChanged: false,
    notionConfirmedLocation: false,
    canonicalConfirmedLocation: false,
    notionPublicPhone: legacy,
    canonicalPublicPhone: legacy,
  };
  assert.equal(notionDirectoryUpdateSafety(base).preserveUnchangedCanonicalPhone, true);
  assert.equal(notionDirectoryUpdateSafety({ ...base, notionPublicPhone: "replacement" }).preserveUnchangedCanonicalPhone, false);
  assert.match(syncSource, /if \(safety\.verifyExactAddress\)/);
  assert.match(syncSource, /publicPhone: undefined/);
});

test("Gemini Notion proposals become private canonical drafts without approval or public status", () => {
  const gate = syncSource.slice(syncSource.indexOf("function notionProfileReadyForCreate"), syncSource.indexOf("async function createProfileFromNotion"));
  assert.match(gate, /Gemini automatizácia/);
  assert.match(gate, /"Nápad", "Na kontrolu", "Ready", "Koncept"/);
  assert.match(gate, /propertyText\(page, "Psipedia stav"\) === "Koncept"/);
  assert.doesNotMatch(gate, /editorialState === "Publikované" &&/);
  const creation = syncSource.slice(syncSource.indexOf("async function createProfileFromNotion"), syncSource.indexOf("async function applyNotionToProfile"));
  assert.match(creation, /status: "draft"/);
  assert.match(creation, /resolveGeminiPublicSlug/);
  assert.doesNotMatch(creation, /desired\\.slug = "gemini-" \\+/);
  assert.doesNotMatch(creation, /sameDirectoryIdentity|GeminiCanonicalDuplicateError/);
  assert.match(syncSource, /await saveMapping\(\{/);
});
test("Gemini mapped drafts never auto-publish and editorial conflicts remain unresolved", () => {
  const section = syncSource.slice(syncSource.indexOf("async function applyNotionToProfile"), syncSource.indexOf("async function recentNotionPages"));
  assert.match(section, /status: current.status/);
  const mapped = syncSource.slice(syncSource.indexOf("async function syncMappedPage"), syncSource.indexOf("async function recoverMappingFromPage"));
  assert.match(mapped, /if \(notionChanged && profileChanged\)/);
  assert.match(mapped, /throw new Error\("CONFLICT/);
});

test("one-page Fénix import is scoped to exact Notion ID and does not process unrelated profiles", () => {
  const sweep = syncSource.slice(syncSource.indexOf("export async function runNotionDirectorySyncSweep"));
  assert.match(sweep, /targetPageId\?: string/);
  assert.match(sweep, /NOTION_TARGET_PAGE_INVALID/);
  assert.match(sweep, /NOTION_TARGET_DATA_SOURCE_MISMATCH/);
  assert.match(sweep, /pages = \[targetPage\]/);
  assert.match(sweep, /input.targetPageId \? \[\] : await changedProfileIds/);
});

test("Gemini 22 scope enumerates exactly 10 Directory, 6 Events and 6 Help stable keys", () => {
  const keys = [
    ...["veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
      "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
      "vencenie", "fyzioterapia", "dalsie-sluzby"].map(x => "directory." + x),
    ...["vystavy", "preteky", "seminare", "treningy", "stretnutia", "dalsie"].map(x => "events." + x),
    ...["docasna-opatera", "zbierky", "dobrovolnictvo", "utulky",
      "adopcia", "stratene-a-najdene"].map(x => "help." + x),
  ];
  assert.equal(keys.length, 22);
  assert.equal(new Set(keys).size, 22);
  for (const key of keys) assert.equal(externalWorkerCategorySupported(key), true, key);
});

test("Gemini 22 Directory: Notion enrichment preserves canonical ownership and blank fields", () => {
  const canonical = {
    slug: "existing", category: "veterinari", status: "published",
    name: "Clinic", excerpt: "Old", description: "Existing description",
    services: ["chirurgia"], qualifications: ["MVDr."],
    region: "Nitriansky kraj", district: "Nitra", city: "Nitra",
    address: "Výstavná 4", postalCode: "94901", street: "Výstavná",
    houseNumber: "4", addressFormat: "STREET",
    confirmedServiceLocation: true, verified: true, featured: true,
    internalEmail: "admin@example.org", qualityResolutions: {phone:"RESOLVED"},
    qualityCheckedAt: "2026-10-01",
    seo: {title:"Old SEO", description:"Existing", noindex:true},
  };
  const notion = {
    ...canonical, slug: "unsafe", status: "draft", category: "salony-a-sluzby",
    name: "Clinic Updated", excerpt: "", description: "Improved",
    services: [], qualifications: ["MVDr.", "PhD."],
    region: "Bratislavský kraj", district: "Bratislava", city: "Bratislava",
    address: "", postalCode: "", street: "", houseNumber: "",
    confirmedServiceLocation: false, verified: false, featured: false,
    internalEmail: "notion@example.org",
    qualityResolutions: {phone:"IGNORE"}, qualityCheckedAt: "",
    seo: { title: "Better SEO", description: "", noindex: false },
  };
  const result = mergeGeminiDirectoryPriority({
    canonical, notion, confirmedGooglePlace: true,
  });
  assert.equal(result.name, "Clinic Updated");
  assert.equal(result.description, "Improved");
  assert.equal(result.excerpt, "Old");
  assert.deepEqual(result.services, ["chirurgia"]);
  assert.deepEqual(result.qualifications, ["MVDr.", "PhD."]);
  assert.equal(result.slug, "existing");
  assert.equal(result.category, "veterinari");
  assert.equal(result.status, "published");
  assert.equal(result.region, "Nitriansky kraj");
  assert.equal(result.address, "Výstavná 4");
  assert.equal(result.confirmedServiceLocation, true);
  assert.equal(result.verified, true);
  assert.equal(result.featured, true);
  assert.equal(result.internalEmail, "admin@example.org");
  assert.equal(result.qualityResolutions.phone, "RESOLVED");
  assert.equal(result.seo.title, "Better SEO");
  assert.equal(result.seo.description, "Existing");
  assert.equal(result.seo.noindex, true);
  assert.equal(canonical.description, "Existing description");
});

test("mapped Directory pages must belong to the configured Notion data source", () => {
  const source = "84e0664c-ca47-405f-9d54-31b20287bc8c";
  const page = { parent: { type: "data_source_id", data_source_id: source } };
  assert.equal(notionDirectoryPageBelongsToSource(page, source), true);
  assert.equal(notionDirectoryPageBelongsToSource({
    parent: { type: "data_source_id", data_source_id: source.replaceAll("-", "") },
  }, source), true);
  assert.equal(notionDirectoryPageBelongsToSource(page, "76d9ccde-5816-422c-bcfe-863ab69db080"), false);
  assert.equal(notionDirectoryPageBelongsToSource({ parent: { type: "database_id" } }, source), false);
  assert.equal(notionDirectoryPageBelongsToSource({}, source), false);
  assert.equal(notionDirectoryPageBelongsToSource({ ...page, archived: true }, source), false);
  assert.equal(notionDirectoryPageBelongsToSource({ ...page, in_trash: true }, source), false);
  assert.equal(notionDirectoryPageBelongsToSource(page, "not-a-uuid"), false);

  const mapped = syncSource.slice(
    syncSource.indexOf("async function syncMappedPage("),
    syncSource.indexOf("async function recoverMappingFromPage("),
  );
  assert.ok(mapped.indexOf("notionDirectoryPageBelongsToSource(page, input.dataSourceId)") <
    mapped.indexOf("await writeProfileToNotion({"),
    "moved pages must be rejected before any Notion write");
});

test("Directory hourly sweep never processes a mapped profile twice", () => {
  const sweep = syncSource.slice(syncSource.indexOf("export async function runNotionDirectorySyncSweep"));
  assert.match(sweep, /const attemptedMappedProfileIds = new Set<number>\(\)/);
  const pageAttempt = sweep.indexOf("attemptedMappedProfileIds.add(mapping.directory_profile_id)");
  const reconcile = sweep.indexOf("const result = await syncMappedPage({");
  const fastPath = sweep.indexOf("propertyText(page, \"Sync hash\") === mapping.content_hash");
  assert.ok(fastPath >= 0 && pageAttempt > fastPath && reconcile > pageAttempt,
    "no-change fast path must allow later canonical D1 changes");
  assert.match(sweep, /for \(const profileId of changedIds\) \{\s*if \(attemptedMappedProfileIds.has\(profileId\)\) continue;/);
});

test("foreign or moved Directory pages never receive diagnostic Notion PATCH", () => {
  const sweep = syncSource.slice(syncSource.indexOf("export async function runNotionDirectorySyncSweep"));
  const skipErrors = (sweep.match(/if \(!\(error instanceof NotionDirectoryUnsafeTargetError\)\) \{/g) ?? []).length;
  assert.equal(skipErrors, 2, "both recent-page and D1-changed catch paths must fail closed");
  assert.match(syncSource, /throw new NotionDirectoryUnsafeTargetError\("IDENTITY_CONFLICT: Notion profil/);
  assert.match(syncSource, /throw new NotionDirectoryUnsafeTargetError\("IDENTITY_CONFLICT: Notion page ID/);
  const denied = new NotionDirectoryUnsafeTargetError("foreign page");
  assert.equal(denied instanceof NotionDirectoryUnsafeTargetError, true);
});

test("unchanged Directory error metadata is not rewritten every hourly run", () => {
  const input = {
    syncStatus: "Chyba",
    syncError: "CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (*:BASELINE_UNAVAILABLE)",
    message: "CONFLICT: LOSSLESS_FIELD_REVIEW_REQUIRED (*:BASELINE_UNAVAILABLE)",
  };
  assert.equal(directorySyncErrorMetadataNeedsWrite(input), false);
  assert.equal(directorySyncErrorMetadataNeedsWrite({ ...input, message: "NEW_ERROR" }), true);
  assert.equal(directorySyncErrorMetadataNeedsWrite({ ...input, syncStatus: "Synchronizované" }), true);
  const sweep = syncSource.slice(syncSource.indexOf("export async function runNotionDirectorySyncSweep"));
  assert.match(syncSource, /if \(page\?\.id === pageId && !directorySyncErrorMetadataNeedsWrite/);
  assert.match(sweep, /markPageError\(input\.bindings, page\.id, error, page\)/);
  assert.match(sweep, /markPageError\(input\.bindings, mapping\.notion_page_id, error, page\)/);
  assert.match(sweep, /page = await fetchNotionPage\(input\.bindings, mapping\.notion_page_id\)/);
  assert.match(sweep, /syncMappedPage\(\{[\s\S]*?mapping,\s*page,\s*forcePsipediaPush: true/);
});

test("Directory bootstrap has no targeted selectors; reconciler rejects ambiguous scope", () => {
  const bootstrapStart = syncSource.indexOf("export async function runNotionDirectoryBootstrapSweep");
  const syncStart = syncSource.indexOf("export async function runNotionDirectorySyncSweep");
  assert.ok(bootstrapStart >= 0 && syncStart > bootstrapStart);
  const bootstrap = syncSource.slice(bootstrapStart, syncStart);
  const sweep = syncSource.slice(syncStart);
  assert.equal(bootstrap.includes("input.targetPageId"), false);
  assert.equal(bootstrap.includes("input.targetProfileId"), false);
  const guard = "if (input.targetPageId !== undefined && input.targetProfileId !== undefined)";
  assert.ok(sweep.includes(guard), "mixed page/profile targets must be rejected");
  assert.ok(sweep.indexOf(guard) < sweep.indexOf("const enabled = notionFlagEnabled("),
    "invalid scope must fail before feature flag and any D1/Notion reads");
  assert.ok(sweep.includes('throw new Error("NOTION_TARGET_SCOPE_AMBIGUOUS")'));
});

test("targeted Directory import refuses archived, trashed, and foreign Notion pages", () => {
  const sweep = syncSource.slice(syncSource.indexOf("export async function runNotionDirectorySyncSweep"));
  const targetStart = sweep.indexOf("if (input.targetPageId !== undefined) {");
  const ownershipCheck = sweep.indexOf("if (!notionDirectoryPageBelongsToSource(targetPage, dataSourceId))", targetStart);
  const beforeImport = sweep.indexOf("pages = [targetPage];", targetStart);
  assert.ok(targetStart >= 0 && ownershipCheck > targetStart && beforeImport > ownershipCheck,
    "target page ownership must be verified before it is admitted for import");
  const source = "84e0664c-ca47-405f-9d54-31b20287bc8c";
  const page = { parent: { type: "data_source_id", data_source_id: source } };
  assert.equal(notionDirectoryPageBelongsToSource(page, source), true);
  assert.equal(notionDirectoryPageBelongsToSource({ ...page, archived: true }, source), false);
  assert.equal(notionDirectoryPageBelongsToSource({ ...page, in_trash: true }, source), false);
  assert.equal(notionDirectoryPageBelongsToSource(page, "76d9ccde-5816-422c-bcfe-863ab69db080"), false);
});

test("Services V3 selected choices trigger a targeted Notion relation after canonical CAS", async () => {
  const route = await readFile(
    new URL("../app/api/admin/directory/[id]/service-options/route.ts", import.meta.url), "utf8");
  const saved = route.indexOf("await saveAdminServiceChoice(");
  const reset = route.indexOf("await resetAdminServiceChoice(");
  const projection = route.indexOf("await projectServiceChoiceToDirectoryNotion(");
  const sync = route.indexOf("await runNotionDirectorySyncSweep(");
  assert.ok(saved >= 0 && reset >= 0 && projection > saved && projection > reset);
  assert.ok(sync > projection, "relation writeback must run only after canonical choice CAS and projection");
  assert.ok(route.includes("targetProfileId:profileId,syncServiceRelations:true"));
  assert.ok(route.includes('NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED==="true"'));
  assert.ok(route.includes('notionFieldSync="pending"'));
  assert.ok(route.includes('notionProjection==="deferred"'));
  assert.ok(route.includes("return Response.json({selection,notionProjection,notionFieldSync,"));
  assert.ok(route.includes("if(!cfg.DB)return Response.json("), "D1 must be available before saving");
  assert.equal(route.includes("runServicesV3CatalogAutoSweep"), false,
    "saving a service selection must not trigger unrelated catalog creation/sweeps");
});

test("Services V3 relation sync runs only when requested for an existing mapped Directory profile", async () => {
  const sweep = syncSource.slice(syncSource.indexOf("export async function runNotionDirectorySyncSweep"));
  const fastStart = sweep.indexOf("if (input.targetProfileId !== undefined) {");
  const helper = sweep.indexOf("async function syncRelation(");
  const targetEnd = sweep.indexOf("let pages: NotionPage[];", fastStart);
  const target = sweep.slice(fastStart, targetEnd);
  assert.ok(helper >= 0 && helper < fastStart, "the hourly and targeted paths reuse one relation helper");
  assert.ok(target.includes("const mapping = await loadMappingByProfile("));
  assert.ok(target.includes("if (!mapping) return summary"), "no new Notion page for unmapped records");
  assert.ok(target.includes("if (input.syncServiceRelations) {"));
  assert.ok(target.includes("await syncRelation(mapping.notion_page_id, input.targetProfileId)"));
  assert.ok(target.includes("summary.serviceRelationSync = relation"));
  assert.ok(target.includes('if (relation === "skipped") summary.failed++'),
    "missing migration or missing remote relation must not be reported as synced");
  assert.ok(target.includes("return summary"), "no ordinary full Directory sweep");
  const handler = await readFile(
    new URL("../app/api/admin/directory/[id]/route.ts", import.meta.url), "utf8");
  assert.equal(handler.includes("syncServiceRelations:true"), false,
    "saving unrelated Directory fields must not requery the entire Notion catalog");
});

test("Services V3 relation verifies current Directory owner and preserves conflict protection", async () => {
  const relation = await readFile(
    new URL("../lib/service-catalog-notion-relations.ts", import.meta.url), "utf8");
  assert.ok(relation.includes("directoryDataSourceId:string"));
  assert.ok(relation.includes("notionPageBelongsToDataSource(p,expectedDirectorySourceId)"));
  assert.ok(relation.includes("SERVICES_PROFILE_NOTION_SOURCE_CHANGED"));
  assert.ok(relation.includes("readRemote(bindings,pageId,directoryDataSourceId)"));
  assert.ok(relation.includes("SERVICES_RELATION_BOTH_SIDES_CHANGED_REVIEW"));
  assert.ok(relation.includes("SERVICES_RELATION_WRITE_NOT_VERIFIED"));
  assert.ok(relation.includes("SERVICES_RELATION_CATALOG_NOT_YET_MIRRORED"));
  assert.equal(relation.includes("INSERT INTO service_catalog_admin_options"), false);
});
