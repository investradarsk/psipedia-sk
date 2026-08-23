import type { Metadata } from "next";
import Link from "next/link";
import { PrivacyControls } from "@/components/privacy-controls";

export const metadata: Metadata = {
  title: "Cookies a lokálne úložisko",
  description: "Aké technické údaje a lokálne úložisko používa Psipedia.sk.",
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Tvoje zariadenie</span>
      <h1>Cookies a lokálne úložisko</h1>
      <p className="lead">Psipedia.sk momentálne nepoužíva analytické, reklamné ani marketingové cookies. Preto návštevníka nežiadame o zbytočný všeobecný súhlas.</p>

      <h2>Nevyhnutné technické údaje</h2>
      <p>Hosting a bezpečnostná vrstva môžu použiť krátkodobé technické cookies alebo obdobné údaje potrebné na doručenie stránky, ochranu pred zneužitím a fungovanie prihlásenia do administrácie. Bez nich by požadovaná služba nefungovala. Nepoužívajú sa na reklamné profilovanie.</p>

      <h2>Obľúbené články</h2>
      <p>Keď si výslovne uložíš článok medzi obľúbené, jeho adresa sa uloží do lokálneho úložiska prehliadača pod názvom <code>psipedia-favorites</code>. Údaj zostáva len v danom zariadení, neobsahuje tvoje meno ani e-mail a Psipedia ho neposiela na server.</p>
      <PrivacyControls />

      <h2>Administrácia</h2>
      <p>Prihlásenie redaktora môže používať nevyhnutné autentifikačné cookies. Administrácia nie je určená bežným návštevníkom a bez týchto cookies nie je možné bezpečne overiť oprávnenie redaktora.</p>

      <h2>Budúca analytika alebo reklama</h2>
      <p>Ak neskôr pridáme meranie návštevnosti, personalizáciu alebo reklamu, ktorá nie je bezpodmienečne potrebná, nespustíme ju pred voľbou návštevníka. Odmietnutie bude rovnako jednoduché ako prijatie a súhlas bude možné kedykoľvek odvolať. Zároveň aktualizujeme túto stránku s názvami poskytovateľov, účelmi a dobami uloženia.</p>

      <p>Ďalšie informácie o spracúvaní údajov sú v <Link href="/sukromie">zásadách ochrany osobných údajov</Link>.</p>
      <p className="legal-updated">Účinné od 17. augusta 2026.</p>
    </main>
  );
}
