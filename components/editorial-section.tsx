import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import Link from "next/link";
import { ArticleListItem } from "@/components/article-list-item";
import { HorizontalCarouselControls } from "@/components/horizontal-carousel-controls";
import {
  ArrowIcon,
  HeartIcon,
  PawMark,
  SparkIcon,
  WhistleIcon,
} from "@/components/icons";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { PortalSectionTabs } from "@/components/portal-section-tabs";
import { HomePortalSearch } from "@/components/home-portal-search";
import {
  PublicActionLink,
  PublicContentList,
  PublicFoundation,
  PublicIcon,
  PublicLandingSectionHeading,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { StructuredData } from "@/components/structured-data";
import type { Article } from "@/lib/content";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
import { formatSlovakCount } from "@/lib/slovak-count";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import {
  articleHref,
  articlePortalSection,
  portalSubpageHref,
  type PortalSection,
  type PortalSubpage,
} from "@/lib/portal";
import styles from "./editorial-section.module.css";

type EditorialSectionSlug = "steniatka" | "starostlivost" | "aktivity";

function isEditorialSectionSlug(slug: string): slug is EditorialSectionSlug {
  return slug === "steniatka" || slug === "starostlivost" || slug === "aktivity";
}

function sectionToneClass(slug: EditorialSectionSlug) {
  if (slug === "starostlivost") return styles.careTone;
  if (slug === "aktivity") return styles.activityTone;
  return styles.puppyTone;
}

function topicImage(sectionSlug: EditorialSectionSlug, topicSlug: string, articles: Article[]) {
  const fallback = {
    steniatka: "/images/hero-labrador.webp",
    starostlivost: "/images/zdravie-veterinar.webp",
    aktivity: "/images/trening-pri-nohe.webp",
  } satisfies Record<EditorialSectionSlug, string>;
  return (
    articles.find((article) => articleArea(article, sectionSlug) === topicSlug && article.image)
      ?.image ?? fallback[sectionSlug]
  );
}

function nextStepImage(href: string) {
  if (href.includes("trener") || href.includes("kynologicke-kluby"))
    return "/images/trening-pri-nohe.webp";
  if (href.includes("veterinari") || href.includes("fyzioterapia"))
    return "/images/zdravie-veterinar.webp";
  if (href.includes("salony")) return "/images/breeds/anglicky-koker-spaniel.webp";
  if (href.includes("hotely")) return "/images/breeds/beagle.webp";
  return "/images/hero-labrador.webp";
}

function articleArea(article: Article, sectionSlug: EditorialSectionSlug) {
  if (sectionSlug === "steniatka") return article.portalSubpage;
  if (sectionSlug === "starostlivost") {
    return (
      article.portalSubpage ||
      (
        {
          Zdravie: "zdravie",
          Výživa: "vyziva",
          Výcvik: "vycvik",
          "Život so psom": "spravanie",
        } as Record<string, string>
      )[article.category]
    );
  }
  return article.portalSubpage || (article.category === "Výcvik" ? "psie-sporty" : undefined);
}

function orderedArticles(section: PortalSection, articles: Article[], subpage?: PortalSubpage) {
  const sectionSlug = section.slug;
  if (!isEditorialSectionSlug(sectionSlug)) return [];
  const candidates = articles.filter(
    (article) =>
      articlePortalSection(article) === sectionSlug &&
      (!subpage || articleArea(article, sectionSlug) === subpage.slug),
  );
  const featuredSlugs = subpage
    ? (subpage.featuredArticleSlugs ?? [])
    : section.subpages.flatMap((item) => item.featuredArticleSlugs ?? []);
  const featured = new Map(featuredSlugs.map((slug, index) => [slug, index]));
  return [...candidates].sort(
    (first, second) => (featured.get(first.slug) ?? 999) - (featured.get(second.slug) ?? 999),
  );
}

function SectionContentList({ articles, label, limit = 8 }: {
  articles: Article[];
  label: string;
  limit?: number;
}) {
  if (!articles.length) {
    return <PublicEmptyState variant="context" className={styles.emptyState}>Ďalšie články pripravujeme.</PublicEmptyState>;
  }
  return (
    <PublicContentList label={label} className={styles.contentList}>
      {articles.slice(0, limit).map((article) => (
        <ArticleListItem article={article} key={article.slug} />
      ))}
    </PublicContentList>
  );
}

function SearchBox({
  sectionSlug,
  subpage,
  placeholder: managedPlaceholder,
  buttonLabel: managedButtonLabel,
  shortcuts: managedShortcuts,
}: {
  sectionSlug: EditorialSectionSlug;
  subpage?: PortalSubpage;
  placeholder?: string;
  buttonLabel?: string;
  shortcuts?: Array<{ href: string; label: string }>;
}) {
  const sectionConfig = {
    steniatka: {
      label: "Čo potrebuješ vedieť o šteniatku?",
      placeholder: "Hľadaj prvú noc, socializáciu, kŕmenie alebo očkovanie…",
      button: "Hľadať v sprievodcovi",
    },
    starostlivost: {
      label: "Čo riešiš so svojím psom?",
      placeholder: "Čo riešiš? Napríklad hnačka, svrbenie alebo samota…",
      button: "Nájsť odpoveď",
    },
    aktivity: {
      label: "Akú aktivitu alebo tréning hľadáš?",
      placeholder: "Hľadaj tréning, šport, výlet alebo cestovanie…",
      button: "Hľadať v sekcii",
    },
  }[sectionSlug];
  const label = subpage ? `Hľadať v téme ${subpage.label}` : sectionConfig.label;
  const placeholder = subpage ? `Hľadať v téme ${subpage.label}…` : sectionConfig.placeholder;
  const hidden = [
    { name: "sekcia", value: sectionSlug },
    ...(subpage ? [{ name: "podsekcia", value: subpage.slug }] : []),
  ];

  return (
    <HomePortalSearch
      action="/hladat"
      panelLabel={`Vyhľadávanie: ${label}`}
      eyebrow="ČO POTREBUJEŠ VYRIEŠIŤ?"
      title={subpage ? `Hľadať v téme ${subpage.label}` : sectionConfig.label}
      shortcuts={managedShortcuts ?? []}
      id={`section-search-${sectionSlug}-${subpage?.slug ?? "all"}`}
      label={label}
      placeholder={managedPlaceholder ?? placeholder}
      buttonLabel={managedButtonLabel ?? sectionConfig.button}
      allowEmpty
      hidden={hidden}
      searchScope={sectionSlug}
    />
  );
}

function HubCallout({ sectionSlug }: { sectionSlug: EditorialSectionSlug }) {
  const config = {
    steniatka: {
      icon: <PawMark />,
      eyebrow: "Začni podľa situácie",
      title: "Čakáš šteniatko alebo je už doma?",
      description: "Vyber si správny začiatok a pokračuj podľa fázy, v ktorej sa práve nachádzaš.",
      urgent: false,
      actions: [
        {
          href: "/steniatka/pred-kupou-psa",
          label: "Ešte sa rozhodujem",
          variant: "secondary" as const,
        },
        { href: "/steniatka/prve-dni", label: "Šteniatko je doma", variant: "primary" as const },
      ],
    },
    starostlivost: {
      icon: <HeartIcon />,
      eyebrow: "Keď ide o čas",
      title: "Má pes akútny problém?",
      description:
        "Pri sťaženom dýchaní, kolapse, silnom krvácaní, nafúknutom tvrdom bruchu alebo podozrení na otravu nečakaj na odpoveď z internetu.",
      urgent: true,
      actions: [
        {
          href: "/starostlivost/kedy-ist-so-psom-k-veterinarovi",
          label: "Kedy volať ihneď",
          variant: "secondary" as const,
        },
        { href: "/adresar/veterinari", label: "Nájsť veterinára", variant: "primary" as const },
      ],
    },
    aktivity: {
      icon: <WhistleIcon />,
      eyebrow: "Vyber rozumne",
      title: "Dobrá aktivita sedí konkrétnemu psovi",
      description:
        "Zohľadni vek a zdravie, motiváciu psa, čas aj prostredie. Náročnosť pridávaj postupne.",
      urgent: false,
      actions: [
        {
          href: "/aktivity/psie-sporty",
          label: "Porovnať možnosti",
          variant: "secondary" as const,
          icon: <ArrowIcon />,
        },
      ],
    },
  }[sectionSlug];

  return (
    <section
      className={`${styles.callout} ${config.urgent ? styles.calloutUrgent : ""}`}
      aria-labelledby={`${sectionSlug}-hub-callout`}
    >
      <PublicIcon icon={config.icon} size="lg" className={styles.calloutIcon} />
      <div className={styles.calloutCopy}>
        <span className={styles.eyebrow}>{config.eyebrow}</span>
        <h2 id={`${sectionSlug}-hub-callout`}>{config.title}</h2>
        <p>{config.description}</p>
      </div>
      <div className={styles.calloutActions}>
        {config.actions.map((action) => (
          <PublicActionLink
            href={action.href}
            variant={action.variant}
            icon={"icon" in action ? action.icon : undefined}
            key={action.href}
          >
            {action.label}
          </PublicActionLink>
        ))}
      </div>
    </section>
  );
}

function nextSteps(sectionSlug: EditorialSectionSlug) {
  if (sectionSlug === "starostlivost") {
    return [
      {
        title: "Veterinári",
        description: "Ambulancie, kliniky a pohotovosti podľa lokality.",
        href: "/adresar/veterinari",
        icon: <HeartIcon size={22} />,
      },
      {
        title: "Fyzioterapia",
        description: "Rehabilitácia, regenerácia a podpora pohybu.",
        href: "/adresar/fyzioterapia",
        icon: <SparkIcon size={22} />,
      },
      {
        title: "Tréneri a školy",
        description: "Pomoc s výcvikom a problémovým správaním.",
        href: "/adresar/treneri",
        icon: <WhistleIcon size={22} />,
      },
      {
        title: "Psie salóny",
        description: "Úprava srsti a pravidelná hygienická starostlivosť.",
        href: "/adresar/salony-a-sluzby",
        icon: <SparkIcon size={22} />,
      },
    ];
  }
  if (sectionSlug === "aktivity") {
    return [
      {
        title: "Tréneri a psie školy",
        description: "Základy, športová príprava aj individuálne vedenie.",
        href: "/adresar/treneri",
        icon: <WhistleIcon size={22} />,
      },
      {
        title: "Kynologické kluby",
        description: "Cvičiská, športové kluby a miestne organizácie.",
        href: "/adresar/kynologicke-kluby",
        icon: <SparkIcon size={22} />,
      },
      {
        title: "Podujatia",
        description: "Preteky, tréningy, semináre a spoločné stretnutia.",
        href: "/podujatia",
        icon: <PawMark size={22} />,
      },
      {
        title: "Hotely a opatrovanie",
        description: "Starostlivosť o psa, keď nemôže cestovať s tebou.",
        href: "/adresar/hotely-a-opatrovanie",
        icon: <SparkIcon size={22} />,
      },
    ];
  }
  return [
    {
      title: "Veterinári",
      description: "Ambulancie, kliniky a pohotovosti podľa lokality.",
      href: "/adresar/veterinari",
      icon: <HeartIcon size={22} />,
    },
    {
      title: "Tréneri a školy",
      description: "Vedenie socializácie a prvých tréningových krokov.",
      href: "/adresar/treneri",
      icon: <WhistleIcon size={22} />,
    },
    {
      title: "Chovateľské stanice",
      description: "Nájdi chovateľov a over si pôvod aj zdravotné vyšetrenia.",
      href: "/adresar/chovatelske-stanice",
      icon: <SparkIcon size={22} />,
    },
  ];
}

function safetyNote(sectionSlug: EditorialSectionSlug) {
  if (sectionSlug === "starostlivost") {
    return (
      <>
        <strong>Dôležité:</strong> Psipedia nenahrádza veterinárne vyšetrenie. Pri akútnom stave
        alebo rýchlom zhoršovaní kontaktuj veterinára bez čakania.
      </>
    );
  }
  if (sectionSlug === "aktivity") {
    return (
      <>
        <strong>Bezpečný pohyb:</strong> Záťaž zvyšuj postupne. Pri bolesti, krívaní alebo
        zdravotnom obmedzení vhodný pohyb konzultuj s veterinárom alebo fyzioterapeutom.
      </>
    );
  }
  return (
    <>
      <strong>Dôležité pre rast:</strong> Očkovanie, zdravotné ťažkosti, výživu a primeranú záťaž
      rieš podľa konkrétneho šteniatka s veterinárom.
    </>
  );
}

export async function EditorialSectionHub({
  section,
  articles,
}: {
  section: PortalSection;
  articles: Article[];
}) {
  const sectionSlug = section.slug;
  if (!isEditorialSectionSlug(sectionSlug)) return null;
  const subpages = section.subpages.filter((subpage) => subpage.visible !== false);
  const visibleArticles = orderedArticles(section, articles);
  const nextCards = nextSteps(sectionSlug);
  const hasScrollableServices = nextCards.length > 3;
  const heroVisual = await getSectionHeroVisual(`section.${sectionSlug}`);
  const schema = buildCollectionPageJsonLd({
    name: section.label,
    description: section.description,
    path: `/${sectionSlug}`,
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: section.label, path: `/${sectionSlug}` },
    ],
    items: subpages.map((subpage) => ({
      name: subpage.label,
      path: portalSubpageHref(section, subpage),
    })),
  });

  return (
    <PublicFoundation className={`${styles.foundation} ${sectionToneClass(sectionSlug)}`}>
      <main id="obsah" className={styles.main}>
        <StructuredData value={schema} />
        <UnifiedSectionHeroShell>
          <UnifiedSectionHero
            breadcrumbs={
              <Breadcrumbs>
                <Link href="/">Domov</Link>
                <span>/</span>
                <span>{section.label}</span>
              </Breadcrumbs>
            }
            eyebrow={section.eyebrow}
            title={section.label}
            intro={section.description}
            visual={heroVisual}
            portalSearchSlot={<SearchBox sectionSlug={sectionSlug} />}
          />
        </UnifiedSectionHeroShell>

        {sectionSlug === "starostlivost" ? (
          <PageContainer className={styles.calloutShell} data-section-public-callout>
            <HubCallout sectionSlug="starostlivost" />
          </PageContainer>
        ) : null}

        <div className={styles.topicGroups} data-section-subcategories data-section-topic-groups>
          <PageContainer>
            {subpages.map((subpage) => {
              const related = orderedArticles(section, articles, subpage);
              const href = portalSubpageHref(section, subpage);
              return (
                <section className={styles.topicGroup} key={subpage.slug}
                  aria-labelledby={`area-${sectionSlug}-${subpage.slug}`} data-section-article-group>
                  <div className={styles.topicGroupHeader}>
                    <img
                      src={subpage.imageUrl || topicImage(sectionSlug, subpage.slug, visibleArticles)}
                      alt=""
                      loading="lazy" decoding="async"
                      className={styles.topicGroupPhoto}
                    />
                    <div className={styles.topicGroupHeading}>
                      <h2 id={`area-${sectionSlug}-${subpage.slug}`}>
                        <Link href={href}>{subpage.label}</Link>
                      </h2>
                      <span>{formatSlovakCount(related.length, { one: "článok", few: "články", many: "článkov" })}</span>
                    </div>
                    <PublicActionLink href={href} variant="tertiary" icon={<ArrowIcon />}>
                      Všetky články z oblasti
                    </PublicActionLink>
                  </div>
                  <div data-section-content-list>
                    {related.length > 0 ? (
                      <SectionContentList
                        articles={related}
                        label={`Články z oblasti ${subpage.label}`}
                        limit={5}
                      />
                    ) : (
                      <p className={styles.topicGroupEmpty}>Články z tejto oblasti pripravujeme.</p>
                    )}
                  </div>
                </section>
              );
            })}
          </PageContainer>
        </div>

        <section className={styles.nextSection} aria-labelledby={`${sectionSlug}-next`}>
          <PageContainer>
            <PublicLandingSectionHeading
              eyebrow="Ďalší krok"
              title="Užitočné služby a pokračovanie"
              id={`${sectionSlug}-next`}
              action={hasScrollableServices ? (
                <HorizontalCarouselControls
                  targetId={`${sectionSlug}-next-carousel`}
                  className={styles.carouselControls}
                  buttonClassName={styles.carouselControl}
                />
              ) : null}
            />
            <div
              id={`${sectionSlug}-next-carousel`}
              className={styles.nextCarousel}
              data-section-next-carousel
              role="region"
              aria-label="Užitočné služby a pokračovanie"
            >
              {nextCards.map((item) => (
                <Link
                  href={item.href}
                  className={styles.nextCard}
                  data-section-next-card
                  key={item.href}
                >
                  <span className={styles.nextCardMedia}>
                    <img src={nextStepImage(item.href)} alt="" loading="lazy" decoding="async" />
                    <span className={styles.nextCardIcon} aria-hidden="true">
                      {item.icon}
                    </span>
                  </span>
                  <span className={styles.nextCardCopy}>
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                    <span className={styles.nextCardAction}>
                      Otvoriť <ArrowIcon size={18} />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            {hasScrollableServices ? (
              <div className={styles.carouselCue} aria-hidden="true">
                <span>←</span><i /><i /><i /><span>→</span>
              </div>
            ) : null}
            <p className={styles.safetyNote}>{safetyNote(sectionSlug)}</p>
          </PageContainer>
        </section>
      </main>
    </PublicFoundation>
  );
}

export async function EditorialSectionTopic({
  section,
  subpage,
  articles,
}: {
  section: PortalSection;
  subpage: PortalSubpage;
  articles: Article[];
}) {
  const sectionSlug = section.slug;
  if (!isEditorialSectionSlug(sectionSlug)) return null;
  const topicArticles = orderedArticles(section, articles, subpage);
  const heroVisual = await getSectionHeroVisual(`subsection.${sectionSlug}.${subpage.slug}`);
  const isHealthLanding = sectionSlug === "starostlivost" && subpage.slug === "zdravie";
  const path = portalSubpageHref(section, subpage);
  const schema = buildCollectionPageJsonLd({
    name: `${subpage.label} – ${section.label}`,
    description: subpage.description,
    path,
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: section.label, path: `/${sectionSlug}` },
      { name: subpage.label, path },
    ],
    items: topicArticles.map((article) => ({ name: article.title, path: articleHref(article) })),
  });

  return (
    <PublicFoundation className={`${styles.foundation} ${sectionToneClass(sectionSlug)}`}>
      <main id="obsah" className={styles.main}>
        <StructuredData value={schema} />
        <UnifiedSectionHeroShell>
          <UnifiedSectionHero
            breadcrumbs={
              <Breadcrumbs>
                <Link href="/">Domov</Link>
                <span>/</span>
                <Link href={`/${sectionSlug}`}>{section.label}</Link>
                <span>/</span>
                <span>{subpage.label}</span>
              </Breadcrumbs>
            }
            eyebrow={section.eyebrow}
            title={subpage.label}
            intro={subpage.description}
            visual={heroVisual}
            portalSearchSlot={<SearchBox sectionSlug={sectionSlug} subpage={subpage}
                shortcuts={isHealthLanding ? [
                  { href: "/adresar/veterinari", label: "Veterinári" },
                  { href: "/starostlivost/vyziva", label: "Výživa" },
                ] : undefined}
              />}
          />
        </UnifiedSectionHeroShell>

        <PortalSectionTabs section={section} activeSlug={subpage.slug} />

        <PageContainer className={styles.topicBody} data-section-public-topic-body>
          {isHealthLanding ? (
            <div className={styles.topicEmergency} data-health-urgent>
              <HubCallout sectionSlug="starostlivost" />
            </div>
          ) : null}
          <section className={styles.relatedSection} aria-labelledby="topic-related-heading" data-section-content-list>
            <PublicLandingSectionHeading
              eyebrow="Články v oblasti"
              title={subpage.label}
              id="topic-related-heading"
            />
            <SectionContentList
              articles={topicArticles}
              label={`Články v oblasti ${subpage.label}`}
              limit={Math.max(10, topicArticles.length)}
            />
          </section>
          <p className={styles.safetyNote}>{safetyNote(sectionSlug)}</p>
        </PageContainer>
      </main>
    </PublicFoundation>
  );
}
