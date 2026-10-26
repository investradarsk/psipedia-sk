"use client";

import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import { PublicTextInput } from "@/components/public-visual-system/public-form-controls";
import { PublicActionButton, PublicContentListItem } from "@/components/public-visual-system";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ArticleListingCard } from "@/lib/content";
import { articleHref } from "@/lib/portal";
import { SearchIcon } from "./icons";

const filters = ["Všetky", "Novinky", "Šteniatka", "Výcvik", "Zdravie", "Výživa", "Život so psom"];
const INITIAL_COUNT = 12;
const NEXT_COUNT = 12;

function matchesCategory(article: ArticleListingCard, category: string) {
  if (category === "Všetky") return true;
  if (category === "Novinky") return article.portalSection === "novinky";
  if (category === "Šteniatka") return article.portalSection === "steniatka";
  return article.category === category;
}

function ArchiveArticleRow({ article }: { article: ArticleListingCard }) {
  return (
    <PublicContentListItem
      href={articleHref(article)}
      title={article.title}
      eyebrow={<>{article.category}{article.date ? ` · ${article.date}` : ""}</>}
      excerpt={article.excerpt || undefined}
      image={article.image ? {
        src: article.image,
        alt: article.imageAlt || `Fotografia k článku: ${article.title}`,
        mode: article.imageDisplay,
        focusX: article.imageFocusX,
        focusY: article.imageFocusY,
        config: article.thumbnailImageDisplay,
      } : undefined}
      actionLabel="Čítať článok"
    />
  );
}

/** First three articles share a row with discovery, the rest use the full available width. */
export function ArticleBrowser({
  articles,
  initialCategory = "Všetky",
  initialQuery = "",
  hidePrimarySearch = false,
  sidebar,
}: {
  articles: ArticleListingCard[];
  initialCategory?: string;
  initialQuery?: string;
  hidePrimarySearch?: boolean;
  sidebar?: ReactNode;
}) {
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState(initialQuery);
  const [shown, setShown] = useState(INITIAL_COUNT);
  useEffect(() => {
    if (!hidePrimarySearch) return;
    const form = document.querySelector<HTMLFormElement>('form[data-public-search-form="articles"]');
    if (!form) return;
    const slugs: Record<string, string> = {
      "Novinky": "novinky", "Šteniatka": "steniatka",
      "Výcvik": "vycvik", "Zdravie": "zdravie",
      "Výživa": "vyziva", "Život so psom": "zivot-so-psom",
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

  useEffect(() => {
    if (!hidePrimarySearch) return;
    const input = document.getElementById("article-hero-search");
    if (!(input instanceof HTMLInputElement)) return;
    const sync = () => { setQuery(input.value); setShown(INITIAL_COUNT); };
    input.addEventListener("input", sync);
    return () => input.removeEventListener("input", sync);
  }, [hidePrimarySearch]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("sk");
    return articles.filter((article) => {
      const categoryMatch = matchesCategory(article, category);
      const queryMatch = !normalized || `${article.title} ${article.excerpt} ${article.category}`.toLocaleLowerCase("sk").includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [articles, category, query]);
  const displayed = visible.slice(0, shown);
  const featured = sidebar ? displayed.slice(0, 3) : [];
  const remaining = sidebar ? displayed.slice(3) : displayed;

  return (
    <div className="article-browser article-browser--listing">
      <div className="browser-toolbar">
        <div className="filter-row" role="group" aria-label="Filtrovať magazín podľa témy">
          {filters.map((filter) => (
            <button
              type="button"
              key={filter}
              className={filter === category ? "is-active" : ""}
              aria-pressed={filter === category}
              onClick={() => { setCategory(filter); setShown(INITIAL_COUNT); }}
            >
              {filter}
            </button>
          ))}
        </div>
        {!hidePrimarySearch && <label className="inline-search">
          <SearchIcon size={19} />
          <span className="sr-only">Hľadať v magazíne</span>
          <PublicTextInput appearance="context" value={query} onChange={(event) => { setQuery(event.target.value); setShown(INITIAL_COUNT); }} placeholder="Hľadať v magazíne" />
        </label>}
      </div>

      <p className="result-count" aria-live="polite">
        {visible.length === 1 ? "1 výsledok" : `${visible.length} výsledkov`}
        {query && <> pre „{query}“</>}
      </p>

      {visible.length > 0 ? (
        <>
          {sidebar && <div className="article-listing-intro">
            <div className="article-listing-lead-list" role="list" aria-label="Najnovšie články">
              {featured.map((article) => <ArchiveArticleRow article={article} key={article.slug} />)}
            </div>
            {sidebar}
          </div>}
          {remaining.length > 0 && <div className="article-grid article-grid--listing article-grid--compact" role="list" data-article-listing-grid>
            {remaining.map((article) => <ArchiveArticleRow article={article} key={article.slug} />)}
          </div>}
          {displayed.length < visible.length && (
            <div className="article-listing-load-more">
              <PublicActionButton type="button" variant="primary" onClick={() => setShown((current) => current + NEXT_COUNT)}>
                Načítať ďalšie články
              </PublicActionButton>
              <span aria-live="polite">{displayed.length} z {visible.length}</span>
            </div>
          )}
        </>
      ) : (
        <PublicEmptyState variant="listing" icon="🐾" title="Na túto stopu sme ešte nenarazili" description="Skús kratší výraz alebo inú tému.">
          <button type="button" className="button button--dark" onClick={() => {
            setQuery("");
            setCategory("Všetky");
            setShown(INITIAL_COUNT);
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
