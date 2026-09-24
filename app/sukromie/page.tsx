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
          <h3>Partner účet a správa profilov</h3>
          <p>Pri Partner účte spracúvame e-mail účtu, stav účtu, meno kontaktnej osoby, voliteľný telefón a voliteľnú informáciu o úlohe alebo vzťahu k spravovanému profilu. Podľa používaných funkcií spracúvame aj údaje o spôsoboch prihlásenia, prihláseniach a bezpečnostných udalostiach, žiadostiach o správu profilov, navrhovaných zmenách, nových profiloch alebo podujatiach a ich histórii. Ak Partner využíva obchodné funkcie, evidujeme aj súvisiace žiadosti a stav dohôd.</p>
          <p>Tieto údaje používame na vytvorenie a zabezpečenie Partner účtu, overenie prístupu, vybavenie žiadostí o správu, kontrolu navrhovaných zmien a komunikáciu o stave Partner účtu a jeho podaní. Vytvorenie účtu samo osebe neznamená automatické právo spravovať konkrétny profil.</p>
          <p>Ak si Partner nastaví heslo, neuchovávame ho v čitateľnej podobe. Systém uchováva iba bezpečne odvodený údaj potrebný na overenie hesla.</p>
        </section>

        <section>
          <h3>Prihlásenie cez Google</h3>
          <p>Ak použiješ prihlásenie alebo prepojenie cez Google, Psipedia po úspešnom overení použije identifikátor potrebný na bezpečné rozpoznanie toho istého Google účtu a overenú e-mailovú adresu. Tieto údaje slúžia na prihlásenie, vytvorenie Partner účtu alebo jeho prepojenie s existujúcim Partner účtom.</p>
          <p>Google heslo Psipedia nedostáva. Prihlasovací proces môže sprístupniť aj základné profilové údaje Google účtu, aktuálna implementácia ich však trvalo neukladá ani nepoužíva na vytvorenie profilu Partnera. Psipedia podľa aktuálneho fungovania trvalo neuchováva ani údaje, ktoré by jej umožnili dlhodobý prístup k Google účtu.</p>
          <p>Ak už rovnaká e-mailová adresa patrí existujúcemu Partner účtu, samotná zhoda e-mailu nestačí na automatické prepojenie. Prepojenie Google identity s existujúcim Partner účtom vyžaduje osobitné potvrdenie v prihlásenom účte.</p>
        </section>

        <section>
          <h3>Bezpečnostné overenie Partner účtu</h3>
          <p>Pri registračných, prihlasovacích a vybraných bezpečnostných úkonoch používame Cloudflare Turnstile na ochranu formulárov a účtov pred automatizovaným zneužitím. Cloudflare pri poskytnutí tejto bezpečnostnej služby môže spracúvať technické údaje potrebné na vyhodnotenie požiadavky a ochranu služby.</p>
        </section>

        <section>
          <h3>E-maily Partner účtu</h3>
          <p>Partner účet používa e-mailové správy napríklad na jednorazové prihlasovacie odkazy, obnovenie hesla a dôležité oznámenia o žiadostiach, zmenách alebo stave účtu. Na doručenie používame poskytovateľa e-mailovej služby, ktorému sprístupníme e-mailovú adresu príjemcu a obsah potrebný na odoslanie konkrétnej správy.</p>
        </section>
      </div>

      <h2>Google Analytics 4</h2>
      <p>Google Analytics 4 používame iba po výslovnom súhlase návštevníka. Pred udelením súhlasu sa analytický skript nenačíta. Psipedia má vypnuté Google Signals aj reklamné personalizačné signály.</p>
      <p>Pri povolenej analytike môžu byť spracované údaje o navštívených stránkach, čase návštevy, zariadení, prehliadači, približnej geografickej oblasti a interakciách. Súhlas môžeš kedykoľvek zmeniť cez <strong>Nastavenia cookies</strong> v pätičke.</p>

      <h2>Google Maps</h2>
      <p>Na stránke Mapa Psipedie používame interaktívny mapový podklad Google Maps od spoločnosti Google až po samostatnom výslovnom povolení návštevníka. Bez tohto povolenia sa Google Maps skript nenačíta a mapa zostáva použiteľná ako textový zoznam verejných výsledkov.</p>
      <p>Po povolení môže Google pri poskytovaní mapy spracúvať technické údaje, najmä IP adresu, údaje o prehliadači a súradnice zobrazovanej mapovej oblasti. Psipedia neposkytuje Google súkromné adresy z geo moderácie, nepoužíva Google Places ani browser geocoding a nežiada browser geolocation.</p>
      <p>Podrobnosti o voľbe a jej odvolaní sú na stránke <Link href="/cookies">Cookies a lokálne úložisko</Link>. Používanie mapového podkladu podlieha aj <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">podmienkam Google Maps</a> a <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">zásadám ochrany súkromia Google</a>.</p>

      <h2>Obľúbené články a lokálne úložisko</h2>
      <p>Zoznam obľúbených článkov a voľba týkajúca sa analytiky sa ukladajú lokálne v prehliadači. Zoznam obľúbených nie je používateľský účet a samotný zoznam Psipedia neposiela na server. Podrobnosti sú na stránke <Link href="/cookies">Cookies a lokálne úložisko</Link>.</p>

      <h2>Komu môžu byť údaje sprístupnené</h2>
      <p>Údaje môžu byť v nevyhnutnom rozsahu sprístupnené poskytovateľom hostingu, databázy a bezpečnostnej infraštruktúry, poskytovateľovi e-mailovej služby pri e-mailovej komunikácii, spoločnosti Google pri použití Google prihlásenia, povolenej analytike alebo samostatne povolenom mapovom podklade Google Maps a spoločnosti Cloudflare pri bezpečnostnom overení Turnstile. Údaje môžu byť sprístupnené aj orgánu verejnej moci, ak to vyžaduje zákon. Osobné údaje nepredávame.</p>

      <h2>Prenosy mimo Európskeho hospodárskeho priestoru</h2>
      <p>Ak technický poskytovateľ spracúva údaje mimo EHP, prenos sa môže uskutočniť iba pri splnení podmienok kapitoly V GDPR, napríklad na základe rozhodnutia Európskej komisie o primeranosti alebo vhodných záruk.</p>

      <h2>Ako dlho údaje uchovávame</h2>
      <p>Údaje uchovávame iba počas obdobia potrebného na účel, na ktorý boli získané. Pri určovaní doby prihliadame na trvanie komunikácie, potrebu preveriť podnet, bezpečnostné potreby, zákonné povinnosti a ochranu právnych nárokov. Keď údaje už nepotrebujeme a nemáme iný právny dôvod na ich uchovanie, vymažeme ich alebo anonymizujeme.</p>
      <p>Deaktiváciou Partner účtu sa zablokuje ďalšie prihlásenie a zneplatnia sa aktívne prihlásenia a nepoužité prihlasovacie odkazy. Verejné profily, služby, organizácie alebo podujatia sa tým automaticky nemažú. Údaje a história Partner účtu sa pri deaktivácii nemažú automaticky v tom istom okamihu; ich ďalšie uchovanie sa riadi nevyhnutnosťou na účely správy účtu, bezpečnosti a evidencie vykonaných úkonov.</p>

      <h2>Tvoje práva</h2>
      <p>Podľa okolností máš právo požiadať o prístup k údajom, opravu, vymazanie, obmedzenie spracúvania, prenosnosť údajov a namietať spracúvanie založené na oprávnenom záujme. Ak sa spracúvanie opiera o súhlas, môžeš ho kedykoľvek odvolať bez vplyvu na zákonnosť spracúvania pred odvolaním.</p>
      <p>Na žiadosť odpovieme bez zbytočného odkladu, spravidla najneskôr do jedného mesiaca. Pred vybavením môžeme primerane overiť totožnosť žiadateľa. Máš tiež právo podať návrh na začatie konania na <a href="https://dataprotection.gov.sk/sk/" target="_blank" rel="noreferrer">Úrade na ochranu osobných údajov SR</a>.</p>

      <h2>Automatizované rozhodovanie</h2>
      <p>Psipedia.sk nevykonáva automatizované individuálne rozhodovanie, ktoré by voči návštevníkovi vyvolávalo právne alebo obdobne významné účinky.</p>

      <h2>Zmeny týchto informácií</h2>
      <p>Text aktualizujeme pred spustením funkcie, ktorá významne mení účel alebo rozsah spracúvania osobných údajov, a pri zmene právnych alebo technických podmienok.</p>
      <p className="legal-updated">Aktualizované 24. septembra 2026.</p>
    </main>
  );
}
