import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationCategorySources } from "@/components/admin-automation-category-sources";
import { AdminAutomationSearchControls } from "@/components/admin-automation-search-controls";
import { AdminShell } from "@/components/admin-shell";
import { AdminAutomationAvailabilityState } from "@/app/admin/automatizacie/_components/automation-availability-state";
import styles from "@/components/admin-operations-ux.module.css";
import { requireAdminPageUser } from "@/lib/admin-auth";
import {
  automationCategoryBySlug,
  automationCandidatesForCategory,
  automationDiscoveryRootsForCategory,
  automationSourcesForCategory,
} from "@/lib/admin-automation-presentation";
import { listAutomationDiscoveryRoots } from "@/lib/data-automation-discovery-store";
import { listAutomationSourceCandidates, listAutomationSourcesAdmin } from "@/lib/data-automation-source-store";
import { isTavilySearchDiscoveryRoot } from "@/lib/tavily-canary-control";
import { normalizeAutomationUpdateSuggestionSummaries } from "@/lib/data-automation-update-review";
import { countOpenAutomationAddressReviews } from "@/lib/data-automation-address-review-store";
import { countOpenAutomationLifecycleSuggestions } from "@/lib/data-automation-lifecycle-store";
import { readAdminAutomationData, summarizeAdminAutomationReads } from "@/lib/admin-automation-reliability";
import {
  getDirectEntityRefreshSetting,
  listAutomationSourceCanonicalContent,
  listDirectEntityConcepts,
  listDirectEntityUpdateSuggestions,
  listFeedUpdateSuggestions,
} from "@/lib/data-automation-product-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ category: string }> };

export default async function AutomationCategoryPage({ params }: Props) {
  const slug = (await params).category;
  const category = automationCategoryBySlug(slug);
  if (!category) notFound();
  const user = await requireAdminPageUser("/admin/automatizacie/" + slug);

  const [allSourcesRead, allCandidatesRead, allRootsRead] = await Promise.all([
    readAdminAutomationData({
      key: `category:${slug}:sources`,
      load: () => listAutomationSourcesAdmin(undefined, 200),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
    readAdminAutomationData({
      key: `category:${slug}:candidates`,
      load: () => listAutomationSourceCandidates(undefined, 200),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
    readAdminAutomationData({
      key: `category:${slug}:discovery-roots`,
      load: () => listAutomationDiscoveryRoots(undefined, 100),
      fallback: [],
      empty: (value) => value.length === 0,
    }),
  ]);
  const allSources = allSourcesRead.data;
  const allCandidates = allCandidatesRead.data;
  const allRoots = allRootsRead.data;
  const sources = automationSourcesForCategory(allSources, slug);
  const candidates = automationCandidatesForCategory(allCandidates, slug);
  const discoveryRoots = automationDiscoveryRootsForCategory(allRoots, slug).filter(isTavilySearchDiscoveryRoot);

  const directSlug = category.mode === "DIRECT_ENTITY"
    ? slug as "veterinari" | "psie-sluzby" | "utulky-organizacie"
    : null;
  const refreshSettingRead = directSlug
    ? await readAdminAutomationData({
        key: `category:${slug}:refresh-setting`,
        load: () => getDirectEntityRefreshSetting(directSlug),
        fallback: null,
        empty: (value) => value === null,
      })
    : null;
  const directConceptsRead = directSlug
    ? await readAdminAutomationData({
        key: `category:${slug}:direct-concepts`,
        load: () => listDirectEntityConcepts(directSlug),
        fallback: [],
        empty: (value) => value.length === 0,
      })
    : null;
  const rawUpdateSuggestionsRead = directSlug
    ? await readAdminAutomationData({
        key: `category:${slug}:direct-update-suggestions`,
        load: () => listDirectEntityUpdateSuggestions(directSlug),
        fallback: [],
        empty: (value) => value.length === 0,
      })
    : await readAdminAutomationData({
        key: `category:${slug}:feed-update-suggestions`,
        load: () => listFeedUpdateSuggestions(sources.map((source) => source.id)),
        fallback: [],
        empty: (value) => value.length === 0,
      });
  const rawUpdateSuggestions = rawUpdateSuggestionsRead.data;
  const updateSuggestionsRead = await readAdminAutomationData({
    key: `category:${slug}:normalize-update-suggestions`,
    load: () => normalizeAutomationUpdateSuggestionSummaries(rawUpdateSuggestions),
    fallback: rawUpdateSuggestions,
    empty: (value) => value.length === 0,
  });
  const sourceContentReads = category.mode === "FEED_SOURCE"
    ? await Promise.all(sources.map((source) => readAdminAutomationData({
        key: `category:${slug}:source-content:${source.id}`,
        load: () => listAutomationSourceCanonicalContent(source.id),
        fallback: [],
        empty: (value) => value.length === 0,
      })))
    : [];
  const sourceContent = Object.fromEntries(sourceContentReads.map((read, index) => [sources[index]!.id, read.data]));
  const addressReviewCategory = slug === "veterinari" || slug === "psie-sluzby"
    ? slug
    : null;
  const addressReviewRead = addressReviewCategory
    ? await readAdminAutomationData({
        key: `category:${slug}:address-review-count`,
        load: () => countOpenAutomationAddressReviews(addressReviewCategory),
        fallback: 0,
        empty: (value) => value === 0,
      })
    : null;
  const lifecycleRead = category.mode === "FEED_SOURCE"
    ? await readAdminAutomationData({
        key: `category:${slug}:lifecycle-count`,
        load: () => countOpenAutomationLifecycleSuggestions({ entityTypes: category.entityTypes }),
        fallback: 0,
        empty: (value) => value === 0,
      })
    : null;

  const reliability = summarizeAdminAutomationReads([
    allSourcesRead,
    allCandidatesRead,
    allRootsRead,
    rawUpdateSuggestionsRead,
    updateSuggestionsRead,
    ...sourceContentReads,
    ...(refreshSettingRead ? [refreshSettingRead] : []),
    ...(directConceptsRead ? [directConceptsRead] : []),
    ...(addressReviewRead ? [addressReviewRead] : []),
    ...(lifecycleRead ? [lifecycleRead] : []),
  ]);
  const refreshSetting = refreshSettingRead?.data ?? null;
  const directConcepts = directConceptsRead?.data ?? [];
  const updateSuggestions = updateSuggestionsRead.data;
  const addressReviewCount = addressReviewRead?.data ?? 0;
  const addressReviewLabel = addressReviewRead?.status === "UNAVAILABLE" ? "—" : String(addressReviewCount);
  const lifecycleLabel = lifecycleRead?.status === "UNAVAILABLE" ? "—" : String(lifecycleRead?.data ?? 0);

  return (
    <AdminShell
      user={user}
      eyebrow="Automatizácie"
      title={category.title}
      description={category.mode === "DIRECT_ENTITY"
        ? "Priame hľadanie nových entít a read-only návrhy doplnení existujúcich záznamov."
        : "Správa opakovaných zdrojov a obsahu, ktorý z nich automatizácia našla."}
      actions={(
        <>
          <Link href="/admin/automatizacie">← Všetky kategórie</Link>
          <Link href="/admin/automatizacie/prehlad">Prehľad</Link>
          {category.mode === "FEED_SOURCE" ? (
            <Link href={`/admin/automatizacie/zmeny-stavu?category=${category.slug}`}>Zmeny stavu · {lifecycleLabel}</Link>
          ) : null}
        </>
      )}
    >
      <AdminAutomationAvailabilityState summary={reliability} refreshHref={`/admin/automatizacie/${slug}`} />
      {addressReviewCategory ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Adresy na kontrolu</h2>
              <p>Nejednoznačné exact adresy, pri ktorých musí správnu budovu potvrdiť administrátor.</p>
            </div>
            <span className={styles.sectionCount}>{addressReviewLabel}</span>
          </div>
          <Link
            className={styles.itemAction}
            href={`/admin/automatizacie/adresy?category=${addressReviewCategory}`}
          >
            Adresy na kontrolu · {addressReviewLabel}
          </Link>
        </section>
      ) : null}
      <AdminAutomationSearchControls categorySlug={slug} roots={discoveryRoots} />
      <AdminAutomationCategorySources
        category={category}
        sources={sources}
        candidates={candidates}
        discoveryRoots={discoveryRoots}
        refreshSetting={refreshSetting}
        directConcepts={directConcepts}
        updateSuggestions={updateSuggestions}
        sourceContent={sourceContent}
      />
    </AdminShell>
  );
}
