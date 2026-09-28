"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Article } from "@/lib/content";
import { ArticleCard } from "./article-card";
import { STORAGE_KEY } from "./favorite-button";

export function FavoritesList({ articles }: { articles: Article[] }) {
  const [slugs, setSlugs] = useState<string[] | null>(null);

  useEffect(() => {
    function read() {
      try {
        setSlugs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
      } catch {
        setSlugs([]);
      }
    }
    read();
    window.addEventListener("psipedia-favorites-changed", read);
    return () => window.removeEventListener("psipedia-favorites-changed", read);
  }, []);

  if (slugs === null) return <div className="favorites-loading">Načítavam uložené články…</div>;
  const saved = articles.filter((article) => slugs.includes(article.slug));

  if (!saved.length) {
    return (
      <div className="empty-state favorites-empty">
        <span>♡</span>
        <h2>Zatia tu nič nie je</h2>
        <p>Pri článku ťukni na záložku a bezpečne si ho odlož na neskôr v tomto zariadení.</p>
        <Link href="/clanky" className="button button--dark">Objaviť články</Link>
      </div>
    );
  }

  return <div className="article-grid">{saved.map((article) => <ArticleCard key={article.slug} article={article} />)}</div>;
}
