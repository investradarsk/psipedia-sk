import type { Metadata } from "next";
import Link from "next/link";
import { getLegalSettings } from "@/lib/legal-settings";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Ochrana osobných údajov",
  description: "Ako Psipedia.sk spracúva osobné údaje, na aké účely a aké práva majú dotknuté osoby.",
  path: "/sukromie",
});

export default async function PrivacyPage() {
  const settings = await getLegalSettings();
  const controllerName = settings.businessName || settings.legalName;
  const privacyEmail = settings.privacyEmail || settings.email;

  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Tvoje údaje</span>
      <h1>Ochrana osobných údajov</h1>
      <p className="lead">Psipedia.sk nevyžaduje registráciu bežných návštevníkov, nepredáva osobné údaje a nevytvára reklamné používateľské profily.</p>

      <h2>Prevádzkovateľ osobných údajov</h2>
      <p>Prevádzkovateľom je <strong>{controllerName}</strong>{settings.address ? `, ${settings.address}` : ". Adresa prevádzkovateľa čaká na doplnenie v právnych údajoch"}.</p>
      {privacyEmail ? <p>Kontakt pre otázky a uplatnenie práv: <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.</p> : <div className="legal-status-note"><strong>Kontakt čaká na aktiváciu</strong><p>E-mail pre žiadosti týkajúce sa osobných údajov ešte musí prevádzkovateľ doplniť v <Link href="/pravne-informacie">právnych informáciách</Link>.</p></div>}

      <h2>Aké údaje a prečo spracúvame</h2>
      <div className="privacy-purpose-list">
        <section><h3>Dopyty cez adresár</h3><p>Meno, e-mail, nepovinný telefón, údaje o psovi a správu spracúvame na vybavenie dopytu, jeho kontrolu a sprostredkovanie vybranému poskytovateľovi. Právnym základom sú kroky vykonané na žiadosť používateľa a oprávnený záujem na bezpečnom sprostredkovaní a predchádzaní zneužitiu.</p><p>Príjemcom môže byť konkrétny tréner, klub, útulok alebo iný poskytovateľ, ktorého používateľ kontaktoval. Vybavený dopyt vymažeme najneskôr po 6 mesiacoch; ostatné dopyty najneskôr po 12 mesiacoch.</p></section>
        <section><h3>Tipy pre redakciu</h3><p>Tému, názov, opis, zdroj, miesto a dátum udalosti spracúvame na preverenie tipu a prípravu redakčného obsahu. Meno a e-mail sú nepovinné a slúžia iba na doplnenie alebo overenie konkrétneho tipu. Právnym základom je oprávnený záujem na redakčnej činnosti, overovaní informácií a ochrane pred zneužitím.</p><p>Tip sa nezverejňuje automaticky a kontaktné údaje nezverejníme bez samostatného právneho dôvodu. Vybavené alebo odmietnuté tipy vymažeme najneskôr po 6 mesiacoch, ostatné najneskôr po 12 mesiacoch; dlhšie môžeme uchovať iba materiál potrebný na ochranu redakčného zdroja alebo právnych nárokov.</p></section>
        <section><h3>Hodnotenie užitočnosti článkov</h3><p>Pri odpovedi Áno alebo Nie uložíme adresu a názov článku, voľbu a prípadný nepovinný textový podnet. Nežiadame meno ani kontakt a k hodnoteniu neukladáme IP adresu. Údaje používame na zlepšovanie redakčného obsahu na základe oprávneného záujmu.</p></section>
        <section><h3>Profily v adresári a spolupráca</h3><p>Kontaktné a profesijné údaje poskytovateľov spracúvame na vytvorenie, overenie a správu profilu. Právnym základom je plnenie dohody alebo oprávnený záujem na prevádzke dôveryhodného adresára. Údaje uchovávame počas aktívneho profilu a nevyhnutnú dokumentáciu najviac 3 roky po jeho ukončení.</p></section>
        <section><h3>Redakčná administrácia</h3><p>Pri prihlásení oprávneného redaktora spracúvame jeho e-mail a zobrazované meno na kontrolu prístupu, evidenciu zmien a bezpečnosť. Právnym základom je oprávnený záujem prevádzkovateľa. Prístupové údaje spracúvame počas trvania oprávnenia a technické záznamy po dobu potrebnú na bezpečnosť.</p></section>
        <section><h3>Technická prevádzka a bezpečnosť</h3><p>Poskytovatelia hostingu a bezpečnostnej infraštruktúry môžu spracúvať IP adresu, čas požiadavky, typ zariadenia a technické záznamy, aby stránku doručili, chránili a diagnostikovali chyby. Právnym základom je oprávnený záujem na bezpečnej prevádzke. Doba uchovávania sa riadi nevyhnutnosťou a pravidlami technického poskytovateľa.</p></section>
      </div>

      <h2>Obľúbené články a cookies</h2>
      <p>Zoznam obľúbených sa ukladá iba do lokálneho úložiska tvojho prehliadača a neposiela sa do používateľského účtu. So súhlasom používame Google Analytics 4 na súhrnné meranie návštevnosti a interakcií; bez súhlasu sa analytika nenačíta. Nepoužívame Google Signals ani reklamné prispôsobovanie. Podrobnosti a možnosť zmeniť voľbu nájdeš na stránke <Link href="/cookies">Cookies a lokálne úložisko</Link>.</p>

      <h2>Komu môžu byť údaje sprístupnené</h2>
      <p>Údaje sprístupníme iba v nevyhnutnom rozsahu poskytovateľom hostingu, databázy, zabezpečenia a administratívnej autentifikácie; adresátovi konkrétneho dopytu; odbornému poradcovi viazanému mlčanlivosťou; alebo orgánu verejnej moci, ak to vyžaduje zákon. Údaje nepredávame.</p>

      <h2>Prenosy mimo Európskeho hospodárskeho priestoru</h2>
      <p>Ak technický poskytovateľ spracúva údaje mimo EHP, prenos sa môže uskutočniť iba pri splnení podmienok kapitoly V GDPR, napríklad na základe rozhodnutia Európskej komisie o primeranosti alebo štandardných zmluvných doložiek.</p>

      <h2>Tvoje práva</h2>
      <p>Podľa okolností máš právo požiadať o prístup k údajom, opravu, vymazanie, obmedzenie spracúvania, prenosnosť údajov a namietať spracúvanie založené na oprávnenom záujme. Ak sa spracúvanie opiera o súhlas, môžeš ho kedykoľvek odvolať bez vplyvu na zákonnosť pred odvolaním.</p>
      <p>Na žiadosť odpovieme bez zbytočného odkladu, spravidla najneskôr do jedného mesiaca. Pred vybavením môžeme primerane overiť totožnosť žiadateľa. Máš tiež právo podať návrh na začatie konania na <a href="https://dataprotection.gov.sk/sk/" target="_blank" rel="noreferrer">Úrade na ochranu osobných údajov SR</a>.</p>

      <h2>Povinnosť poskytnúť údaje</h2>
      <p>Údaje označené vo formulári ako povinné potrebujeme na vybavenie dopytu alebo preverenie tipu; bez nich službu nemusíme vedieť poskytnúť. Nepovinné údaje môžeš vynechať. Nevykonávame automatizované individuálne rozhodovanie ani profilovanie.</p>

      <h2>Zmeny týchto informácií</h2>
      <p>Text aktualizujeme pred spustením novej funkcie, ktorá mení účel alebo rozsah spracúvania, a pri zmene právnych alebo technických podmienok.</p>
      <p className="legal-updated">Aktualizované 24. augusta 2026.</p>
    </main>
  );
}
