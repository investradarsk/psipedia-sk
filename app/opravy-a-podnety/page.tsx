import type { Metadata } from "next";
import Link from "next/link";
import { getLegalSettings } from "@/lib/legal-settings";
import { EDITORIAL_EMAIL_ADDRESS } from "@/lib/public-contact";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Opravy a podnety",
  description: "Ako oznámiť chybu alebo požiadať Psipedia.sk o uverejnenie opravy.",
  path: "/opravy-a-podnety",
});

export default async function CorrectionsPage() {
  const settings = await getLegalSettings();
  const correctionEmail = settings.correctionEmail || EDITORIAL_EMAIL_ADDRESS;
  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Zodpovedná redakcia</span>
      <h1>Opravy a podnety</h1>
      <p className="lead">Vecnú chybu chceme opraviť rýchlo. Zákonná žiadosť o opravu má presné náležitosti a lehoty.</p>

      <h2>Bežná chyba alebo doplnenie</h2>
      <p>Ak ide o preklep, nefunkčný odkaz, zmenu termínu podujatia alebo odborné doplnenie, pošli nám <Link href="/novinky/poslat-tip">tip pre redakciu</Link>. Uveď adresu stránky a čo treba preveriť.</p>

      <h2>Žiadosť o uverejnenie opravy</h2>
      <p>Ak bolo uverejnené nepravdivé alebo neúplné skutkové tvrdenie, ktoré zasahuje do cti, dôstojnosti, súkromia alebo dobrej povesti presne určiteľnej osoby, žiadosť treba doručiť do 30 dní od uverejnenia.</p>
      <p>Písomná žiadosť má obsahovať:</p>
      <ul>
        <li>odkaz alebo inú presnú identifikáciu článku,</li>
        <li>označenie sporného skutkového tvrdenia,</li>
        <li>vysvetlenie, v čom je tvrdenie nepravdivé alebo neúplné a ako zasahuje do práv žiadateľa,</li>
        <li>pravdivé alebo úplné skutkové tvrdenie a návrh znenia opravy.</li>
      </ul>
      <div className="legal-contact-box"><strong>Kontakt na opravy</strong><a href={`mailto:${correctionEmail}`}>{correctionEmail}</a></div>

      <h2>Dodatočné oznámenie</h2>
      <p>Osoba, o ktorej portál informoval v súvislosti s konaním pred orgánom verejnej moci, môže po jeho právoplatnom skončení požiadať o uverejnenie konečného výsledku. Žiadosť sa doručuje do 30 dní od právoplatnosti rozhodnutia a musí identifikovať článok, konanie a jeho konečný výsledok.</p>

      <h2>Ochrana zdroja</h2>
      <p>Ak žiadaš utajenie totožnosti ako zdroj redakčnej informácie, uveď to už pri prvom kontakte a neposielaj viac identifikačných údajov, než je nevyhnutné. Bežný webový formulár nie je tiesňová ani šifrovaná komunikačná služba.</p>

      <p>Právny rámec: <a href="https://static.slov-lex.sk/static/SK/ZZ/2022/265/20251101.html" target="_blank" rel="noreferrer">zákon č. 265/2022 Z. z. o publikáciách</a>.</p>
    </main>
  );
}
