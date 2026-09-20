import { BreedPhoto } from "@/components/breed-photo";
import { HomeEditorialSection, HomeLatestArticles } from "@/components/home-editorial";
import { HomePortalSearch } from "@/components/home-portal-search";
import { ArrowIcon, PawMark, SparkIcon } from "@/components/icons";
import { DogAgeCalculator } from "@/components/dog-age-calculator";
import { AdSlot } from "@/components/ad-slot";
import { dayOfYearInBratislava } from "@/lib/breed-canonical";
import { getPublishedArticleSummaries } from "@/lib/article-store";
import { getBreedOfTheDay } from "@/lib/breed-store";
import { directoryCategories, directoryProfileHref } from "@/lib/directory";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";
import { getUpcomingEvents } from "@/lib/event-store";
import { eventHref, formatEventDate } from "@/lib/events";
import { getHighlightedHelpCases } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { selectHomepageArticles } from "@/lib/homepage-content";
import { AD_PLACEMENTS } from "@/lib/monetization";
import { buildPageMetadata, ORGANIZATION_ID, serializeJsonLd, SITE_NAME, SITE_URL, WEBSITE_ID } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import styles from "./home-v2.module.css";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "Psipedia.sk – rozumej svojmu psovi",
    description: "Praktické a zrozumiteľné články o výcviku, zdraví, výžive, plemenách a živote so psom.",
    path: "/",
    image: "/images/hero-labrador.webp",
    imageAlt: "Čierny labrador na lúke",
  }),
  title: { absolute: "Psipedia.sk – rozumej svojmu psovi" },
};

export default async function Home() {
  const dayOfYear = dayOfYearInBratislava();
  const [publishedArticles, nextEvents, activeHelpCases, breedOfTheDay, veterinarians] = await Promise.all([
    getPublishedArticleSummaries({ limit: 48 }),
    getUpcomingEvents(3),
    getHighlightedHelpCases(3),
    getBreedOfTheDay(dayOfYear),
    getPublishedDirectoryProfiles("veterinari", 3),
  ]);
  const articleSelection = selectHomepageArticles(publishedArticles, { latestLimit: 5, sectionLimit: 3 });
  const otherServiceCategories = directoryCategories.filter((category) => category.slug !== "veterinari").slice(0, 6);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: SITE_NAME,
        url: SITE_URL,
        logo: {
          "@type": "ImageObject",
          url: `${SITE_URL}/favicon.svg`,
          width: 64,
          height: 64,
        },
        description: "Slovenský obsahový portál o psoch.",
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        url: SITE_URL,
        description: "Slovenský obsahový portál o psoch.",
        publisher: { "@id": ORGANIZATION_ID },
        inLanguage: "sk-SK",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${SITE_URL}/hladat?q={search_term_string}`,
          },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <main id="obsah" className={styles.homeV2}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />

      <section className="hero-section shell" data-home-hero>
        <div className="hero-card">
          <img className="hero-image" src="/images/hero-labrador.webp" alt="Čierny labrador beží po rannej lúke" fetchPriority="high" decoding="async" />
          <div className="hero-shade" />
          <div className="hero-copy">
            <span className="hero-kicker"><SparkIcon size={17} /> Slovenský portál pre psí život</span>
            <h1>Rozumej svojmu psovi.<br /><em>Každý deň o trochu viac.</em></h1>
            <p>Overené informácie, služby, podujatia a pomoc pre každodenný život so psom.</p>
          </div>
        </div>
      </section>

      <div className="shell home-search-shell" data-home-search>
        <HomePortalSearch />
      </div>

      <section className="shell home-services-entry" data-home-services-gateway aria-labelledby="home-services-title">
        <div className="home-services-copy">
          <span className="eyebrow">Služby pre psov</span>
          <h2 id="home-services-title">Nájdi správnu službu bez obchádzania desiatok stránok</h2>
          <p>Veterinári, tréneri, psie školy, opatrovanie, fyzioterapia a ďalšie profily v jednom adresári.</p>
        </div>
        <Link href="/adresar" className="button button--dark home-services-primary">
          Všetky služby <ArrowIcon size={18} />
        </Link>
      </section>

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
                    {event.imageUrl ? <img src={event.imageUrl} alt="" loading="lazy" decoding="async" /> : <span className="home-event-placeholder" aria-hidden="true"><PawMark size={30} /></span>}
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
          <Link href="/adresar/veterinari" className="text-link">Všetci veterinári <ArrowIcon size={17} /></Link>
        </div>
        {veterinarians.length ? (
          <div className="home-vet-list">
            {veterinarians.map((profile) => (
              <article className="home-vet-item" key={profile.id}>
                <Link href={directoryProfileHref(profile)}>
                  {profile.imageUrl ? <img src={profile.imageUrl} alt="" loading="lazy" decoding="async" /> : <span className="home-vet-mark" aria-hidden="true">+</span>}
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
          <h2 id="home-services-secondary-title">Aj ostatné služby pre každodenný život so psom</h2>
          <p>Nájdi trénerov, psie školy, salóny, opatrovanie, fyzioterapiu a ďalšie služby.</p>
          <div className="home-service-taxonomy" aria-label="Kategórie služieb">
            {otherServiceCategories.map((category) => <span key={category.slug}>{category.label}</span>)}
          </div>
        </div>
        <Link href="/adresar" className="text-link home-services-wide-link">Preskúmať adresár <ArrowIcon size={18} /></Link>
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
          <Link href="/pomoc-psom" className="text-link">Všetky možnosti pomoci <ArrowIcon size={17} /></Link>
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
                    {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" /> : <span className="home-help-placeholder" aria-hidden="true"><PawMark size={34} /></span>}
                  </span>
                  <span className="home-help-copy">
                    <span className="home-help-meta">
                      <span>{getHelpCategory(item.category)?.singular ?? "Pomoc psom"}</span>
                      {item.urgent ? <b>Urgentné</b> : null}
                    </span>
                    <strong>{item.title}</strong>
                    <small>{item.city}{item.verified ? " · Overené" : ""}</small>
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
