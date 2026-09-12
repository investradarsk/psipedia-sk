import type { Metadata } from "next";
import Link from "next/link";
import { EDITORIAL_EMAIL_ADDRESS, PUBLIC_OPERATOR_ADDRESS, PUBLIC_OPERATOR_NAME } from "@/lib/public-contact";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Kontakt",
  description: "Kontakt na Psipedia.sk pre otázky, podnety, opravy a spoluprácu.",
  path: "/kontakt",
});

export default function ContactPage() {
  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Kontakt</span>
      <h1>Napíš nám</h1>
      <p className="lead">Psipedia.sk je slovenský odborný a informačný portál o psoch. Ak máš otázku, našiel si chybu alebo nám chceš poslať podnet, ozvi sa.</p>

      <div className="legal-contact-box">
        <strong>E-mail</strong>
        <a href={`mailto:${EDITORIAL_EMAIL_ADDRESS}`}>{EDITORIAL_EMAIL_ADDRESS}</a>
      </div>

      <h2>S čím sa môžeš ozvať</h2>
      <ul>
        <li>chyba alebo neaktuálny údaj na stránke,</li>
        <li>tip na článok, príbeh alebo zaujímavosť zo sveta psov,</li>
        <li>doplnenie služby, organizácie alebo podujatia,</li>
        <li>otázka k ochrane osobných údajov alebo cookies,</li>
        <li>návrh na spoluprácu.</li>
      </ul>

      <h2>Prevádzkovateľ</h2>
      <p><strong>{PUBLIC_OPERATOR_NAME}</strong><br />{PUBLIC_OPERATOR_ADDRESS}</p>
      <p>Ďalšie informácie nájdeš na stránke <Link href="/pravne-informacie">Prevádzkovateľ a právne informácie</Link>.</p>

      <h2>Ak ide o chybu v obsahu</h2>
      <p>Pošli nám odkaz na konkrétnu stránku a stručne napíš, čo máme preveriť. Postup nájdeš aj na stránke <Link href="/opravy-a-podnety">Opravy a podnety</Link>.</p>

      <h2>Ak ide o akútny problém so psom</h2>
      <p>Psipedia.sk nie je veterinárna pohotovosť ani tiesňová služba. Pri ohrození zdravia alebo života psa kontaktuj veterinára alebo príslušnú zložku pomoci.</p>
    </main>
  );
}
