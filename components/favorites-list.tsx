"use client";
import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Article } from "@/lib/content";
import { ArticleCard } from "./article-card";
import { readFavorites, subscribeFavorites } from "@/lib/public-favorites";

export function FavoritesList({ articles }: { articles: Article[] }) {
  const [slugs, setSlugs] = useState<string[] | null>(null);

  useEffect(() => {
    function read() {
      setSlugs(readFavorites());
    }
    read();
    return subscribeFavorites(read);
  }, []);

  if (slugs === null) return <div className="favorites-loading">Načítavam uložené články…</div>;
  const saved = articles.filter((article) => slugs.includes(article.slug));

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
