import type { Metadata } from "next";
import { ArticleBrowser } from "@/components/article-browser";
import { getPublishedArticles } from "@/lib/article-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Články o psoch",
  description: "Praktické články o výcviku, zdraví, výžive a každodennom živote so psom.",
  alternates: { canonical: "/clanky" },
};

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ hladat?: string; tema?: string }>;
}) {
  const params = await searchParams;
  const articles = await getPublishedArticles();
  const categories: Record<string, string> = {
    vycvik: "Výcvik",
    zdravie: "Zdravie",
    vyziva: "Výživa",
    "zivot-so-psom": "Život so psom",
  };

  return (
    <main id="obsah">
      <header className="page-hero shell">
        <div className="page-hero-inner">
          <span className="eyebrow">Psia knižnica</span>
          <h1>Články, ku ktorým sa oplatí vrátiť</h1>
          <p>Bez zbytočných skratiek. Vyberáme praktické témy a vysvetľujeme ich tak, aby dávali zmysel v skutočnom živote so psom.</p>
        </div>
      </header>
      <section className="page-body shell">
        <ArticleBrowser
          articles={articles}
          initialQuery={params.hladat ?? ""}
          initialCategory={categories[params.tema ?? ""] ?? "Všetky"}
        />
      </section>
    </main>
  );
}
