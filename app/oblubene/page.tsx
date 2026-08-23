import type { Metadata } from "next";
import { FavoritesList } from "@/components/favorites-list";
import { getPublishedArticles } from "@/lib/article-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Obľúbené články",
  description: "Články, ktoré ste si odložili na neskôr.",
  robots: { index: false, follow: true },
};

export default async function FavoritesPage() {
  const articles = await getPublishedArticles();

  return (
    <main id="obsah">
      <header className="page-hero page-hero--compact shell">
        <div className="page-hero-inner">
          <span className="eyebrow">Tvoja knižnica</span>
          <h1>Obľúbené články</h1>
          <p>Uložené zostanú v tomto zariadení, kým ich neodstrániš alebo nevymažeš údaje prehliadača.</p>
        </div>
      </header>
      <section className="page-body shell"><FavoritesList articles={articles} /></section>
    </main>
  );
}
