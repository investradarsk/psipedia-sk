import type { Metadata } from "next";
import Link from "next/link";
import { getLegalSettings } from "@/lib/legal-settings";
import {
  EDITORIAL_EMAIL_ADDRESS,
  PUBLIC_OPERATOR_ADDRESS,
  PUBLIC_OPERATOR_NAME,
} from "@/lib/public-contact";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Ochrana osobných údajov",
  description: "Ako Psipedia.sk spracúva osobné údaje, na aké účely a aké práva majú dotknuté osoby.",
  path: "/sukromie",
});

export default async function PrivacyPage() {
  const settings = await getLegalSettings();
  const controllerName = settings.businessName || settings.legalName || PUBLIC_OPERATOR_NAME;
  const controllerAddress = settings.address || PUBLIC_OPERATOR_ADDRESS;
  const privacyEmail = settings.privacyEmail || settings.email || EDITORIAL_EMAIL_ADDRESS;

  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Tvoje údaje</span>
      <h1>Ochrana osobných údajov</h1>
      <p className="lead">Psipedia.sk nevyžaduje registráciu bežných návštevníkov, osobné údaje nepredáva a nevytvára reklamné používateľské profily. Spracúvame iba údaje potrebné na fungovanie portálu, komunikáciu a funkcie, ktoré návštevník sám použije.</p>

      <h2>Prevádzkovateľ osobných údajov</h2>
      <p>Prevádzkovateľom je <strong>{controllerName}</strong>, {controllerAddress}.</p>
      <p>Kontakt pre otázky a uplatnenie práv: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</p>

      <h2>Aké údaje a prečo spracúvame</h2>
      <div className="privacy-purpose-list">
        <section>
          <h3>Kontakt e-mailom</h3>
          <p>Ak nám napíšeš, spracúvame údaje, ktoré nám sám poskytneš, najmä e-mailovú adresu, meno, ak ho uvedieš, a obsah správy. Používame ich na vybavenie otázky alebo podnetu, komunikáciu s tebou a primeranú ochranu našich práv.</p>
          <p>Právnym základom je podľa povahy komunikácie vykonanie krokov na tvoju žiadosť alebo oprávnený záujem na vybavovaní komunikácie, prevádzke portálu a ochrane pred zneužitím.</p>
        </section>

        <section>
          <h3>Tipy a námety pre Psipediu</h3>
          <p>Vo formulári na tip môžeme spracovať tému, názov a opis tipu, zdrojový odkaz, miesto a dátum udalosti. Meno a e-mail sú nepovinné a používame ich iba vtedy, ak je potrebné k tipu niečo doplniť alebo overiť.</p>
          <p>Tip sa nezverejňuje automaticky. Kontaktné údaje odosielateľa nezverejníme bez osobitného právneho dôvodu. Údaje používame na preverenie námetu, ochranu pred zneužitím a prípravu odborného alebo informačného obsahu.</p>
        </section>

        <section>
          <h3>Hodnotenie a spätná väzba k obsahu</h3>
          <p>Ak použiješ funkciu hodnotenia užitočnosti článku alebo pošleš textový podnet, môžeme uložiť identifikáciu hodnoteného obsahu, zvolenú odpoveď a text, ktorý sám zadáš. Neposielaj do voľného textu osobné údaje, ktoré nie sú na podnet potrebné.</p>
        </section>

        <section>
          <h3>Technická prevádzka a bezpečnosť</h3>
          <p>Pri načítaní stránky môžu poskytovatelia hostingu, bezpečnostnej a databázovej infraštruktúry spracúvať IP adresu, čas požiadavky, požadovanú adresu, typ zariadenia alebo prehliadača a technické záznamy potrebné na doručenie stránky, ochranu pred útokmi a diagnostiku chýb.</p>
          <p>Právnym základom je oprávnený záujem na bezpečnej a spoľahlivej prevádzke portálu.</p>
        </section>

        <section>
          <h3>Budúce účty poskytovateľov služieb</h3>
          <p>Psipedia pripravuje možnosť, aby si napríklad veterinár, psí salón, tréner alebo iný poskytovateľ mohol vytvoriť účet, požiadať o priradenie svojho profilu a navrhovať jeho zmeny. Táto funkcia zatiaľ nie je verejne spustená.</p>
          <p>Po jej spustení budeme na vytvorenie a zabezpečenie účtu spracúvať najmä meno, e-mail, údaje potrebné na overenie vzťahu k profilu, históriu navrhovaných zmien a bezpečnostné záznamy. Verejná zmena profilu sa nebude publikovať automaticky; pred zverejnením ju bude môcť Psipedia skontrolovať a schváliť.</p>
          <p>Pred spustením tejto funkcie tieto zásady doplníme o presný rozsah údajov, dobu uchovávania a prípadných ďalších poskytovateľov použitých na prihlasovanie.</p>
        </section>
      </div>

      <h2>Google Analytics 4</h2>
      <p>Google Analytics 4 používame iba po výslovnom súhlase návštevníka. Pred udelením súhlasu sa analytický skript nenačíta. Psipedia má vypnuté Google Signals aj reklamné personalizačné signály.</p>
      <p>Pri povolenej analytike môžu byť spracované údaje o navštívených stránkach, čase návštevy, zariadení, prehliadači, približnej geografickej oblasti a interakciách. Súhlas môžeš kedykoľvek zmeniť cez <strong>Nastavenia cookies</strong> v pätičke.</p>

      <h2>Obľúbené články a lokálne úložisko</h2>
      <p>Zoznam obľúbených článkov a voľba týkajúca sa analytiky sa ukladajú lokálne v prehliadači. Zoznam obľúbených nie je používateľský účet a samotný zoznam Psipedia neposiela na server. Podrobnosti sú na stránke <Link href="/cookies">Cookies a lokálne úložisko</Link>.</p>

      <h2>Komu môžu byť údaje sprístupnené</h2>
      <p>Údaje môžu byť v nevyhnutnom rozsahu sprístupnené poskytovateľom hostingu, databázy a bezpečnostnej infraštruktúry, poskytovateľovi e-mailovej služby pri e-mailovej komunikácii a spoločnosti Google pri povolenej analytike. Údaje môžu byť sprístupnené aj orgánu verejnej moci, ak to vyžaduje zákon. Osobné údaje nepredávame.</p>

      <h2>Prenosy mimo Európskeho hospodárskeho priestoru</h2>
      <p>Ak technický poskytovateľ spracúva údaje mimo EHP, prenos sa môže uskutočniť iba pri splnení podmienok kapitoly V GDPR, napríklad na základe rozhodnutia Európskej komisie o primeranosti alebo vhodných záruk.</p>

      <h2>Ako dlho údaje uchovávame</h2>
      <p>Údaje uchovávame iba počas obdobia potrebného na účel, na ktorý boli získané. Pri určovaní doby prihliadame na trvanie komunikácie, potrebu preveriť podnet, bezpečnostné potreby, zákonné povinnosti a ochranu právnych nárokov. Keď údaje už nepotrebujeme a nemáme iný právny dôvod na ich uchovanie, vymažeme ich alebo anonymizujeme.</p>

      <h2>Tvoje práva</h2>
      <p>Podľa okolností máš právo požiadať o prístup k údajom, opravu, vymazanie, obmedzenie spracúvania, prenosnosť údajov a namietať spracúvanie založené na oprávnenom záujme. Ak sa spracúvanie opiera o súhlas, môžeš ho kedykoľvek odvolať bez vplyvu na zákonnosť spracúvania pred odvolaním.</p>
      <p>Na žiadosť odpovieme bez zbytočného odkladu, spravidla najneskôr do jedného mesiaca. Pred vybavením môžeme primerane overiť totožnosť žiadateľa. Máš tiež právo podať návrh na začatie konania na <a href="https://dataprotection.gov.sk/sk/" target="_blank" rel="noreferrer">Úrade na ochranu osobných údajov SR</a>.</p>

      <h2>Automatizované rozhodovanie</h2>
      <p>Psipedia.sk nevykonáva automatizované individuálne rozhodovanie, ktoré by voči návštevníkovi vyvolávalo právne alebo obdobne významné účinky.</p>

      <h2>Zmeny týchto informácií</h2>
      <p>Text aktualizujeme pred spustením funkcie, ktorá významne mení účel alebo rozsah spracúvania osobných údajov, a pri zmene právnych alebo technických podmienok.</p>
      <p className="legal-updated">Aktualizované 12. septembra 2026.</p>
    </main>
  );
}
