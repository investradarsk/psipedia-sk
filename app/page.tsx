import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import { HOME_PROFILE_BANNER_ANCHOR } from "@/lib/visual-library-anchors";
import { getPublishedDesktopBannerColors } from "@/lib/visual-library-edit-store";
import { BreedPhoto } from "@/components/breed-photo";
import {
  HomeEditorialSection,
  HomeLatestArticles,
  HomeMagazineBanner,
  HomeMagazineSidebar,
  HomeSidebarRow,
} from "@/components/home-editorial";
import { HomePortalSearch } from "@/components/home-portal-search";
import { UnifiedSectionHero, UnifiedSectionHeroShell } from "@/components/public-visual-system";
import { ArrowIcon, PawMark, SparkIcon } from "@/components/icons";
import { DogAgeCalculator } from "@/components/dog-age-calculator";
import { AdSlot } from "@/components/ad-slot";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { listHomepageFeaturedBreeds } from "@/lib/breed-store";
import { directoryProfileHref } from "@/lib/directory";
import { getHomepageDirectoryProfilesWithImages } from "@/lib/directory-store";
import { getHomepageUpcomingEventsWithImages } from "@/lib/event-store";
import { eventHref, formatEventDate } from "@/lib/events";
import { publicLocationValue } from "@/lib/public-location";
import { getHomepageHighlightedHelpCasesWithImages } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { selectHomepageArticles } from "@/lib/homepage-content";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import { responsiveMediaSrcSet } from "@/lib/responsive-media";
import { ImageDisplay } from "@/components/image-display";
import { PublicMediaFallback } from "@/components/public-visual-system/public-media-fallback";
import { EventImage } from "@/components/event-image";
import { AD_PLACEMENTS } from "@/lib/monetization";
import { buildPageMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
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
  const [
    publishedArticles,
    nextEvents,
    activeHelpCases,
    veterinarians,
    trainers,
    homeHeroVisual,
    featuredBreeds,
    homeProfileBannerColors,
  ] = await Promise.all([
    getPublishedArticleSummaries({ limit: 120 }),
    getHomepageUpcomingEventsWithImages(3),
    getHomepageHighlightedHelpCasesWithImages(3),
    getHomepageDirectoryProfilesWithImages("veterinari", 3),
    getHomepageDirectoryProfilesWithImages("treneri", 3),
    getSectionHeroVisual("home.hero"),
    listHomepageFeaturedBreeds(5).catch((error) => {
      console.error("homepage_featured_breeds_unavailable", error);
      return [];
    }),
    getPublishedDesktopBannerColors("homepage:profil"),
  ]);
  const homeHero = homeHeroVisual;
  const articleSelection = selectHomepageArticles(publishedArticles, {
    latestLimit: 5,
    sectionLimit: 5,
    backfillSectionsFromLatest: true,
  });
  const featuredBreedCards = featuredBreeds
    .filter((breed) => Boolean(breed.image?.trim()))
    .filter((breed, index, all) => all.findIndex((item) => item.slug === breed.slug) === index)
    .slice(0, 3);

  return (
    <main id="obsah" className={styles.homeV2}>
      <UnifiedSectionHeroShell className="hero-section" data-home-hero>
        <UnifiedSectionHero
          variant="homepage-style"
          eyebrow={<><SparkIcon size={17} /> Slovenský portál pre psí život</>}
          title={<>Všetko dôležité<br />pre život so psom.</>}
          intro="Psipedia.sk je slovenský portál o psoch – rady, služby, podujatia a pomoc na jednom mieste."
          visual={homeHero}
          portalSearchSlot={<HomePortalSearch />}
        />
      </UnifiedSectionHeroShell>

      <HomeLatestArticles articles={articleSelection.latest} />

      {/* The article archive link belongs to the article section above,
          not below the following events panel. */}
      <section className="section shell home-independent-events" data-home-events-section aria-label="Najbližšie podujatia">
        <div className="home-magazine-side home-independent-events-inner">
          <HomeMagazineSidebar
              title="Najbližšie podujatia"
              href="/podujatia"
              actionLabel="Celý kalendár"
            >
              {nextEvents.length ? (
                <div className="home-event-list home-side-list" data-home-events>
                  {nextEvents.map((event) => (
                    <article className="home-event-item" key={event.id} data-home-event>
                      <HomeSidebarRow
                        href={eventHref(event)}
                        media={<EventImage imageUrl={event.imageUrl} eventType={event.eventType}
                          mode={event.imageDisplay} config={event.thumbnailImageDisplay}
                          alt={`Obrázok k podujatiu ${event.title}`} loading="lazy" decoding="async" />}
                        eyebrow={<time dateTime={event.startDate}>{formatEventDate(event)}</time>}
                        title={event.title}
                        description={publicLocationValue(event.city, "city")}
                      />
                    </article>
                  ))}
                </div>
              ) : (
                <PublicEmptyState
                  variant="context"
                  className="home-editorial-empty"
                  data-home-events-empty
                >
                  <strong>Pozri si kalendár podujatí</strong>
                  <p>Aktuálne termíny a všetky kategórie nájdeš v kalendári.</p>
                </PublicEmptyState>
              )}
            </HomeMagazineSidebar>
        </div>
      </section>

      <HomeEditorialSection
        eyebrow="Od prvých dní"
        title="Šteniatka"
        description="Prvé mesiace, socializácia, rast a dobré základy spoločného života."
        articles={articleSelection.bySection.steniatka}
        href="/steniatka"
        actionLabel="Všetko o šteniatkach"
        testId="steniatka"
        sidebar={
          <HomeMagazineSidebar title="Objav plemená" href="/plemena" actionLabel="Všetky plemená">
            <div className="home-side-breed-list" data-home-featured-breeds>
              {featuredBreedCards.map((breed) => (
                <HomeSidebarRow key={breed.slug} href={`/plemena/${breed.slug}`}
                  media={<BreedPhoto src={breed.image!} alt={breed.name} sizes="76px" loading="lazy" decoding="async" />}
                  title={breed.name} description={breed.intro?.trim() || undefined}
                />
              ))}
            </div>
          </HomeMagazineSidebar>
        }
      />

      <HomeMagazineBanner
        anchorId={HOME_PROFILE_BANNER_ANCHOR}
        desktopColors={homeProfileBannerColors}
        desktopCopy={homeProfileBannerColors}
        testId="profil"
        title="Pridajte svoj profil"
        description="Prevádzkujete službu pre psov? Nech vás majitelia ľahšie nájdu v adresári."
        label="Pridať profil"
        href="/partner/profily/novy"
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
            <HomeMagazineSidebar
              title="Veterinári"
              href="/adresar/veterinari"
              actionLabel="Nájsť veterinára"
            >
              {veterinarians.length ? (
                <div className="home-vet-list" data-home-veterinarians>
                  {veterinarians.map((profile) => (
                    <article className="home-vet-item" key={profile.id}>
                      <HomeSidebarRow href={directoryProfileHref(profile)}
                        media={profile.imageUrl
                          ? <ImageDisplay fallbackOnError roleHint="generic" context="thumbnail"
                              config={profile.thumbnailImageDisplay} src={profile.imageUrl}
                              srcSet={responsiveMediaSrcSet(profile.imageUrl, [160, 320])} sizes="76px"
                              alt={`Obrázok profilu ${profile.name}`} loading="lazy" decoding="async" />
                          : <PublicMediaFallback />}
                        title={profile.name}
                        description={[profile.city, profile.district && profile.district !== profile.city ? profile.district : ""].filter(Boolean).join(" · ")}
                      />
                    </article>
                  ))}
                </div>
              ) : (
                <PublicEmptyState
                  variant="context"
                  className="home-editorial-empty"
                  data-home-veterinarians-empty
                >
                  <strong>Veterinárov nájdeš v adresári</strong>
                  <p>Vyhľadaj ambulanciu podľa mesta alebo kraja.</p>
                </PublicEmptyState>
              )}
            </HomeMagazineSidebar>
        }
      />


      <div data-home-help>
        <HomeEditorialSection
          eyebrow="Záleží na každom psovi"
          title="Pomoc psom"
          description="Aktuálne prípady, adopcie a organizácie, ktoré potrebujú podporu."
          articles={[]}
          feature={
            activeHelpCases.length ? (
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
                        {item.imageUrl ? (
                          <ImageDisplay fallbackOnError
                            roleHint="generic"
                            context="thumbnail"
                            config={item.thumbnailImageDisplay}
                            src={item.imageUrl}
                            srcSet={responsiveMediaSrcSet(item.imageUrl, [320, 480, 640, 768, 960])}
                            sizes="(max-width: 900px) 100vw, 65vw"
                            alt={`Obrázok k výzve ${item.title}`}
                            loading="lazy"
                            decoding="async"
                          />
                        ) : <PublicMediaFallback />}
                      </span>
                      <span className="home-help-copy">
                        <span className="home-help-meta">
                          <span>{getHelpCategory(item.category)?.singular ?? "Pomoc psom"}</span>
                          {item.urgent ? <b>Urgentné</b> : null}
                        </span>
                        <strong>{item.title}</strong>
                        {publicLocationValue(item.city, "city") ? (
                          <small>{publicLocationValue(item.city, "city")}</small>
                        ) : null}
                      </span>
                    </Link>
                  </article>
                ))}
              </div>
            ) : (
              <PublicEmptyState
                variant="context"
                className="home-editorial-empty"
                data-home-help-empty
              >
                <strong>Objav možnosti pomoci psom</strong>
                <p>Ďalšie prípady a organizácie nájdeš v kompletnom prehľade.</p>
              </PublicEmptyState>
            )
          }
          href="/pomoc-psom"
          actionLabel="Všetky možnosti pomoci"
          testId="help"
        />
      </div>

      <HomeEditorialSection
        eyebrow="Spoločné zážitky"
        title="Výcvik a aktivity"
        description="Tréning, šport a aktivity pre spokojný spoločný život."
        articles={articleSelection.bySection.aktivity}
        href="/aktivity"
        actionLabel="Výcvik a aktivity"
        testId="aktivity"
        sidebar={
          <HomeMagazineSidebar title="Tréneri a psie školy" href="/adresar/treneri" actionLabel="Všetci tréneri">
            {trainers.length ? (
              <div className="home-vet-list" data-home-trainers>
                {trainers.map((profile) => (
                  <article className="home-vet-item" key={profile.id}>
                    <HomeSidebarRow href={directoryProfileHref(profile)}
                      media={profile.imageUrl
                        ? <ImageDisplay fallbackOnError roleHint="generic" context="thumbnail"
                            config={profile.thumbnailImageDisplay} src={profile.imageUrl}
                            srcSet={responsiveMediaSrcSet(profile.imageUrl, [160, 320])} sizes="76px"
                            alt={`Fotografia profilu ${profile.name}`} loading="lazy" decoding="async" />
                        : <PublicMediaFallback />}
                      title={profile.name} description={profile.city}
                    />
                  </article>
                ))}
              </div>
            ) : <p className="home-side-muted">Trénerov a psie školy nájdeš v adresári podľa lokality.</p>}
          </HomeMagazineSidebar>
        }
      />

      <section className="section shell home-utility-section" data-home-calculator>
        <div className="calculator-section">
          <div className="calculator-intro">
            <span className="eyebrow eyebrow--light">Psí vek bez násobilky</span>
            <h2>Koľko „ľudských rokov“ má tvoj pes?</h2>
            <p>
              Prvý a druhý rok života psa bežia rýchlejšie. Potom záleží najmä na jeho veľkosti.
            </p>
            <span className="calculator-paw">
              <PawMark size={120} />
            </span>
          </div>
          <DogAgeCalculator />
        </div>
      </section>

      <AdSlot placementId={AD_PLACEMENTS.HOME_BOTTOM.id} />
    </main>
  );
}
