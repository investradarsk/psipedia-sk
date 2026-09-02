import Link from "next/link";
import { ArticleCard } from "@/components/article-card";
import { ArrowIcon, CheckIcon } from "@/components/icons";
import type { Article } from "@/lib/content";
import { getNewsCategory, newsCategories } from "@/lib/news";
import { articleHref, articlePortalSection, type PortalSection } from "@/lib/portal";

export function NewsHub({ articles, section }: { articles: Article[]; section: PortalSection }) {
  const newsArticles = articles.filter((article) => articlePortalSection(article) === "novinky");
  const lead = newsArticles[0];
  const more = newsArticles.slice(1, 4);
  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: section.label,
    url: "https://psipedia.sk/novinky",
    description: section.description,
  };

  return (
    <main id="obsah">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <header className={`news-hero${lead?.image ? " news-hero--photo" : ""}`}>
        {lead?.image && <img className="news-hero-photo" src={lead.image} alt="" aria-hidden="true" decoding="async" />}
        <div className="shell news-hero-inner">
          <nav className="article-breadcrumbs" aria-label="Navigácia">
            <Link href="/">Domov</Link><span>/</span><span>{section.label}</span>
          </nav>
          <div className="news-hero-grid">
            <div className="news-hero-copy">
              <span className="eyebrow"><i aria-hidden="true" /> {section.eyebrow}</span>
              <h1>{section.label}</h1>
              <p>{section.intro || section.description}</p>
              <div className="news-hero-actions">
                <Link className="button button--coral" href="#najnovsie">Najnovšie správy <ArrowIcon /></Link>
                <Link className="button button--glass" href="#temy">Vybrať tému</Link>
                <Link className="button button--glass" href="/novinky/poslat-tip">Pošli tip</Link>
              </div>
            </div>
            <aside className="news-watch-card" aria-label="Témy, ktoré sledujeme">
              <span>Sledujeme pre teba</span>
              <ul>
                <li><b>01</b><strong>Záchranu a adopcie</strong><small>prípady s reálnym výsledkom</small></li>
                <li><b>02</b><strong>Vedu a nové lieky</strong><small>čo objav znamená pre majiteľov</small></li>
                <li><b>03</b><strong>Psov v akcii</strong><small>záchranári, asistenti a hrdinovia</small></li>
              </ul>
            </aside>
          </div>
        </div>
      </header>

      <section className="section shell news-category-section" id="temy">
        <div className="section-heading split-heading">
          <div><span className="eyebrow">Prehľad tém</span><h2>Čo sa oplatí vedieť aj zdieľať</h2></div>
          <p>Každý typ novinky má vlastnú stálu adresu. Otvor si iba to, čo ťa zaujíma.</p>
        </div>
        <div className="news-category-grid">
          {newsCategories.map((category) => (
            <Link href={`/novinky/${category.slug}`} className="news-category-card" key={category.slug}>
              <span className="news-category-icon" aria-hidden="true">{category.icon}</span>
              <div><small>{category.shortLabel}</small><h3>{category.label}</h3><p>{category.description}</p></div>
              <ArrowIcon size={19} />
            </Link>
          ))}
        </div>
      </section>

      <section className="section section--tint news-latest-section" id="najnovsie">
        <div className="shell">
          <div className="section-heading split-heading">
            <div><span className="eyebrow">Aktuálne</span><h2>Najnovšie zo sveta psov</h2></div>
            <p>Správy priebežne dopĺňame a pri vývoji udalosti ich aktualizujeme.</p>
          </div>
          {lead ? (
            <div className="news-lead-grid">
              <article className={`news-lead-card news-lead-card--${lead.accent}`}>
                <Link href={articleHref(lead)} className="news-lead-media" aria-label={lead.title}>
                  {lead.image ? <img src={lead.image} alt={`Ilustračná fotografia k novinke: ${lead.title}`} decoding="async" /> : <span aria-hidden="true">{getNewsCategory(lead.newsCategory)?.icon ?? "🗞️"}</span>}
                </Link>
                <div className="news-lead-copy">
                  <span>{getNewsCategory(lead.newsCategory)?.label ?? "Zo sveta psov"} · {lead.date}</span>
                  <h3><Link href={articleHref(lead)}>{lead.title}</Link></h3>
                  <p>{lead.excerpt}</p>
                  <Link className="text-link text-link--large" href={articleHref(lead)}>Prečítať novinku <ArrowIcon /></Link>
                </div>
              </article>
              {more.length > 0 && <div className="news-more-grid">{more.map((article) => <ArticleCard article={article} key={article.slug} />)}</div>}
            </div>
          ) : (
            <div className="news-empty-stage">
              <span aria-hidden="true">🗞️</span>
              <div>
                <small>Redakčný priestor je pripravený</small>
                <h3>Prvé overené správy práve pripravujeme</h3>
                <p>Keď pribudne novinka, nájdeš tu jej zdroj, dátum, stručné vysvetlenie aj tlačidlo na jednoduché zdieľanie.</p>
              </div>
              <Link href="/zasady-obsahu" className="text-link">Ako overujeme obsah <ArrowIcon size={18} /></Link>
            </div>
          )}
        </div>
      </section>

      <section className="section shell news-tip-callout">
        <div><span aria-hidden="true">💡</span><div><small>Komunita vidí viac</small><h2>Vieš o príbehu, ktorý by nemal zapadnúť?</h2><p>Pošli nám námet, odkaz alebo vlastné svedectvo. Redakcia ho pred zverejnením overí a doplní do súvislostí.</p></div></div>
        <Link className="button button--coral" href="/novinky/poslat-tip">Poslať tip redakcii <ArrowIcon /></Link>
      </section>

      <section className="section shell">
        <div className="news-trust-card">
          <div><span className="eyebrow">Najprv overiť, potom zdieľať</span><h2>Silný príbeh potrebuje pevné fakty</h2><p>Nezverejníme iba virálny titulok. Pri každej správe oddelíme potvrdené informácie od tvrdení, uvedieme pôvodný zdroj a viditeľne označíme aktualizácie.</p></div>
          <ul>
            <li><CheckIcon size={19} /><span><strong>Pôvodný zdroj</strong><small>organizácia, výskum alebo dôveryhodné médium</small></span></li>
            <li><CheckIcon size={19} /><span><strong>Jasný dátum</strong><small>kedy sa udalosť stala a kedy sme text upravili</small></span></li>
            <li><CheckIcon size={19} /><span><strong>Súvislosti</strong><small>čo správa skutočne znamená pre psy a ich ľudí</small></span></li>
          </ul>
        </div>
      </section>
    </main>
  );
}
