import type { Metadata } from "next";
import { FavoritesList } from "@/components/favorites-list";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import { getPublishedArticleSummaries } from "@/lib/article-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Obľúbené články",
  description: "Články, ktoré ste si odložili na neskôr.",
  robots: { index: false, follow: true },
};

export default async function FavoritesPage() {
  const articles = await getPublishedArticleSummaries({ limit: 200 });

  return (
    <main id="obsah">
      <UniversalPageHero
        eyebrow="Tvoja knižnica"
        title="Obľúbené články"
        intro="Uložené zostanú v tomto zariadení, kým ich neodstrániš alebo nevymažeš údaje prehliadača."
      />
      <section className="page-body shell"><FavoritesList articles={articles} /></section>
    </main>
  );
}
