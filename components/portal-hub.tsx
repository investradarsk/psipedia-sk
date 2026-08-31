import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { EventCard } from "@/components/event-card";
import { ArrowIcon, SearchIcon } from "@/components/icons";
import type { Article } from "@/lib/content";
import type { DogEvent } from "@/lib/events";
import {
  articlePortalSection,
  portalSubpageHref,
  type PortalSection,
} from "@/lib/portal";

export function PortalHub({ section, articles, events, allSections = [] }: { section: PortalSection; articles: Article[]; events?: DogEvent[]; allSections?: PortalSection[] }) {
  const sectionArticles = articles.filter((article) => articlePortalSection(article) === section.slug);
  const hasEventCalendar = events !== undefined;
  const isCare = section.slug === "starostlivost";
  const subpages = section.subpages.filter((subpage) => subpage.visible !== false);
  const careArticleArea = (article: Article) => article.portalSubpage || ({ Zdravie: "zdravie", Výživa: "vyziva", Výcvik: "vycvik", "Život so psom": "spravanie" } as Record<string, string>)[article.category];
  const careServices = [
    { icon: "🩺", title: "Veterinári", text: "Ambulancie, kliniky a pohotovosti podľa lokality.", href: "/adresar/veterinari" },
    { icon: "🦴", title: "Fyzioterapia", text: "Rehabilitácia, regenerácia a podpora pohybu.", href: "/adresar/fyzioterapia" },
    { icon: "🦮", title: "Tréneri a školy", text: "Pomoc s výcvikom a problémovým správaním.", href: "/adresar/treneri" },
    { icon: "✂️", title: "Psie salóny", text: "Úprava srsti a pravidelná hygienická starostlivosť.", href: "/adresar/salony-a-sluzby" },
  ];

  return (
    <main id="obsah">
      <header className={`portal-hero portal-hero--${section.accent}`}>
        <div className="shell portal-hero-inner">
          <nav className="article-breadcrumbs" aria-label="Navigácia">
            <Link href="/">Domov</Link><span>/</span><span>{section.label}</span>
          </nav>
          <div className="portal-hero-copy">
            <span className="portal-hero-icon" aria-hidden="true">{section.icon}</span>
            <div>
              <span className="eyebrow">{section.eyebrow}</span>
              <h1>{section.label}</h1>
              <p>{section.description}</p>
            </div>
          </div>
          <p className="portal-hero-intro">{section.intro}</p>
          {isCare && <form className="care-search" action="/hladat" method="get">
            <SearchIcon size={22} />
            <input type="hidden" name="sekcia" value="starostlivost" />
            <label className="sr-only" htmlFor="care-search-query">Čo riešiš so svojím psom?</label>
            <input id="care-search-query" name="q" maxLength={120} placeholder="Čo riešiš? Napríklad hnačka, svrbenie alebo samota…" />
            <button type="submit">Nájsť odpoveď</button>
          </form>}
        </div>
      </header>

      {isCare && <section className="shell care-urgent" aria-labelledby="care-urgent-heading">
        <span className="care-urgent-icon" aria-hidden="true">!</span>
        <div><span className="eyebrow">Keď ide o čas</span><h2 id="care-urgent-heading">Má pes akútny problém?</h2><p>Pri sťaženom dýchaní, kolapse, silnom krvácaní, nafúknutom tvrdom bruchu alebo podozrení na otravu nečakaj na odpoveď z internetu.</p></div>
        <div className="care-urgent-actions"><Link href="/starostlivost/kedy-ist-so-psom-k-veterinarovi">Kedy volať ihneď</Link><Link href="/adresar/veterinari" className="is-primary">Nájsť veterinára</Link></div>
      </section>}

      <section className="section shell portal-directory" aria-labelledby="portal-directory-heading">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Vyber si oblasť</span>
            <h2 id="portal-directory-heading">Všetko na jednom mieste</h2>
          </div>
          <p>{isCare ? "Začni tým, čo práve riešiš. V každej poradni nájdeš domáce kroky, varovné signály aj hranicu odbornej pomoci." : "Každá oblasť má vlastnú adresu, ktorú si môžeš uložiť alebo priamo zdieľať."}</p>
        </div>
        <div className="portal-subpage-grid">
          {subpages.map((subpage, index) => (
            <Link href={portalSubpageHref(section, subpage)} className={`portal-subpage-card ${isCare ? "care-area-card" : ""}`} key={subpage.slug}>
              <span>{isCare ? (subpage.icon || "🐾") : String(index + 1).padStart(2, "0")}</span>
              <div><h3>{subpage.label}</h3><p>{subpage.description}</p>{isCare && <div className="care-area-topics">{subpage.popularTopics?.slice(0, 3).map((topic) => <small key={topic}>{topic}</small>)}</div>}{isCare && <b>{sectionArticles.filter((article) => careArticleArea(article) === subpage.slug).length} {sectionArticles.filter((article) => careArticleArea(article) === subpage.slug).length === 1 ? "článok" : "článkov"}</b>}</div>
              <ArrowIcon size={20} />
            </Link>
          ))}
        </div>
      </section>

      <section className="section section--tint">
        <div className="shell">
          <div className="section-heading split-heading">
            <div>
              <span className="eyebrow">{hasEventCalendar ? "Najbližšie termíny" : "Najnovšie v sekcii"}</span>
              <h2>{hasEventCalendar ? "Čo nás čaká" : "Čerstvé články a sprievodcovia"}</h2>
            </div>
            <Link href={hasEventCalendar ? "/podujatia/kalendar" : "/clanky"} className="text-link text-link--large">{hasEventCalendar ? "Celý kalendár" : "Všetky články"} <ArrowIcon /></Link>
          </div>
          {hasEventCalendar && events.length ? (
            <div className="event-grid">{events.slice(0, 3).map((event) => <EventCard event={event} key={event.id} />)}</div>
          ) : !hasEventCalendar && sectionArticles.length ? (
            isCare ? <><nav className="care-article-filters" aria-label="Oblasti článkov">{subpages.map((subpage) => <Link href={portalSubpageHref(section, subpage)} key={subpage.slug}>{subpage.icon} {subpage.label}</Link>)}</nav><div className="care-articles-layout"><div className="care-article-featured"><ArticleCard article={sectionArticles[0]} /></div><div className="care-article-stack">{sectionArticles.slice(1, 5).map((article) => <ArticleCard article={article} key={article.slug} />)}</div></div></>
              : <div className="article-grid">{sectionArticles.slice(0, 3).map((article) => <ArticleCard article={article} key={article.slug} />)}</div>
          ) : (
            <div className="portal-empty">
              <span aria-hidden="true">🐾</span>
              <div><h3>{hasEventCalendar ? "Prvé termíny pripravujeme" : "Prvé články pripravujeme"}</h3><p>{hasEventCalendar ? "Kalendár je pripravený a nové podujatia sa sem pridávajú cez redakčnú administráciu." : "Štruktúra sekcie je už pripravená a redakcia sem môže články pridávať priamo cez administráciu."}</p></div>
            </div>
          )}
        </div>
      </section>

      <section className="section shell">
        <div className="portal-more-heading"><span className="eyebrow">{isCare ? "Pomoc nablízku" : "Celá Psipedia"}</span><h2>{isCare ? "Užitočné služby a kontakty" : "Pokračuj ďalšou sekciou"}</h2>{isCare && <p>Keď článok nestačí, pokračuj priamo k vhodnému odborníkovi alebo službe.</p>}</div>
        <div className={`portal-more-grid ${isCare ? "care-service-grid" : ""}`}>
          {(isCare ? careServices : allSections.filter((item) => item.slug !== section.slug).map((item) => ({ icon: item.icon, title: item.label, text: "", href: `/${item.slug}` }))).map((item) => (
            <Link href={item.href} key={item.href}><span aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong>{item.text && <small>{item.text}</small>}</span><ArrowIcon size={18} /></Link>
          ))}
        </div>
        {isCare && <p className="care-medical-note"><strong>Dôležité:</strong> Psipedia nenahrádza veterinárne vyšetrenie. Pri akútnom stave alebo rýchlom zhoršovaní kontaktuj veterinára bez čakania.</p>}
      </section>
    </main>
  );
}
