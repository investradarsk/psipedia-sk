import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { DogAgeCalculator } from "@/components/dog-age-calculator";
import { HomePortalSearch } from "@/components/home-portal-search";
import { ArrowIcon, PawMark, SparkIcon } from "@/components/icons";
import { getHomepageArticles } from "@/lib/article-store";
import { getBreedOfTheDay } from "@/lib/breed-store";
import { getUpcomingEvents } from "@/lib/event-store";
import { eventHref, formatEventDate } from "@/lib/events";
import { getHighlightedHelpCases } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { getNewsCategory, newsCategories } from "@/lib/news";
import { articleHref, articlePortalSection } from "@/lib/portal";
import { buildPageMetadata, ORGANIZATION_ID, serializeJsonLd, SITE_NAME, SITE_URL, WEBSITE_ID } from "@/lib/seo";

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
  { icon: "🐶", eyebrow: "Šteniatko", title: "Prvé dni doma bez chaosu", description: "Režim, spánok, čistotnosť a pokojný začiatok spoločného života.", href: "/steniatka/prve-dni" },
  { icon: "🩺", eyebrow: "Starostlivosť", title: "Zdravie a varovné signály", description: "Čo môžeš sledovať doma a kedy už patrí problém veterinárovi.", href: "/starostlivost/zdravie" },
  { icon: "🥾", eyebrow: "Spoločné zážitky", title: "Aktivity podľa vášho tempa", description: "Psie športy, výlety a nápady pre hlavu aj telo psa.", href: "/aktivity/psie-sporty" },
] as const;

function dayOfYearInBratislava(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Bratislava", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).reduce<Record<string, number>>((values, part) => {
      if (part.type !== "literal") values[part.type] = Number(part.value);
      return values;
    }, {});
  const start = Date.UTC(parts.year, 0, 0);
  return Math.floor((Date.UTC(parts.year, parts.month - 1, parts.day) - start) / 86_400_000);
}

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
    <main id="obsah">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }} />

      <section className="hero-section shell">
        <div className="hero-card">
          <img className="hero-image" src="/images/hero-labrador.webp" alt="Čierny labrador beží po rannej lúke" fetchPriority="high" decoding="async" />
          <div className="hero-shade" />
          <div className="hero-copy">
            <span className="hero-kicker"><SparkIcon size={17} /> Slovenský portál pre psí život</span>
            <h1>Rozumej svojmu psovi.<br /><em>Každý deň o trochu viac.</em></h1>
            <p>Overené informácie, služby a pomoc pre každodenný život so psom.</p>
          </div>
        </div>
      </section>

      <div className="shell home-search-shell">
        <HomePortalSearch />
      </div>

      <section className="section shell home-news-section">
        <div className="home-news-panel">
          <div className="home-news-heading">
            <div><span className="home-news-live"><i aria-hidden="true" /> Aktuálne</span><h2>Novinky zo sveta psov</h2><p>Dôležité správy a príbehy overené a vysvetlené v súvislostiach.</p></div>
          </div>
          {newsLead ? (
            <div className="home-news-content">
              <Link href={articleHref(newsLead)} className={`home-news-lead home-news-lead--${newsLead.accent}`}>
                <span>{getNewsCategory(newsLead.newsCategory)?.label ?? "Zo sveta psov"} · {newsLead.date}</span>
                <h3>{newsLead.title}</h3>
                <p>{newsLead.excerpt}</p>
                <strong>Prečítať novinku <ArrowIcon size={18} /></strong>
              </Link>
              <div className="home-news-side">
                {newsArticles.slice(1, 3).map((article) => (
                  <Link href={articleHref(article)} key={article.slug}><span>{getNewsCategory(article.newsCategory)?.shortLabel ?? "Novinky"}</span><strong>{article.title}</strong><small>{article.date}</small></Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="home-news-empty">
              <div><span aria-hidden="true">🗞️</span><div><strong>Prvé overené správy pripravujeme</strong><p>Zatiaľ si môžeš vybrať okruh, ktorý ťa zaujíma. Každý má vlastnú stálu adresu.</p></div></div>
              <nav aria-label="Témy noviniek">
                {newsCategories.slice(0, 4).map((category) => <Link href={`/novinky/${category.slug}`} key={category.slug}><span aria-hidden="true">{category.icon}</span>{category.shortLabel}</Link>)}
              </nav>
            </div>
          )}
          <div className="home-section-cta"><Link href="/novinky" className="button button--dark">Všetky novinky <ArrowIcon /></Link></div>
        </div>
      </section>

      <section className="section shell home-compact-section">
        <div className="section-heading"><span className="eyebrow">Kalendár</span><h2>Najbližšie podujatia</h2></div>
        <div className="home-compact-grid">
          <article className="home-live-card home-live-card--events">
            <div className="home-live-list">
              {nextEvents.length ? nextEvents.map((event) => (
                <Link href={eventHref(event)} key={event.id}>
                  <span>{event.eventType} · {event.city}</span>
                  <strong>{event.title}</strong>
                  <small>{formatEventDate(event)}</small>
                </Link>
              )) : <div className="home-live-empty"><strong>Kalendár práve dopĺňame</strong><p>Výstavy, preteky, semináre a spoločné tréningy budú na jednom mieste.</p><div><Link href="/podujatia/vystavy">Výstavy</Link><Link href="/podujatia/preteky">Preteky</Link></div></div>}
            </div>
            <Link className="home-live-footer" href="/podujatia">Zobraziť celý kalendár <ArrowIcon size={18} /></Link>
          </article>
        </div>
      </section>

      <section className="section shell home-compact-section home-help-section">
        <div className="section-heading"><span className="eyebrow">Aktuálne možnosti</span><h2>Pomoc psom</h2></div>
        <div className="home-compact-grid">
          <article className="home-live-card home-live-card--help">
            <div className="home-live-list">
              {activeHelpCases.length ? activeHelpCases.map((item) => (
                <Link href={helpCaseHref(item)} key={item.id}>
                  <span>{getHelpCategory(item.category)?.singular} · {item.city}</span>
                  <strong>{item.title}</strong>
                  <small>{item.urgent ? "Urgentné" : item.verified ? "✓ Overené" : item.organization}</small>
                </Link>
              )) : <div className="home-live-empty"><strong>Žiadna otvorená výzva</strong><p>To je dobrá správa. Ak nájdeš psa v núdzi, pripravili sme jasný postup.</p><div><Link href="/pomoc-psom/nahlasit-psa-v-nudzi">Čo urobiť teraz</Link></div></div>}
            </div>
            <Link className="home-live-footer" href="/pomoc-psom">Pozrieť možnosti pomoci <ArrowIcon size={18} /></Link>
          </article>
        </div>
      </section>

      <section className="section section--tint">
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
            <div className="home-starter-grid">
              {starterGuides.map((guide) => (
                <Link href={guide.href} className="home-starter-card" key={guide.href}>
                  <span className="home-starter-icon" aria-hidden="true">{guide.icon}</span>
                  <small>{guide.eyebrow}</small>
                  <h3>{guide.title}</h3>
                  <p>{guide.description}</p>
                  <strong>Začať tu <ArrowIcon size={18} /></strong>
                </Link>
              ))}
            </div>
          )}
          <div className="home-section-cta"><Link href="/clanky" className="button button--dark">Všetky články <ArrowIcon /></Link></div>
        </div>
      </section>

      <section className="section shell home-breed-day-section">
        <div className="section-heading"><span className="eyebrow">Atlas plemien</span><h2>Plemeno dňa</h2></div>
        {breedOfTheDay && <article className="home-breed-day">
          <img src={breedOfTheDay.image} alt={`${breedOfTheDay.name} – plemeno dňa`} />
          <div><span className="eyebrow">Dnešný profil</span><h3>{breedOfTheDay.name}</h3><p>{breedOfTheDay.intro}</p>
            <dl><div><dt>FCI skupina</dt><dd>{breedOfTheDay.fciGroup}. {breedOfTheDay.fciSection}</dd></div><div><dt>Veľkosť</dt><dd>{breedOfTheDay.size}</dd></div><div><dt>Energia</dt><dd>{breedOfTheDay.energy}/5</dd></div><div><dt>Cvičiteľnosť</dt><dd>{breedOfTheDay.trainability}/5</dd></div></dl>
            <Link className="button button--coral" href={`/plemena/${breedOfTheDay.slug}`}>Pozrieť profil <ArrowIcon /></Link>
          </div>
        </article>}
        <div className="home-section-cta home-section-cta--quiet"><Link href="/plemena" className="text-link">Všetky plemená <ArrowIcon size={18} /></Link></div>
      </section>

      <section className="section shell">
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
