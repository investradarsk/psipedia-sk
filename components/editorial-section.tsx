import Link from "next/link";
import type { ReactElement } from "react";
import { ArrowIcon, BowlIcon, CheckIcon, HeartIcon, PawMark, SearchIcon, SparkIcon, WhistleIcon } from "@/components/icons";
import { Breadcrumbs, PageContainer } from "@/components/page-system";
import { PortalSectionTabs } from "@/components/portal-section-tabs";
import {
  PublicActionLink,
  PublicContentList,
  PublicContentListItem,
  PublicDataCard,
  PublicFoundation,
  PublicIcon,
  PublicSectionHeader,
} from "@/components/public-visual-system";
import { StructuredData } from "@/components/structured-data";
import type { Article } from "@/lib/content";
import { buildCollectionPageJsonLd } from "@/lib/listing-seo";
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

function sectionIcon(slug: EditorialSectionSlug): ReactElement {
  if (slug === "starostlivost") return <HeartIcon size={30} />;
  if (slug === "aktivity") return <WhistleIcon size={30} />;
  return <PawMark size={30} />;
}

function topicIcon(sectionSlug: EditorialSectionSlug, topicSlug: string): ReactElement {
  if (topicSlug.includes("krmen") || topicSlug === "vyziva") return <BowlIcon size={22} />;
  if (topicSlug.includes("vycvik") || topicSlug === "trening") return <WhistleIcon size={22} />;
  if (topicSlug.includes("zdrav") || topicSlug === "senior") return <HeartIcon size={22} />;
  if (topicSlug === "socializacia" || topicSlug === "spravanie" || topicSlug === "psie-sporty") return <SparkIcon size={22} />;
  return sectionIcon(sectionSlug);
}

function articleArea(article: Article, sectionSlug: EditorialSectionSlug) {
  if (sectionSlug === "steniatka") return article.portalSubpage;
  if (sectionSlug === "starostlivost") {
    return article.portalSubpage || ({
      Zdravie: "zdravie",
      Výživa: "vyziva",
      Výcvik: "vycvik",
      "Život so psom": "spravanie",
    } as Record<string, string>)[article.category];
  }
  return article.portalSubpage || (article.category === "Výcvik" ? "psie-sporty" : undefined);
}

function orderedArticles(section: PortalSection, articles: Article[], subpage?: PortalSubpage) {
  const sectionSlug = section.slug;
  if (!isEditorialSectionSlug(sectionSlug)) return [];
  const candidates = articles.filter((article) =>
    articlePortalSection(article) === sectionSlug &&
    (!subpage || articleArea(article, sectionSlug) === subpage.slug),
  );
  const featuredSlugs = subpage
    ? (subpage.featuredArticleSlugs ?? [])
    : section.subpages.flatMap((item) => item.featuredArticleSlugs ?? []);
  const featured = new Map(featuredSlugs.map((slug, index) => [slug, index]));
  return [...candidates].sort((first, second) =>
    (featured.get(first.slug) ?? 999) - (featured.get(second.slug) ?? 999),
  );
}

function SectionContentList({
  articles,
  label,
  limit = 8,
}: {
  articles: Article[];
  label: string;
  limit?: number;
}) {
  if (!articles.length) {
    return (
      <div className={styles.emptyState}>
        <strong>Obsah dopĺňame</strong>
        <p>Publikované články sa na tejto adrese zobrazia automaticky po redakčnom schválení.</p>
      </div>
    );
  }

  return (
    <PublicContentList label={label} className={styles.contentList}>
      {articles.slice(0, limit).map((article) => (
        <PublicContentListItem
          href={articleHref(article)}
          title={article.title}
          eyebrow={article.category}
          excerpt={article.excerpt}
          meta={article.readTime ? `${article.readTime} čítania` : undefined}
          image={article.image ? { src: article.image, alt: `Ilustračná fotografia k článku: ${article.title}` } : undefined}
          actionLabel="Čítať"
          key={article.slug}
        />
      ))}
    </PublicContentList>
  );
}

function HealthUrgent() {
  return (
    <section className={styles.urgent} aria-labelledby="section-health-urgent" data-health-urgent>
      <PublicIcon icon={<HeartIcon />} size="lg" className={styles.urgentIcon} />
      <div className={styles.urgentCopy}>
        <span className={styles.eyebrow}>Keď ide o čas</span>
        <h2 id="section-health-urgent">Má pes akútny problém?</h2>
        <p>Pri sťaženom dýchaní, kolapse, silnom krvácaní, nafúknutom tvrdom bruchu alebo podozrení na otravu nečakaj na odpoveď z internetu.</p>
      </div>
      <div className={styles.urgentActions}>
        <PublicActionLink href="/starostlivost/kedy-ist-so-psom-k-veterinarovi" variant="secondary">Kedy volať ihneď</PublicActionLink>
        <PublicActionLink href="/adresar/veterinari" variant="primary">Nájsť veterinára</PublicActionLink>
      </div>
    </section>
  );
}

function SearchBox({ sectionSlug }: { sectionSlug: EditorialSectionSlug }) {
  const config = {
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

  return (
    <form className={styles.search} action="/hladat" method="get" role="search">
      <SearchIcon size={20} />
      <input type="hidden" name="sekcia" value={sectionSlug} />
      <label className="sr-only" htmlFor={`section-search-${sectionSlug}`}>{config.label}</label>
      <input id={`section-search-${sectionSlug}`} name="q" maxLength={120} placeholder={config.placeholder} />
      <button type="submit">{config.button}</button>
    </form>
  );
}

function HubCallout({ sectionSlug }: { sectionSlug: EditorialSectionSlug }) {
  if (sectionSlug === "aktivity") {
    return (
      <section className={styles.callout} aria-labelledby="activity-fit-heading">
        <PublicIcon icon={<WhistleIcon />} size="lg" />
        <div>
          <span className={styles.eyebrow}>Vyber rozumne</span>
          <h2 id="activity-fit-heading">Dobrá aktivita sedí konkrétnemu psovi</h2>
          <p>Zohľadni vek a zdravie, motiváciu psa, čas aj prostredie. Náročnosť pridávaj postupne.</p>
        </div>
        <PublicActionLink href="/aktivity/psie-sporty" variant="secondary" icon={<ArrowIcon />}>Porovnať možnosti</PublicActionLink>
      </section>
    );
  }

  if (sectionSlug === "steniatka") {
    return (
      <section className={styles.callout} aria-labelledby="puppy-start-heading">
        <PublicIcon icon={<PawMark />} size="lg" />
        <div>
          <span className={styles.eyebrow}>Začni podľa situácie</span>
          <h2 id="puppy-start-heading">Čakáš šteniatko alebo je už doma?</h2>
          <p>Vyber si správny začiatok a pokračuj podľa fázy, v ktorej sa práve nachádzaš.</p>
        </div>
        <div className={styles.calloutActions}>
          <PublicActionLink href="/steniatka/pred-kupou-psa" variant="secondary">Ešte sa rozhodujem</PublicActionLink>
          <PublicActionLink href="/steniatka/prve-dni" variant="primary">Šteniatko je doma</PublicActionLink>
        </div>
      </section>
    );
  }

  return <HealthUrgent />;
}

function nextSteps(sectionSlug: EditorialSectionSlug) {
  if (sectionSlug === "starostlivost") {
    return [
      { title: "Veterinári", description: "Ambulancie, kliniky a pohotovosti podľa lokality.", href: "/adresar/veterinari", icon: <HeartIcon size={22} /> },
      { title: "Fyzioterapia", description: "Rehabilitácia, regenerácia a podpora pohybu.", href: "/adresar/fyzioterapia", icon: <SparkIcon size={22} /> },
      { title: "Tréneri a školy", description: "Pomoc s výcvikom a problémovým správaním.", href: "/adresar/treneri", icon: <WhistleIcon size={22} /> },
    ];
  }
  if (sectionSlug === "aktivity") {
    return [
      { title: "Tréneri a psie školy", description: "Základy, športová príprava aj individuálne vedenie.", href: "/adresar/treneri", icon: <WhistleIcon size={22} /> },
      { title: "Kynologické kluby", description: "Cvičiská, športové kluby a miestne organizácie.", href: "/adresar/kynologicke-kluby", icon: <SparkIcon size={22} /> },
      { title: "Podujatia", description: "Preteky, tréningy, semináre a spoločné stretnutia.", href: "/podujatia", icon: <PawMark size={22} /> },
    ];
  }
  return [
    { title: "Výber plemena", description: "Porovnaj povahu, energiu a nároky plemien podľa svojho života.", href: "/plemena/vyber-plemena", icon: <PawMark size={22} /> },
    { title: "Veterinári", description: "Ambulancie, kliniky a pohotovosti podľa lokality.", href: "/adresar/veterinari", icon: <HeartIcon size={22} /> },
    { title: "Tréneri a školy", description: "Vedenie socializácie a prvých tréningových krokov.", href: "/adresar/treneri", icon: <WhistleIcon size={22} /> },
  ];
}

function safetyNote(sectionSlug: EditorialSectionSlug) {
  if (sectionSlug === "starostlivost") {
    return <><strong>Dôležité:</strong> Psipedia nenahrádza veterinárne vyšetrenie. Pri akútnom stave alebo rýchlom zhoršovaní kontaktuj veterinára bez čakania.</>;
  }
  if (sectionSlug === "aktivity") {
    return <><strong>Bezpečný pohyb:</strong> Záťaž zvyšuj postupne. Pri bolesti, krívaní alebo zdravotnom obmedzení vhodný pohyb konzultuj s veterinárom alebo fyzioterapeutom.</>;
  }
  return <><strong>Dôležité pre rast:</strong> Očkovanie, zdravotné ťažkosti, výživu a primeranú záťaž rieš podľa konkrétneho šteniatka s veterinárom.</>;
}

export function EditorialSectionHub({
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
  const schema = buildCollectionPageJsonLd({
    name: section.label,
    description: section.description,
    path: `/${sectionSlug}`,
    breadcrumbs: [
      { name: "Domov", path: "/" },
      { name: section.label, path: `/${sectionSlug}` },
    ],
    items: subpages.map((subpage) => ({ name: subpage.label, path: portalSubpageHref(section, subpage) })),
  });

  return (
    <PublicFoundation className={styles.foundation}>
      <main id="obsah" className={styles.main}>
        <StructuredData value={schema} />
        <PageContainer className={styles.headerShell} data-section-public-header>
          <Breadcrumbs><Link href="/">Domov</Link><span>/</span><span>{section.label}</span></Breadcrumbs>
          <PublicSectionHeader
            variant="data"
            eyebrow={section.eyebrow}
            title={section.label}
            intro={<><p>{section.description}</p><p className={styles.headerIntro}>{section.intro}</p></>}
            visual={<div className={styles.headerMark}>{sectionIcon(sectionSlug)}</div>}
            className={styles.header}
          />
          <SearchBox sectionSlug={sectionSlug} />
        </PageContainer>

        <PortalSectionTabs section={section} />

        <PageContainer className={styles.calloutShell} data-section-public-callout>
          <HubCallout sectionSlug={sectionSlug} />
        </PageContainer>

        <section className={styles.contentSection} aria-labelledby={`${sectionSlug}-latest`} data-section-content-list>
          <PageContainer>
            <div className={styles.sectionHeading}>
              <div><span className={styles.eyebrow}>Odporúčané a najnovšie</span><h2 id={`${sectionSlug}-latest`}>Čítaj priamo zo sekcie</h2></div>
              <PublicActionLink href="/clanky" variant="tertiary" icon={<ArrowIcon />}>Všetky články</PublicActionLink>
            </div>
            <SectionContentList articles={visibleArticles} label={`Články v sekcii ${section.label}`} />
          </PageContainer>
        </section>

        <section className={styles.directorySection} aria-labelledby={`${sectionSlug}-areas`} data-section-directory>
          <PageContainer>
            <div className={styles.sectionHeading}>
              <div><span className={styles.eyebrow}>Oblasti</span><h2 id={`${sectionSlug}-areas`}>Vyber tému</h2></div>
              <p>Stále kategórie s jasnou adresou, stručným kontextom a súvisiacim obsahom.</p>
            </div>
            <div className={styles.dataGrid}>
              {subpages.map((subpage) => {
                const count = visibleArticles.filter((article) => articleArea(article, sectionSlug) === subpage.slug).length;
                return (
                  <PublicDataCard
                    href={portalSubpageHref(section, subpage)}
                    title={subpage.label}
                    description={subpage.description}
                    eyebrow={subpage.popularTopics?.slice(0, 2).join(" · ")}
                    meta={`${count} ${count === 1 ? "článok" : "článkov"}`}
                    icon={topicIcon(sectionSlug, subpage.slug)}
                    actionLabel="Otvoriť tému"
                    key={subpage.slug}
                  />
                );
              })}
            </div>
          </PageContainer>
        </section>

        <section className={styles.nextSection} aria-labelledby={`${sectionSlug}-next`}>
          <PageContainer>
            <div className={styles.sectionHeading}>
              <div><span className={styles.eyebrow}>Ďalší krok</span><h2 id={`${sectionSlug}-next`}>Užitočné služby a pokračovanie</h2></div>
            </div>
            <div className={styles.nextGrid}>
              {nextSteps(sectionSlug).map((item) => (
                <PublicDataCard
                  href={item.href}
                  title={item.title}
                  description={item.description}
                  icon={item.icon}
                  actionLabel="Otvoriť"
                  key={item.href}
                />
              ))}
            </div>
            <p className={styles.safetyNote}>{safetyNote(sectionSlug)}</p>
          </PageContainer>
        </section>
      </main>
    </PublicFoundation>
  );
}

function guidanceLabels(sectionSlug: EditorialSectionSlug) {
  if (sectionSlug === "starostlivost") {
    return { eyebrow: "Rýchla orientácia", first: "Čo sledovať doma", second: "Kedy nečakať", expert: "Kedy vyhľadať odborníka" };
  }
  if (sectionSlug === "aktivity") {
    return { eyebrow: "Praktický začiatok", first: "Ako začať", second: "Bezpečnosť a limity", expert: "Čo zvážiť pri výbere" };
  }
  return { eyebrow: "Praktická orientácia", first: "Praktické kroky", second: "Na čo si dať pozor", expert: "Dôležité pre túto fázu" };
}

export function EditorialSectionTopic({
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
  const labels = guidanceLabels(sectionSlug);
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
    <PublicFoundation className={styles.foundation}>
      <main id="obsah" className={styles.main}>
        <StructuredData value={schema} />
        <PageContainer className={styles.headerShell} data-section-public-header>
          <Breadcrumbs>
            <Link href="/">Domov</Link><span>/</span><Link href={`/${sectionSlug}`}>{section.label}</Link><span>/</span><span>{subpage.label}</span>
          </Breadcrumbs>
          <PublicSectionHeader
            variant="compact"
            eyebrow={section.eyebrow}
            title={subpage.label}
            intro={subpage.description}
            className={styles.topicHeader}
          />
        </PageContainer>

        <PortalSectionTabs section={section} activeSlug={subpage.slug} />

        {sectionSlug === "starostlivost" && subpage.slug === "zdravie" ? (
          <PageContainer className={styles.calloutShell}><HealthUrgent /></PageContainer>
        ) : null}

        <PageContainer className={styles.topicBody} data-section-public-topic-body>
          <section className={styles.introSection} aria-labelledby="topic-intro-heading">
            <span className={styles.eyebrow}>O tejto téme</span>
            <h2 id="topic-intro-heading">{subpage.label} v praxi</h2>
            <p>{subpage.intro || subpage.description}</p>
            {!!subpage.popularTopics?.length && (
              <div className={styles.chips} aria-label="Súvisiace témy">
                {subpage.popularTopics.map((item) => (
                  <Link href={`/hladat?q=${encodeURIComponent(item)}&sekcia=${sectionSlug}`} key={item}>{item}</Link>
                ))}
              </div>
            )}
          </section>

          {!!subpage.commonQuestions?.length && (
            <section className={styles.questions} aria-labelledby="topic-questions-heading">
              <span className={styles.eyebrow}>Časté otázky</span>
              <h2 id="topic-questions-heading">Na čo sa ľudia pri tejto téme pýtajú</h2>
              <ul>{subpage.commonQuestions.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          )}

          {(subpage.homeSteps?.length || subpage.warningSigns?.length || subpage.expertAdvice) && (
            <section className={styles.guidanceSection} aria-labelledby="topic-guidance-heading">
              <div className={styles.sectionHeading}>
                <div><span className={styles.eyebrow}>{labels.eyebrow}</span><h2 id="topic-guidance-heading">Užitočné kroky a hranice</h2></div>
              </div>
              <div className={styles.guidanceGrid}>
                {!!subpage.homeSteps?.length && (
                  <article className={styles.guidanceCard}>
                    <PublicIcon icon={<CheckIcon />} size="md" />
                    <h3>{labels.first}</h3>
                    <ul>{subpage.homeSteps.map((item) => <li key={item}>{item}</li>)}</ul>
                  </article>
                )}
                {!!subpage.warningSigns?.length && (
                  <article className={`${styles.guidanceCard} ${styles.warningCard}`}>
                    <PublicIcon icon={<HeartIcon />} size="md" />
                    <h3>{labels.second}</h3>
                    <ul>{subpage.warningSigns.map((item) => <li key={item}>{item}</li>)}</ul>
                  </article>
                )}
              </div>
              {subpage.expertAdvice && (
                <div className={styles.expertCallout}>
                  <PublicIcon icon={<SparkIcon />} size="md" />
                  <div><strong>{labels.expert}</strong><p>{subpage.expertAdvice}</p></div>
                </div>
              )}
              {!!subpage.serviceLinks?.length && (
                <div className={styles.serviceLinks}>
                  <strong>Kontakty a súvisiace služby</strong>
                  <div>
                    {subpage.serviceLinks.map((item) => (
                      <PublicActionLink href={item.href} variant="secondary" icon={<ArrowIcon />} key={`${item.label}-${item.href}`}>{item.label}</PublicActionLink>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          <section className={styles.relatedSection} aria-labelledby="topic-related-heading" data-section-content-list>
            <div className={styles.sectionHeading}>
              <div><span className={styles.eyebrow}>Súvisiace čítanie</span><h2 id="topic-related-heading">Články: {subpage.label}</h2></div>
              <PublicActionLink href="/clanky" variant="tertiary" icon={<ArrowIcon />}>Všetky články</PublicActionLink>
            </div>
            <SectionContentList articles={topicArticles} label={`Články k téme ${subpage.label}`} limit={10} />
          </section>

          <p className={styles.safetyNote}>{safetyNote(sectionSlug)}</p>
        </PageContainer>
      </main>
    </PublicFoundation>
  );
}
