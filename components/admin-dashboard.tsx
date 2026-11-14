"use client";

import Link from "next/link";
import { AdminRecordBulkDelete } from "@/components/admin-record-bulk-delete";
import { AdminRecordTable } from "./admin-record-table";
import { useRouter } from "next/navigation";
import { Suspense, use, useMemo, useRef, useState } from "react";
import {
  AdminBulkSelectionControls,
  useAdminBulkSelection,
} from "@/components/admin-bulk-selection";
import {
  articleAdminBulkFingerprint,
  normalizeArticleAdminBulkFilter,
} from "@/lib/article-admin-bulk-filter";
import {
  articleAdminDirections,
  articleAdminListHref,
  articleAdminSorts,
  articleAdminStatuses,
  type ArticleAdminListFilters,
} from "@/lib/article-admin-query";
import type { ManagedArticleSummary, ManagedArticleSummaryPage } from "@/lib/article-store";
import { AdminInlineRowActions, AdminInlineCellInput } from "@/components/admin-inline-edit-controls";
import type { ArticleTopic } from "@/lib/article-topics";
import type { AdminModuleCounts } from "@/lib/admin-dashboard-store";
import { getNewsCategory } from "@/lib/news";
import { articleHref, articlePortalSectionOptions, portalSectionLabel } from "@/lib/portal";
import { AdminPagination } from "./admin-pagination";
import { SearchIcon } from "./icons";
import styles from "./admin-article-dashboard.module.css";

function formattedDate(value: string) {
  const date = new Date(value);
  const months = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${date.getUTCDate()}. ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hour}:${minute}`;
}

const moduleOverview: Array<{ key: keyof AdminModuleCounts; label: string; href: string }> = [
  { key: "articles", label: "Články", href: "/admin/clanky" },
  { key: "puppies", label: "Šteniatka", href: "/admin/steniatka" },
  { key: "breeds", label: "Plemená", href: "/admin/plemena" },
  { key: "sections", label: "Sekcie", href: "/admin/sekcie" },
  { key: "tips", label: "Tipy", href: "/admin/tipy" },
  { key: "feedback", label: "Hodnotenia", href: "/admin/hodnotenia" },
  { key: "inquiries", label: "Dopyty", href: "/admin/dopyty" },
  { key: "events", label: "Podujatia", href: "/admin/podujatia" },
  { key: "directory", label: "Adresár", href: "/admin/adresar" },
  { key: "help", label: "Pomoc", href: "/admin/pomoc" },
];

const statusLabels = {
  all: "Všetky",
  published: "Publikované",
  scheduled: "Naplánované",
  draft: "Koncepty",
} as const;

const sortLabels = { updated: "Posledná úprava", title: "Názov" } as const;
const directionLabels = { desc: "Zostupne", asc: "Vzostupne" } as const;

function SuspendedArticleTopics({ promise, value, onChange }: {
  promise: Promise<ArticleTopic[] | null>;
  value: string;
  onChange: (value: number | null) => void;
}) {
  const options = use(promise);
  if (options === null) return <select name="topic" disabled aria-label="Témy sú nedostupné">
    <option>Témy sa nepodarilo načítať</option>
  </select>;
  return <select name="topic" defaultValue={value}
    onChange={(event) => onChange(Number(event.target.value) || null)}>
    <option value="">Všetky témy</option>
    {options.map(topic => <option key={topic.id} value={topic.id}>
      {topic.label}{topic.isActive ? "" : " (neaktívna)"}
    </option>)}
  </select>;
}

export function AdminDashboard({
  initialArticles,
  initialCounts,
  initialResultCount,
  moduleCounts,
  pagination,
  filters,
  fixedPortalSection,
  listPath = "/admin",
  topicOptions = [],
  topicOptionsPromise,
}: {
  initialArticles: ManagedArticleSummary[];
  initialCounts: ManagedArticleSummaryPage["counts"];
  initialResultCount: number;
  moduleCounts?: AdminModuleCounts;
  pagination: ManagedArticleSummaryPage["pagination"];
  filters: ArticleAdminListFilters;
  fixedPortalSection?: ManagedArticleSummary["portalSection"];
  listPath?: string;
  topicOptions?: ArticleTopic[];
  topicOptionsPromise?: Promise<ArticleTopic[] | null>;
}) {
  const router = useRouter();
  const [articles, setArticles] = useState(initialArticles);
  const [counts, setCounts] = useState(initialCounts);
  const [resultCount, setResultCount] = useState(initialResultCount);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [inlineDraft, setInlineDraft] = useState<{ id: number; key: string; updatedAt: string; excerpt: string } | null>(null);
  const [inlineBusy, setInlineBusy] = useState(false);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(true);

  const membershipFilter = useMemo(() => normalizeArticleAdminBulkFilter({
    portalSection: fixedPortalSection ?? (filters.portalSection === "all" ? "" : filters.portalSection),
    status: filters.status,
    q: filters.query,
    topicId: filters.topicId ?? null,
  }), [fixedPortalSection, filters.portalSection, filters.query, filters.status, filters.topicId]);
  const membershipFingerprint = articleAdminBulkFingerprint(membershipFilter);
  const pageIds = articles.map((article) => article.id);
  const bulkSelection = useAdminBulkSelection({
    module: "articles",
    membershipFingerprint,
    pageIds,
    resultCount,
    supportsAllMatching: false,
  });
  const filterFormRef = useRef<HTMLFormElement>(null);
  const routePath = fixedPortalSection ? "/admin/steniatka" : listPath;
  const paginationBase = articleAdminListHref(routePath, { ...filters, page: 1 });
  const inlineKey = JSON.stringify([routePath, filters, pagination.page, articles.map(item => item.id)]);
  const activeInline = inlineDraft?.key === inlineKey &&
    articles.some(item => item.id === inlineDraft.id && item.updatedAt === inlineDraft.updatedAt)
      ? inlineDraft : null;

  function beginInline(article: ManagedArticleSummary) {
    if (inlineBusy || deletingId !== null) return;
    setInlineDraft({ id: article.id, key: inlineKey, updatedAt: article.updatedAt, excerpt: article.excerpt || "" });
    setMessage("");
  }

  async function saveInline() {
    const draft = activeInline;
    if (!draft || inlineBusy) return;
    setInlineBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/articles/${draft.id}`, {
        method: "PATCH", credentials: "same-origin", cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set-inline-excerpt", excerpt: draft.excerpt,
          expectedUpdatedAt: draft.updatedAt,
        }),
      });
      const answer = await response.json() as {
        error?: string; article?: { updatedAt: string; excerpt: string };
        notionEditorialWriteback?: { status: string; code?: string };
      };
      if (!response.ok || !answer.article) throw new Error(answer.error || "Krátky popis sa nepodarilo uložiť.");
      setArticles(current => current.map(item => item.id === draft.id
        ? { ...item, excerpt: answer.article!.excerpt, updatedAt: answer.article!.updatedAt } : item));
      setInlineDraft(null);
      setMessage(answer.notionEditorialWriteback?.status === "blocked"
        ? "Popis uložený. Synchronizácia s Notion potrebuje kontrolu."
        : "Krátky popis bol uložený.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rýchla úprava zlyhala.");
    } finally {
      setInlineBusy(false);
    }
  }
  function applyFilter(overrides: Partial<ArticleAdminListFilters>) {
    // Preserve unsent search/sort changes before an immediate select navigation.
    const form = filterFormRef.current;
    const data = form ? new FormData(form) : null;
    const query = data?.get("query");
    const status = data?.get("status");
    const section = data?.get("section");
    const topic = data?.get("topic");
    const sort = data?.get("sort");
    const direction = data?.get("direction");
    router.push(articleAdminListHref(routePath, filters, {
      ...(typeof query === "string" ? { query } : {}),
      ...(status === "all" || status === "draft" || status === "published" || status === "scheduled" ? { status } : {}),
      ...(typeof section === "string" && !fixedPortalSection ? { portalSection: section as ArticleAdminListFilters["portalSection"] } : {}),
      ...(typeof topic === "string" && !fixedPortalSection ? { topicId: Number(topic) || null } : {}),
      ...(sort === "updated" || sort === "title" ? { sort } : {}),
      ...(direction === "asc" || direction === "desc" ? { direction } : {}),
      ...overrides, page: 1,
    }));
  }

  async function removeArticle(article: ManagedArticleSummary) {
    const confirmed = window.confirm(`Naozaj chceš natrvalo odstrániť ${article.portalSection === "novinky" ? "novinku" : "článok"} „${article.title}“?`);
    if (!confirmed) return;

    setDeletingId(article.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/articles/${article.id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Článok sa nepodarilo odstrániť.");
      setArticles((current) => current.filter((item) => item.id !== article.id));
      setCounts((current) => ({
        ...current,
        total: Math.max(0, current.total - 1),
        [article.status]: Math.max(0, current[article.status] - 1),
      }));
      setResultCount((current) => Math.max(0, current - 1));
      bulkSelection.clear();
      setMessage("Článok bol odstránený.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Článok sa nepodarilo odstrániť.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {moduleCounts && (
        <section className="admin-overview" aria-labelledby="admin-overview-title">
          <div className="admin-overview-heading">
            <div><span>Celý portál</span><h2 id="admin-overview-title">Súhrnný prehľad</h2></div>
            <p>Počty záznamov v hlavných moduloch administrácie.</p>
          </div>
          <div className="admin-overview-grid">
            {moduleOverview.map((item) => (
              <Link href={item.href} key={item.key}>
                <span>{item.label}</span>
                <strong>{moduleCounts[item.key]}</strong>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="admin-stats" aria-label="Stav redakcie">
        <div><span>Všetok obsah</span><strong>{counts.total}</strong></div>
        <div><span>Publikované</span><strong>{counts.published}</strong></div>
        <div><span>Naplánované</span><strong>{counts.scheduled}</strong></div>
        <div><span>Koncepty</span><strong>{counts.draft}</strong></div>
      </section>

      <section className="admin-panel">
        <nav className={styles.quickFilters} aria-label="Rýchly filter stavu článkov">
          {articleAdminStatuses.map((value) => (
            <Link key={value} href={articleAdminListHref(routePath, filters, { status: value, page: 1 })} aria-current={filters.status === value ? "page" : undefined}>
              {statusLabels[value]}
            </Link>
          ))}
        </nav>
        <form ref={filterFormRef} className="admin-toolbar" method="get" action={routePath} role="search" data-admin-article-filters>
          <label className="admin-search">
            <SearchIcon size={19} />
            <span className="sr-only">Hľadať článok</span>
            <input name="query" defaultValue={filters.query} maxLength={120} placeholder="Názov, slug, perex alebo téma" title="Vyhľadáva aj podľa presného Admin ID, napr. 2295" />
          </label>
          <button type="button" className={styles.filterToggle} aria-controls="admin-article-advanced-filters"
            aria-expanded={advancedFiltersOpen} onClick={() => setAdvancedFiltersOpen(open => !open)}>
            {advancedFiltersOpen ? "Skryť filtre" : "Ďalšie filtre"}
          </button>
          <div id="admin-article-advanced-filters" className={styles.advancedFilters} data-expanded={advancedFiltersOpen}>
          <label className="admin-select-filter">
            <span>Stav</span>
            <select name="status" defaultValue={filters.status} onChange={(event) => applyFilter({ status: event.target.value as ArticleAdminListFilters["status"] })}>
              {articleAdminStatuses.map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
            </select>
          </label>
          {!fixedPortalSection && (
            <label className="admin-select-filter">
              <span>Sekcia</span>
              <select name="section" defaultValue={filters.portalSection} onChange={(event) => applyFilter({ portalSection: event.target.value as ArticleAdminListFilters["portalSection"] })}>
                <option value="all">Všetky sekcie</option>
                {articlePortalSectionOptions.map((option) => (
                  <option key={option.slug} value={option.slug}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
          {!fixedPortalSection && (
            <label className="admin-select-filter">
              <span>Téma</span>
              {topicOptionsPromise ? (
                <Suspense fallback={<select name="topic" disabled aria-label="Načítavam témy"><option>Načítavam témy…</option></select>}>
                  <SuspendedArticleTopics promise={topicOptionsPromise}
                    value={filters.topicId ? String(filters.topicId) : ""}
                    onChange={(topicId) => applyFilter({ topicId })} />
                </Suspense>
              ) : (
                <select name="topic" defaultValue={filters.topicId ? String(filters.topicId) : ""} onChange={(event) => applyFilter({ topicId: Number(event.target.value) || null })}>
                  <option value="">Všetky témy</option>
                  {topicOptions.map((topic) => (
                    <option key={topic.id} value={topic.id}>{topic.label}{topic.isActive ? "" : " (neaktívna)"}</option>
                  ))}
                </select>
              )}
            </label>
          )}
          <div className={styles.sortDirectionGroup} data-admin-sort-direction>
            <label className="admin-select-filter">
              <span>Zoradiť</span>
              <select name="sort" defaultValue={filters.sort}>
                {articleAdminSorts.map((value) => <option key={value} value={value}>{sortLabels[value]}</option>)}
              </select>
            </label>
            <label className="admin-select-filter">
              <span>Smer</span>
              <select name="direction" defaultValue={filters.direction}>
                {articleAdminDirections.map((value) => <option key={value} value={value}>{directionLabels[value]}</option>)}
              </select>
            </label>
          </div>
          </div>
          <button type="submit">Filtrovať</button>
          {(filters.query || filters.status !== "all" || filters.portalSection !== "all" || filters.topicId || filters.sort !== "updated" || filters.direction !== "desc")
            && <Link href={routePath}>Vyčistiť filtre</Link>}
        </form>

        <p className="admin-event-result-count" role="status">
          Nájdené: {resultCount} · Zobrazené: {articles.length}
        </p>
        {message && <p className="admin-flash" role="status">{message}</p>}

        {articles.length ? (
          <>
            <AdminBulkSelectionControls
              module="articles"
              membershipFilter={membershipFilter}
              membershipFingerprint={membershipFingerprint}
              resultCount={resultCount}
              pageIds={pageIds}
              selection={bulkSelection.selection}
              selectionReady={bulkSelection.ready}
              selectedCount={bulkSelection.selectedCount}
              currentPageSelected={bulkSelection.currentPageSelected}
              currentPageAllSelected={bulkSelection.currentPageAllSelected}
              currentPageSomeSelected={bulkSelection.currentPageSomeSelected}
              toggleCurrentPage={bulkSelection.toggleCurrentPage}
              selectAllMatching={bulkSelection.selectAllMatching}
              clear={bulkSelection.clear}
              supportsAllMatching={false}
              pageSelectionInTable
            />
            {bulkSelection.selectedCount > 0 && <AdminRecordBulkDelete
              kind="articles"
              selectedIds={bulkSelection.selection.mode === "explicit" ? bulkSelection.selection.ids : []}
              disabled={!bulkSelection.ready || inlineBusy || deletingId !== null}
              onFinished={ids => {
                setArticles(current => current.filter(article => !ids.includes(article.id)));
                bulkSelection.clear();
                router.refresh();
              }}
            />}
            <AdminRecordTable
              rows={articles}
              label="Články"
              busy={inlineBusy || deletingId !== null}
              rowDataAttribute="data-admin-article-row"
              stretch
              stickyActions
              serverSorted
              serverSorting={{
                id: filters.sort,
                desc: filters.direction === "desc",
                allowedIds: ["title", "updated"],
                onChange: next => applyFilter({
                  sort: next.id === "title" ? "title" : "updated",
                  direction: next.desc ? "desc" : "asc",
                }),
              }}
              selection={{
                selectedIds: bulkSelection.selection.mode === "explicit" ? bulkSelection.selection.ids : [],
                disabled: !bulkSelection.ready,
                labelForRow: article => `Vybrať článok ${article.title}`,
                selectAllLabel: "Vybrať všetky články na tejto strane",
                onChange: ids => {
                  // Reconcile only currently visible IDs. Bulk selection ownership stays in the module.
                  for (const id of pageIds) {
                    if (bulkSelection.isSelected(id) !== ids.includes(id)) bulkSelection.toggleRow(id);
                  }
                },
              }}
              columns={[
                { id: "photo", label: "Foto", width: 58, cell: article =>
                  <span className={styles.gridThumb}>{article.image
                    ? <img src={article.image} alt="" loading="lazy" decoding="async" />
                    : <span>🐾</span>}</span> },
                { id: "title", label: "Názov", width: 260, sortValue: article => article.title,
                  cell: article => <div className={styles.gridIdentity}>
                    <h2 className={styles.gridTitle}><Link href={`/admin/clanky/${article.id}`}>{article.title}</Link></h2>
                    <small>{article.category}{article.newsCategory
                      ? ` · ${getNewsCategory(article.newsCategory)?.shortLabel ?? article.newsCategory}` : ""}</small>
                  </div> },
                { id: "status", label: "Publikovanie", width: 115, cell: article =>
                  <span className={`admin-status admin-status--${article.status}`}>
                    {article.status === "published" ? "Publikovaný" : article.status === "scheduled" ? "Naplánovaný" : "Koncept"}
                  </span> },
                { id: "section", label: "Sekcia", width: 110, cell: article => portalSectionLabel(article.portalSection) },
                { id: "excerpt", label: "Krátky popis", width: 190, cell: article =>
                  activeInline?.id === article.id
                    ? <AdminInlineCellInput label={`Krátky popis článku ${article.title}`}
                        value={activeInline.excerpt} maxLength={700} disabled={inlineBusy}
                        onChange={excerpt => setInlineDraft(current => current ? { ...current, excerpt } : null)} />
                    : <span className={styles.inlineDesktop} title={article.excerpt || ""}>
                        {article.excerpt || "Bez krátkeho popisu"}</span> },
                { id: "updated", label: "Upravené", width: 120, sortValue: article => article.updatedAt,
                  cell: article => formattedDate(article.updatedAt) },
                { id: "actions", label: "Akcie", width: 215, cell: article =>
                  <div className={styles.gridActions}>
                    {article.status === "published" && <Link href={articleHref(article)} target="_blank">Web ↗</Link>}
                    <span className={styles.inlineDesktop}><AdminInlineRowActions
                      editing={activeInline?.id === article.id} busy={inlineBusy}
                      disabled={Boolean(activeInline && activeInline.id !== article.id) || deletingId !== null}
                      onEdit={() => beginInline(article)}
                      onSave={() => void saveInline()}
                      onCancel={() => { if (!inlineBusy) setInlineDraft(null); }}
                    /></span>
                    <Link href={`/admin/clanky/${article.id}`}>Upraviť</Link>
                    <button type="button" disabled={deletingId === article.id}
                      onClick={() => removeArticle(article)}>
                      {deletingId === article.id ? "Odstraňujem…" : "Odstrániť"}
                    </button>
                  </div> },
              ]}
            />
          </>
        ) : (
          <div className="admin-empty">
            <span>🐾</span>
            <h2>{counts.total === 0 ? "Zatiaľ tu nie sú žiadne články" : "Pre zvolené filtre sa nič nenašlo"}</h2>
            <p>{counts.total === 0 ? "Vytvor prvý obsah." : "Vyčisti filtre alebo uprav vyhľadávanie."}</p>
          </div>
        )}
        <AdminPagination pagination={pagination} basePath={paginationBase} />
      </section>
    </>
  );
}
