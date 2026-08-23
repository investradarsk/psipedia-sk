import type { Metadata } from "next";
import Link from "next/link";
import { NewsTipForm } from "@/components/news-tip-form";
import { CheckIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Pošli tip redakcii",
  description: "Pošli Psipedii tip na dôležitý príbeh, záchranu, výskum alebo udalosť zo sveta psov.",
  alternates: { canonical: "/novinky/poslat-tip" },
};

export default function SendNewsTipPage() {
  return (
    <main id="obsah" className="news-tip-page">
      <header className="news-tip-hero">
        <div className="shell">
          <nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span><Link href="/novinky">Novinky</Link><span>/</span><span>Pošli tip</span></nav>
          <div><span className="eyebrow">Pomôž nám nájsť dôležitý príbeh</span><h1>Pošli tip Psipedii</h1><p>Vieš o zachránenom psovi, výnimočnom zásahu, novom výskume, pripravovanej zmene zákona alebo udalosti, ktorá by nemala zostať bez povšimnutia? Daj nám vedieť.</p></div>
        </div>
      </header>

      <section className="section shell news-tip-layout">
        <NewsTipForm />
        <aside className="news-tip-process">
          <span className="eyebrow">Čo sa deje potom</span>
          <h2>Tip nie je automaticky článok</h2>
          <ol>
            <li><b>1</b><span><strong>Prijmeme námet</strong><small>Zostane iba v redakčnej schránke.</small></span></li>
            <li><b>2</b><span><strong>Overíme fakty</strong><small>Hľadáme pôvodný zdroj a ďalšie potvrdenie.</small></span></li>
            <li><b>3</b><span><strong>Doplníme súvislosti</strong><small>Vysvetlíme, prečo je správa dôležitá.</small></span></li>
            <li><b>4</b><span><strong>Zverejníme alebo odložíme</strong><small>Nie každý tip spĺňa redakčné zásady.</small></span></li>
          </ol>
          <div className="news-tip-safety"><CheckIcon size={20} /><p><strong>Pes je práve v ohrození?</strong> Nečakaj na redakciu. Použi náš <Link href="/pomoc-psom/nahlasit-psa-v-nudzi">postup pri psovi v núdzi</Link> a kontaktuj príslušné zložky.</p></div>
        </aside>
      </section>
    </main>
  );
}
