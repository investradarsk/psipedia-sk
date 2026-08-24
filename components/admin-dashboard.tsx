"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ManagedArticle } from "@/lib/article-store";
import { getNewsCategory } from "@/lib/news";
import { articleHref, portalSectionLabel } from "@/lib/portal";
import { SearchIcon } from "./icons";

type StatusFilter = "all" | "published" | "draft";

function formattedDate(value: string) {
  const date = new Date(value);
  const months = ["jan", "feb", "mar", "apr", "máj", "jún", "júl", "aug", "sep", "okt", "nov", "dec"];
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  return `${date.getUTCDate()}. ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${hour}:${minute}`;
}

export function AdminDashboard({ initialArticles, fixedPortalSection }: { initialArticles: ManagedArticle[]; fixedPortalSection?: ManagedArticle["portalSection"] }) {
  const [articles, setArticles] = useState(initialArticles);
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

  const scopedArticles = fixedPortalSection ? articles.filter((article) => article.portalSection === fixedPortalSection) : articles;
  const published = scopedArticles.filter((article) => article.status === "published").length;
  const drafts = scopedArticles.length - published;

  async function removeArticle(article: ManagedArticle) {
    const confirmed = window.confirm(`Naozaj chceš natrvalo odstrániť ${article.portalSection === "novinky" ? "novinku" : "článok"} „${article.title}“?`);
    if (!confirmed) return;

    setDeletingId(article.id);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/articles/${article.id}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Článok sa nepodarilo odstrániť.");
      setArticles((current) => current.filter((item) => item.id !== article.id));
      setMessage("Článok bol odstránený.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Článok sa nepodarilo odstrániť.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section className="admin-stats" aria-label="Stav redakcie">
        <div><span>Všetok obsah</span><strong>{scopedArticles.length}</strong></div>
        <div><span>Publikované</span><strong>{published}</strong></div>
        <div><span>Koncepty</span><strong>{drafts}</strong></div>
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
                      {article.status === "published" ? "Publikovaný" : "Koncept"}
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
      </section>
    </>
  );
}
