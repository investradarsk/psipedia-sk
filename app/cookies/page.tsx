import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyControls } from "@/components/privacy-controls";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Cookies a lokálne úložisko",
  description: "Aké cookies, lokálne úložisko a analytické technológie používa Psipedia.sk.",
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Tvoje zariadenie</span>
      <h1>Cookies a lokálne úložisko</h1>
      <p className="lead">Psipedia.sk používa nevyhnutné technické údaje a lokálne úložisko. Google Analytics 4 sa spustí iba vtedy, keď návštevník analytiku výslovne povolí.</p>

      <h2>Nevyhnutné technológie</h2>
      <p>Hosting a bezpečnostná vrstva môžu používať krátkodobé technické cookies alebo obdobné údaje potrebné na doručenie stránky, ochranu pred zneužitím a bezpečnú prevádzku. Tieto technológie sa nepoužívajú na reklamné profilovanie.</p>

      <h2>Voľba analytiky</h2>
      <p>Informáciu o tom, či si analytiku prijal alebo odmietol, ukladáme v lokálnom úložisku prehliadača pod názvom <code>psipedia-cookie-consent</code>. Vďaka tomu sa na rovnakú voľbu nemusíme pýtať pri každom otvorení stránky.</p>

      <h2>Obľúbené články</h2>
      <p>Keď si výslovne uložíš článok medzi obľúbené, jeho adresa sa uloží do lokálneho úložiska prehliadača pod názvom <code>psipedia-favorites</code>. Zoznam zostáva v danom zariadení, neobsahuje tvoje meno ani e-mail a Psipedia ho neposiela na server.</p>
      <PrivacyControls />

      <h2>Google Analytics 4</h2>
      <p>So súhlasom návštevníka používame službu Google Analytics 4 od spoločnosti Google Ireland Limited na súhrnné meranie návštevnosti a používania portálu. Identifikátor merania je <code>G-Z6KV64S2CK</code>. Analytický skript sa pred udelením súhlasu nenačíta.</p>
      <p>Pri povolenej analytike môžu byť spracúvané údaje o navštívenej stránke, čase návštevy, zariadení, prehliadači, približnej geografickej oblasti a interakciách. Nepoužívame Google Signals ani reklamné personalizačné signály.</p>
      <p>Po povolení môže Google Analytics používať analytické cookies, napríklad <code>_ga</code> a <code>_ga_*</code>.</p>

      <h2>Prihlásenie a budúce používateľské účty</h2>
      <p>Redakčná administrácia môže používať nevyhnutné autentifikačné alebo bezpečnostné údaje. Ak Psipedia neskôr spustí účty pre veterinárov, salóny, trénerov alebo iných poskytovateľov, nevyhnutné údaje potrebné na prihlásenie, bezpečnosť a udržanie relácie budú patriť medzi technológie potrebné na používateľom vyžiadanú funkciu. Pred verejným spustením účtov tento dokument doplníme o konkrétne používané technológie.</p>

      <h2>Tvoja voľba</h2>
      <p>Analytiku môžeš prijať alebo odmietnuť priamo v ozname. Rozhodnutie môžeš kedykoľvek zmeniť tlačidlom <strong>Nastavenia cookies</strong> v pätičke každej stránky. Odmietnutie analytiky nemá vplyv na používanie verejnej časti portálu.</p>
      <p>Pri odvolaní súhlasu Psipedia zakáže ďalšie analytické meranie a pokúsi sa odstrániť analytické cookies vytvorené pre doménu Psipedia.sk.</p>

      <p>Ďalšie informácie o spracúvaní údajov sú v <Link href="/sukromie">zásadách ochrany osobných údajov</Link>.</p>
      <p className="legal-updated">Aktualizované 12. septembra 2026.</p>
    </main>
  );
}
