"use client";

import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import { PublicTextInput } from "@/components/public-visual-system/public-form-controls";
import { useEffect, useMemo, useState } from "react";
import type { ArticleListingCard } from "@/lib/content";
import { ArticleCard } from "./article-card";
import { SearchIcon } from "./icons";

const filters = ["Všetky", "Výcvik", "Zdravie", "Výživa", "Život so psom"];

export function ArticleBrowser({
  articles,
  initialCategory = "Všetky",
  initialQuery = "",
  hidePrimarySearch = false,
}: {
  articles: ArticleListingCard[];
  initialCategory?: string;
  initialQuery?: string;
  hidePrimarySearch?: boolean;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState(initialQuery);
  useEffect(() => {
    if (!hidePrimarySearch) return;
    const form = document.querySelector<HTMLFormElement>('form[data-public-search-form="articles"]');
    if (!form) return;
    const slugs: Record<string, string> = {
      "Výcvik": "vycvik", "Zdravie": "zdravie", "Výživa": "vyziva", "Život so psom": "zivot-so-psom",
    };
    const slug = slugs[category] ?? "";
    let field = form.querySelector<HTMLInputElement>('input[type="hidden"][name="tema"]');
    if (!slug) { field?.remove(); return; }
    if (!field) {
      field = document.createElement("input");
      field.type = "hidden";
      field.name = "tema";
      form.appendChild(field);
    }
    field.value = slug;
  }, [category, hidePrimarySearch]);
  // Preserve live, client-side filtering while its only visible input is in the hero.
  useEffect(() => {
    if (!hidePrimarySearch) return;
    const input = document.getElementById("article-hero-search");
    if (!(input instanceof HTMLInputElement)) return;
    const sync = () => setQuery(input.value);
    input.addEventListener("input", sync);
    return () => input.removeEventListener("input", sync);
  }, [hidePrimarySearch]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sk");
    return articles.filter((article) => {
      const categoryMatch = category === "Všetky" || article.category === category;
      const queryMatch = !normalized || `${article.title} ${article.excerpt} ${article.category}`.toLocaleLowerCase("sk").includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [articles, category, query]);

  return (
    <div className="article-browser article-browser--listing">
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
        {!hidePrimarySearch && <label className="inline-search">
          <SearchIcon size={19} />
          <span className="sr-only">Hľadať v magazíne</span>
          <PublicTextInput appearance="context" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hľadať v magazíne" />
        </label>}
      </div>

      <p className="result-count" aria-live="polite">
        {visible.length === 1 ? "1 výsledok" : `${visible.length} výsledkov`}
        {query && <> pre „{query}“</>}
      </p>

      {visible.length > 0 ? (
        <div className="article-grid article-grid--listing" data-article-listing-grid>
          {visible.map((article) => <ArticleCard key={article.slug} article={article} headingLevel={2} omitMissingImage />)}
        </div>
      ) : (
        <PublicEmptyState variant="listing" icon="🐾" title="Na túto stopu sme ešte nenarazili" description="Skús kratší výraz alebo inú tému.">
          <button type="button" className="button button--dark" onClick={() => {
            setQuery("");
            setCategory("Všetky");
            const heroInput = document.getElementById("article-hero-search");
            if (heroInput instanceof HTMLInputElement) heroInput.value = "";
          }}>
            Zobraziť celý magazín
          </button>
        </PublicEmptyState>
      )}
    </div>
  );
}
