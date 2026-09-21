"use client";

import { useMemo, useState } from "react";
import type { Article } from "@/lib/content";
import { ArticleCard } from "./article-card";
import { SearchIcon } from "./icons";

const filters = ["Všetky", "Výcvik", "Zdravie", "Výživa", "Život so psom"];

export function ArticleBrowser({
  articles,
  initialCategory = "Všetky",
  initialQuery = "",
}: {
  articles: Article[];
  initialCategory?: string;
  initialQuery?: string;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState(initialQuery);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sk");
    return articles.filter((article) => {
      const categoryMatch = category === "Všetky" || article.category === category;
      const queryMatch = !normalized || `${article.title} ${article.excerpt} ${article.category}`.toLocaleLowerCase("sk").includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [articles, category, query]);

  return (
    <div className="article-browser">
      <div className="browser-toolbar">
        <div className="filter-row" role="group" aria-label="Filtrovať magazín podľa témy">
          {filters.map((filter) => (
            <button
              type="button"
              key={filter}
              className={filter === category ? "is-active" : ""}
              onClick={() => setCategory(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        <label className="inline-search">
          <SearchIcon size={19} />
          <span className="sr-only">Hľadať v magazíne</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hľadať v magazíne" />
        </label>
      </div>

      <p className="result-count" aria-live="polite">
        {visible.length === 1 ? "1 výsledok" : `${visible.length} výsledkov`}
        {query && <> pre „{query}“</>}
      </p>

      {visible.length > 0 ? (
        <div className="article-grid">
          {visible.map((article) => <ArticleCard key={article.slug} article={article} />)}
        </div>
      ) : (
        <div className="empty-state">
          <span>🐾</span>
          <h2>Na túto stopu sme ešte nenarazili</h2>
          <p>Skús kratší výraz alebo inú tému.</p>
          <button type="button" className="button button--dark" onClick={() => { setQuery(""); setCategory("Všetky"); }}>
            Zobraziť celý magazín
          </button>
        </div>
      )}
    </div>
  );
}
