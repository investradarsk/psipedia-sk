import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { isInternalArticleInstructionText, isNotionOnlySocialDraftHeading, isPhotoAttributionHeading, isPrivateEditorialArticleHeading } from "../lib/public-editorial-guard.ts";
import { readFile } from "node:fs/promises";
import test from "node:test";

const syncSource = await readFile(new URL("../lib/notion-article-sync.ts", import.meta.url), "utf8");
const routeSource = await readFile(new URL("../app/api/admin/notion-sync/route.ts", import.meta.url), "utf8");
const articleRouteSource = await readFile(new URL("../app/api/admin/articles/[id]/route.ts", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
const migrationSource = await readFile(new URL("../drizzle/0044_notion_article_sync.sql", import.meta.url), "utf8");
const taxonomySource = await readFile(new URL("../lib/article-subsection-taxonomy.ts", import.meta.url), "utf8");
const portalSource = await readFile(new URL("../lib/portal.ts", import.meta.url), "utf8");
const articleStoreSource = await readFile(new URL("../lib/article-store.ts", import.meta.url), "utf8");

test("Ready Notion articles auto-flow into Psipedia as draft only", () => {
  assert.match(syncSource, /selectProperty\(page, "Stav"\) !== "Ready"/);
  assert.match(syncSource, /status: "draft"/);
  assert.match(syncSource, /existing\.status !== "draft" && existing\.status !== "published"/);
  assert.match(syncSource, /status: existing\.status/);
  assert.match(syncSource, /checkboxProperty\(page, "Odoslať na Psipedia"\)/);
  assert.doesNotMatch(syncSource, /Zdroje overené/);
  assert.doesNotMatch(syncSource, /Obsah skontrolovaný/);
  assert.doesNotMatch(syncSource, /SEO skontrolované/);
});

test("past-due scheduled articles import editorial changes only through verified published mappings", () => {
  const start = syncSource.indexOf('  const dueScheduledPublishedMapping = Boolean(');
  const end = syncSource.indexOf("  // Unapproved legacy Ready rows", start);
  const bodyLoad = syncSource.indexOf("  const blocks = await getPageBlocks(bindings, page.id);", start);
  assert.ok(start >= 0 && end > start && bodyLoad > end, "the identity gate must run before parsing article content");
  const guard = syncSource.slice(start, end);
  assert.match(guard, /effectiveArticleStatus\(mappedExisting\.status, mappedExisting\.publishedAt\) === "published"/);
  assert.match(guard, /selectProperty\(page, "Stav"\) === "Publikované"/);
  assert.match(guard, /richTextProperty\(page, "Psipedia ID"\) === String\(mappedExisting\.id\)/);
  assert.doesNotMatch(guard, /return "unchanged"|updateManagedArticle|upsertMapping|updateNotionSyncState/);

  const verified = runInNewContext(`(function (mappedExisting, page) {
    ${guard}
    return dueScheduledPublishedMapping;
  })`, {
    effectiveArticleStatus: (status, publishedAt) => (
      status === "scheduled" && publishedAt && Date.parse(publishedAt) <= Date.parse("2026-11-22T17:00:00Z")
        ? "published" : status
    ),
    selectProperty: (page, property) => property === "Stav" ? page.status : "",
    richTextProperty: (page, property) => property === "Psipedia ID" ? page.articleId : "",
  }, { timeout: 500 });
  const stored = { id: 2272, status: "scheduled", publishedAt: "2026-11-21T08:00:00.000Z" };
  const remote = { status: "Publikované", articleId: "2272" };
  assert.equal(verified(stored, remote), true);
  assert.equal(verified({ ...stored, publishedAt: "2026-12-19T16:00:00.000Z" }, remote), false);
  assert.equal(verified(stored, { ...remote, status: "Ready" }), false);
  assert.equal(verified(stored, { ...remote, articleId: "other" }), false);
  assert.equal(verified({ ...stored, status: "draft" }, remote), false);
  assert.equal(verified(null, remote), false);

  assert.match(syncSource, /existing\.status !== "draft" && existing\.status !== "published"[\s\S]*?!dueScheduledPublishedMapping/);
  assert.match(syncSource, /if \(existing\.status === "published" \|\| dueScheduledPublishedMapping\|\|stagedScheduled\)/);
  assert.match(syncSource, /status: existing\.status,[\s\S]*?publishedAt: existing\.publishedAt/);
  assert.match(syncSource, /status: existing\.status==="scheduled" \? "scheduled" : undefined/);
  assert.match(syncSource, /allowPastDueScheduledContentEdit: existing\.status==="scheduled"&&effectiveArticleStatus\(existing\.status,existing\.publishedAt\)==="published"/);
  assert.match(articleStoreSource, /schedulingPrecondition\?\.allowPastDueScheduledContentEdit === true/);
  assert.match(articleStoreSource, /schedulingPrecondition\.status === "scheduled"/);
  assert.match(articleStoreSource, /existing\.status === "scheduled"/);
  assert.match(articleStoreSource, /payload\.status === "scheduled"/);
  assert.match(articleStoreSource, /payload\.publishedAt === existing\.publishedAt/);
  assert.match(articleStoreSource, /Date\.parse\(existing\.publishedAt\) <= Date\.now\(\)/);
  assert.match(articleStoreSource, /allowPastDueScheduledContentEdit\)\)\)/);
  assert.match(articleStoreSource, /AND \(\? IS NULL OR status = \?\)/);
});

test("published articles preserve identity and media while importing mapped SEO fields", () => {
  assert.match(syncSource, /findUnmappedCanonicalArticle/);
  assert.match(syncSource, /ARTICLE_MAPPING_REVIEW_REQUIRED/);
  assert.match(syncSource, /selectProperty\(page, "Stav"\) === "Publikované"/);
  assert.match(syncSource, /ARTICLE_CREATE_REQUIRES_READY/);
  assert.match(syncSource, /status: existing\.status/);
  assert.match(syncSource, /publishedAt: existing\.publishedAt/);
  assert.match(syncSource, /imageUrl: existing\.image/);
  assert.match(syncSource, /\.\.\.basePayload/);
  assert.doesNotMatch(syncSource, /canonicalUrl: existing\.canonicalUrl/);
  assert.doesNotMatch(syncSource, /noindex: existing\.noindex/);
  assert.doesNotMatch(syncSource, /ogImageUrl: existing\.ogImage/);
  assert.match(syncSource, /ARTICLE_ADMIN_REVISION_NOT_SYNCED/);
});

test("Notion query automatically scans Ready articles in the exact data source", () => {
  assert.match(syncSource, /filter:\s*\{\s*or:\s*\[/);
  assert.match(syncSource, /\{ property: "Stav", select: \{ equals: "Ready" \} \}/);
  assert.match(syncSource, /\{ property: "Odoslať na Psipedia", checkbox: \{ equals: true \} \}/);
  assert.match(syncSource, /last_edited_time/);
  assert.match(syncSource, /NOTION_ARTICLES_DATA_SOURCE_ID/);
  assert.match(syncSource, /\/data_sources\/\$\{encodeURIComponent\(dataSourceId\)\}\/query/);
});


test("Ready sync requires an explicit send opt-in, even for a page returned by a stale query", () => {
  const start = syncSource.indexOf("function validateSyncGate(");
  const end = syncSource.indexOf("\nasync function notionRequest<", start);
  assert.ok(start >= 0 && end > start, "sync gate source must be available");
  const functionSource = syncSource.slice(start, end).replace("page: NotionPage", "page").trim();
  const validate = runInNewContext(`(${functionSource})`, {
    selectProperty: (page, name) => name === "Stav" ? page.state : "",
    checkboxProperty: (page, name) => name === "Odoslať na Psipedia" && page.send === true,
  }, { timeout: 500 });

  assert.doesNotThrow(() => validate({ state: "Ready", send: true }));
  assert.doesNotThrow(() => validate({ state: "Publikované", send: false }));
  assert.doesNotThrow(() => validate({ state: "Na kontrolu", send: false }, true));
  assert.throws(() => validate({ state: "Na kontrolu", send: false }), /nie je v stave Ready/);
  assert.throws(() => validate({ state: "Ready", send: false }), /Odoslať na Psipedia/);
  assert.throws(() => validate({ state: "Ready" }), /Odoslať na Psipedia/);
  assert.throws(() => validate({ state: "Draft", send: true }), /nie je v stave Ready/);
});

test("retry is idempotent, protects non-drafts and preserves Admin-owned promo blocks", () => {
  assert.match(migrationSource, /notion_page_id TEXT PRIMARY KEY/);
  assert.match(migrationSource, /article_id INTEGER NOT NULL UNIQUE/);
  assert.match(syncSource, /if \(!signedFields && mapping && decodeArticleSeoReceipt\(mapping\.content_hash\)\.hash === contentHash\)/);
  assert.match(syncSource, /return "unchanged"/);
  assert.match(syncSource, /ON CONFLICT\(notion_page_id\) DO UPDATE SET/);
  assert.match(syncSource, /existing\.status !== "draft" && existing\.status !== "published"/);
  assert.match(syncSource, /ARTICLE_CREATE_REQUIRES_READY/);
  assert.match(syncSource, /preserveArticlePromoBlocks\(existing\.blocks \?\? \[\], basePayload\.blocks \?\? \[\]\)/);
  assert.match(syncSource, /catch \(error\) \{[\s\S]*?isArticleSlugConflict\(error\)/);
  assert.match(syncSource, /await updateNotionSyncState\(bindings, page\.id, \{[\s\S]*?state: "Synchronizované"/);
});

test("markerless Editorial Hub articles keep complete prose without importing admin-only notes", () => {
  const start = syncSource.indexOf("function selectNotionArticleBodyBlocks(");
  const end = syncSource.indexOf("\nfunction convertBodyBlocks(", start);
  assert.ok(start >= 0 && end > start);
  const isolated = syncSource.slice(start, end).replace("blocks: NotionBlock[]", "blocks");
  const select = runInNewContext(`(${isolated})`, {
    blockText: (block) => block.text ?? "",
    isStartHeading: (value) => ["článok — draft", "osnova článku"].includes(value.toLowerCase()),
    isStopHeading: (value) => value.toLowerCase() === "seo",
    isAdminManifestHeading: (value) => value.toLowerCase() === "psipedia bloky",
    isPrivateEditorialArticleHeading,
    isPhotoAttributionHeading,
    isInternalArticleInstructionText,
    isNotionSocialDraftSection: (blocks, index) => {
      if (blocks[index]?.type !== "heading_2") return false;
      const subsections = [];
      for (let i = index + 1; i < blocks.length && blocks[i].type !== "heading_2"; i += 1)
        if (blocks[i].type === "heading_3") subsections.push(blocks[i].text);
      return isNotionOnlySocialDraftHeading(blocks[index].text, subsections);
    },
    normalizeText: (value) => value.replace(/\s+/g, " ").trim(),
  }, { timeout: 500 });
  const paragraph = (text) => ({ type: "paragraph", text });
  const heading = (text) => ({ type: "heading_2", text });
  const intro = paragraph("Úvodný odsek skutočného článku obsahuje dôležité informácie pre čitateľa.");
  const a = heading("Prvý obsahový nadpis");
  const b = heading("Druhý obsahový nadpis");
  const body = paragraph("Vysvetlenie jednotlivých krokov.");
  const seo = heading("SEO");
  const manifest = heading("Psipedia bloky");
  const notes = heading("Pred publikovaním");

  assert.deepEqual(Array.from(select([intro, a, body, b, seo, paragraph("Interné SEO")])), [intro, a, body, b]);
  assert.deepEqual(Array.from(select([intro, a, b, notes, paragraph("Interné poznámky")])), [intro, a, b]);
  assert.deepEqual(Array.from(select([intro, a, b, manifest, paragraph("JSON manifest")])), [intro, a, b]);
  assert.deepEqual(Array.from(select([heading("Článok — draft"), intro, a, body, seo])), [intro, a, body]);
  const social = heading("Sociálne siete");
  const facebook = { type: "heading_3", text: "Facebook" };
  const instagram = { type: "heading_3", text: "Instagram" };
  assert.deepEqual(Array.from(select([intro, a, body, b, social, facebook, instagram])), [intro, a, body, b]);
  const instruction = { type: "callout", text: "Táto sekcia je zdrojom obsahu pre synchronizáciu do Psipedia.sk." };
  assert.deepEqual(Array.from(select([heading("Článok — draft"), instruction, intro, a, body, b])), [intro, a, body, b]);
  assert.throws(() => select([intro, a]), /aspoň dva obsahové nadpisy/);
  assert.throws(() => select([heading("Redakčné pokyny"), intro, a, b]), /bezpečný úvod/);
  assert.throws(() => select([paragraph("krátky"), a, b]), /bezpečný úvod/);
});

test("Notion retry cannot overwrite a manually edited or concurrently updated Admin draft", () => {
  assert.match(syncSource, /if \(mapping && existing\.updatedBy !== SYNC_ACTOR[\s\S]{0,170}articleAuthorityCoversDifferences/);
  assert.match(syncSource, /Prepojený koncept bol upravený v administrácii/);
  assert.match(syncSource, /updateManagedArticle\(existing\.id, prepared\.payload, SYNC_ACTOR, existing, \{ updatedAt: existing\.updatedAt, status: "draft" \}\)/);
  assert.match(articleStoreSource, /WHERE id = \?/);
  assert.match(articleStoreSource, /AND \(\? IS NULL OR updated_at = \?\)/);
  assert.match(articleStoreSource, /AND \(\? IS NULL OR status = \?\)/);
  assert.match(articleStoreSource, /const \[articleResult\] = await database\.batch\(\[articleStatement\]\)/);
  assert.match(articleStoreSource, /if \(!result && schedulingPrecondition\) throw new ArticleUpdateConflictError\(\)/);
  assert.match(articleStoreSource, /AND \(\? IS NULL OR updated_at = \?\)/);
  assert.match(articleStoreSource, /AND \(\? IS NULL OR status = \?\)/);
  assert.match(syncSource, /if \(!updated\) \{/);
  assert.match(syncSource, /cleanupImageKeys\(bindings\.BUCKET, \[prepared\.uploadedKey\]\)/);
});

test("canonical Notion subsection mapping is explicit and sourced from public portal taxonomy", () => {
  assert.match(syncSource, /selectProperty\(page, "Podsekcia"\)/);
  assert.match(syncSource, /resolveCanonicalArticleSubsection\(notionCategory, notionSubsection\)/);
  assert.match(taxonomySource, /getPortalSection/);
  assert.match(taxonomySource, /getPortalSubpage/);
  assert.match(taxonomySource, /NOTION_CANONICAL_SECTION_PORTALS/);
  assert.match(taxonomySource, /"Zdravie a starostlivosť": "starostlivost"/);
  assert.match(taxonomySource, /"Výcvik a aktivity": "aktivity"/);
  assert.match(taxonomySource, /"Šteniatka": "steniatka"/);
});

test("invalid Section and Subsection combinations fail closed without a generic fallback route", () => {
  assert.match(taxonomySource, /Podsekcia „\$\{subsectionLabel\}“ nepatrí do sekcie „\$\{sectionLabel\}“/);
  assert.match(syncSource, /Sync nevymyslí náhradnú route/);
  assert.match(syncSource, /fail-closed/);
  assert.match(syncSource, /nemá bezpečné canonical article mapping/);
  assert.doesNotMatch(syncSource, /NOTION_CATEGORY_PLACEMENTS/);
  assert.doesNotMatch(syncSource, /NOTION_CATEGORY_PLACEMENTS\[notionCategory\] \?\?/);
});

test("care subsection taxonomy covers hygiene, senior, nutrition and behaviour", () => {
  for (const pair of [
    ['slug: "vyziva"', 'label: "Výživa"'],
    ['slug: "spravanie"', 'label: "Správanie"'],
    ['slug: "srst-a-hygiena"', 'label: "Srsť a hygiena"'],
    ['slug: "senior"', 'label: "Psí senior"'],
  ]) {
    assert.ok(portalSource.includes(pair[0]), `missing ${pair[0]}`);
    assert.ok(portalSource.includes(pair[1]), `missing ${pair[1]}`);
  }
  assert.match(taxonomySource, /portalSubpage === "vyziva"\) return "Výživa"/);
  assert.match(taxonomySource, /portalSubpage === "vycvik"\) return "Výcvik"/);
});

test("Admin-aligned Všeobecné články preserves existing /clanky routes and categories", () => {
  const start = syncSource.indexOf("function mapNotionPlacement(");
  const end = syncSource.indexOf("\nfunction isStartHeading(", start);
  assert.ok(start >= 0 && end > start);
  const fn = syncSource.slice(start, end);
  assert.match(fn, /notionCategory === "Všeobecné články"/);
  assert.match(fn, /existing\?\.portalSection === "clanky" && existing\.category !== "Plemená"[\s\S]*?\? existing\.category : "Život so psom"/);
  assert.match(fn, /portalSection: "clanky"/);
  assert.match(fn, /portalSubpage: null/);
  assert.match(fn, /notionCategory === "Všeobecné články"[\s\S]*?contentType === "Aktuálna novinka" \|\| contentType === "Recenzia"/);
  assert.ok(fn.indexOf('if (notionCategory === "Všeobecné články"') <
    fn.indexOf('if (contentType === "Aktuálna novinka" || notionCategory === "Novinky zo sveta psov")'),
    "news and reviews must fail closed before any automatic news routing");
  assert.ok(fn.indexOf('if (notionSubsection) {') < fn.indexOf('if (notionCategory === "Všeobecné články")'),
    "a non-empty canonical subsection must fail before generic fallback");

  // Existing Notion legacy buckets remain readable until every source row
  // has been remapped and the old select options are removed.
  assert.match(syncSource, /"Pomoc psom": \{/);
  assert.match(syncSource, /"Bezpečnosť": \{/);
  assert.match(syncSource, /"Plemená": \{/);
  assert.match(syncSource, /"Zaujímavosti": \{/);
});

test("legacy articles without Podsekcia keep only safe compatibility behaviour", () => {
  assert.match(syncSource, /LEGACY_UNAMBIGUOUS_CATEGORY_PLACEMENTS/);
  assert.match(syncSource, /"Výživa": \{[\s\S]*portalSubpage: "vyziva"/);
  assert.match(syncSource, /"Správanie": \{[\s\S]*portalSubpage: "spravanie"/);
  assert.match(syncSource, /preservedLegacyPlacement/);
  assert.match(syncSource, /isCompatibleLegacyArticleSubsection/);
  assert.match(syncSource, /Doplň v Notione Podsekciu pre sekciu/);
});

test("existing article URL is stable when only its subsection placement changes", () => {
  assert.match(portalSource, /export function articleHref\(article: Pick<Article, "slug" \| "portalSection">\)/);
  assert.match(portalSource, /return section === "clanky" \? `\/clanky\/\$\{article\.slug\}` : `\/\$\{section\}\/\$\{article\.slug\}`/);
  const articleHrefBody = portalSource.slice(portalSource.indexOf("export function articleHref"), portalSource.indexOf("export function portalSectionLabel"));
  assert.doesNotMatch(articleHrefBody, /portalSubpage/);
});

test("article routes reject collisions with subsection landing slugs", () => {
  assert.match(articleStoreSource, /getPortalSubpage\(portalSection, slug\)/);
  assert.match(articleStoreSource, /Túto adresu už používa podsekcia portálu/);
});

test("mapped Draft is loaded before placement resolution so a legacy missing subsection can preserve a valid route", () => {
  const mappingLoad = syncSource.indexOf("const mapping = await loadMapping");
  const existingLoad = syncSource.indexOf("const mappedExisting = mapping ?", mappingLoad);
  const payloadBuild = syncSource.indexOf("const proposed = notionPageToManagedArticleInput(", existingLoad);
  assert.ok(mappingLoad >= 0 && existingLoad > mappingLoad && payloadBuild > existingLoad);
  assert.match(syncSource, /existing\.status !== "draft"/);
});

test("sync is idempotent and writes status back to Notion", () => {
  assert.match(migrationSource, /notion_page_id TEXT PRIMARY KEY/);
  assert.match(migrationSource, /article_id INTEGER NOT NULL UNIQUE/);
  assert.match(migrationSource, /FOREIGN KEY \(article_id\) REFERENCES managed_articles\(id\) ON DELETE CASCADE/);
  assert.match(syncSource, /content_hash/);
  assert.match(syncSource, /"Sync stav": \{ select: \{ name: values\.state \} \}/);
  assert.match(syncSource, /"Psipedia ID"/);
});

test("manual trigger stays behind existing admin authentication", () => {
  assert.match(routeSource, /getAdminApiUser/);
  assert.match(routeSource, /unauthorizedAdminResponse/);
  assert.match(routeSource, /runNotionArticleSyncSweep/);
});

test("hourly worker invokes the guarded sync sweep", () => {
  assert.match(workerSource, /runNotionArticleSyncSweep/);
  assert.match(workerSource, /event: "notion_article_sync_sweep"/);
});


test("hourly article sync survives unrelated Promise.all rejections and logs runtime binding health", () => {
  const start = workerSource.indexOf("const notionArticleRunId = controller.scheduledTime ?? null;");
  const dispatch = workerSource.indexOf("const [summary, editorial, partnerNotifications", start);
  assert.ok(start > 0 && dispatch > start, "article task must be isolated before sibling sweeps");
  const isolated = workerSource.slice(start, dispatch);
  const siblings = workerSource.slice(dispatch, workerSource.indexOf("    // Run push after the editorial sweep", dispatch));

  assert.match(isolated, /notionArticleTask = observeScheduledAutomation\(/);
  assert.match(isolated, /execute: async \(\) => \{/);
  assert.match(isolated, /await runArticlePublishNotionReconciliation\(\{ database: env\.DB, bindings: env \}\)/);
  assert.match(isolated, /const imported = await runNotionArticleSyncSweep\(\{ database: env\.DB, bindings: env \}\)/);
  assert.ok(isolated.indexOf("await runArticlePublishNotionReconciliation") < isolated.indexOf("await runNotionArticleSyncSweep"), "publish reconciliation must precede Ready imports");
  assert.match(isolated, /_ctx\.waitUntil\(notionArticleTask\)/);
  assert.match(isolated, /\.then\(\(result\) =>/);
  assert.match(isolated, /\.catch\(\(error\) =>/);
  assert.match(isolated, /event: "notion_article_sync_started"/);
  assert.match(isolated, /event: "notion_article_sync_sweep"/);
  assert.match(isolated, /notionToken: Boolean\(env\.NOTION_API_TOKEN\?\.trim\(\)\)/);
  assert.match(isolated, /database: Boolean\(env\.DB\)/);
  assert.match(isolated, /bucket: Boolean\(env\.BUCKET\)/);
  assert.match(isolated, /dataSourceId: Boolean\(env\.NOTION_ARTICLES_DATA_SOURCE_ID\?\.trim\(\)\)/);
  assert.doesNotMatch(siblings, /notionArticles|runNotionArticleSyncSweep/);
  assert.match(workerSource, /return new Date\(controller\.scheduledTime\)\.getUTCMinutes\(\) === 0/);
  assert.match(workerSource, /const ADMIN_PUSH_CRON = "\*\/5 \* \* \* \*"/);
});

test("article sync keeps the original no-publish, no-duplicate and status writeback protections", () => {
  assert.match(syncSource, /status: "draft"/);
  assert.match(syncSource, /existing\.status !== "draft" && existing\.status !== "published"/);
  assert.match(syncSource, /WHERE article_notion_sync\.article_id\s*=\s*excluded\.article_id/);
  assert.match(migrationSource, /notion_page_id TEXT PRIMARY KEY/);
  assert.match(migrationSource, /article_id INTEGER NOT NULL UNIQUE/);
  assert.match(syncSource, /await updateNotionSyncState\(bindings, page\.id, \{/);
  assert.match(syncSource, /"Sync stav": \{ select: \{ name: values\.state \} \}/);
  assert.match(syncSource, /if \(values\.articleId\) properties\["Psipedia ID"\]/);
});

test("publishing a Notion-linked draft writes publication metadata back to Notion", () => {
  assert.match(syncSource, /writeBackPublishedArticleToNotion/);
  assert.match(syncSource, /SELECT notion_page_id FROM article_notion_sync WHERE article_id = \?/);
  assert.match(syncSource, /"Stav": \{ select: \{ name: "Publikované" \} \}/);
  assert.match(syncSource, /"Dátum publikácie": \{ date: \{ start: publishedAt \} \}/);
  assert.match(syncSource, /"URL Psipedia": \{ url: publicUrl \}/);
  assert.match(syncSource, /"Sync stav": \{ select: \{ name: "Synchronizované" \} \}/);
  assert.match(articleRouteSource, /before\.status !== "published" && article\.status === "published"/);
  assert.match(articleRouteSource, /writeBackPublishedArticleToNotion/);
  assert.match(articleRouteSource, /notion_article_publish_writeback_failed/);
});

test("Notion publication writeback is best-effort and does not block the admin publish response", () => {
  const writebackCall = articleRouteSource.indexOf("await writeBackPublishedArticleToNotion");
  const responseCall = articleRouteSource.indexOf("return Response.json({ article,");
  assert.match(articleRouteSource.slice(responseCall), /notionEditorialWriteback/);
  assert.ok(writebackCall >= 0 && responseCall > writebackCall);
  assert.match(articleRouteSource, /try \{[\s\S]*await writeBackPublishedArticleToNotion[\s\S]*\} catch \(error\) \{/);
});


test("ARTICLE-TOPICS manual assignments survive Notion article updates", () => {
  assert.doesNotMatch(syncSource, /topicIds\s*:/);
  assert.match(articleStoreSource, /payload\.topicIds === undefined \? undefined/);
  assert.match(articleStoreSource, /if \(topicIds !== undefined\) \{/);
  assert.match(articleStoreSource, /await database\.batch\(replaceArticleTopicStatements\(database, id, topicIds, now\)\)/);
  assert.match(articleStoreSource, /topicIds === undefined \? existing\.topics/);
});

test("Notion main image URL is downloaded safely and persisted to R2", () => {
  assert.match(syncSource, /Hlavný obrázok URL/);
  assert.match(syncSource, /Zdroj obrázka/);
  assert.match(syncSource, /Alt text obrázka/);
  assert.match(syncSource, /MAX_REMOTE_IMAGE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(syncSource, /url\.protocol !== "https:"/);
  assert.match(syncSource, /redirect: "manual"/);
  assert.match(syncSource, /detectedRemoteImageType/);
  assert.match(syncSource, /bucket\.put\(key, remote\.bytes/);
  assert.match(syncSource, /notionSourceHash/);
  assert.match(syncSource, /notionSourceUrl/);
  assert.match(syncSource, /imageUrl,\s*imageKey: key/);
  assert.match(syncSource, /ogImageUrl: nextOgImageUrl,\s*ogImageKey: nextOgImageKey/);
  assert.match(syncSource, /explicitOgImage \|\| imageUrl/);
  assert.match(routeSource, /BUCKET\?: R2Bucket/);
});

test("Notion image sync is idempotent and cleans up failed or replaced R2 objects", () => {
  assert.match(syncSource, /currentObject\?\.customMetadata\?\.notionSourceHash === sourceFingerprint/);
  assert.match(syncSource, /cleanupImageKeys\(bindings\.BUCKET, \[prepared\.uploadedKey\]\)/);
  assert.match(syncSource, /cleanupImageKeys\(bindings\.BUCKET, prepared\.replacedKeys\)/);
  assert.match(syncSource, /JSON\.stringify\(\{[\s\S]*payload: \{ \.\.\.sourcePayload, relatedBreedIds: \[\] \},[\s\S]*notionArticleBreedFingerprint\(page\),[\s\S]*notionImageSourceUrl,[\s\S]*notionImageAlt,[\s\S]*notionImageCreditUrl/);
});


test("Wikimedia image fetches use an identifiable user agent", () => {
  assert.match(syncSource, /WIKIMEDIA_USER_AGENT = "PsipediaBot\/1\.0 \(https:\/\/psipedia\.sk\/kontakt\)"/);
  assert.match(syncSource, /hostname\.endsWith\("\.wikimedia\.org"\)/);
  assert.match(syncSource, /headers\.set\("User-Agent", WIKIMEDIA_USER_AGENT\)/);
  assert.match(syncSource, /headers\.set\("Api-User-Agent", WIKIMEDIA_USER_AGENT\)/);
  assert.match(syncSource, /headers: remoteImageHeaders\(url\)/);
});


test("Notion rich text preserves bold, italic and links in intro, paragraphs, quotes and callouts", () => {
  assert.match(syncSource, /notionRichTextInline/);
  assert.match(syncSource, /annotations\.bold === true/);
  assert.match(syncSource, /annotations\.italic === true/);
  assert.match(syncSource, /type: "link", href/);
  assert.match(syncSource, /introRichText/);
  assert.match(syncSource, /\.\.\.\(richText \? \{ richText \} : \{\}\)/);
  assert.match(syncSource, /notionRichTextMarkdown/);
});

test("Notion body supports native external images, video embeds and tables", () => {
  assert.match(syncSource, /function notionImageBlock/);
  assert.match(syncSource, /type: "image"/);
  assert.match(syncSource, /function notionEmbedBlock/);
  assert.match(syncSource, /type: "embed"/);
  assert.match(syncSource, /function notionTableBlock/);
  assert.match(syncSource, /type: "table"/);
  assert.match(syncSource, /getBlockChildren/);
  assert.match(syncSource, /block\.type === "table" && block\.has_children/);
});

test("Notion Psipedia block manifest can create any normalized Admin article block with placement", () => {
  assert.match(syncSource, /isAdminManifestHeading/);
  assert.match(syncSource, /"psipedia bloky"/);
  assert.match(syncSource, /JSON\.parse\(raw\.map\(node=>node\.plain_text\)\.join\(""\)\)/);
  assert.match(syncSource, /NOTION_ARTICLE_MANIFEST_INCOMPLETE/);
  assert.match(syncSource, /normalizeArticleBlocks/);
  assert.match(syncSource, /afterSection/);
  assert.match(syncSource, /beforeHeading/);
  assert.match(syncSource, /position === "start"/);
  assert.match(syncSource, /placeManifestBlocks/);
});

test("Notion main image metadata syncs alt text and source URL and participates in idempotency hash", () => {
  assert.match(syncSource, /imageAlt: altText \|\| null/);
  assert.match(syncSource, /imageCreditUrl: imageSourceUrl \|\| null/);
  assert.match(syncSource, /notionImageAlt/);
  assert.match(syncSource, /notionImageCreditUrl/);
  assert.match(syncSource, /JSON\.stringify\(\{[\s\S]*notionImageSourceUrl,[\s\S]*notionImageAlt,[\s\S]*notionImageCreditUrl/);
});


test("Notion Files article hero reuses stable identity and preserves URL fallback", () => {
  assert.match(syncSource, /notionArticleMainImageSource\(page\)/);
  assert.match(syncSource, /sha256\(source\.identity\)/);
  assert.match(syncSource, /notionImageFileIdentity/);
  assert.match(syncSource, /const sourceUrl = source\.url/);
  assert.match(syncSource, /notionHero\.kind === "file" \? null : notionHero\.url/);
});

test("Notion-related manifest links require existing published canonical articles", () => {
  assert.match(syncSource, /await assertPublishedRelatedBlocks\(/);
  assert.match(syncSource, /await getPublishedArticle\(slug\)/);
  assert.match(syncSource, /articleHref\(published\)/);
});


// ARTICLE-NOTION-SEO-1: the Notion source already owns all eight SEO columns.
// A spelling drift must not create a second "OG description" column.
test("article SEO property contract maps all eight Admin fields to the existing Notion schema", async () => {
  const { ARTICLE_NOTION_SEO_PROPERTIES: fields } = await import("../lib/notion-article-seo-properties.ts");
  assert.deepEqual(Object.keys(fields).sort(), [
    "seoTitle", "metaDescription", "focusKeyword", "canonicalUrl",
    "noindex", "ogTitle", "ogDescription", "ogImageUrl",
  ].sort());
  assert.deepEqual(Object.values(fields).map((field) => [field.name, field.type]), [
    ["SEO title", "rich_text"],
    ["Meta description", "rich_text"],
    ["Hlavné kľúčové slovo", "rich_text"],
    ["Canonical URL", "url"],
    ["Noindex", "checkbox"],
    ["OG title", "rich_text"],
    ["OG popis", "rich_text"],
    ["OG obrázok", "url"],
  ]);
  assert.equal(new Set(Object.values(fields).map(({ name }) => name)).size, 8);
});

test("article editorial draft writer uses existing OG popis and the shared SEO contract", async () => {
  const source = await readFile(new URL("../lib/notion-article-content-plan.ts", import.meta.url), "utf8");
  assert.match(source, /SEO\.ogDescription\.name in pageProperties/);
  assert.match(source, /SEO\.ogTitle\.name in pageProperties/);
  assert.doesNotMatch(source, /"OG description" in pageProperties/);
  assert.match(syncSource, /articleSeoFromNotion\(page, existing, confirmedPrevious, explicitlyEditedSeo\)/);
  assert.match(syncSource, /\.\.\.seoFields/);
});

test("legacy Ready error retry only acknowledges identical published article content", () => {
  assert.match(syncSource, /MAX_LEGACY_READY_RECEIPTS_PER_SWEEP = 30/);
  assert.match(syncSource, /property: "Odoslať na Psipedia", checkbox: \{ equals: false \}/);
  assert.match(syncSource, /property: "Psipedia ID", rich_text: \{ is_not_empty: true \}/);
  assert.match(syncSource, /contains: "Prepojený článok už nie je Draft"/);
  assert.match(syncSource, /if \(legacyUnapprovedReady && \(!mapping \|\| mappedExisting\?\.status !== "published"\)\)/);
  assert.match(syncSource, /ARTICLE_LEGACY_READY_IDENTITY_REVIEW_REQUIRED/);
  assert.match(syncSource, /decodeArticleSeoReceipt\(mapping\.content_hash\)\.hash !== contentHash/);
  assert.match(syncSource, /ARTICLE_LEGACY_READY_CONTENT_REVIEW_REQUIRED/);
  assert.match(syncSource, /ADMIN_UNACKNOWLEDGED_EDITORIAL_REVISION/);
  assert.match(syncSource, /if \(legacyUnapprovedReady\) \{[\s\S]*?await updateNotionSyncState\(bindings, page\.id, \{/);
  assert.match(syncSource, /state: "Synchronizované", articleId: existing\.id, syncedAt: now/);
});

test("Notion image-credit cell updates, including explicit clears, are mapped to Admin/D1 without importing private notes", () => {
  const fields = syncSource.slice(
    syncSource.indexOf("const ARTICLE_EDITABLE_AUTHORITY_FIELDS = ["),
    syncSource.indexOf("] as const;", syncSource.indexOf("const ARTICLE_EDITABLE_AUTHORITY_FIELDS = [")) + "] as const;".length,
  );
  assert.match(fields, /"imageCredit"/);
  assert.match(syncSource, /imageCredit: "Kredit fotografie"/);
  assert.match(syncSource, /signedFields\?\.has\("imageCredit"\) \?\? false/);
  assert.match(syncSource, /const imageCredit = explicitlyEditedPhotoCredit[\s\S]*?\? notionImageCredit/);
  assert.match(syncSource, /imageCredit: explicitlyEditedPhotoCredit \? \(imageCredit \|\| null\) : \(imageCredit \|\| undefined\)/);
  assert.match(syncSource, /if \(mappedExisting && signedFields && signedFields\.size === 0\) return "unchanged"/);
  assert.match(syncSource, /imageCreditUrl = urlProperty\(page, "Zdroj obrázka"\)/);
  assert.match(syncSource, /hasCompletePublicPhotoCredit\(imageCredit, imageCreditUrl\)/);
  // Other property events and body-only webhooks must keep the canonical credit.
  assert.match(syncSource, /eventType === "page\.content_updated"[\s\S]*?\["intro", "blocks"\]/);
  assert.match(syncSource, /edited\.has\(key\) \? incoming\[key\] : articleCurrentField\(existing, key\)/);
  assert.match(articleStoreSource, /const canonicalBlocks = publicArticleBlocks\(normalizeArticleBlocks\(payload\.blocks/);
});
