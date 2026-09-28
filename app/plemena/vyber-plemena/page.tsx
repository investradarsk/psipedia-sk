import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Nájsť vhodné plemeno",
  description: "Začnite atlasom plemien, porovnaním dvoch plemien alebo praktickým návodom, ako vybrať psa podľa svojho života.",
  path: "/plemena/vyber-plemena",
});

export default function BreedChoicePage() {
  return (
    <main id="obsah">
      <header className="page-hero shell">
        <div className="page-hero-inner">
          <span className="eyebrow">Plemená</span>
          <h1>Nájsť vhodné plemeno</h1>
          <p>Vyberajte podľa energie, povahy, veľkosti, starostlivosti a toho, ako vyzerá váš bežný deň — nie iba podľa vzhľadu.</p>
        </div>
      </header>

      <section className="page-body shell">
        <div className="article-grid">
          <article className="article-card article-card--large article-card--forest">
            <div className="article-card-body">
              <span className="eyebrow">1. Preskúmať</span>
              <h2>Atlas plemien</h2>
              <p>Prejdite si plemená podľa FCI skupín a otvorte detail s povahou, potrebami a praktickými informáciami.</p>
              <Link className="button button--dark" href="/plemena">Otvoriť atlas plemien</Link>
            </div>
          </article>

          <article className="article-card article-card--large article-card--gold">
            <div className="article-card-body">
              <span className="eyebrow">2. Porovnať</span>
              <h2>Porovnať dve plemená</h2>
              <p>Keď už máte užší výber, pozrite si dve plemená vedľa seba a porovnajte ich praktické vlastnosti.</p>
              <Link className="button button--dark" href="/porovnat-plemena">Porovnať plemená</Link>
            </div>
          </article>

          <article className="article-card article-card--large article-card--coral">
            <div className="article-card-body">
              <span className="eyebrow">3. Rozhodnúť sa</span>
              <h2>Ako si vybrať plemeno</h2>
              <p>Praktický návod pred kúpou šteniatka: čo zvážiť pri aktivite, rodine, bývaní, zdraví a každodennej starostlivosti.</p>
              <Link className="button button--dark" href="/steniatka/vyber-plemena">Prečítať sprievodcu</Link>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
