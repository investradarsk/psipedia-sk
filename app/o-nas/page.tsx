import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "O Psipedii",
  description: "Prečo vzniká Psipedia.sk a podľa akých zásad tvoríme obsah o psoch.",
  alternates: { canonical: "/o-nas" },
};

export default function AboutPage() {
  return (
    <main id="obsah" className="prose-page">
      <span className="eyebrow">O projekte</span>
      <h1>Lepší život so psom začína porozumením</h1>
      <p className="lead">Psipedia.sk vzniká ako moderný slovenský magazín a praktická encyklopédia pre ľudí, ktorí nechcú iba rýchlu odpoveď. Chcú vedieť, prečo ich pes niečo robí a ako mu pomôcť férovo.</p>

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
      <Link className="button button--dark" href="/clanky">Pozrieť články <ArrowIcon /></Link>
    </main>
  );
}
