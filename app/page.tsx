import { BreedPhoto } from "@/components/breed-photo";
import { dayOfYearInBratislava } from "@/lib/breed-canonical";
import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { DogAgeCalculator } from "@/components/dog-age-calculator";
import { HomePortalSearch } from "@/components/home-portal-search";
import { ArrowIcon, HeartIcon, PawMark, SparkIcon, WhistleIcon } from "@/components/icons";
import { getHomepageArticles } from "@/lib/article-store";
import { getBreedOfTheDay } from "@/lib/breed-store";
import { getUpcomingEvents } from "@/lib/event-store";
import { eventHref, formatEventDate } from "@/lib/events";
import { getHighlightedHelpCases } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { getNewsCategory, newsCategories } from "@/lib/news";
import { articleHref, articlePortalSection } from "@/lib/portal";
import { buildPageMetadata, ORGANIZATION_ID, serializeJsonLd, SITE_NAME, SITE_URL, WEBSITE_ID } from "@/lib/seo";
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

const starterGuides = [
  { icon: PawMark, eyebrow: "Šteniatko", title: "Prvé dni doma bez chaosu", description: "Režim, spánok, čistotnosť a pokojný začiatok spoločného života.", href: "/steniatka/prve-dni" },
  { icon: HeartIcon, eyebrow: "Starostlivosť", title: "Zdravie a varovné signály", description: "Čo môžeš sledovať doma a kedy už patrí problém veterinárovi.", href: "/starostlivost/zdravie" },
  { icon: WhistleIcon, eyebrow: "Spoločné zážitky", title: "Aktivity podľa vášho tempa", description: "Psie športy, výlety a nápady pre hlavu aj telo psa.", href: "/aktivity/psie-sporty" },
] as const;

const serviceLinks = [
  { icon: HeartIcon, label: "Veterinári", href: "/adresar/veterinari" },
  { icon: WhistleIcon, label: "Tréneri a psie školy", href: "/adresar/treneri" },
  { icon: PawMark, label: "Hotely a opatrovanie", href: "/adresar/hotely-a-opatrovanie" },
] as const;

export default async function Home() {
  const dayOfYear = dayOfYearInBratislava();
  const [publishedArticles, publishedEvents, publishedHelpCases, breedOfTheDay] = await Promise.all([
    getHomepageArticles(),
    getUpcomingEvents(3),
    getHighlightedHelpCases(2),
    getBreedOfTheDay(dayOfYear),
  ]);
  const newsArticles = publishedArticles.filter((article) => articlePortalSection(article) === "novinky");
  const guideArticles = publishedArticles.filter((article) => articlePortalSection(article) !== "novinky");
  const featuredArticles = guideArticles.slice(0, 3);
  const newsLead = newsArticles[0];
  const nextEvents = publishedEvents;
  const activeHelpCases = publishedHelpCases;
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

      <section className="shell home-services-entry" data-home-services aria-labelledby="home-services-title">
        <div className="home-services-copy">
          <span className="eyebrow">Služby pre psov</span>
          <h2 id="home-services-title">Nájdi pomoc vo svojom okolí</h2>
          <p>Veterinári, tréneri, psie školy, opatrovanie a ďalšie služby v novom adresári Psipedie.</p>
        </div>
        <div className="home-services-links">
          {serviceLinks.map((service) => {
            const Icon = service.icon;
            return (
              <Link href={service.href} key={service.href}>
                <Icon size={20} />
                <span>{service.label}</span>
                <ArrowIcon size={17} />
              </Link>
            );
          })}
          <Link href="/adresar" className="home-services-all">Všetky služby <ArrowIcon size={18} /></Link>
        </div>
      </section>

      <section className="section shell home-news-section" data-home-news>
        <div className="home-news-panel">
          <div className="home-news-heading">
            <div><span className="home-news-live"><i aria-hidden="true" /> Aktuálne</span><h2>Novinky zo sveta psov</h2><p>Dôležité správy a príbehy overené a vysvetlené v súvislostiach.</p></div>
          </div>
          {newsLead ? (
            <div className="home-news-content">
              <Link href={articleHref(newsLead)} className={`home-news-lead home-news-lead--${newsLead.accent}`} data-home-news-lead>
                {newsLead.image && <img className="home-news-lead-image" src={newsLead.image} alt="" aria-hidden="true" decoding="async" />}
                <span className="home-news-lead-shade" aria-hidden="true" />
                <span>{getNewsCategory(newsLead.newsCategory)?.label ?? "Zo sveta psov"} · {newsLead.date}</span>
                <h3>{newsLead.title}</h3>
                <p>{newsLead.excerpt}</p>
                <strong>Čítať novinku <ArrowIcon size={18} /></strong>
              </Link>
              <div className="home-news-side" data-home-secondary-news>
                {newsArticles.slice(1, 3).map((article) => (
                  <Link href={articleHref(article)} key={article.slug}>
                    {article.image && <img src={article.image} alt="" aria-hidden="true" loading="lazy" decoding="async" />}
                    <span className="home-news-side-copy">
                      <span>{getNewsCategory(article.newsCategory)?.shortLabel ?? "Novinky"} · {article.date}</span>
                      <strong>{article.title}</strong>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="home-news-empty" data-home-news-empty>
              <div><span className="home-news-empty-icon" aria-hidden="true"><SparkIcon size={24} /></span><div><strong>Prvé overené správy pripravujeme</strong><p>Zatiaľ si môžeš vybrať okruh, ktorý ťa zaujíma. Každý má vlastnú stálu adresu.</p></div></div>
              <nav aria-label="Témy noviniek">
                {newsCategories.slice(0, 4).map((category) => <Link href={`/novinky/${category.slug}`} key={category.slug}>{category.shortLabel}<ArrowIcon size={14} /></Link>)}
              </nav>
            </div>
          )}
          <div className="home-section-cta"><Link href="/novinky" className="button button--dark">Všetky novinky <ArrowIcon /></Link></div>
        </div>
      </section>

      <section className="section shell home-compact-section" data-home-events>
        <div className="section-heading"><span className="eyebrow">Kalendár</span><h2>Najbližšie podujatia</h2></div>
        <div className="home-compact-grid">
          <article className="home-live-card home-live-card--events">
            <div className="home-live-list">
              {nextEvents.length ? nextEvents.map((event) => (
                <Link href={eventHref(event)} key={event.id} data-home-event>
                  <time dateTime={event.startDate}>{formatEventDate(event)}</time>
                  <strong>{event.title}</strong>
                  <small>{event.eventType} · {event.city}</small>
                </Link>
              )) : <div className="home-live-empty" data-home-events-empty><strong>Kalendár práve dopĺňame</strong><p>Výstavy, preteky, semináre a spoločné tréningy budú na jednom mieste.</p><div><Link href="/podujatia/vystavy">Výstavy</Link><Link href="/podujatia/preteky">Preteky</Link></div></div>}
            </div>
            <Link className="home-live-footer" href="/podujatia">Zobraziť celý kalendár <ArrowIcon size={18} /></Link>
          </article>
        </div>
      </section>

      <section className="section section--tint" data-home-reading>
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">Vybrané redakciou</span>
              <h2>Dobré čítanie pre dobrý psí život</h2>
            </div>
          </div>
          {featuredArticles.length > 0 ? (
            <div className="featured-grid">
              <ArticleCard article={featuredArticles[0]} large />
              <div className="featured-stack">
                {featuredArticles.slice(1).map((article) => <ArticleCard article={article} key={article.slug} />)}
              </div>
            </div>
          ) : (
            <div className="home-starter-grid" data-home-starter>
              {starterGuides.map((guide) => {
                const Icon = guide.icon;
                return (
                  <Link href={guide.href} className="home-starter-card" key={guide.href}>
                    <span className="home-starter-icon" aria-hidden="true"><Icon size={25} /></span>
                    <small>{guide.eyebrow}</small>
                    <h3>{guide.title}</h3>
                    <p>{guide.description}</p>
                    <strong>Začať tu <ArrowIcon size={18} /></strong>
                  </Link>
                );
              })}
            </div>
          )}
          <div className="home-section-cta"><Link href="/clanky" className="button button--dark">Všetky články <ArrowIcon /></Link></div>
        </div>
      </section>

      <section className="section shell home-compact-section home-help-section" data-home-help>
        <div className="section-heading"><span className="eyebrow">Aktuálne možnosti</span><h2>Pomoc psom</h2></div>
        <div className="home-compact-grid">
          <article className="home-live-card home-live-card--help">
            <div className="home-live-list">
              {activeHelpCases.length ? activeHelpCases.map((item) => (
                <Link href={helpCaseHref(item)} key={item.id} data-home-help-item>
                  <span>{getHelpCategory(item.category)?.singular} · {item.city}</span>
                  <strong>{item.title}</strong>
                  <small>{item.urgent ? "Urgentné" : item.verified ? "✓ Overené" : item.organization}</small>
                </Link>
              )) : <div className="home-live-empty" data-home-help-empty><strong>Žiadna otvorená výzva</strong><p>To je dobrá správa. Ak nájdeš psa v núdzi, pripravili sme jasný postup.</p><div><Link href="/pomoc-psom/nahlasit-psa-v-nudzi">Čo urobiť teraz</Link></div></div>}
            </div>
            <Link className="home-live-footer" href="/pomoc-psom">Pozrieť možnosti pomoci <ArrowIcon size={18} /></Link>
          </article>
        </div>
      </section>

      {breedOfTheDay && <section className="section shell home-breed-day-section" data-home-breed>
        <div className="section-heading"><span className="eyebrow">Atlas plemien</span><h2>Plemeno dňa</h2></div>
        <article className="home-breed-day">
          <BreedPhoto src={breedOfTheDay.image} alt={`${breedOfTheDay.name} – plemeno dňa`} />
          <div><span className="eyebrow">Dnešný profil</span><h3>{breedOfTheDay.name}</h3><p>{breedOfTheDay.intro}</p>
            <dl><div><dt>FCI skupina</dt><dd>{breedOfTheDay.fciGroup}. {breedOfTheDay.fciSection}</dd></div>{breedOfTheDay.size?.trim() && <div><dt>Veľkosť</dt><dd>{breedOfTheDay.size}</dd></div>}<div><dt>Energia</dt><dd>{breedOfTheDay.energy}/5</dd></div><div><dt>Cvičiteľnosť</dt><dd>{breedOfTheDay.trainability}/5</dd></div></dl>
            <Link className="button button--coral" href={`/plemena/${breedOfTheDay.slug}`}>Pozrieť profil <ArrowIcon /></Link>
          </div>
        </article>
        <div className="home-section-cta home-section-cta--quiet"><Link href="/plemena" className="text-link">Všetky plemená <ArrowIcon size={18} /></Link></div>
      </section>}

      <section className="section shell" data-home-calculator>
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
    </main>
  );
}
