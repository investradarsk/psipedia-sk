import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BreedPhoto } from "@/components/breed-photo";
import { getFciGroup } from "@/lib/content";
import {
  combinedFciMeasurement,
  publicBreedMeasurement,
  publicFciDate,
  publicFciSectionName,
  type FciStandard,
} from "@/lib/breed-fci";
import { getPublishedBreed, type BreedEditorial, type ManagedBreed } from "@/lib/breed-store";
import { normalizeBreedSports, textParagraphs } from "@/lib/breed-profile-next";
import { BreedProfileNextAccordion } from "./breed-profile-next-accordion";
import styles from "./breed-profile-next.module.css";

type Props = { params: Promise<{ slug: string }> };

type AccordionItem = {
  key: string;
  title: string;
  eyebrow: string;
  paragraphs: string[];
  tip?: string;
  risks?: string[];
  sports?: ReturnType<typeof normalizeBreedSports>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  return {
    title: breed ? `${breed.name} – nový profil plemena (preview) | Psipedia` : "Preview profilu plemena | Psipedia",
    robots: { index: false, follow: false },
  };
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (typeof value !== "string") return [];
    const text = value.trim();
    const key = text.toLocaleLowerCase("sk");
    if (!text || seen.has(key)) return [];
    seen.add(key);
    return [text];
  });
}

function ReadingText({ paragraphs }: { paragraphs: string[] }) {
  return <>{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</>;
}

export default async function BreedProfileNextPage({ params }: Props) {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  if (!breed) notFound();

  const managed = "id" in breed && typeof breed.id === "number" ? breed as ManagedBreed : null;
  const editorial: BreedEditorial = managed?.editorial ?? {};
  const fci: FciStandard = managed?.fciStandard ?? {};
  const sports = normalizeBreedSports(managed?.sports ?? []);
  const healthRisks = cleanList(breed.healthRisks);
  const goodFor = cleanList(breed.goodFor);
  const consider = cleanList(breed.consider);

  const fciDogHeight = publicBreedMeasurement(fci.vyska_pes_cm, "height");
  const fciBitchHeight = publicBreedMeasurement(fci.vyska_suka_cm, "height");
  const fciDogWeight = publicBreedMeasurement(fci.hmotnost_pes_kg, "weight");
  const fciBitchWeight = publicBreedMeasurement(fci.hmotnost_suka_kg, "weight");
  const height = publicBreedMeasurement(
    breed.height,
    "height",
    combinedFciMeasurement([fciDogHeight, fciBitchHeight], "cm"),
  );
  const weight = publicBreedMeasurement(
    breed.weight,
    "weight",
    combinedFciMeasurement([fciDogWeight, fciBitchWeight], "kg"),
  );
  const lifespan = publicBreedMeasurement(breed.lifespan, "lifespan");
  const use = fci.vyuzitie?.trim() ?? "";
  const workingTrial = managed?.workingTrial?.trim() ?? "";

  const quickFacts = [
    { label: "Pôvod", value: breed.origin?.trim() },
    { label: "Výška", value: height },
    { label: "Hmotnosť", value: weight },
    { label: "Dĺžka života", value: lifespan },
    { label: "Využitie", value: use },
    { label: "Pracovná skúška", value: workingTrial },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));

  const overviewParagraphs = textParagraphs(editorial.overview, breed.character);
  const accordions: AccordionItem[] = [
    {
      key: "movement",
      eyebrow: "Každodenný život",
      title: "Pohyb a každodenný život",
      paragraphs: textParagraphs(breed.exercise, breed.needs),
      tip: editorial.exerciseTip,
    },
    {
      key: "training",
      eyebrow: "Výchova",
      title: "Výcvik",
      paragraphs: textParagraphs(breed.training),
      tip: editorial.trainingTip,
    },
    {
      key: "family",
      eyebrow: "Spolužitie",
      title: "Rodina a deti",
      paragraphs: textParagraphs(editorial.familyLife),
    },
    {
      key: "dogs",
      eyebrow: "Spolužitie",
      title: "Vzťah k iným psom",
      paragraphs: textParagraphs(editorial.otherDogsLife),
    },
    {
      key: "coat",
      eyebrow: "Starostlivosť",
      title: "Srsť a starostlivosť",
      paragraphs: textParagraphs(editorial.coatCare),
      tip: editorial.coatTip,
    },
    {
      key: "health",
      eyebrow: "Zdravie",
      title: "Zdravie",
      paragraphs: textParagraphs(breed.health),
      tip: editorial.healthTip,
      risks: healthRisks,
    },
    {
      key: "sports",
      eyebrow: "Aktivity",
      title: "Šport a pracovné využitie",
      paragraphs: [],
      sports,
    },
    {
      key: "history",
      eyebrow: "Pôvod plemena",
      title: "História a pôvod",
      paragraphs: textParagraphs(breed.history),
    },
  ].filter((item) => item.paragraphs.length > 0 || Boolean(item.tip?.trim()) || Boolean(item.risks?.length) || Boolean(item.sports?.length));

  const fciGroupName = getFciGroup(breed.fciGroup)?.label || fci.fci_skupina_nazov || breed.group;
  const sectionNumber = managed?.fciSectionNumber?.trim() ?? "";
  const storedSectionName = (fci.fci_sekcia_nazov || breed.fciSection || "").trim();
  const sectionName = publicFciSectionName(
    breed.fciGroup,
    sectionNumber,
    storedSectionName && storedSectionName !== sectionNumber ? storedSectionName : "",
  );
  const standardDate = publicFciDate(managed?.validStandardDate);
  const fciFacts = [
    { label: "FCI číslo", value: managed?.fciNumber ? String(managed.fciNumber) : "" },
    { label: "Skupina", value: fciGroupName ? `${breed.fciGroup}. ${fciGroupName}` : String(breed.fciGroup) },
    { label: "Sekcia", value: [sectionNumber, sectionName].filter(Boolean).join(" · ") },
    { label: "Krajina pôvodu", value: breed.origin?.trim() ?? "" },
    { label: "Využitie", value: use },
    { label: "Pracovná skúška", value: workingTrial },
    { label: "Platný štandard", value: standardDate },
  ].filter((item) => Boolean(item.value));
  const hasFciReference = Boolean(managed?.fciNumber || Object.values(fci).some((value) => typeof value === "string" && value.trim()));

  return (
    <main id="obsah" className={styles.page}>
      <div className={`shell ${styles.shell}`}>
        <nav className={`article-breadcrumbs ${styles.breadcrumbs}`} aria-label="Navigácia">
          <Link href="/">Domov</Link><span>/</span><Link href="/plemena">Plemená</Link><span>/</span><span>{breed.name}</span>
        </nav>

        <header className={styles.hero}>
          <div className={styles.identity}>
            <div className={styles.fciIdentity}>
              {managed?.fciNumber ? <span>FCI č. {managed.fciNumber}</span> : null}
              {fciGroupName ? <span>Skupina {breed.fciGroup}</span> : null}
            </div>
            <h1>{breed.name}</h1>
            {managed?.officialFciName?.trim() ? <p className={styles.officialName}>{managed.officialFciName}</p> : null}
          </div>
          <div className={styles.heroPhoto}>
            {breed.image ? (
              <BreedPhoto src={breed.image} alt={`${breed.name} – profilová fotografia plemena`} className={styles.heroImage} />
            ) : (
              <div className={styles.photoPlaceholder} role="img" aria-label={`Fotografia plemena ${breed.name} zatiaľ nie je dostupná`}>Fotografia sa pripravuje</div>
            )}
          </div>
          {breed.intro?.trim() ? <p className={styles.lead}>{breed.intro}</p> : null}
        </header>

        {quickFacts.length ? (
          <section className={styles.quickFacts} aria-labelledby="breed-next-facts">
            <h2 id="breed-next-facts" className={styles.sectionLabel}>Plemeno v skratke</h2>
            <dl className={styles.factGrid}>
              {quickFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
            </dl>
          </section>
        ) : null}

        {overviewParagraphs.length ? (
          <section className={styles.readingSection} aria-labelledby="breed-next-about">
            <p className={styles.eyebrow}>Profil plemena</p>
            <h2 id="breed-next-about">O plemene</h2>
            <div className={styles.prose}><ReadingText paragraphs={overviewParagraphs} /></div>
          </section>
        ) : null}

        {goodFor.length || consider.length ? (
          <section className={styles.fitSection} aria-labelledby="breed-next-fit">
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>Praktický pohľad</p>
              <h2 id="breed-next-fit">Je toto plemeno pre mňa?</h2>
            </div>
            <div className={styles.fitGrid}>
              {goodFor.length ? <div className={styles.fitPositive}><h3>Hodí sa pre</h3><ul>{goodFor.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
              {consider.length ? <div className={styles.fitConsider}><h3>Treba zvážiť</h3><ul>{consider.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
            </div>
          </section>
        ) : null}

        {accordions.length ? (
          <section className={styles.practicalSection} aria-labelledby="breed-next-practical">
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>Každodenný život so psom</p>
              <h2 id="breed-next-practical">Praktické informácie</h2>
              <p>Podrobnosti sú zbalené do tém, aby profil zostal prehľadný aj pri väčšom množstve odborného obsahu.</p>
            </div>
            <div className={styles.accordionList}>
              {accordions.map((item) => (
                <BreedProfileNextAccordion key={item.key} title={item.title} eyebrow={item.eyebrow}>
                  {item.paragraphs.length ? <div className={styles.prose}><ReadingText paragraphs={item.paragraphs} /></div> : null}
                  {item.tip?.trim() ? <aside className={styles.tip}><strong>Praktická poznámka</strong><p>{item.tip}</p></aside> : null}
                  {item.risks?.length ? <div className={styles.riskBlock}><h4>Známe zdravotné riziká</h4><ul>{item.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul></div> : null}
                  {item.sports?.length ? <div className={styles.sportList} aria-label="Vhodné športy a pracovné aktivity">{item.sports.map((sport) => <div key={sport.key}><div><strong>{sport.label}</strong>{sport.note ? <p>{sport.note}</p> : null}</div><span aria-label={`hodnotenie ${sport.rating} z 5`}>{sport.rating}/5</span></div>)}</div> : null}
                </BreedProfileNextAccordion>
              ))}
            </div>
          </section>
        ) : null}

        {hasFciReference ? (
          <section className={styles.fciSection} aria-labelledby="breed-next-fci">
            <div className={styles.fciHeading}>
              <p className={styles.eyebrow}>Oficiálna referencia</p>
              <h2 id="breed-next-fci">Oficiálne zaradenie FCI</h2>
              <p>Na hlavnom profile uvádzame iba základné zaradenie. Úplný štandard je dostupný samostatne ako odborná referencia.</p>
            </div>
            {fciFacts.length ? <dl className={styles.fciFacts}>{fciFacts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl> : null}
            <Link href={`/preview/breed-profile-next/${breed.slug}/fci-standard`} className={styles.primaryLink}>Pozrieť celý FCI štandard <span aria-hidden="true">→</span></Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
