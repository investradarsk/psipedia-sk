import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminAutomationCategorySources } from "@/components/admin-automation-category-sources";
import { AdminAutomationSearchControls } from "@/components/admin-automation-search-controls";
import { AdminShell } from "@/components/admin-shell";
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
import { countOpenAutomationAddressReviews } from "@/lib/data-automation-address-review-store";
import { countOpenAutomationLifecycleSuggestions } from "@/lib/data-automation-lifecycle-store";
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

  const [allSources, allCandidates, allRoots] = await Promise.all([
    listAutomationSourcesAdmin(undefined, 200).catch(() => []),
    listAutomationSourceCandidates(undefined, 200).catch(() => []),
    listAutomationDiscoveryRoots(undefined, 100).catch(() => []),
  ]);
  const sources = automationSourcesForCategory(allSources, slug);
  const candidates = automationCandidatesForCategory(allCandidates, slug);
  const discoveryRoots = automationDiscoveryRootsForCategory(allRoots, slug).filter(isTavilySearchDiscoveryRoot);

  const directSlug = category.mode === "DIRECT_ENTITY"
    ? slug as "veterinari" | "psie-sluzby" | "utulky-organizacie"
    : null;
  const refreshSetting = directSlug
    ? await getDirectEntityRefreshSetting(directSlug).catch(() => null)
    : null;
  const directConcepts = directSlug
    ? await listDirectEntityConcepts(directSlug).catch(() => [])
    : [];
  const updateSuggestions = directSlug
    ? await listDirectEntityUpdateSuggestions(directSlug).catch(() => [])
    : await listFeedUpdateSuggestions(sources.map((source) => source.id)).catch(() => []);
  const sourceContentEntries = category.mode === "FEED_SOURCE"
    ? await Promise.all(sources.map(async (source) => [
        source.id,
        await listAutomationSourceCanonicalContent(source.id).catch(() => []),
      ] as const))
    : [];
  const sourceContent = Object.fromEntries(sourceContentEntries);
  const addressReviewCategory = slug === "veterinari" || slug === "psie-sluzby"
    ? slug
    : null;
  const addressReviewCount = addressReviewCategory
    ? await countOpenAutomationAddressReviews(addressReviewCategory).catch(() => 0)
    : 0;
  const lifecycleCount = category.mode === "FEED_SOURCE"
    ? await countOpenAutomationLifecycleSuggestions({ entityTypes: category.entityTypes }).catch(() => 0)
    : 0;

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
            <Link href={`/admin/automatizacie/zmeny-stavu?category=${category.slug}`}>Zmeny stavu · {lifecycleCount}</Link>
          ) : null}
        </>
      )}
    >
      {addressReviewCategory ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <h2>Adresy na kontrolu</h2>
              <p>Nejednoznačné exact adresy, pri ktorých musí správnu budovu potvrdiť administrátor.</p>
            </div>
            <span className={styles.sectionCount}>{addressReviewCount}</span>
          </div>
          <Link
            className={styles.itemAction}
            href={`/admin/automatizacie/adresy?category=${addressReviewCategory}`}
          >
            Adresy na kontrolu · {addressReviewCount}
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
