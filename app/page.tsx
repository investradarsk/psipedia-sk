import { BreedPhoto } from "@/components/breed-photo";
import { HomeEditorialSection, HomeLatestArticles } from "@/components/home-editorial";
import { HomePortalSearch } from "@/components/home-portal-search";
import { ArrowIcon, PawMark, SparkIcon } from "@/components/icons";
import { DogAgeCalculator } from "@/components/dog-age-calculator";
import { HomeDogNameDayEntry } from "@/components/home-dog-name-day-entry";
import { AdSlot } from "@/components/ad-slot";
import { dayOfYearInBratislava } from "@/lib/breed-canonical";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { getBreedOfTheDay } from "@/lib/breed-store";
import { directoryCategories, directoryCategoryHref, directoryProfileHref } from "@/lib/directory";
import { getHomepageDirectoryProfilesWithImages } from "@/lib/directory-store";
import { getHomepageUpcomingEventsWithImages } from "@/lib/event-store";
import { eventHref, formatEventDate } from "@/lib/events";
import { getHomepageHighlightedHelpCasesWithImages } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { selectHomepageArticles } from "@/lib/homepage-content";
import { sectionVisualPositionPercent } from "@/lib/section-visual-contract";
import { getResolvedSectionVisual } from "@/lib/section-visual-store";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { AD_PLACEMENTS } from "@/lib/monetization";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import styles from "./home-v2.module.css";

// Site-level positioning: the homepage is a portal, not the landing for individual services.
const homepageSearchDescription =
  "Psipedia.sk je slovenský portál o psoch: rady o zdraví a výcviku, atlas plemien, veterinári, psie salóny, podujatia a pomoc psom.";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Psipedia.sk – rozumej svojmu psovi",
    description: homepageSearchDescription,
    path: "/",
    image: "/images/hero-labrador.webp",
    imageAlt: "Čierny labrador na lúke",
  }),
  title: { absolute: "Psipedia.sk – rozumej svojmu psovi" },
};

export default async function Home() {
  const dayOfYear = dayOfYearInBratislava();
  const [publishedArticles, nextEvents, activeHelpCases, breedOfTheDay, veterinarians, homeHeroVisual] = await Promise.all([
    getPublishedArticleSummaries({ limit: 120 }),
    getHomepageUpcomingEventsWithImages(3),
    getHomepageHighlightedHelpCasesWithImages(3),
    getBreedOfTheDay(dayOfYear),
    getHomepageDirectoryProfilesWithImages("veterinari", 3),
    getResolvedSectionVisual("home.hero"),
  ]);
  const homeHero = homeHeroVisual ?? {
    imageUrl: "/images/hero-labrador.webp",
    altText: "Čierny labrador beží po rannej lúke",
    desktopCrop: { x: 0.5, y: 0.5, zoom: 1 },
    mobileCrop: { x: 0.64, y: 0.5, zoom: 1 },
  };
  const homeHeroStyle = {
    "--section-visual-desktop-x": sectionVisualPositionPercent(homeHero.desktopCrop.x),
    "--section-visual-desktop-y": sectionVisualPositionPercent(homeHero.desktopCrop.y),
    "--section-visual-desktop-zoom": homeHero.desktopCrop.zoom,
    "--section-visual-mobile-x": sectionVisualPositionPercent(homeHero.mobileCrop.x),
    "--section-visual-mobile-y": sectionVisualPositionPercent(homeHero.mobileCrop.y),
    "--section-visual-mobile-zoom": homeHero.mobileCrop.zoom,
  } as CSSProperties & Record<string, string | number>;
  const articleSelection = selectHomepageArticles(publishedArticles, { latestLimit: 5, sectionLimit: 5, backfillSectionsFromLatest: true });
  const homepageServiceSlugs: string[] = [
    "treneri",
    "salony-a-sluzby",
    "hotely-a-opatrovanie",
    "vencenie",
    "fyzioterapia",
    "dalsie-sluzby",
  ];
  const otherServiceCategories = directoryCategories.filter((category) => homepageServiceSlugs.includes(category.slug));
  const serviceCardImages: Record<string, string> = {
    treneri: "/images/trening-pri-nohe.webp",
    "salony-a-sluzby": "/images/breeds/anglicky-koker-spaniel.webp",
    "hotely-a-opatrovanie": "/images/breeds/beagle.webp",
    vencenie: "/images/breeds/jack-russell-terier.webp",
    fyzioterapia: "/images/zdravie-veterinar.webp",
    "dalsie-sluzby": "/images/hero-labrador.webp",
  };

  return (
    <main id="obsah" className={styles.homeV2}>
      <section className="hero-section shell" data-home-hero>
        <div className="hero-card">
          <img className="hero-image" src={homeHero.imageUrl} srcSet={responsiveMediaSrcSet(homeHero.imageUrl, [640, 960, 1280, 1600, 1920])} sizes="100vw" alt={homeHero.altText} style={homeHeroStyle} fetchPriority="high" decoding="async" />
          <div className="hero-shade" />
          <div className="hero-copy">
            <span className="hero-kicker"><SparkIcon size={17} /> Slovenský portál pre psí život</span>
            <h1>Rozumej svojmu psovi.<br /><em>Každý deň o trochu viac.</em></h1>
            <p>Psipedia.sk je slovenský portál o psoch – rady, služby, podujatia a pomoc na jednom mieste.</p>
          </div>
        </div>
      </section>

      <div className="shell home-search-shell" data-home-search>
        <HomePortalSearch />
      </div>

      <HomeLatestArticles articles={articleSelection.latest} />

      <section className="section shell home-events-section" data-home-events aria-labelledby="home-events-title">
        <div className="home-section-heading home-section-heading--compact">
          <div>
            <span className="eyebrow">Kalendár</span>
            <h2 id="home-events-title">Najbližšie podujatia</h2>
            <p>Výstavy, tréningy, preteky a ďalšie podujatia zo sveta psov.</p>
          </div>
        </div>
        {nextEvents.length ? (
          <div className="home-event-list">
            {nextEvents.map((event) => (
              <article className="home-event-item" key={event.id} data-home-event>
                <Link href={eventHref(event)}>
                  <span className="home-event-media">
                    <img src={event.imageUrl ?? undefined} srcSet={responsiveMediaSrcSet(event.imageUrl, [320, 480, 640, 768, 960])} sizes="(max-width: 620px) 100vw, (max-width: 980px) 50vw, 30vw" alt={`Fotografia k podujatiu ${event.title}`} loading="lazy" decoding="async" />
                  </span>
                  <span className="home-event-copy">
                    <time dateTime={event.startDate}>{formatEventDate(event)}</time>
                    <strong>{event.title}</strong>
                    <span>{event.eventType} · {event.city}</span>
                  </span>
                  <span className="home-event-arrow" aria-hidden="true"><ArrowIcon size={18} /></span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="home-editorial-empty" data-home-events-empty>
            <strong>Nové podujatia práve dopĺňame</strong>
            <p>Pozri si celý kalendár a nájdi výstavy, tréningy či ďalšie akcie so psami.</p>
          </div>
        )}
        <div className="home-section-cta home-section-cta--quiet home-events-cta"><Link href="/podujatia" className="text-link">Celý kalendár <ArrowIcon size={17} /></Link></div>
      </section>

      <HomeEditorialSection
        eyebrow="Šteniatka"
        title="Najnovšie pre dobrý štart"
        description="Praktické rady pre prvé dni, výchovu, zdravie a spoločný život so šteniatkom."
        articles={articleSelection.bySection.steniatka}
        href="/steniatka"
        actionLabel="Všetko o šteniatkach"
        testId="steniatka"
      />

      <section className="section shell home-vet-section" data-home-veterinarians aria-labelledby="home-vets-title">
        <div className="home-section-heading home-section-heading--compact">
          <div>
            <span className="eyebrow">Veterinári</span>
            <h2 id="home-vets-title">Veterinárna starostlivosť na jednom mieste</h2>
            <p>Veterinárne ambulancie a kliniky na jednom mieste. Vyber si podľa mesta alebo kraja.</p>
          </div>
        </div>
        {veterinarians.length ? (
          <div className="home-vet-list">
            {veterinarians.map((profile) => (
              <article className="home-vet-item" key={profile.id}>
                <Link href={directoryProfileHref(profile)}>
                  <img src={profile.imageUrl ?? undefined} srcSet={responsiveMediaSrcSet(profile.imageUrl, [160, 320])} sizes="50px" alt={`Fotografia profilu ${profile.name}`} width={50} height={50} loading="lazy" decoding="async" />
                  <span>
                    <strong>{profile.name}</strong>
                    <small>{profile.city}{profile.district ? ` · ${profile.district}` : ""}</small>
                  </span>
                  <ArrowIcon size={18} />
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="home-editorial-empty" data-home-veterinarians-empty>
            <strong>Veterinárov nájdeš v adresári</strong>
            <p>Prehľadaj ambulancie a kliniky podľa mesta alebo kraja.</p>
          </div>
        )}
        <div className="home-section-cta home-section-cta--quiet" data-home-section-cta="veterinari">
          <Link href="/adresar/veterinari" className="text-link">Všetci veterinári <ArrowIcon size={17} /></Link>
        </div>
      </section>

      <HomeEditorialSection
        eyebrow="Zdravie a starostlivosť"
        title="Najnovšie o zdraví a každodennej starostlivosti"
        description="Praktické rady o zdraví, výžive, prevencii a každodennej starostlivosti."
        articles={articleSelection.bySection.starostlivost}
        href="/starostlivost"
        actionLabel="Zdravie a starostlivosť"
        testId="starostlivost"
      />

      <section className="section shell home-services-wide" data-home-services-secondary aria-labelledby="home-services-secondary-title">
        <div className="home-services-wide-copy">
          <span className="eyebrow">Služby pre psov</span>
          <h2 id="home-services-secondary-title">Praktické služby pre každý deň so psom</h2>
          <p>Tréneri, salóny, opatrovanie, venčenie, fyzioterapia a ďalšie služby na jednom mieste.</p>
        </div>
        <nav className="home-service-carousel" aria-label="Kategórie služieb">
          {otherServiceCategories.map((category) => (
            <Link key={category.slug} href={directoryCategoryHref(category)} className="home-service-card">
              <span className="home-service-card-media">
                <img src={serviceCardImages[category.slug]} alt="" loading="lazy" decoding="async" />
                <span className="home-service-card-icon" aria-hidden="true">{category.icon}</span>
              </span>
              <span className="home-service-card-copy">
                <strong>{category.heroTitle}</strong>
                <span>{` — ${category.description}`}</span>
                <span className="home-service-card-arrow" aria-hidden="true"><ArrowIcon size={20} /></span>
              </span>
            </Link>
          ))}
        </nav>
        <div className="home-service-carousel-cue" aria-hidden="true">
          <span>←</span><i /><i /><i /><span>→</span>
        </div>
        <Link href="/adresar" className="button button--dark home-services-wide-link">
          Všetky služby <ArrowIcon size={18} />
        </Link>
      </section>

      <HomeEditorialSection
        eyebrow="Výcvik a aktivity"
        title="Najnovšie pre tréning, pohyb a spoločné aktivity"
        description="Výcvik, pohyb, šport a aktivity pre lepší spoločný život so psom."
        articles={articleSelection.bySection.aktivity}
        href="/aktivity"
        actionLabel="Výcvik a aktivity"
        testId="aktivity"
      />

      <section className="section shell home-help-section" data-home-help aria-labelledby="home-help-title">
        <div className="home-section-heading home-section-heading--compact">
          <div>
            <span className="eyebrow">Aktuálne možnosti</span>
            <h2 id="home-help-title">Pomoc psom</h2>
            <p>Psy, organizácie a výzvy, ktoré práve potrebujú pomoc.</p>
          </div>
        </div>
        {activeHelpCases.length ? (
          <div className="home-help-grid">
            {activeHelpCases.map((item) => (
              <article
                className="home-help-item"
                key={item.id}
                data-home-help-item
                data-home-help-status={item.status}
                data-home-help-resolved={String(item.resolved)}
              >
                <Link href={helpCaseHref(item)}>
                  <span className="home-help-media">
                    <img src={item.imageUrl ?? undefined} srcSet={responsiveMediaSrcSet(item.imageUrl, [320, 480, 640, 768, 960])} sizes="(max-width: 620px) 100vw, (max-width: 980px) 50vw, 33vw" alt={`Fotografia k výzve ${item.title}`} loading="lazy" decoding="async" />
                  </span>
                  <span className="home-help-copy">
                    <span className="home-help-meta">
                      <span>{getHelpCategory(item.category)?.singular ?? "Pomoc psom"}</span>
                      {item.urgent ? <b>Urgentné</b> : null}
                    </span>
                    <strong>{item.title}</strong>
                    <small>{item.city}</small>
                  </span>
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="home-editorial-empty" data-home-help-empty>
            <strong>Momentálne tu nie je otvorená výzva</strong>
            <p>Pozri si všetky možnosti pomoci psom a organizáciám.</p>
          </div>
        )}
        <div className="home-section-cta home-section-cta--quiet" data-home-section-cta="pomoc">
          <Link href="/pomoc-psom" className="text-link">Všetky možnosti pomoci <ArrowIcon size={17} /></Link>
        </div>
      </section>

      {breedOfTheDay && (
        <section className="section shell home-breed-day-section" data-home-breed>
          <div className="home-section-heading home-section-heading--compact">
            <div><span className="eyebrow">Atlas plemien</span><h2>Plemeno dňa</h2></div>
          </div>
          <article className="home-breed-day">
            <BreedPhoto src={breedOfTheDay.image} alt={`${breedOfTheDay.name} – plemeno dňa`} />
            <div>
              <span className="eyebrow">Dnešný profil</span>
              <h3>{breedOfTheDay.name}</h3>
              <p>{breedOfTheDay.intro}</p>
              <dl>
                <div><dt>FCI skupina</dt><dd>{breedOfTheDay.fciGroup}. {breedOfTheDay.fciSection}</dd></div>
                {breedOfTheDay.size?.trim() && <div><dt>Veľkosť</dt><dd>{breedOfTheDay.size}</dd></div>}
                <div><dt>Energia</dt><dd>{breedOfTheDay.energy}/5</dd></div>
                <div><dt>Cvičiteľnosť</dt><dd>{breedOfTheDay.trainability}/5</dd></div>
              </dl>
              <div className="home-breed-actions">
                <Link className="button button--coral" href={`/plemena/${breedOfTheDay.slug}`}>Pozrieť profil <ArrowIcon /></Link>
                <Link className="home-breed-compare" href="/porovnat-plemena">Porovnať plemená <ArrowIcon size={18} /></Link>
              </div>
            </div>
          </article>
          <div className="home-section-cta home-section-cta--quiet"><Link href="/plemena" className="text-link">Všetky plemená <ArrowIcon size={18} /></Link></div>
        </section>
      )}

      <HomeDogNameDayEntry />

      <section className="section shell home-utility-section" data-home-calculator>
        <div className="calculator-section">
          <div className="calculator-intro">
            <span className="eyebrow eyebrow--light">Psí vek bez násobilky</span>
            <h2>Koľko „ľudských rokov“ má tvoj pes?</h2>
            <p>Prvý a druhý rok života psa bežia rýchlejšie. Potom záleží najmä na jeho veľkosti.</p>
            <span className="calculator-paw"><PawMark size={120} /></span>
          </div>
          <DogAgeCalculator />
        </div>
      </section>

      <AdSlot placementId={AD_PLACEMENTS.HOME_BOTTOM.id} />
    </main>
  );
}
