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
        variant="compact"
        eyebrow="Tvoje zariadenie"
        title="Cookies a lokálne úložisko"
        intro="Na chod stránky používame nevyhnutné technické údaje. Analytiku zapneme iba s tvojím súhlasom a reklamné cookies tretích strán až po samostatnom povolení."
      />
      <section className="prose-page legal-page">

      <PublicHeading role="section" as="h2">
        Nevyhnutné technológie
      </PublicHeading>
      <p>
        Základné cookies pomáhajú bezpečne zobrazovať stránku a chrániť ju pred zneužitím.
        Fungujú aj bez súhlasu s analytikou a nepoužívame ich na reklamné profilovanie.
      </p>
      <PublicHeading role="section" as="h2">
        Voľba analytiky
      </PublicHeading>
      <p>
        Tvoj výber si uložíme v prehliadači, aby sme sa naň nemuseli pýtať pri každej návšteve.
        Existujúca voľba „Prijať analytiku“ platí spoločne pre vlastnú analytiku Psipedie
        aj Google Analytics; druhý súhlas na meranie návštevnosti nezavádzame.
        Súhlas môžeš kedykoľvek zmeniť.
      </p>
      <PublicHeading role="section" as="h2">
        Obľúbené články
      </PublicHeading>
      <p>
        Ak si uložíš článok medzi obľúbené, jeho odkaz zostáva v tomto prehliadači.
        Zoznam neobsahuje tvoje meno ani e-mail a automaticky ho neposielame na server.
      </p>
      <PrivacyControls />
      <PublicHeading role="section" as="h2">
        Vlastné štatistiky návštevnosti Psipedie
      </PublicHeading>
      <p>
        Ak povolíš analytiku, Psipedia si sama zaznamená zobrazenia verejných stránok, návštevy,
        približný počet rôznych prehliadačov, typ zariadenia a kategóriu zdroja návštevy
        (napríklad vyhľadávač, sociálna sieť alebo priamy prístup). Zároveň môžeme
        započítať prečítanie článku alebo návštevu profilu po aspoň 10 sekundách
        jeho viditeľného zobrazenia. Opakované zobrazenia toho istého obsahu v jednom
        prehliadači obmedzujeme na šesť hodín. Tieto štatistiky sú nezávislé od Google Analytics.
      </p>
      <p>
        Na počítanie rôznych prehliadačov používame lokálne vytvorený náhodný
        identifikátor najviac na 30 dní a identifikátor návštevy s 30-minútovým
        intervalom nečinnosti. Server ukladá iba ich odvodené HMAC hodnoty,
        ktoré automaticky premazávame najneskôr približne po 35 dňoch.
        Neukladáme celé referenčné URL ani parametre navštívených stránok.
        Na obmedzenie opakovaného počítania obsahu používame lokálne úložisko
        a pri profile aj krátkodobý náhodný token. Na ochranu pred zneužitím môžeme
        použiť jednosmerne odvodený identifikátor z IP adresy, nie jej pôvodnú hodnotu.
        Do samotných súhrnných počtov neukladáme meno ani e-mail návštevníka.
        Po odvolaní súhlasu ďalšie zobrazenia nepočítame a miestne záznamy
        použité pre toto meranie odstránime.
      </p>
      <PublicHeading role="section" as="h2">
        Google Analytics 4
      </PublicHeading>
      <p>
        Ak povolíš analytiku, Google Analytics 4 nám pomôže zistiť, koľko ľudí web navštevuje
        a ktoré stránky čítajú. Bez tvojho súhlasu sa služba nenačíta.
      </p>
      <p>
        Pri povolení môže Google spracúvať údaje o navštívených stránkach, čase návštevy,
        zariadení, prehliadači a približnej oblasti. Môže používať analytické cookies, napríklad
        <code>_ga</code>. Nepoužívame Google Signals ani reklamné personalizačné signály.
      </p>
      <PublicHeading role="section" as="h2">
        Google Maps
      </PublicHeading>
      <p>
        Interaktívnu mapu Google Maps načítame až po tvojom samostatnom povolení.
        Bez neho zostane dostupný textový zoznam výsledkov mapy.
      </p>
      <p>
        Po povolení môže Google spracúvať technické údaje, napríklad IP adresu,
        informácie o prehliadači a zobrazovanú oblasť mapy. Psipedia neposiela Google
        tvoju súkromnú polohu.
      </p>
      <p>
        Tvoju voľbu si prehliadač zapamätá. Nižšie ju môžeš odvolať; stránka sa
        následne obnoví.
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
        Reklamné cookies externých partnerov použijeme iba vtedy, ak je taká reklama zapnutá
        a ty ju samostatne povolíš. Súhlas s analytikou sám osebe nestačí.
      </p>
      <p>
        Na webe sa môžu zobrazovať aj reklamy bez cookies externých partnerov.
        Platené umiestnenia označujeme ako <strong>Reklama</strong> alebo
        <strong> Sponzorované</strong>. Zobrazenia a kliknutia meriame iba pri povolenej
        analytike alebo reklamných cookies.
      </p>
      <PublicHeading role="section" as="h2">
        Partner účet a prihlásenie
      </PublicHeading>
      <p>
        Partner účet už slúži poskytovateľom služieb, organizáciám a organizátorom podujatí
        na správu ich profilov a návrhov. Prihlásiť sa dá heslom alebo jednorazovým odkazom
        zaslaným e-mailom; prihlásenie cez Google je dostupné, ak je zapnuté.
        Na bezpečné prihlásenie a udržanie relácie používame nevyhnutné technické cookies.
        Tie nevyžadujú súhlas s analytikou.
      </p>
      <PublicHeading role="section" as="h2">
        Tvoja voľba
      </PublicHeading>
      <p>
        Analytiku a prípadné reklamné cookies môžeš prijať alebo odmietnuť v ozname.
        Rozhodnutie kedykoľvek zmeníš cez <strong>Nastavenia cookies</strong> v pätičke.
        Odmietnutie nebráni bežnému používaniu webu.
      </p>
      <p>
        Ak odvoláš súhlas s analytikou, vypneme ďalšie meranie a pokúsime sa odstrániť
        analytické cookies pre doménu Psipedia.sk.
      </p>
      <p>
        Ďalšie informácie o spracúvaní údajov sú v{" "}
        <Link href="/sukromie">zásadách ochrany osobných údajov</Link>.
      </p>
      <p className="legal-updated">Aktualizované 13. novembra 2026.</p>
      </section>
    </main>
  );
}
