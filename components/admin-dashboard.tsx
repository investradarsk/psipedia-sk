"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AdminBulkSelectionControls,
  BulkSelectionCheckbox,
  adminBulkSelectionStyles,
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
}) {
  const router = useRouter();
  const [articles, setArticles] = useState(initialArticles);
  const [counts, setCounts] = useState(initialCounts);
  const [resultCount, setResultCount] = useState(initialResultCount);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

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
  const routePath = fixedPortalSection ? "/admin/steniatka" : listPath;
  const paginationBase = articleAdminListHref(routePath, { ...filters, page: 1 });
  function applyFilter(overrides: Partial<ArticleAdminListFilters>) {
    router.push(articleAdminListHref(routePath, filters, { ...overrides, page: 1 }));
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
        <form className="admin-toolbar" method="get" action={routePath} role="search">
          <label className="admin-search">
            <SearchIcon size={19} />
            <span className="sr-only">Hľadať článok</span>
            <input name="query" defaultValue={filters.query} maxLength={120} placeholder="Názov, slug, perex alebo téma" />
          </label>
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
              <select name="topic" defaultValue={filters.topicId ? String(filters.topicId) : ""} onChange={(event) => applyFilter({ topicId: Number(event.target.value) || null })}>
                <option value="">Všetky témy</option>
                {topicOptions.map((topic) => (
                  <option key={topic.id} value={topic.id}>{topic.label}{topic.isActive ? "" : " (neaktívna)"}</option>
                ))}
              </select>
            </label>
          )}
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
            />
            <div className="admin-article-list">
              {articles.map((article) => (
                <article className={`admin-article-row ${styles.row}`} key={article.id}>
                  <BulkSelectionCheckbox
                    checked={bulkSelection.isSelected(article.id)}
                    disabled={!bulkSelection.ready}
                    label={`Vybrať článok ${article.title}`}
                    onChange={() => bulkSelection.toggleRow(article.id)}
                    className={`${adminBulkSelectionStyles.rowCheck} ${styles.rowCheck}`}
                  />
                  <div className={`admin-article-thumb admin-article-thumb--${article.accent} ${styles.thumb}`}>
                    {article.image ? <img src={article.image} alt="" /> : <span>🐾</span>}
                  </div>
                  <div className={`admin-article-main ${styles.main}`}>
                    <div className="admin-article-tags">
                      <span className={`admin-status admin-status--${article.status}`}>
                        {article.status === "published" ? "Publikovaný" : article.status === "scheduled" ? "Naplánovaný" : "Koncept"}
                      </span>
                      <span>{article.category}</span>
                      <span>{portalSectionLabel(article.portalSection)}</span>
                      {article.newsCategory && <span>{getNewsCategory(article.newsCategory)?.shortLabel}</span>}
                    </div>
                    <h2><Link href={`/admin/clanky/${article.id}`}>{article.title}</Link></h2>
                    <p>Naposledy upravené {formattedDate(article.updatedAt)}</p>
                  </div>
                  <div className={`admin-row-actions ${styles.actions}`}>
                    {article.status === "published" && <Link href={articleHref(article)} target="_blank">Pozrieť ↗</Link>}
                    <Link className="admin-row-edit" href={`/admin/clanky/${article.id}`}>Upraviť</Link>
                    <button type="button" disabled={deletingId === article.id} onClick={() => removeArticle(article)}>
                      {deletingId === article.id ? "Odstraňujem…" : "Odstrániť"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
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
