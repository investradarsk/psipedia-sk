import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, SearchIcon } from "@/components/icons";
import { directoryCategories } from "@/lib/directory";
import { eventTypes } from "@/lib/events";
import { getNewsCategory } from "@/lib/news";
import {
  normalizePortalSearch,
  portalSearchFallbacks,
  portalSearchMapHref,
  searchPortal,
  type PortalSearchItem,
} from "@/lib/portal-search";
import {
  SEARCH_MAX_QUERY_LENGTH,
  parsePortalSearchLocationFilter,
  parsePortalSearchTypeFilter,
  portalSearchTypeFilterFromParsed,
  type ParsedPortalSearchQuery,
} from "@/lib/portal-search-query";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hľadať na Psipedii",
  description: "Vyhľadávanie článkov, plemien, podujatí, odborníkov a pomoci na Psipedia.sk.",
  robots: { index: false, follow: true },
};

type SearchParams = {
  q?: string | string[];
  sekcia?: string | string[];
  page?: string | string[];
  typ?: string | string[];
  lokalita?: string | string[];
  podsekcia?: string | string[];
};

type Props = { searchParams: Promise<SearchParams> };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resultCountLabel(value: number) {
  if (value === 1) return "1 výsledok";
  if (value >= 2 && value <= 4) return `${value} výsledky`;
  return `${value} výsledkov`;
}

const searchArticleDateFormatter = new Intl.DateTimeFormat("sk-SK", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function searchArticleDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : searchArticleDateFormatter.format(date);
}

function searchArticleTopic(item: { type: string; category?: string; newsCategory?: string }) {
  if (item.type === "Novinka") return getNewsCategory(item.newsCategory)?.shortLabel ?? "Zo sveta psov";
  return item.category ?? "Článok";
}

function searchHref(
  query: string,
  section: string,
  page: number,
  typeFilter: string | undefined,
  locationFilter: string | undefined,
  subsection = "",
) {
  const params = new URLSearchParams({ q: query });
  if (section) params.set("sekcia", section);
  if (section && subsection) params.set("podsekcia", subsection);
  if (typeFilter !== undefined) params.set("typ", typeFilter);
  if (locationFilter !== undefined) params.set("lokalita", locationFilter);
  if (page > 1) params.set("page", String(page));
  return `/hladat?${params}`;
}

function knownContentFallbacks(query: string, section: string) {
  if (normalizePortalSearch(query) !== "labrador") return [];
  return [
    ...(section ? [] : [{ href: "/plemena/labradorsky-retriever", label: "Labradorský retriever", type: "Plemeno" }]),
    ...(!section || section === "steniatka" ? [{ href: "/steniatka/prvy-rok-labradora-mesiac-po-mesiaci", label: "Prvý rok labradora: čo vás čaká mesiac po mesiaci", type: "Článok" }] : []),
  ];
}

function typeFilterLabel(value: string) {
  const directory = directoryCategories.find((item) => item.slug === value);
  if (directory) return directory.label;
  if (value.startsWith("event:")) return `Podujatie: ${value.slice("event:".length)}`;
  if (value === "adoption") return "Psy na adopciu";
  if (value === "organization") return "Organizácie a útulky";
  if (value === "lost-found") return "Stratené a nájdené psy";
  return "";
}

function locationLabel(parsed: ParsedPortalSearchQuery) {
  const location = parsed.location;
  if (!location) return "";
  if (location.level === "city") return location.city;
  if (location.level === "district") return `okres ${location.district}`;
  return location.region;
}

function resultLocation(item: PortalSearchItem) {
  return [item.city, item.district && item.district !== item.city ? item.district : "", item.region && item.region !== item.district ? item.region : ""]
    .filter(Boolean)
    .join(" · ");
}

function serviceLabels(value?: string) {
  if (!value?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()).slice(0, 4);
    }
  } catch {
    return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean).slice(0, 4);
  }
  return [];
}

function broadenSearchLinks(
  query: string,
  section: string,
  parsed: ParsedPortalSearchQuery,
  typeFilter: string | undefined,
  locationFilter: string | undefined,
  subsection = "",
) {
  const links: Array<{ href: string; label: string }> = [];
  const location = parsed.location;
  if (location?.level === "city" && location.district) {
    links.push({
      href: searchHref(query, section, 1, typeFilter, `okres:${location.district}`, subsection),
      label: `Rozšíriť na okres ${location.district}`,
    });
  }
  if (location && location.level !== "region" && location.region) {
    links.push({
      href: searchHref(query, section, 1, typeFilter, `kraj:${location.region}`, subsection),
      label: `Rozšíriť na ${location.region}`,
    });
  }
  if (location) {
    links.push({
      href: searchHref(query, section, 1, typeFilter, "", subsection),
      label: "Hľadať bez obmedzenia lokality",
    });
  }
  if (portalSearchTypeFilterFromParsed(parsed)) {
    links.push({
      href: searchHref(query, section, 1, "", locationFilter, subsection),
      label: "Hľadať vo všetkých typoch výsledkov",
    });
  }
  return [...new Map(links.map((item) => [item.href, item])).values()];
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = (first(params.q) ?? "").trim().slice(0, SEARCH_MAX_QUERY_LENGTH);
  const rawSection = first(params.sekcia);
  const supportedSections = new Set(["starostlivost", "aktivity", "steniatka", "novinky", "recenzie", "pomoc-psom"]);
  const section = rawSection && supportedSections.has(rawSection) ? rawSection : "";
  const subsection = section ? (first(params.podsekcia) ?? "").trim().slice(0, 80) : "";
  const requestedPage = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);
  const typeProvided = params.typ !== undefined;
  const locationProvided = params.lokalita !== undefined;
  const rawTypeFilter = (first(params.typ) ?? "").trim();
  const rawLocationFilter = (first(params.lokalita) ?? "").trim();
  const typeFilterParam = typeProvided ? rawTypeFilter : undefined;
  const locationFilterParam = locationProvided ? rawLocationFilter : undefined;
  const result = await searchPortal(query, {
    page: requestedPage,
    section,
    subsection,
    filters: {
      type: rawTypeFilter,
      typeProvided,
      location: rawLocationFilter,
      locationProvided,
    },
  });
  const fallbacks = portalSearchFallbacks(result.parsed);
  const knownFallbacks = knownContentFallbacks(query, section);
  const broadenings = broadenSearchLinks(query, section, result.parsed, typeFilterParam, locationFilterParam, subsection);
  const activeTypeFilter = portalSearchTypeFilterFromParsed(result.parsed);
  const activeTypeLabel = typeFilterLabel(activeTypeFilter);
  const activeLocationLabel = locationLabel(result.parsed);
  const mapHref = section ? null : portalSearchMapHref(result.parsed);
  const explicitLocation = locationProvided ? parsePortalSearchLocationFilter(rawLocationFilter) : null;
  const invalidTypeFilter = typeProvided && Boolean(rawTypeFilter) && !parsePortalSearchTypeFilter(rawTypeFilter);
  const invalidLocationFilter = locationProvided && Boolean(rawLocationFilter) && !explicitLocation;
  const locationFieldValue = locationProvided
    ? explicitLocation?.level === "city"
      ? explicitLocation.city
      : explicitLocation?.level === "district"
        ? `okres ${explicitLocation.district}`
        : explicitLocation?.level === "region"
          ? `kraj ${explicitLocation.region}`
          : rawLocationFilter
    : activeLocationLabel;
  const hasActiveDiscoveryFilter = Boolean(activeTypeLabel || activeLocationLabel);

  return (
    <main id="obsah" className="portal-search-page">
      <header className="portal-search-hero">
        <div className="shell">
          <span className="eyebrow">Celá Psipedia na jednom mieste</span>
          <h1>Čo hľadáš?</h1>
          <p>{section === "starostlivost" ? "Vyhľadávame iba v poradni Zdravie a starostlivosť." : section === "aktivity" ? "Vyhľadávame iba v sekcii Výcvik a aktivity." : section === "steniatka" ? "Vyhľadávame iba v sprievodcovi Šteniatka." : section === "novinky" ? "Vyhľadávame iba medzi Novinkami." : section === "recenzie" ? "Vyhľadávame iba medzi redakčnými recenziami a testami." : section === "pomoc-psom" ? "Vyhľadávame iba v sekcii Pomoc psom." : "Článok, plemeno, podujatie, veterinára, trénera, službu alebo pomoc nájdeš jedným vyhľadávaním."}</p>
          <form action="/hladat" method="get" className="portal-search-form" role="search">
            <SearchIcon size={24} />
            {section && <input type="hidden" name="sekcia" value={section} />}
            {section && subsection && <input type="hidden" name="podsekcia" value={subsection} />}
            <label className="sr-only" htmlFor="portal-query">Hľadaný výraz</label>
            <input
              id="portal-query"
              name="q"
              defaultValue={query}
              maxLength={SEARCH_MAX_QUERY_LENGTH}
              placeholder="Hľadať na Psipedii"
              autoComplete="off"
            />
            <button type="submit">Hľadať</button>
          </form>
        </div>
      </header>

      {query.length >= 2 && !section ? (
        <section className={`shell ${styles.discovery}`} aria-labelledby="search-interpretation-title">
          <div className={styles.discoveryIntro}>
            <div>
              <span className={styles.discoveryEyebrow}>Ako chápeme dotaz</span>
              <h2 id="search-interpretation-title">
                {activeTypeLabel || activeLocationLabel
                  ? [activeTypeLabel, activeLocationLabel].filter(Boolean).join(" · ")
                  : "Bez rozpoznaného typu alebo lokality"}
              </h2>
            </div>
            <div className={styles.discoveryActions}>
              {mapHref ? <Link className={styles.mapLink} href={mapHref}>Zobraziť na mape</Link> : null}
              {typeProvided || locationProvided ? (
                <Link href={searchHref(query, section, 1, undefined, undefined, subsection)}>Obnoviť rozpoznanie z dotazu</Link>
              ) : null}
            </div>
          </div>

          {activeTypeLabel || activeLocationLabel ? (
            <div className={styles.chips} aria-label="Aktívna interpretácia dotazu">
              {activeTypeLabel ? (
                <Link
                  href={searchHref(query, section, 1, "", locationFilterParam, subsection)}
                  className={styles.chip}
                  aria-label={`Zrušiť filter typu ${activeTypeLabel}`}
                >
                  Typ: {activeTypeLabel} <span aria-hidden="true">×</span>
                </Link>
              ) : null}
              {activeLocationLabel ? (
                <Link
                  href={searchHref(query, section, 1, typeFilterParam, "", subsection)}
                  className={styles.chip}
                  aria-label={`Zrušiť filter lokality ${activeLocationLabel}`}
                >
                  Lokalita: {activeLocationLabel} <span aria-hidden="true">×</span>
                </Link>
              ) : null}
            </div>
          ) : null}

          <form action="/hladat" method="get" className={styles.filterForm} aria-label="Upraviť filtre vyhľadávania">
            <input type="hidden" name="q" value={query} />
            <label>
              <span>Typ výsledku</span>
              <select name="typ" defaultValue={activeTypeFilter}>
                <option value="">Všetky typy</option>
                <optgroup label="Služby pre psov">
                  {directoryCategories.map((category) => (
                    <option key={category.slug} value={category.slug}>{category.label}</option>
                  ))}
                </optgroup>
                <optgroup label="Podujatia">
                  {eventTypes.map((eventType) => (
                    <option key={eventType} value={`event:${eventType}`}>{eventType}</option>
                  ))}
                </optgroup>
                <optgroup label="Pomoc psom">
                  <option value="organization">Organizácie a útulky</option>
                  <option value="adoption">Psy na adopciu</option>
                  <option value="lost-found">Stratené a nájdené psy</option>
                </optgroup>
              </select>
            </label>
            <label>
              <span>Lokalita</span>
              <input
                name="lokalita"
                defaultValue={locationFieldValue}
                placeholder="Napr. Trnava, okres Nitra alebo kraj"
                autoComplete="address-level2"
              />
            </label>
            <button type="submit">Upraviť výsledky</button>
          </form>

          {invalidTypeFilter || invalidLocationFilter ? (
            <p className={styles.filterNotice} role="status">
              {invalidTypeFilter ? "Neznámy typ výsledku sme nepoužili. " : ""}
              {invalidLocationFilter ? `Lokalitu „${rawLocationFilter}“ sme nerozpoznali, preto podľa nej výsledky neobmedzujeme.` : ""}
            </p>
          ) : null}
        </section>
      ) : null}

      <section className="section shell portal-search-results" aria-live="polite" aria-busy="false">
        {query.length < 2 ? (
          <div className="portal-search-start">
            <span aria-hidden="true">🔎</span>
            <h2>Napíš aspoň dve písmená</h2>
            <p>Vyhľadávame bez ohľadu na diakritiku a rozumieme aj kombinácii služby s lokalitou.</p>
            <div><Link href="/plemena">Atlas plemien</Link><Link href="/podujatia">Kalendár</Link><Link href="/adresar">Služby pre psov</Link><Link href="/pomoc-psom">Pomoc psom</Link></div>
          </div>
        ) : result.items.length ? (
          <>
            <div className="portal-search-summary">
              <span>Výsledky pre</span>
              <h2>„{query}“</h2>
              <strong>{resultCountLabel(result.total)}</strong>
            </div>
            <div className={styles.resultList} aria-label="Výsledky vyhľadávania">
              {result.items.map((item) => {
                const location = resultLocation(item);
                const services = item.kind === "directory" ? serviceLabels(item.services) : [];
                return (
                  <Link
                    href={item.href}
                    key={item.href}
                    className={`${styles.result} ${item.kind === "article" ? styles.articleResult : ""}`}
                    data-article-list-item={item.kind === "article" ? "" : undefined}
                  >
                    {item.kind === "article" ? (
                      <span className={`${styles.copy} ${item.imageUrl ? styles.articleCopy : styles.articleCopyNoImage}`}>
                        {item.imageUrl ? (
                          <span className={styles.articleImage} data-article-image>
                            <img src={item.imageUrl} alt={"Ilustračná fotografia k článku: " + item.title} loading="lazy" decoding="async" />
                          </span>
                        ) : null}
                        <span className={styles.articleText}>
                          <span className={styles.articleTopic} data-article-topic>{searchArticleTopic(item)}</span>
                          <strong data-article-title>{item.title}</strong>
                          {item.publishedAt ? (
                            <time className={styles.articleDate} dateTime={item.publishedAt} data-article-date>{searchArticleDate(item.publishedAt)}</time>
                          ) : null}
                        </span>
                      </span>
                    ) : (
                      <span className={styles.copy}>
                        <span className={styles.meta}>
                          <small className={styles.type}>{item.type}</small>
                          {location ? <span className={styles.location}>{location}</span> : null}
                        </span>
                        <strong>{item.title}</strong>
                        {item.description ? <span className={styles.description}>{item.description}</span> : null}
                        {services.length ? (
                          <span className={styles.services} aria-label="Dostupné služby">
                            {services.map((service) => <span key={service}>{service}</span>)}
                          </span>
                        ) : null}
                      </span>
                    )}
                    <ArrowIcon size={20} />
                  </Link>
                );
              })}
            </div>

            {result.capped ? <p className={styles.limitNote}>Pri veľmi širokom dotaze zobrazujeme najrelevantnejších 480 výsledkov. Pre úplný zoznam použi príslušnú sekciu alebo adresár.</p> : null}

            {result.totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="Stránkovanie výsledkov">
                {result.page > 1 ? <Link href={searchHref(query, section, result.page - 1, typeFilterParam, locationFilterParam, subsection)} rel="prev">← Predchádzajúca</Link> : <span />}
                <span>Strana {result.page} z {result.totalPages}</span>
                {result.page < result.totalPages ? <Link href={searchHref(query, section, result.page + 1, typeFilterParam, locationFilterParam, subsection)} rel="next">Ďalšia →</Link> : <span />}
              </nav>
            ) : null}
          </>
        ) : (
          <div className="portal-search-start">
            <span aria-hidden="true">🐾</span>
            <span>Výsledky pre „{query}“</span>
            <h2>Nenašli sme presnú zhodu</h2>
            <p>
              {hasActiveDiscoveryFilter
                ? "Pre zvolený typ alebo lokalitu momentálne nemáme zodpovedajúci publikovaný výsledok. Môžeš rozšíriť lokalitu alebo zrušiť jeden z filtrov."
                : `Pre dotaz „${query}“ momentálne nemáme zodpovedajúci publikovaný výsledok. Skús upraviť názov, službu alebo lokalitu.`}
            </p>
            {broadenings.length ? <div>{broadenings.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}</div> : null}
            {knownFallbacks.length ? <div>{knownFallbacks.map((link) => <Link href={link.href} key={link.href}><small>{link.type}</small> {link.label}</Link>)}</div> : null}
            {fallbacks.length ? <div>{fallbacks.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}</div> : null}
          </div>
        )}
      </section>
    </main>
  );
}
