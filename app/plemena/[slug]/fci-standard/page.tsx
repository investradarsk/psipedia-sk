import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFciGroup } from "@/lib/content";
import {
  publicBreedMeasurement,
  publicFciDate,
  publicFciSectionName,
  type FciStandard,
} from "@/lib/breed-fci";
import { textParagraphs } from "@/lib/breed-profile";
import { getPublishedBreed, type ManagedBreed } from "@/lib/breed-store";
import { serializeJsonLd, SITE_URL } from "@/lib/seo";
import {
  FciStandardAccordions,
  type FciAccordionGroup,
  type FciAccordionItem,
} from "./fci-standard-accordion";
import styles from "./fci-standard.module.css";

type Props = { params: Promise<{ slug: string }> };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  if (!breed) return {};

  // Conservative launch policy: keep the secondary standard page out of the
  // index until its duplicate-content/search-intent role is reviewed explicitly.
  return {
    title: `FCI štandard: ${breed.name} | Psipedia`,
    description: `Oficiálny FCI štandard plemena ${breed.name} prehľadne rozdelený podľa vzhľadu, stavby, srsti, rozmerov a chýb.`,
    robots: { index: false, follow: true },
  };
}

function textItem(label: string, value?: string): FciAccordionItem | null {
  const paragraphs = textParagraphs(value);
  return paragraphs.length ? { label, paragraphs } : null;
}

function group(
  id: string,
  title: string,
  items: Array<FciAccordionItem | null>,
): FciAccordionGroup | null {
  const available = items.filter((item): item is FciAccordionItem => Boolean(item));
  return available.length ? { id, title, items: available } : null;
}

export default async function BreedFciStandardPage({ params }: Props) {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  if (!breed) notFound();

  const managed = "id" in breed && typeof breed.id === "number" ? breed as ManagedBreed : null;
  const fci: FciStandard = managed?.fciStandard ?? {};
  const groupName = getFciGroup(breed.fciGroup)?.label || fci.fci_skupina_nazov || breed.group;
  const sectionNumber = managed?.fciSectionNumber?.trim() ?? "";
  const storedSectionName = (fci.fci_sekcia_nazov || breed.fciSection || "").trim();
  const sectionName = publicFciSectionName(
    breed.fciGroup,
    sectionNumber,
    storedSectionName && storedSectionName !== sectionNumber ? storedSectionName : "",
  );

  const dogHeight = publicBreedMeasurement(fci.vyska_pes_cm, "height");
  const bitchHeight = publicBreedMeasurement(fci.vyska_suka_cm, "height");
  const dogWeight = publicBreedMeasurement(fci.hmotnost_pes_kg, "weight");
  const bitchWeight = publicBreedMeasurement(fci.hmotnost_suka_kg, "weight");
  const dimensionNote = textParagraphs(fci.velkost_hmotnost_poznamka);

  const dogFacts = [
    { label: "Výška", value: dogHeight },
    { label: "Hmotnosť", value: dogWeight },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));
  const bitchFacts = [
    { label: "Výška", value: bitchHeight },
    { label: "Hmotnosť", value: bitchWeight },
  ].filter((fact): fact is { label: string; value: string } => Boolean(fact.value));

  const groups = [
    group("celkovy-vzhlad-a-povaha", "Celkový vzhľad a povaha", [
      textItem("Historický súhrn", fci.historicky_suhrn),
      textItem("Celkový vzhľad", fci.celkovy_vzhlad),
      textItem("Dôležité proporcie", fci.dolezite_proporcie),
      textItem("Povaha / temperament", fci.povaha_temperament),
    ]),
    group("hlava", "Hlava", [
      textItem("Lebková časť", fci.hlava_lebecna_cast),
      textItem("Tvárová časť", fci.hlava_tvarova_cast),
      textItem("Oči", fci.oci),
      textItem("Uši", fci.usi),
    ]),
    group("telo-a-stavba", "Telo a stavba", [
      textItem("Krk", fci.krk),
      textItem("Telo", fci.telo),
      textItem("Chvost", fci.chvost),
    ]),
    group("koncatiny-a-pohyb", "Končatiny a pohyb", [
      textItem("Predné končatiny", fci.predne_koncatiny),
      textItem("Zadné končatiny", fci.zadne_koncatiny),
      textItem("Pohyb", fci.pohyb),
    ]),
    group("srst-a-farba", "Srsť a farba", [
      textItem("Koža", fci.koza),
      textItem("Srsť", fci.srst),
      textItem("Farba", fci.farba),
    ]),
    group("vyska-a-hmotnost", "Výška a hmotnosť", [
      dogFacts.length ? { label: "Pes", facts: dogFacts } : null,
      bitchFacts.length ? { label: "Suka", facts: bitchFacts } : null,
      dimensionNote.length
        ? { label: "Poznámky k veľkosti a hmotnosti", paragraphs: dimensionNote }
        : null,
    ]),
    group("chyby", "Chyby", [
      textItem("Chyby", fci.chyby),
      textItem("Závažné chyby", fci.zavazne_chyby),
      textItem("Diskvalifikačné chyby", fci.diskvalifikacne_chyby),
      textItem("Chovateľská poznámka", fci.poznamka_chov),
    ]),
  ].filter((item): item is FciAccordionGroup => Boolean(item));

  const referenceFacts = [
    { label: "FCI číslo", value: managed?.fciNumber ? String(managed.fciNumber) : "" },
    { label: "Skupina", value: groupName ? `${breed.fciGroup}. ${groupName}` : String(breed.fciGroup) },
    { label: "Sekcia", value: [sectionNumber, sectionName].filter(Boolean).join(" · ") },
    { label: "Krajina pôvodu", value: breed.origin?.trim() ?? "" },
    { label: "Využitie", value: fci.vyuzitie?.trim() ?? "" },
    { label: "Pracovná skúška", value: managed?.workingTrial?.trim() ?? "" },
    { label: "Platný štandard", value: publicFciDate(managed?.validStandardDate) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  const officialLinks = [
    { label: "FCI nomenklatúra", href: fci.fci_nomenklatura_url },
    { label: "Oficiálny FCI štandard (PDF)", href: fci.fci_standard_pdf },
  ].filter((item): item is { label: string; href: string } => Boolean(item.href?.trim()));

  if (!managed?.fciNumber && !groups.length && !officialLinks.length) notFound();

  const canonicalPath = `/plemena/${breed.slug}/fci-standard`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${SITE_URL}${canonicalPath}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Plemená", item: `${SITE_URL}/plemena` },
      { "@type": "ListItem", position: 3, name: breed.name, item: `${SITE_URL}/plemena/${breed.slug}` },
      { "@type": "ListItem", position: 4, name: "FCI štandard", item: `${SITE_URL}${canonicalPath}` },
    ],
  };

  return (
    <main id="obsah" className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <div className={`shell ${styles.shell}`}>
        <nav className={`article-breadcrumbs ${styles.breadcrumbs}`} aria-label="Navigácia">
          <Link href="/">Domov</Link><span>/</span><Link href="/plemena">Plemená</Link><span>/</span>
          <Link href={`/plemena/${breed.slug}`}>{breed.name}</Link><span>/</span><span>FCI štandard</span>
        </nav>

        <header className={styles.referenceHeader}>
          <div className={styles.headerTop}>
            <div>
              <p className={styles.eyebrow}>Odborná referencia · FCI štandard</p>
              <h1>{breed.name}</h1>
              {managed?.officialFciName?.trim()
                ? <p className={styles.officialName}>{managed.officialFciName}</p>
                : null}
            </div>
            <Link href={`/plemena/${breed.slug}`} className={styles.backLink}>
              ← Späť na profil plemena
            </Link>
          </div>

          {referenceFacts.length ? (
            <dl className={styles.referenceFacts}>
              {referenceFacts.map((fact) => (
                <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
              ))}
            </dl>
          ) : null}

          {officialLinks.length ? (
            <div className={styles.officialLinks} aria-label="Oficiálne FCI zdroje">
              {officialLinks.map((item) => (
                <a href={item.href} key={item.href} target="_blank" rel="noreferrer">
                  {item.label} <span aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
          ) : null}
        </header>

        {groups.length ? (
          <>
            <div className={styles.standardIntro}>
              <p className={styles.eyebrow}>Štandard plemena</p>
              <h2>Oficiálny opis po tematických častiach</h2>
              <p>Jednotlivé časti sú zbalené pre rýchlejšie skenovanie. Otvorte iba to, čo práve potrebujete, alebo rozbaľte celý štandard naraz.</p>
            </div>
            <FciStandardAccordions groups={groups} />
          </>
        ) : null}
      </div>
    </main>
  );
}
