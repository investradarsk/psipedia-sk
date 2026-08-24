import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyControls } from "@/components/privacy-controls";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Cookies a lokálne úložisko",
  description: "Aké technické údaje a lokálne úložisko používa Psipedia.sk.",
  path: "/cookies",
});

export default function CookiesPage() {
  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Tvoje zariadenie</span>
      <h1>Cookies a lokálne úložisko</h1>
      <p className="lead">Psipedia.sk používa nevyhnutné technické údaje. Voliteľné meranie návštevnosti cez Google Analytics sa spustí iba vtedy, keď ho návštevník výslovne prijme.</p>

      <h2>Nevyhnutné technické údaje</h2>
      <p>Hosting a bezpečnostná vrstva môžu použiť krátkodobé technické cookies alebo obdobné údaje potrebné na doručenie stránky, ochranu pred zneužitím a fungovanie prihlásenia do administrácie. Bez nich by požadovaná služba nefungovala. Nepoužívajú sa na reklamné profilovanie.</p>

      <h2>Obľúbené články</h2>
      <p>Keď si výslovne uložíš článok medzi obľúbené, jeho adresa sa uloží do lokálneho úložiska prehliadača pod názvom <code>psipedia-favorites</code>. Údaj zostáva len v danom zariadení, neobsahuje tvoje meno ani e-mail a Psipedia ho neposiela na server.</p>
      <PrivacyControls />

      <h2>Administrácia</h2>
      <p>Prihlásenie redaktora môže používať nevyhnutné autentifikačné cookies. Administrácia nie je určená bežným návštevníkom a bez týchto cookies nie je možné bezpečne overiť oprávnenie redaktora.</p>

      <h2>Google Analytics 4</h2>
      <p>So súhlasom návštevníka používame službu Google Analytics 4 od spoločnosti Google Ireland Limited na súhrnné meranie návštevnosti, používaných stránok a základných interakcií. Identifikátor merania je <code>G-Z6KV64S2CK</code>. Google Analytics sa pred prijatím analytiky nenačíta.</p>
      <p>Pri meraní môžu byť spracúvané údaje o navštívenej stránke, čase návštevy, zariadení, prehliadači, približnej polohe a interakciách. Nepoužívame Google Signals ani reklamné prispôsobovanie. Doba uchovávania sa riadi nastavením vlastníctva Google Analytics.</p>

      <h2>Tvoja voľba</h2>
      <p>Analytiku môžeš prijať alebo odmietnuť priamo v ozname. Voľbu môžeš kedykoľvek zmeniť tlačidlom <strong>Nastavenia cookies</strong> v päte každej stránky. Odmietnutie nemá vplyv na používanie portálu.</p>

      <p>Ďalšie informácie o spracúvaní údajov sú v <Link href="/sukromie">zásadách ochrany osobných údajov</Link>.</p>
      <p className="legal-updated">Aktualizované 24. augusta 2026.</p>
    </main>
  );
}
