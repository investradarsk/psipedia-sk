import { BreedPhoto } from "@/components/breed-photo";
import { HomeBreedMagazine, HomeEditorialSection, HomeLatestArticles, HomeMagazineBanner, HomeMagazineSidebar } from "@/components/home-editorial";
import { HomePortalSearch } from "@/components/home-portal-search";
import { ArrowIcon, PawMark, SparkIcon } from "@/components/icons";
import { DogAgeCalculator } from "@/components/dog-age-calculator";
import { HomeDogNameDayEntry } from "@/components/home-dog-name-day-entry";
import { AdSlot } from "@/components/ad-slot";
import { dayOfYearInBratislava } from "@/lib/breed-canonical";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { getBreedOfTheDay, listFeaturedBreeds } from "@/lib/breed-store";
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
import { ImageDisplay } from "@/components/image-display";
import { EventImage } from "@/components/event-image";
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
  const [publishedArticles, nextEvents, activeHelpCases, breedOfTheDay, veterinarians, homeHeroVisual, featuredBreeds] = await Promise.all([
    getPublishedArticleSummaries({ limit: 120 }),
    getHomepageUpcomingEventsWithImages(3),
    getHomepageHighlightedHelpCasesWithImages(3),
    getBreedOfTheDay(dayOfYear),
    getHomepageDirectoryProfilesWithImages("veterinari", 3),
    getResolvedSectionVisual("home.hero"),
    listFeaturedBreeds(6),
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
  const featuredBreedCards = [...(breedOfTheDay ? [breedOfTheDay] : []), ...featuredBreeds]
    .filter((breed) => Boolean(breed.image?.trim()))
    .filter((breed, index, all) => all.findIndex((item) => item.slug === breed.slug) === index)
    .slice(0, 5);
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


      <HomeLatestArticles
        articles={articleSelection.latest}
        sidebar={
          <>
            <HomeMagazineSidebar title="Najbližšie podujatia" href="/podujatia" actionLabel="Celý kalendár">
              {nextEvents.length ? (
                <div className="home-event-list home-side-list" data-home-events>
                  {nextEvents.map((event) => (
                    <article className="home-event-item" key={event.id} data-home-event>
                      <Link href={eventHref(event)}>
                        <span className="home-event-media">
                          <EventImage imageUrl={event.imageUrl} eventType={event.eventType} mode={event.imageDisplay} config={event.thumbnailImageDisplay} sizes="96px" alt={`Obrázok k podujatiu ${event.title}`} loading="lazy" decoding="async" />
                        </span>
                        <span className="home-event-copy">
                          <time dateTime={event.startDate}>{formatEventDate(event)}</time>
                          <strong>{event.title}</strong>
                          <span>{event.city}</span>
                        </span>
                        <span className="home-event-arrow" aria-hidden="true"><ArrowIcon size={18} /></span>
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="home-editorial-empty" data-home-events-empty>
                  <strong>Nové podujatia práve dopĺňame</strong>
                  <p>Prejdi celý kalendár a objav ďalšie možnosti.</p>
                </div>
              )}
            </HomeMagazineSidebar>
            <HomeMagazineSidebar title="Veterinárna starostlivosť na jednom mieste" href="/adresar/veterinari" actionLabel="Všetci veterinári">
              {veterinarians.length ? (
                <div className="home-vet-list" data-home-veterinarians>
                  {veterinarians.map((profile) => (
                    <article className="home-vet-item" key={profile.id}>
                      <Link href={directoryProfileHref(profile)}>
                        <span className="home-vet-photo">
                          {profile.imageUrl && <ImageDisplay roleHint="generic" context="thumbnail" config={profile.thumbnailImageDisplay} src={profile.imageUrl} srcSet={responsiveMediaSrcSet(profile.imageUrl, [160, 320])} sizes="50px" alt={`Obrázok profilu ${profile.name}`} loading="lazy" decoding="async" />}
                        </span>
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
                  <p>Vyhľadaj ambulanciu podľa mesta alebo kraja.</p>
                </div>
              )}
            </HomeMagazineSidebar>
          </>
        }
      />

      <HomeMagazineBanner
        testId="profil"
        title="Pridajte svoj profil"
        description="Prevádzkujete službu pre psov? Nech vás majitelia ľahšie nájdu v adresári."
        label="Pridať profil"
        href="/partner/profily/novy"
      />

      <HomeEditorialSection
        eyebrow="Od prvých dní"
        title="Šteniatka"
        description="Prvé mesiace, socializácia, rast a dobré základy spoločného života."
        articles={articleSelection.bySection.steniatka}
        href="/steniatka"
        actionLabel="Všetko o šteniatkach"
        testId="steniatka"
        sidebar={
          <HomeMagazineSidebar title="Plemeno dňa" href="/plemena" actionLabel="Prejsť do atlasu">
            {breedOfTheDay?.image?.trim() ? (
              <Link className="home-side-breed" href={`/plemena/${breedOfTheDay.slug}`} data-home-breed>
                <BreedPhoto src={breedOfTheDay.image} alt={`${breedOfTheDay.name} – plemeno dňa`} sizes="(max-width: 900px) 55vw, 320px" loading="lazy" decoding="async" />
                <strong>{breedOfTheDay.name}</strong>
                <span>{breedOfTheDay.intro}</span>
                <span className="home-side-more">Profil plemena <ArrowIcon size={16} /></span>
              </Link>
            ) : (
              <p className="home-side-muted">Spoznaj atlas publikovaných plemien a ich potreby.</p>
            )}
          </HomeMagazineSidebar>
        }
      />

      <HomeMagazineBanner
        testId="podujatie"
        title="Pridajte podujatie"
        description="Organizujete výstavu, preteky, seminár alebo tréning? Dajte o ňom vedieť komunite."
        label="Pridať podujatie"
        href="/partner/podujatia/nove"
      />

      <HomeEditorialSection
        eyebrow="Poradňa"
        title="Zdravie a starostlivosť"
        description="Prevencia, výživa a starostlivosť o psa s praktickými odporúčaniami."
        articles={articleSelection.bySection.starostlivost}
        href="/starostlivost"
        actionLabel="Všetko o zdraví"
        testId="starostlivost"
        sidebar={
          <HomeMagazineSidebar title="Veterinári v adresári" href="/adresar/veterinari" actionLabel="Nájsť veterinára">
            {veterinarians.length ? (
              <ul className="home-side-quicklinks">
                {veterinarians.map((profile) => (
                  <li key={profile.id}><Link href={directoryProfileHref(profile)}>{profile.name}<span>{profile.city}</span></Link></li>
                ))}
              </ul>
            ) : <p className="home-side-muted">V adresári nájdeš veterinárne ambulancie a kliniky podľa lokality.</p>}
          </HomeMagazineSidebar>
        }
      />

      <HomeEditorialSection
        eyebrow="Spoločné zážitky"
        title="Výcvik a aktivity"
        description="Tréning, šport a aktivity pre spokojný spoločný život."
        articles={articleSelection.bySection.aktivity}
        href="/aktivity"
        actionLabel="Výcvik a aktivity"
        testId="aktivity"
        sidebar={
          <HomeMagazineSidebar title="Kynologické podujatia" href="/podujatia" actionLabel="Zobraziť kalendár">
            {nextEvents.length ? (
              <ul className="home-side-quicklinks">
                {nextEvents.map((event) => (
                  <li key={event.id}><Link href={eventHref(event)}>{event.title}<span>{formatEventDate(event)} · {event.city}</span></Link></li>
                ))}
              </ul>
            ) : <p className="home-side-muted">Výstavy, športové podujatia a semináre priebežne pribúdajú v kalendári.</p>}
          </HomeMagazineSidebar>
        }
      />

      <HomeEditorialSection
        eyebrow="Atlas FCI"
        title="Plemená"
        description="Povaha, pracovné vlohy a potreby skutočných publikovaných plemien."
        articles={[]}
        feature={<HomeBreedMagazine breeds={featuredBreedCards} />}
        href="/plemena"
        actionLabel="Všetky plemená"
        testId="plemena"
        sidebar={
          <HomeMagazineSidebar title="Vyberte si plemeno" href="/plemena" actionLabel="Otvoriť atlas plemien">
            <nav className="home-side-quicklinks" aria-label="Výber plemena">
              <Link href="/plemena">Prehliadať všetky plemená</Link>
              <Link href="/porovnat-plemena">Porovnať dve plemená</Link>
              <Link href="/adresar/chovatelske-kluby">Chovateľské kluby</Link>
            </nav>
          </HomeMagazineSidebar>
        }
      />

      <div data-home-help>
        <HomeEditorialSection
          eyebrow="Záleží na každom psovi"
          title="Pomoc psom"
          description="Aktuálne prípady, adopcie a organizácie, ktoré potrebujú podporu."
          articles={[]}
          feature={activeHelpCases.length ? (
            <div className="home-help-grid" data-home-help-items>
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
                      {item.imageUrl && <ImageDisplay roleHint="generic" context="thumbnail" config={item.thumbnailImageDisplay} src={item.imageUrl} srcSet={responsiveMediaSrcSet(item.imageUrl, [320, 480, 640, 768, 960])} sizes="(max-width: 900px) 100vw, 65vw" alt={`Obrázok k výzve ${item.title}`} loading="lazy" decoding="async" />}
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
          sidebar={
            <HomeMagazineSidebar title="Aktuálne možnosti pomoci" href="/pomoc-psom" actionLabel="Všetky možnosti pomoci">
              {activeHelpCases.length ? (
                <ul className="home-side-quicklinks">
                  {activeHelpCases.map((item) => (
                    <li key={item.id}><Link href={helpCaseHref(item)}>{item.title}<span>{getHelpCategory(item.category)?.singular ?? "Pomoc psom"} · {item.city}</span></Link></li>
                  ))}
                </ul>
              ) : <p className="home-side-muted">Sleduj zverejnené výzvy, adopcie a organizácie, ktorým môžeš pomôcť.</p>}
            </HomeMagazineSidebar>
          }
          href="/pomoc-psom"
          actionLabel="Všetky možnosti pomoci"
          testId="help"
        />
      </div>

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
