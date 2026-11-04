import { PublicHeading } from "@/components/public-heading";
import type { Metadata } from "next";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import Link from "next/link";
import { PrivacyControls } from "@/components/privacy-controls";
import { GoogleMapsConsentControls } from "@/components/google-maps-consent-controls";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Cookies a lokálne úložisko",
  description: "Aké cookies, lokálne úložisko a analytické technológie používa Psipedia.sk.",
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <main id="obsah">
      <UniversalPageHero
        eyebrow="Tvoje zariadenie"
        title="Cookies a lokálne úložisko"
        intro="Psipedia.sk používa nevyhnutné technické údaje a lokálne úložisko. Google Analytics 4 sa spustí iba vtedy, keď návštevník analytiku výslovne povolí. Prípadné reklamné technológie tretích strán sa spustia až po príslušnom súhlase."
      />
      <section className="prose-page legal-page">

      <PublicHeading role="section" as="h2">
        Nevyhnutné technológie
      </PublicHeading>
      <p>
        Hosting a bezpečnostná vrstva môžu používať krátkodobé technické cookies alebo obdobné údaje
        potrebné na doručenie stránky, ochranu pred zneužitím a bezpečnú prevádzku. Tieto
        technológie sa nepoužívajú na reklamné profilovanie.
      </p>

      <PublicHeading role="section" as="h2">
        Voľba analytiky
      </PublicHeading>
      <p>
        Informáciu o tom, či si analytiku prijal alebo odmietol, ukladáme v lokálnom úložisku
        prehliadača pod názvom <code>psipedia-cookie-consent</code>. Vďaka tomu sa na rovnakú voľbu
        nemusíme pýtať pri každom otvorení stránky.
      </p>

      <PublicHeading role="section" as="h2">
        Obľúbené články
      </PublicHeading>
      <p>
        Keď si výslovne uložíš článok medzi obľúbené, jeho adresa sa uloží do lokálneho úložiska
        prehliadača pod názvom <code>psipedia-favorites</code>. Zoznam zostáva v danom zariadení,
        neobsahuje tvoje meno ani e-mail a Psipedia ho neposiela na server.
      </p>
      <PrivacyControls />

      <PublicHeading role="section" as="h2">
        Google Analytics 4
      </PublicHeading>
      <p>
        So súhlasom návštevníka používame službu Google Analytics 4 od spoločnosti Google Ireland
        Limited na súhrnné meranie návštevnosti a používania portálu. Identifikátor merania je{" "}
        <code>G-Z6KV64S2CK</code>. Google Analytics sa pred prijatím analytiky nenačíta.
      </p>
      <p>
        Pri povolenej analytike môžu byť spracúvané údaje o navštívenej stránke, čase návštevy,
        zariadení, prehliadači, približnej geografickej oblasti a interakciách. Nepoužívame Google
        Signals ani reklamné personalizačné signály.
      </p>
      <p>
        Po povolení môže Google Analytics používať analytické cookies, napríklad <code>_ga</code> a{" "}
        <code>_ga_*</code>.
      </p>

      <PublicHeading role="section" as="h2">
        Google Maps
      </PublicHeading>
      <p>
        Na stránke Mapa Psipedie môžeš samostatne povoliť interaktívny mapový podklad Google Maps.
        Pred týmto výslovným povolením Psipedia Google Maps JavaScript nenačíta a textové výsledky
        mapy zostávajú dostupné bez neho.
      </p>
      <p>
        Po povolení prehliadač nadviaže spojenie so službou Google Maps. Google môže pri poskytovaní
        mapy spracúvať technické údaje potrebné na doručenie služby, napríklad IP adresu, informácie
        o prehliadači a súradnice zobrazovanej mapovej oblasti, podľa svojich podmienok a zásad
        ochrany súkromia. Psipedia neodosiela Google súkromné geo polohy ani nepoužíva Google Places
        alebo browser geocoding.
      </p>
      <p>
        Voľbu ukladáme lokálne pod názvom <code>psipedia-google-maps-consent</code>. Môžeš ju
        kedykoľvek odvolať nižšie; po odvolaní stránku obnovíme, aby sa ďalší Google mapový podklad
        nenačítaval.
      </p>
      <GoogleMapsConsentControls />
      <p>
        <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">
          Podmienky Google Maps
        </a>{" "}
        ·{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">
          Zásady ochrany súkromia Google
        </a>
      </p>

      <PublicHeading role="section" as="h2">
        Reklamné technológie tretích strán
      </PublicHeading>
      <p>
        Technická architektúra Psipedie umožňuje v budúcnosti zapnúť programmatic reklamu
        samostatnou konfiguráciou. Kým nie je táto integrácia nakonfigurovaná platným publisher
        identifikátorom, reklamný skript sa nenačíta. Ak bude integrácia zapnutá, načítanie
        third-party reklamného skriptu bude vyžadovať samostatnú voľbu reklamných cookies; samotný
        súhlas s analytikou na to nestačí.
      </p>
      <p>
        Priame first-party kampane môžu byť vykreslené bez third-party reklamného skriptu. Taký
        obsah je na stránke jasne označený ako <strong>Reklama</strong>; zvýraznený canonical profil
        alebo listing ako <strong>Sponzorované</strong>. First-party meranie zobrazení a kliknutí sa
        odosiela iba pri povolenej analytike alebo reklamných cookies.
      </p>

      <PublicHeading role="section" as="h2">
        Prihlásenie a budúce používateľské účty
      </PublicHeading>
      <p>
        Redakčná administrácia môže používať nevyhnutné autentifikačné alebo bezpečnostné údaje. Ak
        Psipedia neskôr spustí účty pre veterinárov, salóny, trénerov alebo iných poskytovateľov,
        nevyhnutné údaje potrebné na prihlásenie, bezpečnosť a udržanie relácie budú patriť medzi
        technológie potrebné na používateľom vyžiadanú funkciu. Pred verejným spustením účtov tento
        dokument doplníme o konkrétne používané technológie.
      </p>

      <PublicHeading role="section" as="h2">
        Tvoja voľba
      </PublicHeading>
      <p>
        Analytiku môžeš prijať alebo odmietnuť priamo v ozname. Rozhodnutie môžeš kedykoľvek zmeniť
        tlačidlom <strong>Nastavenia cookies</strong> v pätičke každej stránky. Odmietnutie
        analytiky nemá vplyv na používanie verejnej časti portálu.
      </p>
      <p>
        Pri odvolaní súhlasu Psipedia zakáže ďalšie analytické meranie a pokúsi sa odstrániť
        analytické cookies vytvorené pre doménu Psipedia.sk.
      </p>

      <p>
        Ďalšie informácie o spracúvaní údajov sú v{" "}
        <Link href="/sukromie">zásadách ochrany osobných údajov</Link>.
      </p>
      <p className="legal-updated">Aktualizované 23. septembra 2026.</p>
      </section>
    </main>
  );
}
