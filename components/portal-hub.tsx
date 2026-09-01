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
  const isActivities = section.slug === "aktivity";
  const isPuppies = section.slug === "steniatka";
  const isEditorialHub = isCare || isActivities || isPuppies;
  const subpages = section.subpages.filter((subpage) => subpage.visible !== false);
  const careArticleArea = (article: Article) => article.portalSubpage || ({ Zdravie: "zdravie", Výživa: "vyziva", Výcvik: "vycvik", "Život so psom": "spravanie" } as Record<string, string>)[article.category];
  const activityArticleArea = (article: Article) => article.portalSubpage || (article.category === "Výcvik" ? "psie-sporty" : undefined);
  const articleArea = (article: Article) => isCare ? careArticleArea(article) : activityArticleArea(article);
  const puppyStages = [
    { title: "Pred príchodom", text: "Rozhodnutie, vhodné plemeno a zodpovedný pôvod.", slugs: ["pred-kupou-psa", "vyber-plemena", "vyber-chovatela"] },
    { title: "Prvé týždne doma", text: "Bezpečie, režim, zdravie a dobré skúsenosti.", slugs: ["prve-dni", "socializacia", "hygiena", "krmenie", "ockovanie-a-zdravie"] },
    { title: "Rast a dospievanie", text: "Spolupráca, primeraný pohyb a pokojná puberta.", slugs: ["vycvik-steniatka", "rast-a-vyvoj", "puberta"] },
  ];
  const careServices = [
    { icon: "🩺", title: "Veterinári", text: "Ambulancie, kliniky a pohotovosti podľa lokality.", href: "/adresar/veterinari" },
    { icon: "🦴", title: "Fyzioterapia", text: "Rehabilitácia, regenerácia a podpora pohybu.", href: "/adresar/fyzioterapia" },
    { icon: "🦮", title: "Tréneri a školy", text: "Pomoc s výcvikom a problémovým správaním.", href: "/adresar/treneri" },
    { icon: "✂️", title: "Psie salóny", text: "Úprava srsti a pravidelná hygienická starostlivosť.", href: "/adresar/salony-a-sluzby" },
  ];
  const activityServices = [
    { icon: "🦮", title: "Tréneri a psie školy", text: "Základy, športová príprava aj individuálne vedenie.", href: "/adresar/treneri" },
    { icon: "🏅", title: "Kynologické kluby", text: "Cvičiská, športové kluby a miestne organizácie.", href: "/adresar/kynologicke-kluby" },
    { icon: "📅", title: "Podujatia", text: "Preteky, tréningy, semináre a spoločné stretnutia.", href: "/podujatia" },
    { icon: "🏡", title: "Hotely a opatrovanie", text: "Starostlivosť o psa, keď nemôže cestovať s tebou.", href: "/adresar/hotely-a-opatrovanie" },
  ];
  const puppyServices = [
    { icon: "🐕", title: "Výber plemena", text: "Porovnaj povahu, energiu a nároky plemien podľa svojho života.", href: "/plemena/vyber-plemena" },
    { icon: "🏡", title: "Chovateľské stanice", text: "Nájdi chovateľov a over si pôvod aj zdravotné vyšetrenia.", href: "/adresar/chovatelske-stanice" },
    { icon: "🩺", title: "Veterinári", text: "Ambulancie, kliniky a pohotovosti podľa lokality.", href: "/adresar/veterinari" },
    { icon: "🦮", title: "Tréneri a školy", text: "Citlivé vedenie socializácie a prvých tréningových krokov.", href: "/adresar/treneri" },
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
          {isActivities && <form className="care-search activity-search" action="/hladat" method="get">
            <SearchIcon size={22} />
            <input type="hidden" name="sekcia" value="aktivity" />
            <label className="sr-only" htmlFor="activity-search-query">Akú aktivitu alebo šport hľadáš?</label>
            <input id="activity-search-query" name="q" maxLength={120} placeholder="Hľadaj šport, výlet, výbavu alebo cestovanie…" />
            <button type="submit">Hľadať v aktivitách</button>
          </form>}
          {isPuppies && <form className="care-search puppy-search" action="/hladat" method="get">
            <SearchIcon size={22} />
            <input type="hidden" name="sekcia" value="steniatka" />
            <label className="sr-only" htmlFor="puppy-search-query">Čo potrebuješ vedieť o šteniatku?</label>
            <input id="puppy-search-query" name="q" maxLength={120} placeholder="Hľadaj prvú noc, socializáciu, kŕmenie alebo očkovanie…" />
            <button type="submit">Hľadať v sprievodcovi</button>
          </form>}
        </div>
      </header>

      {isCare && <section className="shell care-urgent" aria-labelledby="care-urgent-heading">
        <span className="care-urgent-icon" aria-hidden="true">!</span>
        <div><span className="eyebrow">Keď ide o čas</span><h2 id="care-urgent-heading">Má pes akútny problém?</h2><p>Pri sťaženom dýchaní, kolapse, silnom krvácaní, nafúknutom tvrdom bruchu alebo podozrení na otravu nečakaj na odpoveď z internetu.</p></div>
        <div className="care-urgent-actions"><Link href="/starostlivost/kedy-ist-so-psom-k-veterinarovi">Kedy volať ihneď</Link><Link href="/adresar/veterinari" className="is-primary">Nájsť veterinára</Link></div>
      </section>}

      {isActivities && <section className="shell activity-fit" aria-labelledby="activity-fit-heading">
        <div className="activity-fit-heading"><span className="activity-fit-icon" aria-hidden="true">↗</span><div><span className="eyebrow">Vyber rozumne</span><h2 id="activity-fit-heading">Dobrá aktivita sedí konkrétnemu psovi</h2></div></div>
        <div className="activity-fit-factors">
          <div><strong>Vek a zdravie</strong><span>Rast, kĺby, hmotnosť a aktuálna kondícia.</span></div>
          <div><strong>Motivácia psa</strong><span>Čuchanie, beh, aport, presnosť alebo spoločný výlet.</span></div>
          <div><strong>Čas a prostredie</strong><span>Krátky tréning, pravidelný šport alebo celodenná cesta.</span></div>
        </div>
        <Link href="/aktivity/psie-sporty">Porovnať možnosti <ArrowIcon size={18} /></Link>
      </section>}

      {isPuppies && <section className="shell puppy-start" aria-labelledby="puppy-start-heading">
        <div><span className="eyebrow">Začni podľa situácie</span><h2 id="puppy-start-heading">Čakáš šteniatko alebo je už doma?</h2><p>Vyber si správny začiatok a pokračuj krok za krokom bez zahltenia.</p></div>
        <div className="puppy-start-actions"><Link href="/steniatka/pred-kupou-psa">Ešte sa rozhodujem</Link><Link href="/steniatka/prve-dni" className="is-primary">Šteniatko je doma</Link></div>
      </section>}

      <section className="section shell portal-directory" aria-labelledby="portal-directory-heading">
        <div className="section-heading split-heading">
          <div>
            <span className="eyebrow">Vyber si oblasť</span>
            <h2 id="portal-directory-heading">Všetko na jednom mieste</h2>
          </div>
          <p>{isCare ? "Začni tým, čo práve riešiš. V každej poradni nájdeš domáce kroky, varovné signály aj hranicu odbornej pomoci." : isActivities ? "Vyber si oblasť podľa toho, čo chcete spolu robiť. Nájdeš v nej prvé kroky, bezpečnostné limity aj praktické kontakty." : isPuppies ? "Postupuj podľa fázy, v ktorej sa práve nachádzaš. Každá téma má praktické kroky, upozornenia a užitočné kontakty." : "Každá oblasť má vlastnú adresu, ktorú si môžeš uložiť alebo priamo zdieľať."}</p>
        </div>
        {(isPuppies ? puppyStages : [{ title: "", text: "", slugs: subpages.map((item) => item.slug) }]).map((stage) => <div className={isPuppies ? "puppy-stage" : ""} key={stage.title || "all"}>
          {isPuppies && <header className="puppy-stage-heading"><span>{String(puppyStages.indexOf(stage) + 1).padStart(2, "0")}</span><div><h3>{stage.title}</h3><p>{stage.text}</p></div></header>}
          <div className="portal-subpage-grid">
          {subpages.filter((item) => stage.slugs.includes(item.slug)).map((subpage, index) => (
            <Link href={portalSubpageHref(section, subpage)} className={`portal-subpage-card ${isCare ? "care-area-card" : ""} ${isActivities ? "activity-area-card" : ""} ${isPuppies ? "puppy-area-card" : ""}`} key={subpage.slug}>
              <span>{isEditorialHub ? (subpage.icon || "🐾") : String(index + 1).padStart(2, "0")}</span>
              <div><h3>{subpage.label}</h3><p>{subpage.description}</p>{isEditorialHub && <div className="care-area-topics">{subpage.popularTopics?.slice(0, 3).map((topic) => <small key={topic}>{topic}</small>)}</div>}{isEditorialHub && <b>{sectionArticles.filter((article) => articleArea(article) === subpage.slug).length} {sectionArticles.filter((article) => articleArea(article) === subpage.slug).length === 1 ? "článok" : "článkov"}</b>}</div>
              <ArrowIcon size={20} />
            </Link>
          ))}
          </div>
        </div>)}
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
            isEditorialHub ? <><nav className={`care-article-filters ${isActivities ? "activity-article-filters" : ""}`} aria-label="Oblasti článkov">{subpages.map((subpage) => <Link href={portalSubpageHref(section, subpage)} key={subpage.slug}>{subpage.icon} {subpage.label}</Link>)}</nav><div className="care-articles-layout"><div className="care-article-featured"><ArticleCard article={sectionArticles[0]} /></div><div className="care-article-stack">{sectionArticles.slice(1, 5).map((article) => <ArticleCard article={article} key={article.slug} />)}</div></div></>
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
        <div className="portal-more-heading"><span className="eyebrow">{isCare ? "Pomoc nablízku" : isActivities ? "Tréning a zážitky nablízku" : isPuppies ? "Ďalší bezpečný krok" : "Celá Psipedia"}</span><h2>{isCare ? "Užitočné služby a kontakty" : isActivities ? "Kam pokračovať" : isPuppies ? "Výber, zdravie a vedenie na jednom mieste" : "Pokračuj ďalšou sekciou"}</h2>{isCare && <p>Keď článok nestačí, pokračuj priamo k vhodnému odborníkovi alebo službe.</p>}{isActivities && <p>Nájdi vedenie, klub, podujatie alebo bezpečné riešenie na čas, keď pes nemôže cestovať s tebou.</p>}{isPuppies && <p>Over si rozhodnutie, pôvod šteniatka aj odbornú pomoc skôr, než ju budeš súrne potrebovať.</p>}</div>
        <div className={`portal-more-grid ${isEditorialHub ? "care-service-grid" : ""}`}>
          {(isCare ? careServices : isActivities ? activityServices : isPuppies ? puppyServices : allSections.filter((item) => item.slug !== section.slug).map((item) => ({ icon: item.icon, title: item.label, text: "", href: `/${item.slug}` }))).map((item) => (
            <Link href={item.href} key={item.href}><span aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong>{item.text && <small>{item.text}</small>}</span><ArrowIcon size={18} /></Link>
          ))}
        </div>
        {isCare && <p className="care-medical-note"><strong>Dôležité:</strong> Psipedia nenahrádza veterinárne vyšetrenie. Pri akútnom stave alebo rýchlom zhoršovaní kontaktuj veterinára bez čakania.</p>}
        {isActivities && <p className="care-medical-note activity-safety-note"><strong>Bezpečný pohyb:</strong> Záťaž zvyšuj postupne. Pri šteniatku, seniorovi, nadváhe, bolesti alebo zdravotnom obmedzení si vhodný pohyb over u veterinára alebo fyzioterapeuta.</p>}
        {isPuppies && <p className="care-medical-note puppy-safety-note"><strong>Dôležité pre rast:</strong> Očkovanie, zdravotné ťažkosti, výživu a primeranú záťaž rieš podľa konkrétneho šteniatka s veterinárom. Sprievodca nenahrádza vyšetrenie.</p>}
      </section>
    </main>
  );
}
