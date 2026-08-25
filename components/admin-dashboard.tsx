"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ManagedArticleSummary, ManagedArticleSummaryPage } from "@/lib/article-store";
import type { AdminModuleCounts } from "@/lib/admin-dashboard-store";
import { getNewsCategory } from "@/lib/news";
import { articleHref, portalSectionLabel } from "@/lib/portal";
import { AdminPagination } from "./admin-pagination";
import { SearchIcon } from "./icons";

type StatusFilter = "all" | "published" | "scheduled" | "draft";

function formattedDate(value: string) {
  const date = new Date(value);
  const months = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${date.getUTCDate()}. ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hour}:${minute}`;
}

const moduleOverview: Array<{ key: keyof AdminModuleCounts; label: string; href: string }> = [
  { key: "articles", label: "Články", href: "/admin" },
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

export function AdminDashboard({ initialArticles, initialCounts, moduleCounts, pagination, fixedPortalSection }: {
  initialArticles: ManagedArticleSummary[];
  initialCounts: ManagedArticleSummaryPage["counts"];
  moduleCounts?: AdminModuleCounts;
  pagination: ManagedArticleSummaryPage["pagination"];
  fixedPortalSection?: ManagedArticleSummary["portalSection"];
}) {
  const [articles, setArticles] = useState(initialArticles);
  const [counts, setCounts] = useState(initialCounts);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const visibleArticles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return articles.filter((article) => {
      if (fixedPortalSection && article.portalSection !== fixedPortalSection) return false;
      const statusMatches = status === "all" || article.status === status;
      const queryMatches = !needle || `${article.title} ${article.category} ${portalSectionLabel(article.portalSection)} ${getNewsCategory(article.newsCategory)?.label ?? ""} ${article.slug}`.toLocaleLowerCase("sk").includes(needle);
      return statusMatches && queryMatches;
    });
  }, [articles, fixedPortalSection, query, status]);

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
        <div className="admin-toolbar">
          <label className="admin-search">
            <SearchIcon size={19} />
            <span className="sr-only">Hľadať článok</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hľadať podľa názvu alebo témy" />
          </label>
          <div className="admin-status-filter" aria-label="Filtrovať podľa stavu">
            {([
              ["all", "Všetky"],
              ["published", "Publikované"],
              ["scheduled", "Naplánované"],
              ["draft", "Koncepty"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" className={status === value ? "is-active" : ""} onClick={() => setStatus(value)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {message && <p className="admin-flash" role="status">{message}</p>}

        {visibleArticles.length ? (
          <div className="admin-article-list">
            {visibleArticles.map((article) => (
              <article className="admin-article-row" key={article.id}>
                <div className={`admin-article-thumb admin-article-thumb--${article.accent}`}>
                  {article.image ? <img src={article.image} alt="" /> : <span>🐾</span>}
                </div>
                <div className="admin-article-main">
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
                <div className="admin-row-actions">
                  {article.status === "published" && <Link href={articleHref(article)} target="_blank">Pozrieť ↗</Link>}
                  <Link className="admin-row-edit" href={`/admin/clanky/${article.id}`}>Upraviť</Link>
                  <button type="button" disabled={deletingId === article.id} onClick={() => removeArticle(article)}>
                    {deletingId === article.id ? "Odstraňujem…" : "Odstrániť"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="admin-empty">
            <span>🐾</span>
            <h2>Nenašli sa žiadne články</h2>
            <p>Skús zmeniť filter alebo vyhľadávanie.</p>
          </div>
        )}
        <AdminPagination pagination={pagination} basePath={fixedPortalSection ? "/admin/steniatka" : "/admin"} />
      </section>
    </>
  );
}
