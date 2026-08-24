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
      <p className="lead">Používaním Psipedia.sk berieš na vedomie tieto pravidlá. Ich cieľom je chrániť čitateľov, zvieratá, autorov aj ľudí, ktorých sa obsah týka.</p>

      <h2>Informačný charakter</h2>
      <p>Obsah je určený na všeobecné vzdelávanie a orientáciu. Nenahrádza veterinárne vyšetrenie, diagnózu, liečbu, individuálny tréningový plán ani právnu pomoc. Pri ohrození života alebo zdravia psa kontaktuj veterinára alebo príslušnú tiesňovú službu.</p>

      <h2>Presnosť a aktuálnosť</h2>
      <p>Usilujeme sa o presný a aktuálny obsah, no nemôžeme zaručiť, že každý údaj zostane bez zmeny. Pri článkoch uvádzame dátum zverejnenia a aktualizácie. Chyby a neúplné skutkové tvrdenia riešime podľa postupu <Link href="/opravy-a-podnety">Opravy a podnety</Link>.</p>

      <h2>Adresár, podujatia a externé služby</h2>
      <p>Zverejnenie profilu, podujatia alebo odkazu nie je automaticky odporúčaním ani zárukou kvality. Za ponuku, odbornú spôsobilosť, cenu, dostupnosť a plnenie služby zodpovedá jej poskytovateľ. Pred objednaním si over aktuálne podmienky priamo u neho.</p>

      <h2>Pomoc psom a zbierky</h2>
      <p>Psipedia v pilotnej verzii neprijíma peniaze pre útulky ani neorganizuje vlastnú verejnú zbierku. Pri výzvach smeruje návštevníka na oficiálnu stránku overenej organizácie. Pred platbou si vždy skontroluj príjemcu, účel a aktuálnosť výzvy.</p>

      <h2>Tipy a obsah od používateľov</h2>
      <p>Odosielateľ zodpovedá za to, že tip, text, fotografia alebo odkaz neporušuje práva iných osôb a že má oprávnenie materiál poskytnúť. Odoslaním dáva Psipedii nevýhradné a bezodplatné oprávnenie materiál preveriť, redakčne spracovať a po dohode použiť na portáli. Tip sa nezverejňuje automaticky.</p>
      <p>Neposielaj zbytočné osobné údaje, zdravotnú dokumentáciu ľudí, čísla dokladov, súkromnú korešpondenciu ani fotografie osôb bez primeraného právneho dôvodu. Nepravdivý, nezákonný, výhražný alebo autorské práva porušujúci obsah môžeme odmietnuť alebo odstrániť.</p>

      <h2>Autorské práva</h2>
      <p>Texty, štruktúra, grafika a pôvodné fotografie sú chránené autorským právom. Bežné zdieľanie odkazu je vítané. Kopírovanie celého článku, databázy alebo fotografie na iný web bez súhlasu nie je dovolené. Krátka citácia musí uvádzať autora alebo Psipedia.sk a odkaz na pôvodný článok.</p>

      <h2>Reklama a affiliate odkazy</h2>
      <p>Ak bude článok platený, sponzorovaný alebo bude obsahovať affiliate odkazy, označíme to viditeľne pri článku. Partner nemá právo kúpiť si pozitívny odborný záver.</p>

      <h2>Záverečné ustanovenia</h2>
      <p>Na používanie portálu sa vzťahuje právo Slovenskej republiky a priamo uplatniteľné právo Európskej únie. Tieto podmienky môžeme primerane meniť pri rozšírení funkcií alebo zmene právnych povinností; aktuálne znenie bude vždy na tejto adrese.</p>
      <p className="legal-updated">Účinné od 17. augusta 2026.</p>
    </main>
  );
}
