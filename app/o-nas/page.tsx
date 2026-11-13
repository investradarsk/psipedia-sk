import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import { EDITORIAL_EMAIL_ADDRESS } from "@/lib/public-contact";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "O Psipedii",
  description: "Prečo vzniká Psipedia.sk a podľa akých zásad tvoríme obsah o psoch.",
  path: "/o-nas",
});

export default function AboutPage() {
  return (
    <main id="obsah">
      <UniversalPageHero
        eyebrow="O projekte"
        title="Lepší život so psom začína porozumením"
        intro="Psipedia.sk vzniká ako moderný slovenský magazín a praktická encyklopédia pre ľudí, ktorí chcú svojmu psovi lepšie rozumieť."
      />
      <section className="prose-page prose-page--after-hero">
      <h2>Čo chceme robiť inak</h2>
      <p>O psoch existuje obrovské množstvo obsahu, no často je neaktuálny, protirečivý alebo napísaný hlavne preto, aby niečo predal. My oddeľujeme informáciu od reklamy, pomenúvame hranice všeobecnej rady a dávame prednosť praktickým postupom.</p>

      <h2>Pre koho píšeme</h2>
      <p>Pre človeka s prvým šteniatkom, skúseného majiteľa pracovného psa aj rodinu, ktorá si plemeno ešte len vyberá. Nečakáme, že čitateľ pozná odborné výrazy. Ak ich potrebujeme, vysvetlíme ich.</p>

      <h2>Na čom si zakladáme</h2>
      <ul>
        <li>odmeňovací a rešpektujúci výcvik bez zastrašovania,</li>
        <li>zdravotné informácie s jasným odporúčaním, kedy patrí rozhodnutie veterinárovi,</li>
        <li>otvorené rozlišovanie skúsenosti, všeobecného odporúčania a odborného faktu,</li>
        <li>obsah, ktorý sa dá prečítať aj pohodlne na mobile.</li>
      </ul>

      <h2>Psipedia práve rastie</h2>
      <p>Toto je prvá funkčná verzia. Postupne pribudnú ďalšie plemená, odborní spolupracovníci, praktické nástroje a nové články podľa otázok slovenských majiteľov psov.</p>
      <section className="about-contact" id="kontakt">
        <span className="eyebrow">Kontakt</span>
        <h2>Napíš nám</h2>
        <p>Máš otázku, námet na článok, upozornenie na chybu alebo záujem o spoluprácu? Ozvi sa redakcii Psipedie.</p>
        <a className="button button--coral" href={`mailto:${EDITORIAL_EMAIL_ADDRESS}`}>{EDITORIAL_EMAIL_ADDRESS}</a>
      </section>
      <Link className="button button--dark" href="/clanky">Pozrieť články <ArrowIcon /></Link>
      </section>
    </main>
  );
}
