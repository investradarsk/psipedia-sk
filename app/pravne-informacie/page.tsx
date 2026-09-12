import type { Metadata } from "next";
import Link from "next/link";
import { getLegalSettings } from "@/lib/legal-settings";
import {
  EDITORIAL_EMAIL_ADDRESS,
  PUBLIC_OPERATOR_ADDRESS,
  PUBLIC_OPERATOR_NAME,
  PUBLIC_OPERATOR_STATUS,
} from "@/lib/public-contact";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Prevádzkovateľ a právne informácie",
  description: "Údaje o prevádzkovateľovi a právnom režime odborného a informačného portálu Psipedia.sk.",
  path: "/pravne-informacie",
});

export default async function LegalInformationPage() {
  const settings = await getLegalSettings();
  const publicName = settings.businessName || settings.legalName || PUBLIC_OPERATOR_NAME;
  const publicAddress = settings.address || PUBLIC_OPERATOR_ADDRESS;
  const publicEmail = settings.email || EDITORIAL_EMAIL_ADDRESS;

  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Transparentnosť</span>
      <h1>Prevádzkovateľ a právne informácie</h1>
      <p className="lead">Psipedia.sk je slovenský odborný a informačný portál o psoch. Na tejto stránke nájdeš údaje o jeho prevádzkovateľovi a základné právne informácie.</p>

      <h2>Prevádzkovateľ</h2>
      <dl className="legal-data-list">
        <div><dt>Meno</dt><dd>{publicName}</dd></div>
        <div><dt>Adresa</dt><dd>{publicAddress}</dd></div>
        <div><dt>Postavenie</dt><dd>{settings.operatorType === "individual" ? PUBLIC_OPERATOR_STATUS : "prevádzkovateľ portálu"}</dd></div>
        {settings.ico && <div><dt>IČO</dt><dd>{settings.ico}</dd></div>}
        {settings.dic && <div><dt>DIČ</dt><dd>{settings.dic}</dd></div>}
        {settings.vatId && <div><dt>IČ DPH</dt><dd>{settings.vatId}</dd></div>}
        {(settings.registryName || settings.registryNumber) && <div><dt>Register a číslo zápisu</dt><dd>{[settings.registryName, settings.registryNumber].filter(Boolean).join(", ")}</dd></div>}
        <div><dt>E-mail</dt><dd><a href={`mailto:${publicEmail}`}>{publicEmail}</a></dd></div>
        {settings.phone && <div><dt>Telefón</dt><dd><a href={`tel:${settings.phone.replace(/\s/g, "")}`}>{settings.phone}</a></dd></div>}
      </dl>

      <h2>Charakter portálu</h2>
      <p>Psipedia.sk prináša najmä odborné a praktické články, databázu plemien, prehľad služieb a organizácií, podujatia a vybrané príbehy či zaujímavosti zo sveta psov. Nejde o internetový obchod a portál v súčasnosti nepredáva produkty ani neposkytuje platené používateľské účty.</p>

      <h2>Obsah a externé služby</h2>
      <p>Zverejnenie profilu služby, organizácie, podujatia alebo externého odkazu samo osebe neznamená odporúčanie ani garanciu kvality. Za svoju ponuku, odbornú spôsobilosť, aktuálnosť údajov a plnenie služby zodpovedá príslušný poskytovateľ alebo organizátor.</p>

      <h2>Opravy a podnety</h2>
      <p>Ak nájdeš nesprávny alebo neaktuálny údaj, napíš na <a href={`mailto:${EDITORIAL_EMAIL_ADDRESS}`}>{EDITORIAL_EMAIL_ADDRESS}</a> alebo použi postup na stránke <Link href="/opravy-a-podnety">Opravy a podnety</Link>.</p>

      <h2>Ochrana osobných údajov</h2>
      <p>Informácie o spracúvaní osobných údajov sú na stránke <Link href="/sukromie">Ochrana osobných údajov</Link>. Nastavenie analytiky a lokálneho úložiska je vysvetlené na stránke <Link href="/cookies">Cookies a lokálne úložisko</Link>.</p>

      <p className="legal-updated">Aktualizované 12. septembra 2026.</p>
    </main>
  );
}
