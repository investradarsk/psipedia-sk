import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BreedPhoto } from "@/components/breed-photo";
import { ArrowIcon, PawMark } from "@/components/icons";
import { breedAtlasHref } from "@/lib/breed-atlas";
import {
  combinedFciMeasurement,
  publicBreedMeasurement,
  publicFciDate,
  publicFciSectionName,
  type FciStandard,
} from "@/lib/breed-fci";
import { normalizeBreedSports, textParagraphs } from "@/lib/breed-profile";
import {
  getBreedDetailRelations,
  getPublishedBreed,
  type BreedEditorial,
  type ManagedBreed,
} from "@/lib/breed-store";
import { breeds, getFciGroup } from "@/lib/content";
import { breedSeoFallback, buildContentMetadata, resolvedCanonical } from "@/lib/content-seo";
import { articleHref, type ArticlePortalSection } from "@/lib/portal";
import { absoluteUrl, ORGANIZATION_ID, serializeJsonLd, SITE_URL } from "@/lib/seo";
import { BreedProfileAccordion } from "./breed-profile-accordion";
import styles from "./breed-profile.module.css";

type Props = { params: Promise<{ slug: string }> };

type AccordionItem = {
  key: string;
  title: string;
  eyebrow: string;
  paragraphs: string[];
  tip?: string;
  risks?: string[];
  sports?: ReturnType<typeof normalizeBreedSports>;
  extraSections?: Array<{ title: string; paragraphs: string[] }>;
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return breeds.map((breed) => ({ slug: breed.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  const fallback = breed ? breedSeoFallback(breed.name) : null;
  return breed && fallback
    ? buildContentMetadata({
        seo: breed.seo,
        fallbackTitle: fallback.title,
        fallbackDescription: fallback.description,
        path: `/plemena/${breed.slug}`,
        image: breed.image,
        imageAlt: `${breed.name} – profil plemena`,
        type: "article",
        publishedTime: "publishedAt" in breed && typeof breed.publishedAt === "string" ? breed.publishedAt : "2026-08-17",
        modifiedTime: "updatedAt" in breed && typeof breed.updatedAt === "string" ? breed.updatedAt : "2026-08-17",
        section: "Plemená psov",
        tags: [breed.name, `FCI skupina ${breed.fciGroup}`, breed.origin],
      })
    : {};
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

export default async function BreedDetailPage({ params }: Props) {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  if (!breed) notFound();

  const managedBreed = "id" in breed && typeof breed.id === "number" ? breed as ManagedBreed : null;
  const editorial: BreedEditorial = managedBreed?.editorial ?? {};
  const fci: FciStandard = managedBreed?.fciStandard ?? {};
  const sports = normalizeBreedSports(managedBreed?.sports ?? []);
  const healthRisks = cleanList(breed.healthRisks);
  const goodFor = cleanList(breed.goodFor);
  const consider = cleanList(breed.consider);
  const gallery = breed.gallery ?? [];
  const sources = breed.sources ?? [];
  const relations = managedBreed
    ? await getBreedDetailRelations(managedBreed)
    : { articles: [], breedingStations: [], breedClubs: [], similarBreeds: [] };

  const canonical = resolvedCanonical(breed.seo, `/plemena/${breed.slug}`);
  const publishedAt = "publishedAt" in breed && typeof breed.publishedAt === "string" ? breed.publishedAt : "2026-08-17";
  const updatedAt = "updatedAt" in breed && typeof breed.updatedAt === "string" ? breed.updatedAt : "2026-08-17";
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        url: canonical,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
        headline: `${breed.name} – povaha, potreby a profil plemena`,
        description: breed.intro || fci.povaha_temperament || managedBreed?.officialFciName,
        image: [
          breed.image ? absoluteUrl(breed.image) : null,
          ...gallery.map((item) => absoluteUrl(item.imageUrl)),
        ].filter(Boolean),
        datePublished: publishedAt,
        dateModified: updatedAt,
        inLanguage: "sk-SK",
        isAccessibleForFree: true,
        articleSection: "Plemená psov",
        keywords: [breed.name, `FCI skupina ${breed.fciGroup}`, breed.origin, "plemená psov"],
        author: { "@type": "Organization", name: "Redakcia Psipedia", url: `${SITE_URL}/o-nas` },
        publisher: {
          "@type": "Organization",
          "@id": ORGANIZATION_ID,
          name: "Psipedia.sk",
          url: SITE_URL,
          logo: { "@type": "ImageObject", url: `${SITE_URL}/favicon.svg`, width: 64, height: 64 },
        },
        about: { "@type": "Thing", name: breed.name, description: breed.intro },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Domov", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "Plemená", item: `${SITE_URL}/plemena` },
          { "@type": "ListItem", position: 3, name: breed.name, item: canonical },
        ],
      },
    ],
  };

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
  const workingTrial = managedBreed?.workingTrial?.trim() ?? "";

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
      extraSections: [
        { title: "Časté chyby majiteľov", paragraphs: textParagraphs(editorial.commonOwnerMistakes) },
      ],
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
      extraSections: [
        { title: "Zaujímavosti", paragraphs: textParagraphs(editorial.curiosities) },
      ],
    },
  ].filter((item) =>
    item.paragraphs.length > 0 ||
    Boolean(item.tip?.trim()) ||
    Boolean(item.risks?.length) ||
    Boolean(item.sports?.length) ||
    Boolean(item.extraSections?.some((section) => section.paragraphs.length > 0))
  );

  const fciGroupName = getFciGroup(breed.fciGroup)?.label || fci.fci_skupina_nazov || breed.group;
  const sectionNumber = managedBreed?.fciSectionNumber?.trim() ?? "";
  const storedSectionName = (fci.fci_sekcia_nazov || breed.fciSection || "").trim();
  const sectionName = publicFciSectionName(
    breed.fciGroup,
    sectionNumber,
    storedSectionName && storedSectionName !== sectionNumber ? storedSectionName : "",
  );
  const standardDate = publicFciDate(managedBreed?.validStandardDate);
  const fciGroupHref = breedAtlasHref({
    query: "",
    fciGroup: String(breed.fciGroup),
    fciSection: "",
    origin: "",
    energy: "all",
  });
  const fciSectionHref = sectionNumber
    ? breedAtlasHref({
        query: "",
        fciGroup: String(breed.fciGroup),
        fciSection: sectionNumber,
        origin: "",
        energy: "all",
      })
    : "";

  const fciFacts = [
    { label: "FCI číslo", value: managedBreed?.fciNumber ? String(managedBreed.fciNumber) : "" },
    { label: "Skupina", value: fciGroupName ? `${breed.fciGroup}. ${fciGroupName}` : String(breed.fciGroup), href: fciGroupHref },
    { label: "Sekcia", value: [sectionNumber, sectionName].filter(Boolean).join(" · "), href: fciSectionHref },
    { label: "Krajina pôvodu", value: breed.origin?.trim() ?? "" },
    { label: "Využitie", value: use },
    { label: "Pracovná skúška", value: workingTrial },
    { label: "Platný štandard", value: standardDate },
  ].filter((item) => Boolean(item.value));
  const hasFciReference = Boolean(
    managedBreed?.fciNumber ||
    Object.values(fci).some((value) => typeof value === "string" && value.trim()),
  );

  return (
    <main id="obsah" className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />
      <div className={`shell ${styles.shell}`}>
        <nav className={`article-breadcrumbs ${styles.breadcrumbs}`} aria-label="Navigácia">
          <Link href="/">Domov</Link><span>/</span><Link href="/plemena">Plemená</Link><span>/</span><span>{breed.name}</span>
        </nav>

        <header className={styles.hero} data-testid="breed-hero">
          <div className={styles.identity} data-testid="breed-hero-identity">
            <div className={styles.fciIdentity}>
              {managedBreed?.fciNumber ? <span>FCI č. {managedBreed.fciNumber}</span> : null}
              {fciGroupName ? <span>Skupina {breed.fciGroup}</span> : null}
            </div>
            <h1>{breed.name}</h1>
            {managedBreed?.officialFciName?.trim() ? <p className={styles.officialName}>{managedBreed.officialFciName}</p> : null}
          </div>

          <div
            className={styles.heroPhoto}
            data-testid="breed-hero-photo"
            data-image-fallback="breed-photo"
          >
            {breed.image ? (
              <BreedPhoto
                src={breed.image}
                alt={`${breed.name} – profilová fotografia plemena`}
                className={styles.heroImage}
                data-testid="breed-hero-image"
              />
            ) : (
              <div
                className={styles.photoPlaceholder}
                role="img"
                aria-label={`Fotografia plemena ${breed.name} zatiaľ nie je dostupná`}
              >
                Fotografia sa pripravuje
              </div>
            )}
          </div>

          {breed.intro?.trim() ? <p className={styles.lead} data-testid="breed-hero-lead">{breed.intro}</p> : null}
        </header>

        {quickFacts.length ? (
          <section className={styles.quickFacts} aria-labelledby="breed-facts">
            <h2 id="breed-facts" className={styles.sectionLabel}>Plemeno v skratke</h2>
            <dl className={styles.factGrid} data-testid="breed-quick-facts">
              {quickFacts.map((fact) => (
                <div key={fact.label} data-fact-label={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {overviewParagraphs.length ? (
          <section className={styles.readingSection} aria-labelledby="breed-about">
            <p className={styles.eyebrow}>Profil plemena</p>
            <h2 id="breed-about">O plemene</h2>
            <div className={styles.prose}><ReadingText paragraphs={overviewParagraphs} /></div>
          </section>
        ) : null}

        {goodFor.length || consider.length ? (
          <section className={styles.fitSection} aria-labelledby="breed-fit" data-testid="breed-fit">
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>Praktický pohľad</p>
              <h2 id="breed-fit">Je toto plemeno pre mňa?</h2>
            </div>
            <div className={styles.fitGrid}>
              {goodFor.length ? (
                <div className={styles.fitPositive}>
                  <h3>Hodí sa pre</h3>
                  <ul>{goodFor.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
              {consider.length ? (
                <div className={styles.fitConsider}>
                  <h3>Treba zvážiť</h3>
                  <ul>{consider.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {accordions.length ? (
          <section className={styles.practicalSection} aria-labelledby="breed-practical">
            <div className={styles.sectionIntro}>
              <p className={styles.eyebrow}>Každodenný život so psom</p>
              <h2 id="breed-practical">Praktické informácie</h2>
              <p>Podrobnosti sú zbalené do tém, aby profil zostal prehľadný aj pri väčšom množstve odborného obsahu.</p>
            </div>
            <div className={styles.accordionList}>
              {accordions.map((item) => (
                <BreedProfileAccordion key={item.key} title={item.title} eyebrow={item.eyebrow}>
                  {item.paragraphs.length ? <div className={styles.prose}><ReadingText paragraphs={item.paragraphs} /></div> : null}
                  {item.tip?.trim() ? (
                    <aside className={styles.tip}>
                      <strong>Praktická poznámka</strong>
                      <p>{item.tip}</p>
                    </aside>
                  ) : null}
                  {item.risks?.length ? (
                    <div className={styles.riskBlock}>
                      <h4>Známe zdravotné riziká</h4>
                      <ul>{item.risks.map((risk) => <li key={risk}>{risk}</li>)}</ul>
                    </div>
                  ) : null}
                  {item.sports?.length ? (
                    <div className={styles.sportList} aria-label="Vhodné športy a pracovné aktivity" data-testid="breed-sports">
                      {item.sports.map((sport) => (
                        <div key={sport.key} data-sport-key={sport.key}>
                          <div>
                            <strong>{sport.label}</strong>
                            {sport.note ? <p>{sport.note}</p> : null}
                          </div>
                          <span aria-label={`hodnotenie ${sport.rating} z 5`}>{sport.rating}/5</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {item.extraSections?.filter((section) => section.paragraphs.length > 0).map((section) => (
                    <section className={styles.riskBlock} key={section.title}>
                      <h4>{section.title}</h4>
                      <div className={styles.prose}><ReadingText paragraphs={section.paragraphs} /></div>
                    </section>
                  ))}
                </BreedProfileAccordion>
              ))}
            </div>
          </section>
        ) : null}

        {sources.length ? (
          <section className={styles.readingSection} aria-labelledby="breed-sources">
            <p className={styles.eyebrow}>Overené informácie</p>
            <h2 id="breed-sources">Odborné zdroje</h2>
            <ol className="breed-source-list">
              {sources.map((source) => (
                <li key={`${source.label}-${source.url}`}>
                  <a href={source.url} rel="noopener noreferrer" target="_blank">{source.label}</a>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {hasFciReference ? (
          <section className={styles.fciSection} aria-labelledby="breed-fci">
            <div className={styles.fciHeading}>
              <p className={styles.eyebrow}>Oficiálna referencia</p>
              <h2 id="breed-fci">Oficiálne zaradenie FCI</h2>
              <p>Na hlavnom profile uvádzame iba základné zaradenie. Úplný štandard je dostupný samostatne ako odborná referencia.</p>
            </div>
            {fciFacts.length ? (
              <dl className={styles.fciFacts}>
                {fciFacts.map((fact) => (
                  <div key={fact.label}>
                    <dt>{fact.label}</dt>
                    <dd>{fact.href ? <Link href={fact.href} className="text-link">{fact.value}</Link> : fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <Link
              href={`/plemena/${breed.slug}/fci-standard`}
              className={styles.primaryLink}
              data-testid="breed-fci-cta"
            >
              Pozrieť celý FCI štandard <span aria-hidden="true">→</span>
            </Link>
          </section>
        ) : null}
      </div>

      {gallery.length > 0 ? (
        <section className="breed-gallery shell" aria-label={`Fotografie plemena ${breed.name}`}>
          {gallery.map((item, index) => (
            <figure key={`${item.imageUrl}-${index}`}>
              <BreedPhoto src={item.imageUrl} alt={item.alt || `${breed.name} – fotografia ${index + 1}`} />
              {(item.caption || item.credit) ? (
                <figcaption>
                  {item.caption}
                  {item.caption && item.credit ? " · " : ""}
                  {item.credit ? <span>Foto: {item.credit}</span> : null}
                </figcaption>
              ) : null}
            </figure>
          ))}
        </section>
      ) : null}

      {relations.articles.length > 0 ? (
        <section className="breed-related-section shell" id="suvisiaci-obsah">
          <header><span className="eyebrow">Ďalšie čítanie</span><h2>Prehĺbte si vedomosti</h2></header>
          <div className="breed-related-grid">
            {relations.articles.map((article) => (
              <article key={article.id}>
                {article.image ? <img src={article.image} alt="" loading="lazy" /> : null}
                <div>
                  <small>Článok Psipedie</small>
                  <h3><Link href={articleHref({ slug: article.slug, portalSection: article.portalSection as ArticlePortalSection })}>{article.title}</Link></h3>
                  <p>{article.excerpt}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {relations.breedingStations.length > 0 ? (
        <section className="breed-related-section shell">
          <header><span className="eyebrow">Z našej databázy</span><h2>Chovateľské stanice</h2></header>
          <div className="breed-directory-grid">
            {relations.breedingStations.map((profile) => (
              <article key={profile.id}>
                <h3><Link href={`/adresar/chovatelske-stanice/${profile.slug}`}>{profile.name}</Link></h3>
                <p>{[profile.city, profile.region].filter(Boolean).join(" · ")}</p>
                {profile.excerpt ? <small>{profile.excerpt}</small> : null}
              </article>
            ))}
          </div>
          <Link className="text-link" href={`/adresar/chovatelske-stanice?breed=${encodeURIComponent(breed.name)}`}>
            Zobraziť všetky chovateľské stanice pre toto plemeno →
          </Link>
        </section>
      ) : null}

      {relations.breedClubs.length > 0 ? (
        <section className="breed-related-section shell">
          <header><span className="eyebrow">Organizácie a chov</span><h2>Chovateľský klub</h2></header>
          <div className="breed-directory-grid">
            {relations.breedClubs.map((profile) => (
              <article key={profile.id}>
                <h3><Link href={`/adresar/chovatelske-kluby/${profile.slug}`}>{profile.name}</Link></h3>
                <p>{[profile.city, profile.region].filter(Boolean).join(" · ")}</p>
                {profile.excerpt ? <small>{profile.excerpt}</small> : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="breed-useful-links shell">
        <header>
          <span className="eyebrow">Adresár Psipedie</span>
          <h2>Užitočné odkazy a kontakty</h2>
          <p>Nájdite organizácie a odborníkov, ktorí vám pomôžu s chovom, výcvikom aj aktivitami.</p>
        </header>
        <div>
          <Link href="/adresar/chovatelske-kluby">
            <span className="breed-useful-icon" aria-hidden="true"><PawMark size={22} /></span>
            <strong>Chovateľské kluby</strong>
            <small>Kluby združujúce chovateľov a priaznivcov plemena.</small>
            <span className="breed-useful-cta">Zobraziť kluby <ArrowIcon size={15} /></span>
          </Link>
          <Link href="/adresar/chovatelske-stanice">
            <span className="breed-useful-icon" aria-hidden="true"><PawMark size={22} /></span>
            <strong>Chovateľské stanice</strong>
            <small>Publikované stanice v databáze Psipedie.</small>
            <span className="breed-useful-cta">Zobraziť stanice <ArrowIcon size={15} /></span>
          </Link>
          <Link href={`/adresar/treneri?breed=${encodeURIComponent(breed.name)}`}>
            <span className="breed-useful-icon" aria-hidden="true"><PawMark size={22} /></span>
            <strong>Psí tréneri</strong>
            <small>Tréneri so skúsenosťami s pracovnými aj rodinnými psami.</small>
            <span className="breed-useful-cta">Zobraziť trénerov <ArrowIcon size={15} /></span>
          </Link>
          <Link href="/adresar/kynologicke-kluby">
            <span className="breed-useful-icon" aria-hidden="true"><PawMark size={22} /></span>
            <strong>Kynologické kluby</strong>
            <small>Kluby pre šport, výcvik a praktické aktivity.</small>
            <span className="breed-useful-cta">Zobraziť kluby <ArrowIcon size={15} /></span>
          </Link>
        </div>
      </section>

      {relations.similarBreeds.length > 0 ? (
        <section className="breed-related-section shell">
          <header><span className="eyebrow">Objavte ďalšie profily</span><h2>Podobné plemená</h2></header>
          <div className="breed-similar-grid">
            {relations.similarBreeds.map((item) => (
              <Link href={`/plemena/${item.slug}`} key={item.id}>
                {item.image
                  ? <BreedPhoto src={item.image} alt="" loading="lazy" />
                  : <span aria-hidden="true"><PawMark size={30} /></span>}
                <strong>{item.name}</strong>
                <small>FCI {item.fciGroup} · {item.fciSection}</small>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="breed-detail-footer shell">
        <Link href="/plemena" className="button button--dark">Späť do atlasu <ArrowIcon /></Link>
      </div>
    </main>
  );
}
