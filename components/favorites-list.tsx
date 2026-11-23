"use client";
import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Article } from "@/lib/content";
import { ArticleCard } from "./article-card";
import { FAVORITES_BATCH_SIZE, readFavorites, subscribeFavorites } from "@/lib/public-favorites";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; articles: Article[] };

export function FavoritesList() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let request: AbortController | undefined;

    async function load() {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const slugs = readFavorites();
      const articles: Article[] = [];
      if (slugs.length) setState({ status: "loading" });
      try {
        for (let start = 0; start < slugs.length; start += FAVORITES_BATCH_SIZE) {
          const params = new URLSearchParams();
          for (const slug of slugs.slice(start, start + FAVORITES_BATCH_SIZE)) {
            params.append("slug", slug);
          }
          const response = await fetch(`/api/public/articles/favorites?${params}`, {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Favorite articles request failed");
          const batch = (await response.json()) as { articles: Article[] };
          articles.push(...batch.articles);
          if (controller.signal.aborted) return;
        }
        articles.sort((a, b) => b.dateIso.localeCompare(a.dateIso));
        if (!controller.signal.aborted) setState({ status: "ready", articles });
      } catch {
        if (!controller.signal.aborted) setState({ status: "error" });
      }
    }

    void load();
    const unsubscribe = subscribeFavorites(load);
    return () => {
      unsubscribe();
      request?.abort();
    };
  }, [retry]);

  if (state.status === "loading") {
    return (
      <div className="favorites-loading" role="status">
        Načítavam uložené články…
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <PublicEmptyState variant="context" className="empty-state favorites-empty" role="status">
        <h2>Obľúbené články sa nepodarilo načítať</h2>
        <button type="button" className="button button--dark" onClick={() => setRetry(retry + 1)}>
          Skúsiť znova
        </button>
      </PublicEmptyState>
    );
  }
  const saved = state.articles;
  if (!saved.length) {
    return (
      <PublicEmptyState variant="context" className="empty-state favorites-empty">
        <span>♡</span>
        <h2>Zatia tu nič nie je</h2>
        <p>Pri článku ťukni na záložku a bezpečne si ho odlož na neskôr v tomto zariadení.</p>
        <Link href="/clanky" className="button button--dark">
          Objaviť články
        </Link>
      </PublicEmptyState>
    );
  }

  return (
    <div className="article-grid">
      {saved.map((article) => (
        <ArticleCard key={article.slug} article={article} />
      ))}
    </div>
  );
}
