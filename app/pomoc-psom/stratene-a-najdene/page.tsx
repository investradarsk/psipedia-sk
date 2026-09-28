import type { Metadata } from "next";
import Link from "next/link";
import { listPublicDogReports } from "@/lib/lost-found-dog-store";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Stratené a nájdené psy",
  description: "Prehľad hlásení o stratených a nájdených psoch na Slovensku.",
  path: "/pomoc-psom/stratene-a-najdene",
});

export default async function LostFoundHubPage() {
  const [lost, found] = await Promise.all([
    listPublicDogReports("LOST", { page: 1, pageSize: 1 }),
    listPublicDogReports("FOUND", { page: 1, pageSize: 1 }),
  ]);

  return (
    <main id="obsah">
      <header className="page-hero shell">
        <div className="page-hero-inner">
          <span className="eyebrow">Pomoc psom</span>
          <h1>Stratené a nájdené psy</h1>
          <p>Vyberte správny prehľad podľa toho, či psa hľadáte alebo ste ho našli.</p>
        </div>
      </header>

      <section className="page-body shell">
        <div className="article-grid">
          <article className="article-card article-card--large article-card--coral">
            <div className="article-card-body">
              <span className="eyebrow">Aktuálne hlásenia</span>
              <h2>Stratené psy</h2>
              <p>{lost.total === 1 ? "1 aktívne hlásenie" : `${lost.total} aktívnych hlásení`} o psoch, ktorých majitelia hľadajú.</p>
              <Link className="button button--dark" href="/pomoc-psom/stratene-psy">Zobraziť stratené psy</Link>
            </div>
          </article>

          <article className="article-card article-card--large article-card--forest">
            <div className="article-card-body">
              <span className="eyebrow">Aktuálne hlásenia</span>
              <h2>Nájdené psy</h2>
              <p>{found.total === 1 ? "1 aktívne hlásenie" : `${found.total} aktívnych hlásení`} o nájdených psoch, pri ktorých sa hľadá majiteľ.</p>
              <Link className="button button--dark" href="/pomoc-psom/najdene-psy">Zobraziť nájdené psy</Link>
            </div>
          </article>
        </div>

        <p><Link href="/pomoc-psom">← Späť na Pomoc psom</Link></p>
      </section>
    </main>
  );
}
