import { PublicHeading } from "@/components/public-heading";
import type { Metadata } from "next";
import { UniversalPageHero } from "@/components/public-visual-system/universal-page-hero";
import Link from "next/link";
import { EDITORIAL_EMAIL_ADDRESS } from "@/lib/public-contact";
import { buildPageMetadata } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "Opravy a podnety",
  description: "Ako oznámiť chybu, neaktuálny údaj alebo poslať podnet portálu Psipedia.sk.",
  path: "/opravy-a-podnety",
});

export default function CorrectionsPage() {
  return (
    <main id="obsah">
      <UniversalPageHero
        variant="compact"
        eyebrow="Presnosť obsahu"
        title="Opravy a podnety"
        intro="Ak nájdeš chybný, neaktuálny alebo neúplný údaj, daj nám vedieť. Podnet preveríme a podľa výsledku obsah opravíme alebo doplníme."
      />
      <section className="prose-page legal-page">

      <PublicHeading role="section" as="h2">
        Čo nám môžeš nahlásiť
      </PublicHeading>
      <ul>
        <li>preklep alebo nefunkčný odkaz,</li>
        <li>nesprávny odborný údaj,</li>
        <li>zmenený termín alebo miesto podujatia,</li>
        <li>neaktuálny kontakt, otváracie hodiny alebo údaje služby,</li>
        <li>zmenu pri organizácii, útulku alebo inom profile,</li>
        <li>obsah, ktorý môže byť zavádzajúci alebo potrebuje doplniť zdroj.</li>
      </ul>

      <div className="legal-contact-box">
        <strong>Kontakt na opravy a podnety</strong>
        <a href={`mailto:${EDITORIAL_EMAIL_ADDRESS}`}>{EDITORIAL_EMAIL_ADDRESS}</a>
      </div>

      <PublicHeading role="section" as="h2">
        Čo uviesť v správe
      </PublicHeading>
      <p>
        Najviac nám pomôže, ak pošleš odkaz na konkrétnu stránku, označíš sporný údaj a stručne
        vysvetlíš, čo je podľa teba nesprávne alebo neaktuálne. Ak máš dôveryhodný zdroj, prilož aj
        odkaz naň.
      </p>

      <PublicHeading role="section" as="h2">
        Ako podnet spracujeme
      </PublicHeading>
      <p>
        Opravu obsahu nám môžeš nahlásiť aj bez Partner účtu. Podnet preveríme a podľa
        výsledku údaj opravíme alebo doplníme. Ak žiadaš o správu profilu v mene služby
        či organizácie, použiješ Partner účet a Psipedia overí tvoje oprávnenie.
      </p>

      <PublicHeading role="section" as="h2">
        Správa profilov cez Partner účet
      </PublicHeading>
      <p>
        Ak zastupuješ poskytovateľa služby alebo organizáciu, cez{" "}
        <Link href="/partner/registracia">Partner účet</Link> môžeš požiadať o správu profilu
        a po schválení navrhovať jeho úpravy. Pred zverejnením návrh kontroluje redakcia.
        Bežné oznámenie chyby zostáva dostupné aj bez registrácie.
      </p>
      <PublicHeading role="section" as="h2">
        Tip na príbeh alebo zaujímavosť
      </PublicHeading>
      <p>
        Ak nejde o opravu existujúceho obsahu, ale o nový príbeh, zaujímavosť, výskum alebo udalosť
        zo sveta psov, môžeš použiť stránku{" "}
        <Link href="/novinky/poslat-tip">Pošli tip Psipedii</Link>.
      </p>

      <PublicHeading role="section" as="h2">
        Súkromie
      </PublicHeading>
      <p>
        Do správy neposielaj viac osobných údajov, než je potrebné na preverenie podnetu.
        Podrobnosti o spracúvaní údajov sú na stránke{" "}
        <Link href="/sukromie">Ochrana osobných údajov</Link>.
      </p>

      <p className="legal-updated">Aktualizované 13. novembra 2026.</p>
      </section>
    </main>
  );
}
