import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { EventCard } from "@/components/event-card";
import { ArrowIcon } from "@/components/icons";
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
        </div>
      </header>

      <section className="section shell portal-directory" aria-labelledby="portal-directory-heading">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Vyber si oblasť</span>
            <h2 id="portal-directory-heading">Všetko na jednom mieste</h2>
          </div>
          <p>Každá oblasť má vlastnú adresu, ktorú si môžeš uložiť alebo priamo zdieľať.</p>
        </div>
        <div className="portal-subpage-grid">
          {section.subpages.map((subpage, index) => (
            <Link href={portalSubpageHref(section, subpage)} className="portal-subpage-card" key={subpage.slug}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><h3>{subpage.label}</h3><p>{subpage.description}</p></div>
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
            <div className="article-grid">
              {sectionArticles.slice(0, 3).map((article) => <ArticleCard article={article} key={article.slug} />)}
            </div>
          ) : (
            <div className="portal-empty">
              <span aria-hidden="true">🐾</span>
              <div><h3>{hasEventCalendar ? "Prvé termíny pripravujeme" : "Prvé články pripravujeme"}</h3><p>{hasEventCalendar ? "Kalendár je pripravený a nové podujatia sa sem pridávajú cez redakčnú administráciu." : "Štruktúra sekcie je už pripravená a redakcia sem môže články pridávať priamo cez administráciu."}</p></div>
            </div>
          )}
        </div>
      </section>

      <section className="section shell">
        <div className="portal-more-heading">
          <span className="eyebrow">Celá Psipedia</span>
          <h2>Pokračuj ďalšou sekciou</h2>
        </div>
        <div className="portal-more-grid">
          {allSections.filter((item) => item.slug !== section.slug).map((item) => (
            <Link href={`/${item.slug}`} key={item.slug}>
              <span aria-hidden="true">{item.icon}</span><strong>{item.label}</strong><ArrowIcon size={18} />
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
