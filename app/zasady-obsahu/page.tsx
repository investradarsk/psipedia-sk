import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Zásady obsahu",
  description: "Ako na Psipedia.sk pripravujeme a označujeme obsah.",
  alternates: { canonical: "/zasady-obsahu" },
};

export default function EditorialPolicyPage() {
  return (
    <main id="obsah" className="prose-page">
      <span className="eyebrow">Transparentnosť</span>
      <h1>Zásady obsahu</h1>
      <p className="lead">Dôvera sa nedá postaviť iba pekným dizajnom. Preto otvorene uvádzame, čo môže čitateľ od textov Psipedia.sk očakávať.</p>

      <h2>Praktické, ale nie univerzálne</h2>
      <p>Každý pes má inú históriu, zdravie a temperament. Všeobecný návod preto opisujeme ako východisko, nie ako záruku výsledku. Pri správaní, ktoré predstavuje riziko, odporúčame osobnú pomoc kvalifikovaného odborníka.</p>

      <h2>Zdravotné hranice</h2>
      <p>Články o zdraví slúžia na orientáciu a včasné rozpoznanie rizika. Nenahrádzajú diagnózu, vyšetrenie ani liečbu. Pri urgentných príznakoch vždy smerujeme čitateľa k veterinárnej pomoci.</p>

      <h2>Opravy a aktualizácie</h2>
      <p>Ak zistíme vecnú chybu alebo sa odporúčania zmenia, text upravíme. Pri článkoch uvádzame dátum publikovania aj poslednej aktualizácie a pripájame odkazy na odborné zdroje, z ktorých obsah vychádza. Formálny postup pre zákonné žiadosti je na stránke <Link href="/opravy-a-podnety">Opravy a podnety</Link>.</p>

      <h2>Komerčný obsah</h2>
      <p>Platená spolupráca, sponzorovanie, bezplatne poskytnutý produkt aj affiliate odkaz musia byť jasne označené a ľahko odlíšiteľné od redakčného obsahu. Partner si nebude môcť kúpiť pozitívny odborný záver ani ovplyvniť odporúčanie, ktoré súvisí so zdravím alebo bezpečnosťou psa.</p>

      <h2>Umelá inteligencia</h2>
      <p>Technológia umelej inteligencie môže pomôcť s návrhom štruktúry, jazykovou úpravou alebo pracovným súhrnom. Nie je sama osebe odborným zdrojom. Pred publikovaním musí zodpovedná osoba overiť skutkové tvrdenia, zdroje, dátumy, mená a zdravotné odporúčania. Syntetický obraz alebo iný materiál, ktorý by si čitateľ mohol pomýliť s dokumentárnym záznamom skutočnej udalosti, musí byť zreteľne označený.</p>

      <h2>Obrázky a súkromie</h2>
      <p>Zverejňujeme iba materiály, na ktoré máme oprávnenie, alebo ktoré možno použiť na základe zákona. Pri zásahoch, týraní, nehodách a zdravotných prípadoch chránime identitu ľudí, citlivé údaje a dôstojnosť zobrazených osôb. Fotografia nesmie ohroziť prebiehajúcu záchranu ani vyšetrovanie.</p>

      <h2>Tipy od čitateľov</h2>
      <p>Odoslaný tip je námet, nie automaticky zverejnená správa. Pred publikovaním hľadáme pôvodný zdroj, overujeme dátum a miesto a pri citlivých prípadoch chránime súkromie ľudí aj bezpečnosť zvierat. Ak sa podstatné tvrdenie nedá overiť, tip nezverejníme.</p>

      <h2>Zbierky a pomoc psom</h2>
      <p>Výzvu na finančnú pomoc zverejníme iba po primeranom preverení organizátora, príjemcu a účelu. Peniaze v pilotnej verzii nejdú cez Psipediu; odkaz vedie na oficiálnu stránku organizátora. Pri zmene alebo ukončení výzvy údaj aktualizujeme.</p>
    </main>
  );
}
