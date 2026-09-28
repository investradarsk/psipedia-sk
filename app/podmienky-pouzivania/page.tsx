import type { Metadata } from "next";
import Link from "next/link";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Podmienky používania",
  description: "Pravidlá používania portálu Psipedia.sk, zodpovednosť a práva k obsahu.",
  path: "/podmienky-pouzivania",
});

export default function TermsPage() {
  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Pravidlá portálu</span>
      <h1>Podmienky používania</h1>
      <p className="lead">Psipedia.sk je odborný a informačný portál o psoch. Používaním portálu berieš na vedomie tieto pravidlá.</p>

      <h2>Informačný charakter</h2>
      <p>Obsah slúži na všeobecné vzdelávanie a orientáciu. Nenahrádza veterinárne vyšetrenie, diagnózu, liečbu, individuálny tréningový plán ani právnu pomoc. Pri akútnom ohrození zdravia alebo života psa kontaktuj veterinára alebo príslušnú zložku pomoci.</p>

      <h2>Presnosť a aktuálnosť</h2>
      <p>Snažíme sa o presný a aktuálny obsah, no niektoré údaje sa môžu meniť, napríklad termíny podujatí, kontakty, ceny, ordinačné hodiny alebo podmienky poskytovateľov. Pred dôležitým rozhodnutím si aktuálny stav over aj u pôvodného poskytovateľa alebo organizátora.</p>
      <p>Ak nájdeš chybu alebo neaktuálny údaj, použi stránku <Link href="/opravy-a-podnety">Opravy a podnety</Link>.</p>

      <h2>Služby pre psov a adresár</h2>
      <p>Zaradenie veterinára, trénera, salónu, klubu, chovateľskej stanice, organizácie alebo iného subjektu do adresára samo osebe nepredstavuje odporúčanie, garanciu kvality ani potvrdenie odbornej spôsobilosti. Za svoju ponuku, oprávnenia, ceny, aktuálnosť údajov a plnenie služby zodpovedá konkrétny poskytovateľ.</p>

      <h2>Partner účet</h2>
      <p>Partner účet je pracovný účet pre osoby a organizácie, ktoré na Psipedia.sk spravujú alebo žiadajú o správu profilov služieb, organizácií alebo podujatí. Nie je určený ako bežný spotrebiteľský ani sociálny účet.</p>
      <p>Podľa aktuálne dostupných možností sa možno prihlásiť jednorazovým odkazom zaslaným e-mailom, heslom alebo cez Google. Používateľ zodpovedá za zabezpečenie svojho prístupu a za pravdivosť údajov, ktoré v Partner účte poskytne alebo navrhne.</p>
      <p>Vytvorenie Partner účtu samo osebe nezakladá právo spravovať konkrétny profil. O správu existujúceho profilu možno požiadať a Psipedia môže pred jej udelením primerane overiť oprávnenie žiadateľa. Rozsah správy sa riadi schváleným priradením k danému profilu alebo podujatiu.</p>
      <p>Partner môže navrhovať úpravy spravovaných profilov a podujatí a pri podporovaných typoch aj nový profil alebo nové podujatie. Návrhy sa nemusia zverejniť okamžite; Psipedia ich môže pred zverejnením preveriť, upraviť, odmietnuť alebo schváliť.</p>
      <p>Deaktivácia Partner účtu zablokuje ďalší prístup k účtu a zneplatní jeho aktívne prihlásenia. Sama osebe však nemaže verejné profily, služby, organizácie ani podujatia, ktoré existujú nezávisle od Partner účtu.</p>

      <h2>Podujatia</h2>
      <p>Informácie o podujatiach môžu pochádzať od organizátorov alebo z verejných zdrojov. Termín, miesto, podmienky účasti a prípadné zmeny alebo zrušenie si pred cestou over u organizátora.</p>

      <h2>Pomoc psom a zbierky</h2>
      <p>Ak Psipedia odkazuje na útulok, občianske združenie, zbierku alebo inú výzvu na pomoc, nejde automaticky o organizovanie zbierky zo strany Psipedia.sk. Ak nie je výslovne uvedené inak, pomoc alebo platba prebieha priamo prostredníctvom príslušnej organizácie. Pred poskytnutím peňazí si over identitu príjemcu a aktuálnosť výzvy.</p>

      <h2>Tipy a obsah od používateľov</h2>
      <p>Odosielateľ zodpovedá za to, že materiál, ktorý nám poskytne, môže oprávnene poskytnúť a že jeho odoslaním neporušuje práva iných osôb. Tip sa nezverejňuje automaticky a môže byť použitý najprv iba na interné preverenie.</p>
      <p>Neposielaj zbytočné osobné údaje, zdravotnú dokumentáciu ľudí, čísla dokladov, súkromnú korešpondenciu ani fotografie osôb bez primeraného oprávnenia.</p>

      <h2>Mapa Psipedie a Google Maps</h2>
      <p>Mapa Psipedie používa Google Maps iba ako voliteľný mapový podklad. Názvy subjektov, verejné lokality, filtre, zhluky a odkazy na profily pochádzajú z databázy Psipedie, nie z Google Places. Interaktívny Google mapový podklad sa načíta až po výslovnom povolení návštevníka.</p>
      <p>Používanie Google Maps podlieha <a href="https://maps.google.com/help/terms_maps/" target="_blank" rel="noreferrer">podmienkam Google Maps</a> a <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">zásadám ochrany súkromia Google</a>. Informácie o technickej voľbe nájdeš na stránke <Link href="/cookies">Cookies a lokálne úložisko</Link>.</p>

      <h2>Externé odkazy</h2>
      <p>Portál môže obsahovať odkazy na stránky tretích strán. Za ich obsah, dostupnosť, bezpečnosť, obchodné podmienky a spracúvanie osobných údajov zodpovedajú ich prevádzkovatelia.</p>

      <h2>Autorské práva</h2>
      <p>Pôvodné texty, fotografie, grafické prvky, databázové usporiadanie a ďalší obsah Psipedia.sk môžu byť chránené autorským právom a ďalšími právami duševného vlastníctva. Zdieľanie odkazu je vítané. Bez príslušného oprávnenia nie je dovolené systematicky preberať celé články, databázy, fotografie alebo podstatné časti obsahu a zverejňovať ich ako vlastné.</p>
      <p>Právo citovať v rozsahu dovolenom právnymi predpismi tým nie je dotknuté.</p>

      <h2>Reklama, affiliate odkazy a spolupráce</h2>
      <p>Ak portál v budúcnosti použije platenú spoluprácu, sponzorovaný obsah alebo affiliate odkaz, takýto komerčný prvok bude primerane a zrozumiteľne označený. Odmena alebo spolupráca nemá dávať partnerovi právo určovať odborný záver redakcie.</p>

      <h2>Ochrana osobných údajov</h2>
      <p>Pravidlá spracúvania osobných údajov nájdeš na stránke <Link href="/sukromie">Ochrana osobných údajov</Link>. Informácie o analytike, cookies a lokálnom úložisku sú na stránke <Link href="/cookies">Cookies a lokálne úložisko</Link>.</p>

      <h2>Záverečné ustanovenia</h2>
      <p>Na prevádzku portálu sa vzťahuje právny poriadok Slovenskej republiky a priamo uplatniteľné právo Európskej únie. Tým nie sú dotknuté práva, ktoré nemožno podľa zákona vylúčiť alebo obmedziť.</p>
      <p>Tieto podmienky môžeme aktualizovať najmä pri rozšírení funkcií portálu alebo zmene právnych povinností. Aktuálne znenie bude vždy dostupné na tejto adrese.</p>
      <p className="legal-updated">Aktualizované 24. septembra 2026.</p>
    </main>
  );
}
