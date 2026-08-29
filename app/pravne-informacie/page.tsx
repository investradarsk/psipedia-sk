import type { Metadata } from "next";
import Link from "next/link";
import { getLegalSettings, legalReadiness } from "@/lib/legal-settings";
import { EDITORIAL_EMAIL_ADDRESS } from "@/lib/public-contact";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildPageMetadata({
  title: "Právne informácie a prevádzkovateľ",
  description: "Povinné údaje prevádzkovateľa, dohľad a právny režim portálu Psipedia.sk.",
  path: "/pravne-informacie",
});

function valueOrPending(value: string) {
  return value || "Čaká na doplnenie prevádzkovateľom";
}

export default async function LegalInformationPage() {
  const settings = await getLegalSettings();
  const readiness = legalReadiness(settings);
  const publicName = settings.businessName || settings.legalName;
  const publicEmail = settings.email || EDITORIAL_EMAIL_ADDRESS;
  const correctionEmail = settings.correctionEmail || EDITORIAL_EMAIL_ADDRESS;
  const mediaStatus = settings.mediaStatus === "registered"
    ? `zapísaný${settings.mediaRegistryNumber ? `, evidenčné číslo ${settings.mediaRegistryNumber}` : ""}`
    : settings.mediaStatus === "submitted" ? "žiadosť o zápis bola podaná" : "zápis ešte nie je potvrdený";

  return (
    <main id="obsah" className="prose-page legal-page">
      <span className="eyebrow">Transparentnosť</span>
      <h1>Právne informácie</h1>
      <p className="lead">Tu nájdeš údaje o prevádzkovateľovi Psipedia.sk, kontakty a informácie o právnom režime portálu.</p>

      {!readiness.complete && <div className="legal-status-note"><strong>Pilotná prevádzka</strong><p>Časť povinných prevádzkovateľských a registračných údajov ešte čaká na potvrdenie. Pravidelná komerčná spravodajská prevádzka sa nemá spustiť skôr, než budú dokončené zákonné registrácie.</p></div>}

      <h2>Prevádzkovateľ</h2>
      <dl className="legal-data-list">
        <div><dt>Meno alebo názov</dt><dd>{valueOrPending(publicName)}</dd></div>
        <div><dt>Sídlo, miesto podnikania alebo bydlisko</dt><dd>{valueOrPending(settings.address)}</dd></div>
        {settings.ico && <div><dt>IČO</dt><dd>{settings.ico}</dd></div>}
        {settings.dic && <div><dt>DIČ</dt><dd>{settings.dic}</dd></div>}
        {settings.vatId && <div><dt>IČ DPH</dt><dd>{settings.vatId}</dd></div>}
        {(settings.registryName || settings.registryNumber) && <div><dt>Register a číslo zápisu</dt><dd>{[settings.registryName, settings.registryNumber].filter(Boolean).join(", ")}</dd></div>}
        <div><dt>E-mail</dt><dd><a href={`mailto:${publicEmail}`}>{publicEmail}</a></dd></div>
        <div><dt>Telefón</dt><dd>{settings.phone ? <a href={`tel:${settings.phone.replace(/\s/g, "")}`}>{settings.phone}</a> : valueOrPending("")}</dd></div>
      </dl>

      <h2>Spravodajský portál</h2>
      <p>Psipedia.sk pripravuje články a novinky zo sveta psov. Stav evidencie spravodajského webového portálu: <strong>{mediaStatus}</strong>.</p>
      <p>Žiadosti o uverejnenie opravy posielaj na adresu <a href={`mailto:${correctionEmail}`}>{correctionEmail}</a>. Podrobný postup je na stránke <Link href="/opravy-a-podnety">Opravy a podnety</Link>.</p>

      <h2>Dohľad</h2>
      <ul>
        <li>evidenciu periodických publikácií vedie <a href="https://www.culture.gov.sk/sk/evidencia-periodickych-publikacii" target="_blank" rel="noreferrer">Ministerstvo kultúry SR</a>,</li>
        <li>ochranu osobných údajov dozoruje <a href="https://dataprotection.gov.sk/sk/" target="_blank" rel="noreferrer">Úrad na ochranu osobných údajov SR</a>,</li>
        <li>povinnosti pri elektronických komunikáciách dozoruje <a href="https://www.teleoff.gov.sk/" target="_blank" rel="noreferrer">Úrad pre reguláciu elektronických komunikácií a poštových služieb</a>.</li>
      </ul>

      <h2>Obchodný model v pilotnej verzii</h2>
      <p>Psipedia.sk momentálne neprevádzkuje e-shop, neprijíma platby za produkty ani finančné príspevky určené útulkom. Pri overených zbierkach iba odkazuje na oficiálnu stránku organizátora. Platený, sponzorovaný alebo affiliate obsah musí byť pred spustením jasne označený a oddelený od redakčného obsahu.</p>

      <p className="legal-updated">Posledná právna revízia obsahu stránky: 17. augusta 2026.</p>
    </main>
  );
}
