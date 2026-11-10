import type { Metadata } from "next";
import Link from "next/link";
import { ArticlePromo } from "@/components/article-promo";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import { notFound } from "next/navigation";
import { BreedPhoto } from "@/components/breed-photo";
import { PublicMediaFallback } from "@/components/public-visual-system";
import { PublicPhotoGallery } from "@/components/public-visual-system/public-photo-gallery";
import { DetailHero, DetailFactsCard } from "@/components/detail-primitives/detail-primitives";
import { PublicHelpProfileDetailLayout } from "@/components/public-visual-system/public-help-profile-detail-layout";
import { ArrowIcon, PawMark } from "@/components/icons";
import {
  PublicActionLink,
  PublicArticleListItem,
  PublicContentList,
  PublicDataCard,
  PublicFoundation,
} from "@/components/public-visual-system";
import { breedAtlasHref } from "@/lib/breed-atlas";
import {
  combinedFciMeasurement,
  publicBreedMeasurement,
  type FciStandard,
} from "@/lib/breed-fci";
import { normalizeBreedSports, textParagraphs } from "@/lib/breed-profile";
import { readPublicBreedControlledValues } from "@/lib/breed-public-controlled";
import { resolvePublicBreedFacts } from "@/lib/breed-public-facts.mjs";
import {
  getBreedDetailRelations,
  getPublishedBreed,
  type BreedEditorial,
  type ManagedBreed,
} from "@/lib/breed-store";
import { breeds, getFciGroup } from "@/lib/content";
import { breedSeoFallback, buildContentMetadata, resolvedCanonical } from "@/lib/content-seo";
import {
  absoluteUrl,
  articleAuthorJsonLd,
  buildGenericMainEntityJsonLd,
  buildWebPageJsonLd,
  ORGANIZATION_ID,
  serializeJsonLd,
  SITE_URL,
} from "@/lib/seo";
import { getPublicArticleListMeta } from "@/lib/public-article-list";
import { BreedProfileAccordion } from "./breed-profile-accordion";
import styles from "./breed-profile.module.css";

type Props = { params: Promise<{ slug: string }> };

type AccordionItem = {
  key: string;
  title: string;
  paragraphs: string[];
  tip?: string;
  risks?: string[];
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
        publishedTime:
          "publishedAt" in breed && typeof breed.publishedAt === "string"
            ? breed.publishedAt
            : undefined,
        modifiedTime:
          "updatedAt" in breed && typeof breed.updatedAt === "string" ? breed.updatedAt : undefined,
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
  return (
    <>
      {paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </>
  );
}

export default async function BreedDetailPage({ params }: Props) {
  const { slug } = await params;
  const breed = await getPublishedBreed(slug);
  if (!breed) notFound();

  const managedBreed =
    "id" in breed && typeof breed.id === "number" ? (breed as ManagedBreed) : null;
  const controlledFacts=managedBreed ? await readPublicBreedControlledValues(managedBreed.id) : null;
  const editorial: BreedEditorial = managedBreed?.editorial ?? {};
  const fci: FciStandard = managedBreed?.fciStandard ?? {};
  const sports = normalizeBreedSports(managedBreed?.sports ?? []);
  const healthRisks = cleanList(breed.healthRisks);
  const goodFor = cleanList(breed.goodFor);
  const consider = cleanList(breed.consider);
  const gallery = breed.gallery ?? [];
  const sources = breed.sources ?? [];
  const relations = managedBreed
    ? await getBreedDetailRelations(managedBreed).catch((error) => {
        console.error("Public breed relations read failed", {
          breedId: managedBreed.id,
          breedSlug: managedBreed.slug,
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          articles: [],
          breedingStations: [],
          breedingStationLanding: null,
          breedClubs: [],
          similarBreeds: [],
        };
      })
    : {
        articles: [],
        breedingStations: [],
        breedingStationLanding: null,
        breedClubs: [],
        similarBreeds: [],
      };

  const relatedArticleMeta = await getPublicArticleListMeta(
    relations.articles.map((article) => article.slug),
  ).catch((error) => {
    console.error("Public breed related article metadata read failed", {
      breedSlug: breed.slug,
      error: error instanceof Error ? error.message : String(error),
    });
    return new Map();
  });
  const relatedArticles = relations.articles.flatMap((article) => {
    const meta = relatedArticleMeta.get(article.slug);
    return meta ? [{ ...article, ...meta }] : [];
  });

  const canonical = resolvedCanonical(breed.seo, `/plemena/${breed.slug}`);
  const publishedAt =
    "publishedAt" in breed && typeof breed.publishedAt === "string" ? breed.publishedAt : undefined;
  const updatedAt =
    "updatedAt" in breed && typeof breed.updatedAt === "string" ? breed.updatedAt : undefined;
  const breedEntity = buildGenericMainEntityJsonLd({
    canonical,
    name: breed.name,
    description: breed.intro || fci.povaha_temperament || managedBreed?.officialFciName,
    image: breed.image,
    idSuffix: "breed",
  });
  const breedEntityId = breedEntity["@id"];
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        url: canonical,
        mainEntityOfPage: { "@id": canonical },
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
        author: articleAuthorJsonLd("Redakcia Psipedia"),
        publisher: { "@id": ORGANIZATION_ID },
        about: { "@id": breedEntityId },
      },
      breedEntity,
      buildWebPageJsonLd({
        canonical,
        name: breed.name,
        description: breed.intro || fci.povaha_temperament || managedBreed?.officialFciName,
        mainEntityId: breedEntityId,
        breadcrumbId: `${canonical}#breadcrumb`,
        datePublished: publishedAt,
        dateModified: updatedAt,
      }),
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

  // New Admin values take precedence only when present and valid; old prose
  // remains a safe read-only fallback until the Notion cutover is complete.
  const displayFacts=resolvePublicBreedFacts({
    origin:breed.origin?.trim()??"",size:breed.size?.trim()??"",
    height,weight,lifespan,fciGroup:breed.fciGroup,
    fciSection:breed.fciSection,
  },controlledFacts);
  const quickFacts = [
    { label: "Pôvod", value: displayFacts.origin },
    { label: "Veľkosť", value: displayFacts.size },
    { label: "Typ srsti", value: displayFacts.coatTypes },
    { label: "Výška", value: displayFacts.height },
    { label: "Hmotnosť", value: displayFacts.weight },
    { label: "Dĺžka života", value: displayFacts.lifespan },
    { label: "Využitie", value: displayFacts.useTypes },
    { label: "FCI skupina", value: displayFacts.fciGroup },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
  // One care section owns this description; no duplicate "Srsť" card under the hero.
  const coatParagraphs = textParagraphs(editorial.coatCare);
  const coatContent = coatParagraphs.length ? coatParagraphs : textParagraphs(breed.coat);

  const overviewParagraphs = textParagraphs(editorial.overview);
  const characterParagraphs = textParagraphs(breed.character);
  const historyParagraphs = textParagraphs(breed.history);
  const healthParagraphs = textParagraphs(breed.health);
  const needsParagraphs = textParagraphs(breed.needs);
  const hasCharacteristics=overviewParagraphs.length>0 || characterParagraphs.length>0 || historyParagraphs.length>0;
  const ratings=[
    ["Energia",breed.energy],["Trénovateľnosť",breed.trainability],
    ["Vzťah k deťom",breed.children],["Vzťah k iným psom",breed.otherDogs],
    ["Vhodnosť do bytu",breed.apartment],["Náročnosť starostlivosti",breed.grooming],
    ["Pĺznutie",breed.shedding],["Lovecký inštinkt",breed.preyDrive],
  ].filter((item):item is [string,number]=>typeof item[1]==="number"&&Number.isFinite(item[1])&&item[1]>=1&&item[1]<=5);
  const accordions: AccordionItem[] = [
    {
      key:"needs",title:"Potreby plemena",
      paragraphs:needsParagraphs,
    },
    {
      key: "movement",
      title: "Pohyb a aktivita",
      paragraphs: textParagraphs(breed.exercise),
    },
    {
      key: "training",
      title: "Výcvik",
      paragraphs: textParagraphs(breed.training),
      extraSections: [
        {
          title: "Časté chyby majiteľov",
          paragraphs: textParagraphs(editorial.commonOwnerMistakes),
        },
      ],
    },
    {
      key: "family",
      title: "Rodina a deti",
      paragraphs: textParagraphs(editorial.familyLife),
    },
    {
      key: "dogs",
      title: "Vzťah k iným psom",
      paragraphs: textParagraphs(editorial.otherDogsLife),
    },
    {
      key: "coat",
      title: "Starostlivosť o srsť",
      paragraphs: coatContent,
    },
  ].filter(
    (item) =>
      item.paragraphs.length > 0 ||
      Boolean(item.risks?.length) ||
      Boolean(item.extraSections?.some((section) => section.paragraphs.length > 0)),
  );

  const displayFciGroup=Number(displayFacts.fciGroup)||breed.fciGroup;
  const fciGroupName = getFciGroup(displayFciGroup)?.label || "";
  const fciGroupHref = breedAtlasHref({
    query: "",
    fciGroup: String(displayFciGroup),
    fciSection: "",
    origin: "",
  });
  // The section NUMBER remains an internal navigation key for the atlas.
  // It is not a separate input or visible field in the compact Notion editor.
  const sectionNumber = typeof controlledFacts?.fciSectionSelect === "string" && controlledFacts.fciSectionSelect
    ? controlledFacts.fciSectionSelect : (managedBreed?.fciSectionNumber?.trim() ?? "");
  const fciSectionHref = sectionNumber ? breedAtlasHref({
    query: "", fciGroup: String(displayFciGroup),
    fciSection: sectionNumber, origin: "",
  }) : undefined;
  // Only FCI identity fields present in the 60-column Notion workcopy.
  const fciFacts = [
    { label: "FCI číslo", value: managedBreed?.fciNumber ? String(managedBreed.fciNumber) : "" },
    {
      label: "FCI skupina",
      value: fciGroupName ? `${displayFciGroup}. ${fciGroupName}` : String(displayFciGroup),
      href: fciGroupHref,
    },
    { label: "FCI sekcia", value: breed.fciSection?.trim() || displayFacts.fciSection || sectionNumber, href: fciSectionHref },
  ].filter((item) => Boolean(item.value));
  const hasFciReference = Boolean(
    managedBreed?.fciNumber ||
      Object.values(fci).some((value) => typeof value === "string" && value.trim()),
  );

  return (
    <main id="obsah" className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
      />
      <PublicFoundation>
        <div data-testid="breed-hero">
          <DetailHero
            kind="breed"
            breadcrumbs={
              <nav className={styles.breadcrumbs} aria-label="Navigácia">
                <Link href="/">Domov</Link>
                <span>/</span>
                <Link href="/plemena">Plemená</Link>
                <span>/</span>
                <span>{breed.name}</span>
              </nav>
            }
            copy={
              <>
                <span className={styles.heroTag}>Plemeno psa</span>
                <div className={styles.identity} data-testid="breed-hero-identity">
                  <div className={styles.fciIdentity}>
                    {managedBreed?.fciNumber ? <span>FCI č. {managedBreed.fciNumber}</span> : null}
                    {fciGroupName ? <span>Skupina {displayFciGroup}</span> : null}
                  </div>
                  <h1>{breed.name}</h1>
                  {managedBreed?.officialFciName?.trim() ? (
                    <p className={styles.officialName}>{managedBreed.officialFciName}</p>
                  ) : null}
                </div>
                {breed.intro?.trim() ? (
                  <p className={styles.lead} data-testid="breed-hero-lead">
                    {breed.intro}
                  </p>
                ) : null}
              </>
            }
            media={
              <div
                className={styles.heroPhoto}
                data-testid="breed-hero-photo"
                data-image-fallback="breed-photo"
              >
                {breed.image ? (
                  <BreedPhoto
                    src={breed.image}
                    alt={breed.name + " – profilová fotografia plemena"}
                    className={styles.heroImage}
                    data-testid="breed-hero-image"
                  />
                ) : (
                  <div className={styles.photoPlaceholder}>
                    <PublicMediaFallback
                      size="detail"
                      label={"Fotografia plemena " + breed.name + " zatiaľ nie je dostupná"}
                    />
                  </div>
                )}
              </div>
            }
          />
        </div>
        <PublicHelpProfileDetailLayout
          aside={
          <div
            id="uzitocne"
            className={`${styles.utilitySidebar} ${styles.anchorSection}`}
            aria-label="Užitočné odkazy"
            data-testid="breed-utility-sidebar"
          >
            {quickFacts.length > 0 ? (
              <div data-testid="breed-quick-facts">
                <DetailFactsCard title="Plemeno v skratke" facts={quickFacts} />
              </div>
            ) : null}
            <ArticlePromo promoKey="veterinari" variant="v1" seed={breed.slug} compact />
            <PublicMagazineBanner
              compact
              eyebrow="Adresár Psipedia"
              title="Užitočné odkazy"
              description="Kluby, chovatelia a tréneri na jednom mieste."
              testId="breed-utility"
              links={[
                { href: "/adresar/chovatelske-kluby", label: "Chovateľské kluby" },
                {
                  href: relations.breedingStationLanding?.href ?? "/adresar/chovatelske-stanice",
                  label: relations.breedingStationLanding?.label ?? "Chovateľské stanice",
                },
                { href: "/adresar/treneri", label: "Psí tréneri" },
                { href: "/adresar/kynologicke-kluby", label: "Kynologické kluby" },
              ]}
            />
          </div>
          }
          asideLabel="Základné fakty a užitočné odkazy"
          className={styles.contentLayout}
          data-testid="breed-content-layout"
        >
          <article className={styles.mainColumn}>
            {hasCharacteristics ? (
              <section id="prehlad" className={`${styles.readingSection} ${styles.anchorSection}`} aria-labelledby="breed-about">
                <h2 id="breed-about">O plemene</h2>
                {overviewParagraphs.length ? <div className={styles.prose}><ReadingText paragraphs={overviewParagraphs}/></div> : null}
                {characterParagraphs.length ? <div className={styles.characterBlock}>
                  <h3>Charakter a temperament</h3>
                  <div className={styles.prose}><ReadingText paragraphs={characterParagraphs}/></div>
                </div> : null}
                {historyParagraphs.length ? <div className={styles.characterBlock}>
                  <h3>História a pôvod plemena</h3>
                  <div className={styles.prose}><ReadingText paragraphs={historyParagraphs}/></div>
                </div> : null}
                {editorial.curiosities?.trim() ? <div className={styles.characterBlock}>
                  <h3>Zaujímavosti</h3>
                  <div className={styles.prose}><ReadingText paragraphs={textParagraphs(editorial.curiosities)}/></div>
                </div> : null}
              </section>
            ) : null}
            {ratings.length ? (
              <section id="hodnotenia" className={`${styles.ratingSection} ${styles.anchorSection}`} aria-labelledby="breed-ratings">
                <h2 id="breed-ratings">Povaha v číslach</h2>
                <div className={styles.ratingGrid}>
                  {ratings.map(([label,value])=><div className={styles.ratingItem} key={label}>
                    <div><strong>{label}</strong><span>{value}/5</span></div>
                    <meter min={1} max={5} value={value} aria-label={label} />
                  </div>)}
                </div>
              </section>
            ) : null}

            {accordions.length ? (
              <section
                id="prakticke"
                className={`${styles.practicalSection} ${styles.anchorSection}`}
                aria-labelledby="breed-practical"
              >
                <div className={styles.sectionIntro}>
                <h2 id="breed-practical">Život a starostlivosť</h2>
                </div>
                <div className={styles.accordionList}>
                  {accordions.map((item) => (
                    <BreedProfileAccordion key={item.key} title={item.title}>
                      {item.paragraphs.length ? (
                        <div className={styles.prose}>
                          <ReadingText paragraphs={item.paragraphs} />
                        </div>
                      ) : null}
                      {item.tip?.trim() ? (
                        <aside className={styles.tip}>
                          <p>{item.tip}</p>
                        </aside>
                      ) : null}
                      {item.risks?.length ? (
                        <div className={styles.riskBlock}>
                          <h4>Známe zdravotné riziká</h4>
                          <ul>
                            {item.risks.map((risk) => (
                              <li key={risk}>{risk}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {item.extraSections
                        ?.filter((section) => section.paragraphs.length > 0)
                        .map((section) => (
                          <section className={styles.riskBlock} key={section.title}>
                            <h4>{section.title}</h4>
                            <div className={styles.prose}>
                              <ReadingText paragraphs={section.paragraphs} />
                            </div>
                          </section>
                        ))}
                    </BreedProfileAccordion>
                  ))}
                </div>
              </section>
            ) : null}

            {healthParagraphs.length || healthRisks.length ? (
              <section id="zdravie" className={`${styles.readingSection} ${styles.anchorSection}`} aria-labelledby="breed-health-heading">
                <h2 id="breed-health-heading">Zdravie plemena</h2>
                {healthParagraphs.length ? <div className={styles.prose}><ReadingText paragraphs={healthParagraphs}/></div> : null}
                {healthRisks.length ? <div className={styles.riskBlock}><h3>Typické zdravotné riziká</h3>
                  <ul>{healthRisks.map(risk=><li key={risk}>{risk}</li>)}</ul></div> : null}
              </section>
            ) : null}

            {goodFor.length || consider.length ? (
              <section
                id="vhodnost"
                className={`${styles.fitSection} ${styles.anchorSection}`}
                aria-labelledby="breed-fit"
                data-testid="breed-fit"
              >
                <div className={styles.sectionIntro}>
                <h2 id="breed-fit">Je toto plemeno pre mňa?</h2>
                </div>
                <div className={styles.fitGrid}>
                  {goodFor.length ? (
                    <div className={styles.fitPositive}>
                      <h3>Hodí sa pre</h3>
                      <ul>
                        {goodFor.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {consider.length ? (
                    <div className={styles.fitConsider}>
                      <h3>Treba zvážiť</h3>
                      <ul>
                        {consider.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}

            {hasFciReference ? (
              <section
                id="fci"
                className={`${styles.fciSection} ${styles.anchorSection}`}
                aria-labelledby="breed-fci"
              >
                <div className={styles.fciHeading}>
                <h2 id="breed-fci">Oficiálne zaradenie FCI</h2>
                  <p>
                    Na hlavnom profile uvádzame iba základné zaradenie. Úplný štandard je dostupný
                    samostatne ako odborná referencia.
                  </p>
                </div>
                {fciFacts.length ? (
                  <dl className={styles.fciFacts}>
                    {fciFacts.map((fact) => (
                      <div key={fact.label}>
                        <dt>{fact.label}</dt>
                        <dd>
                          {fact.href ? (
                            <Link href={fact.href} className="text-link">
                              {fact.value}
                            </Link>
                          ) : (
                            fact.value
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <PublicActionLink
                  href={`/plemena/${breed.slug}/fci-standard`}
                  className={styles.primaryLink}
                  data-testid="breed-fci-cta"
                >
                  Pozrieť celý FCI štandard <span aria-hidden="true">→</span>
                </PublicActionLink>
              </section>
            ) : null}
            {sports.length ? (
              <section
                id="sporty"
                className={`${styles.sportsSection} ${styles.anchorSection}`}
                aria-labelledby="breed-sports-heading"
              >
                <div className={styles.sectionIntro}>
                <h2 id="breed-sports-heading">Šport a pracovné využitie</h2>
                  <p>
                    Odporúčané aktivity sú zoradené priamo v profile, aby ich nebolo potrebné hľadať
                    v rozbalených témach.
                  </p>
                </div>
                <div
                  className={styles.sportList}
                  aria-label="Vhodné športy a pracovné aktivity"
                  data-testid="breed-sports"
                >
                  {sports.map((sport) => (
                    <div key={sport.key} data-sport-key={sport.key}>
                      <div>
                        <strong>{sport.label}</strong>
                        {sport.note ? <p>{sport.note}</p> : null}
                      </div>
                      <span aria-label={`hodnotenie ${sport.rating} z 5`}>{sport.rating}/5</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {sources.length ? (
              <section className={styles.readingSection} aria-labelledby="breed-sources">
                <h2 id="breed-sources">Odborné zdroje</h2>
                <ol className="breed-source-list">
                  {sources.map((source) => (
                    <li key={`${source.label}-${source.url}`}>
                      <a href={source.url} rel="noopener noreferrer" target="_blank">
                        {source.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}

            {relations.breedingStations.length > 0 ? (
              <section
                className={`${styles.compactRelated} ${styles.anchorSection}`}
                id="chov-a-kluby"
              >
                <header>
                <h2>Chovateľské stanice pre toto plemeno</h2>
                </header>
                <div className={styles.dataCardGrid}>
                  {relations.breedingStations.slice(0, 3).map((profile) => (
                    <PublicDataCard
                      key={profile.id}
                      href={profile.href}
                      eyebrow="Chovateľská stanica"
                      title={profile.name}
                      meta={[profile.city, profile.region].filter(Boolean).join(" · ")}
                      description={profile.excerpt}
                      icon={<PawMark size={24} />}
                      actionLabel="Zobraziť profil"
                    />
                  ))}
                </div>
              </section>
            ) : null}

            {relations.breedClubs.length > 0 ? (
              <section
                className={`${styles.compactRelated} ${styles.anchorSection}`}
                id={relations.breedingStations.length ? undefined : "chov-a-kluby"}
              >
                <header>
                <h2>Chovateľské kluby pre toto plemeno</h2>
                </header>
                <div className={styles.dataCardGrid}>
                  {relations.breedClubs.slice(0, 3).map((profile) => (
                    <PublicDataCard
                      key={profile.id}
                      href={profile.href}
                      eyebrow="Chovateľský klub"
                      title={profile.name}
                      meta={[profile.city, profile.region].filter(Boolean).join(" · ")}
                      description={profile.excerpt}
                      icon={<PawMark size={24} />}
                      actionLabel="Zobraziť profil"
                    />
                  ))}
                </div>
              </section>
            ) : null}

          </article>

        </PublicHelpProfileDetailLayout>

        {gallery.length > 0 ? (
          <section className={`shell ${styles.gallerySection}`} aria-labelledby="breed-gallery-heading">
            <h2 id="breed-gallery-heading">Fotografie plemena</h2>
            <PublicPhotoGallery
              variant="breed"
              className={styles.galleryGrid}
              label={`Fotografie plemena ${breed.name}`}
              maxImages={gallery.length}
              images={gallery.map((item, index) => ({
                src: item.imageUrl,
                alt: item.alt || `${breed.name} – fotografia ${index + 1}`,
                caption:
                  item.caption || item.credit ? (
                    <>
                      {item.caption}
                      {item.caption && item.credit ? " · " : ""}
                      {item.credit ? <span>Foto: {item.credit}</span> : null}
                    </>
                  ) : undefined,
              }))}
              renderImage={(image) => <BreedPhoto src={image.src} alt={image.alt} />}
            />
          </section>
        ) : null}

        {relatedArticles.length > 0 ? (
          <section
            className={`breed-related-section shell ${styles.compactRelated} ${styles.anchorSection}`}
            id="suvisiaci-obsah"
          >
            <header>
                <h2>Články o tomto plemene</h2>
            </header>
            <PublicContentList label="Súvisiace články k plemenu">
              {relatedArticles.map((article) => (
                <PublicArticleListItem
                  key={article.slug}
                  href={article.href}
                  title={article.title}
                  topic={article.topic}
                  date={article.date}
                  dateTime={article.dateIso}
                  image={
                    article.image
                      ? {
                          src: article.image,
                          alt: `Ilustračná fotografia k článku: ${article.title}`,
                        }
                      : undefined
                  }
                />
              ))}
            </PublicContentList>
          </section>
        ) : null}

        {relations.similarBreeds.length > 0 ? (
          <section
            id="podobne"
            className={`breed-related-section shell ${styles.compactRelated} ${styles.anchorSection}`}
          >
            <header>
                <h2>Podobné plemená</h2>
            </header>
            <div className="breed-similar-grid">
              {relations.similarBreeds.map((item) => (
                <Link href={item.href} key={item.id}>
                  {item.image ? (
                    <BreedPhoto src={item.image} alt="" loading="lazy" />
                  ) : (
                    <span aria-hidden="true">
                      <PublicMediaFallback />
                    </span>
                  )}
                  <strong>{item.name}</strong>
                  <small>
                    FCI {item.fciGroup} · {item.fciSection}
                  </small>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="breed-detail-footer shell">
          <Link href="/plemena" className="button button--dark">
            Späť do atlasu <ArrowIcon />
          </Link>
        </div>
      </PublicFoundation>
    </main>
  );
}
