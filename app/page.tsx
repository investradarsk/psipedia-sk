import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { BreedCard } from "@/components/breed-card";
import { DogAgeCalculator } from "@/components/dog-age-calculator";
import { HomePortalSearch, type HomeSearchItem } from "@/components/home-portal-search";
import { ArrowIcon, CheckIcon, PawMark, SparkIcon } from "@/components/icons";
import { getPublishedArticles } from "@/lib/article-store";
import { listPublishedBreeds } from "@/lib/breed-store";
import { getPublishedDirectoryProfiles } from "@/lib/directory-store";
import { directoryProfileHref, getDirectoryCategory } from "@/lib/directory";
import { getPublishedEvents } from "@/lib/event-store";
import { eventHref, eventIsPast, formatEventDate } from "@/lib/events";
import { getPublishedHelpCases } from "@/lib/help-store";
import { getHelpCategory, helpCaseHref } from "@/lib/help";
import { getNewsCategory, newsCategories } from "@/lib/news";
import { articleHref, articlePortalSection, portalSubpageHref } from "@/lib/portal";
import { listManagedPortalSections } from "@/lib/section-store";
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

export default async function Home() {
  const [publishedArticles, publishedEvents, directoryProfiles, publishedHelpCases, managedSections, breeds] = await Promise.all([
    getPublishedArticles(),
    getPublishedEvents(),
    getPublishedDirectoryProfiles(),
    getPublishedHelpCases(),
    listManagedPortalSections(),
    listPublishedBreeds(),
  ]);
  const portalSections = managedSections.filter((section) => section.visible);
  const newsArticles = publishedArticles.filter((article) => articlePortalSection(article) === "novinky");
  const guideArticles = publishedArticles.filter((article) => articlePortalSection(article) !== "novinky");
  const heroArticle = guideArticles[0];
  const featuredArticles = guideArticles.slice(1, 4);
  const newsLead = newsArticles[0];
  const nextEvents = publishedEvents.filter((event) => !event.cancelled && !eventIsPast(event)).slice(0, 2);
  const featuredProfiles = directoryProfiles.slice(0, 2);
  const activeHelpCases = publishedHelpCases.filter((item) => !item.resolved).slice(0, 2);
  const searchItems: HomeSearchItem[] = [
    ...portalSections.flatMap((section) => [
      { href: `/${section.slug}`, title: section.label, type: "Sekcia", keywords: `${section.description} ${section.intro}` },
      ...section.subpages.map((subpage) => ({ href: portalSubpageHref(section, subpage), title: subpage.label, type: section.label, keywords: subpage.description })),
    ]),
    ...breeds.map((breed) => ({ href: `/plemena/${breed.slug}`, title: breed.name, type: "Plemeno", keywords: `${breed.group} ${breed.intro}` })),
    ...publishedArticles.map((article) => ({ href: articleHref(article), title: article.title, type: articlePortalSection(article) === "novinky" ? "Novinka" : "Článok", keywords: `${article.excerpt} ${article.category} ${getNewsCategory(article.newsCategory)?.label ?? ""}` })),
    ...publishedEvents.map((event) => ({ href: eventHref(event), title: event.title, type: "Podujatie", keywords: `${event.eventType} ${event.city} ${event.region}` })),
    ...directoryProfiles.map((profile) => ({ href: directoryProfileHref(profile), title: profile.name, type: "Služby pre psov", keywords: `${profile.excerpt} ${profile.city} ${profile.region} ${profile.services.join(" ")}` })),
    ...publishedHelpCases.map((item) => ({ href: helpCaseHref(item), title: item.title, type: "Pomoc psom", keywords: `${item.excerpt} ${item.city} ${item.region} ${item.organization}` })),
  ];
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
            <div className="hero-actions">
              <Link className="button button--coral" href="#portal">Objaviť portál <ArrowIcon /></Link>
              <Link className="button button--glass" href="/plemena">Nájsť plemeno</Link>
            </div>
          </div>
          <Link href={heroArticle ? articleHref(heroArticle) : "/steniatka/prve-dni"} className="hero-feature">
            <span>{heroArticle ? `Nový sprievodca · ${heroArticle.readTime}` : "Odporúčaný začiatok"}</span>
            <strong>{heroArticle?.title ?? "Prvé dni so šteniatkom bez zbytočného chaosu"}</strong>
            <ArrowIcon />
          </Link>
        </div>
      </section>

      <div className="shell home-search-shell">
        <HomePortalSearch items={searchItems} />
      </div>

      <section className="promise-strip shell" aria-label="Naše zásady">
        <div><CheckIcon /> <span><strong>Zrozumiteľne</strong> bez odbornej hmly</span></div>
        <div><CheckIcon /> <span><strong>Prakticky</strong> použiteľné hneď dnes</span></div>
        <div><CheckIcon /> <span><strong>Zodpovedne</strong> s jasnými hranicami rady</span></div>
      </section>

      <section className="section shell home-news-section">
        <div className="home-news-panel">
          <div className="home-news-heading">
            <div><span className="home-news-live"><i aria-hidden="true" /> Aktuálne</span><h2>Novinky zo sveta psov</h2><p>Dôležité správy a príbehy overené a vysvetlené v súvislostiach.</p></div>
            <Link href="/novinky" className="button button--dark">Všetky novinky <ArrowIcon /></Link>
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
        </div>
      </section>

      <section className="section shell home-live-section">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Práve na Psipedii</span>
            <h2>Portál, ktorý sa hýbe s komunitou</h2>
          </div>
          <p>Najbližšie termíny, profily a aktuálne výzvy.</p>
        </div>
        <div className="home-live-grid">
          <article className="home-live-card home-live-card--events">
            <header><span aria-hidden="true">📅</span><div><small>Kalendár</small><h3>Najbližšie podujatia</h3></div><b>{nextEvents.length}</b></header>
            <div className="home-live-list">
              {nextEvents.length ? nextEvents.map((event) => (
                <Link href={eventHref(event)} key={event.id}>
                  <span>{event.eventType} · {event.city}</span>
                  <strong>{event.title}</strong>
                  <small>{formatEventDate(event)}</small>
                </Link>
              )) : <div className="home-live-empty"><strong>Kalendár práve dopĺňame</strong><p>Výstavy, preteky, semináre a spoločné tréningy budú na jednom mieste.</p><div><Link href="/podujatia/vystavy">Výstavy</Link><Link href="/podujatia/preteky">Preteky</Link></div></div>}
            </div>
            <Link className="home-live-footer" href="/podujatia">Otvoriť kalendár <ArrowIcon size={18} /></Link>
          </article>

          <article className="home-live-card home-live-card--directory">
            <header><span aria-hidden="true">📍</span><div><small>Služby pre psov</small><h3>Odborníci a služby</h3></div><b>{featuredProfiles.length}</b></header>
            <div className="home-live-list">
              {featuredProfiles.length ? featuredProfiles.map((profile) => (
                <Link href={directoryProfileHref(profile)} key={profile.id}>
                  <span>{getDirectoryCategory(profile.category)?.singular} · {profile.city}</span>
                  <strong>{profile.name}</strong>
                  <small>{profile.verified ? "✓ Overený profil" : profile.excerpt}</small>
                </Link>
              )) : <div className="home-live-empty"><strong>Vyber si, koho hľadáš</strong><p>Veterinári, tréneri, školy a kluby podľa kraja.</p><div><Link href="/adresar/treneri">Tréneri</Link><Link href="/adresar/kynologicke-kluby">Kluby</Link></div></div>}
            </div>
            <Link className="home-live-footer" href="/adresar">Nájsť službu <ArrowIcon size={18} /></Link>
          </article>

          <article className="home-live-card home-live-card--help">
            <header><span aria-hidden="true">❤️</span><div><small>Pomoc psom</small><h3>Kde je pomoc potrebná</h3></div><b>{activeHelpCases.length}</b></header>
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

      <section className="section shell" id="portal">
        <div className="section-heading split-heading home-portal-heading">
          <div>
            <span className="eyebrow">Celý život so psom</span>
            <h2>Psipedia je viac než magazín</h2>
          </div>
          <p>Vyber si, čo práve potrebuješ.</p>
        </div>
        <div className="portal-grid">
          {portalSections.map((section) => (
            <Link href={`/${section.slug}`} className={`portal-gateway-card portal-gateway-card--${section.accent}`} key={section.slug}>
              <span className="portal-gateway-icon" aria-hidden="true">{section.icon}</span>
              <div><span>{section.eyebrow}</span><h3>{section.label}</h3><p>{section.description}</p></div>
              <ArrowIcon size={21} />
            </Link>
          ))}
        </div>
      </section>

      <section className="section section--tint">
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">Vybrané redakciou</span>
              <h2>Dobré čítanie pre dobrý psí život</h2>
            </div>
            <Link href="/clanky" className="text-link text-link--large">Všetky články <ArrowIcon /></Link>
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
        </div>
      </section>

      <section className="section shell">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Atlas plemien</span>
            <h2>Nájdi parťáka, ktorý zapadne do tvojho života</h2>
          </div>
          <Link href="/porovnat-plemena" className="text-link text-link--large">Porovnať plemená <ArrowIcon /></Link>
        </div>
        <div className="breed-grid breed-grid--home">
          {breeds.slice(0, 3).map((breed) => <BreedCard breed={breed} key={breed.slug} />)}
        </div>
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

      <section className="section shell">
        <div className="manifesto-card">
          <div className="manifesto-mark"><PawMark size={52} /></div>
          <div>
            <span className="eyebrow">Prečo Psipedia</span>
            <h2>Nie viac rád. Lepšie súvislosti.</h2>
            <p>Internet je plný rýchlych odpovedí, ktoré si často odporujú. Psipedia vysvetľuje aj prečo – aby si sa vedel rozhodnúť pre svojho konkrétneho psa.</p>
          </div>
          <Link className="button button--dark" href="/o-nas">Spoznaj nás <ArrowIcon /></Link>
        </div>
      </section>
    </main>
  );
}
