import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFciGroup } from "@/lib/content";
import { publicBreedMeasurement, publicFciDate, publicFciSectionName, type FciStandard } from "@/lib/breed-fci";
import { getPublishedBreed, type ManagedBreed } from "@/lib/breed-store";
import { textParagraphs } from "@/lib/breed-profile-next";
import styles from "../breed-profile-next.module.css";

type Props = { params: Promise<{ slug: string }> };
type StandardItem = { label?: string; paragraphs: string[] };
type StandardSection = { id: string; title: string; items: StandardItem[] };

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  return {
    title: breed ? `FCI štandard: ${breed.name} (preview) | Psipedia` : "FCI štandard plemena (preview) | Psipedia",
    robots: { index: false, follow: false },
  };
}

function section(id: string, title: string, values: Array<[string | undefined, string | undefined]>): StandardSection | null {
  const items = values
    .map(([label, value]) => ({ label, paragraphs: textParagraphs(value) }))
    .filter((item) => item.paragraphs.length > 0);
  return items.length ? { id, title, items } : null;
}

export default async function BreedFciStandardPreviewPage({ params }: Props) {
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

  const sections = [
    section("celkovy-vzhlad", "Celkový vzhľad", [[undefined, fci.celkovy_vzhlad]]),
    section("proporcie", "Dôležité proporcie", [[undefined, fci.dolezite_proporcie]]),
    section("temperament", "Povaha a temperament", [[undefined, fci.povaha_temperament]]),
    section("hlava", "Hlava", [["Lebečná časť", fci.hlava_lebecna_cast], ["Tvárová časť", fci.hlava_tvarova_cast]]),
    section("oci", "Oči", [[undefined, fci.oci]]),
    section("usi", "Uši", [[undefined, fci.usi]]),
    section("krk", "Krk", [[undefined, fci.krk]]),
    section("telo", "Telo", [[undefined, fci.telo]]),
    section("chvost", "Chvost", [[undefined, fci.chvost]]),
    section("predne-koncatiny", "Predné končatiny", [[undefined, fci.predne_koncatiny]]),
    section("zadne-koncatiny", "Zadné končatiny", [[undefined, fci.zadne_koncatiny]]),
    section("pohyb", "Pohyb", [[undefined, fci.pohyb]]),
    section("koza", "Koža", [[undefined, fci.koza]]),
    section("srst", "Srsť", [[undefined, fci.srst]]),
    section("farba", "Farba", [[undefined, fci.farba]]),
    section("chyby", "Chyby", [[undefined, fci.chyby]]),
    section("zavazne-chyby", "Závažné chyby", [[undefined, fci.zavazne_chyby]]),
    section("diskvalifikacne-chyby", "Diskvalifikačné chyby", [[undefined, fci.diskvalifikacne_chyby]]),
    section("chovatelska-poznamka", "Chovateľská poznámka", [[undefined, fci.poznamka_chov]]),
  ].filter((item): item is StandardSection => Boolean(item));

  const dimensions = [
    { label: "Výška psa", value: dogHeight },
    { label: "Výška suky", value: bitchHeight },
    { label: "Hmotnosť psa", value: dogWeight },
    { label: "Hmotnosť suky", value: bitchWeight },
  ].filter((item) => Boolean(item.value));
  const dimensionNote = textParagraphs(fci.velkost_hmotnost_poznamka);
  const hasDimensions = dimensions.length > 0 || dimensionNote.length > 0;

  const referenceFacts = [
    { label: "FCI číslo", value: managed?.fciNumber ? String(managed.fciNumber) : "" },
    { label: "Skupina", value: groupName ? `${breed.fciGroup}. ${groupName}` : String(breed.fciGroup) },
    { label: "Sekcia", value: [sectionNumber, sectionName].filter(Boolean).join(" · ") },
    { label: "Krajina pôvodu", value: breed.origin?.trim() ?? "" },
    { label: "Využitie", value: fci.vyuzitie?.trim() ?? "" },
    { label: "Pracovná skúška", value: managed?.workingTrial?.trim() ?? "" },
    { label: "Platný štandard", value: publicFciDate(managed?.validStandardDate) },
  ].filter((item) => Boolean(item.value));

  const officialLinks = [
    { label: "FCI nomenklatúra", href: fci.fci_nomenklatura_url },
    { label: "Oficiálny FCI štandard (PDF)", href: fci.fci_standard_pdf },
  ].filter((item): item is { label: string; href: string } => Boolean(item.href?.trim()));

  if (!managed?.fciNumber && !sections.length && !hasDimensions && !officialLinks.length) notFound();

  return (
    <main id="obsah" className={`${styles.page} ${styles.standardPage}`}>
      <div className={`shell ${styles.shell}`}>
        <nav className={`article-breadcrumbs ${styles.breadcrumbs}`} aria-label="Navigácia">
          <Link href="/">Domov</Link><span>/</span><Link href="/plemena">Plemená</Link><span>/</span>
          <Link href={`/preview/breed-profile-next/${breed.slug}`}>{breed.name}</Link><span>/</span><span>FCI štandard</span>
        </nav>

        <header className={styles.standardHero}>
          <p className={styles.eyebrow}>Odborná referencia</p>
          <h1>FCI štandard: {breed.name}</h1>
          {managed?.officialFciName?.trim() ? <p className={styles.standardOfficialName}>{managed.officialFciName}</p> : null}
          <p className={styles.standardLead}>Štruktúrované znenie oficiálneho štandardu plemena. Zobrazujeme iba údaje, ktoré sú v aktuálnom dátovom modeli Psipedie dostupné.</p>
          <Link href={`/preview/breed-profile-next/${breed.slug}`} className={styles.backLink}>← Späť na profil plemena</Link>
        </header>

        {referenceFacts.length ? <dl className={styles.standardFacts}>{referenceFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null}

        {(sections.length || hasDimensions) ? (
          <nav className={styles.standardNav} aria-label="Obsah FCI štandardu">
            <strong>Obsah</strong>
            <div>
              {sections.map((item) => <a key={item.id} href={`#${item.id}`}>{item.title}</a>)}
              {hasDimensions ? <a href="#vyska-hmotnost">Výška a hmotnosť</a> : null}
            </div>
          </nav>
        ) : null}

        <article className={styles.standardArticle}>
          {sections.map((item) => (
            <section key={item.id} id={item.id} className={styles.standardSection}>
              <h2>{item.title}</h2>
              {item.items.map((entry, index) => (
                <div className={styles.standardSubsection} key={`${item.id}-${entry.label ?? index}`}>
                  {entry.label ? <h3>{entry.label}</h3> : null}
                  <div className={styles.prose}>{entry.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
                </div>
              ))}
            </section>
          ))}

          {hasDimensions ? (
            <section id="vyska-hmotnost" className={styles.standardSection}>
              <h2>Výška a hmotnosť</h2>
              {dimensions.length ? <dl className={styles.dimensionList}>{dimensions.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl> : null}
              {dimensionNote.length ? <div className={styles.prose}>{dimensionNote.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div> : null}
            </section>
          ) : null}
        </article>

        {officialLinks.length ? (
          <aside className={styles.officialSources} aria-labelledby="official-fci-sources">
            <p className={styles.eyebrow}>Oficiálny zdroj</p>
            <h2 id="official-fci-sources">Dokumenty FCI</h2>
            <div>{officialLinks.map((item) => <a href={item.href} key={item.href} target="_blank" rel="noreferrer">{item.label} <span aria-hidden="true">↗</span></a>)}</div>
          </aside>
        ) : null}
      </div>
    </main>
  );
}
