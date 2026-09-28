import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, SearchIcon } from "@/components/icons";
import { portalSearchFallbacks, searchPortal } from "@/lib/portal-search";
import { SEARCH_MAX_QUERY_LENGTH } from "@/lib/portal-search-query";
import styles from "./search.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hľadať na Psipedii",
  description: "Vyhľadávanie článkov, plemien, podujatí, odborníkov a pomoci na Psipedia.sk.",
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ q?: string | string[]; sekcia?: string | string[]; page?: string | string[] }> };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resultCountLabel(value: number) {
  if (value === 1) return "1 výsledok";
  if (value >= 2 && value <= 4) return `${value} výsledky`;
  return `${value} výsledkov`;
}

function searchHref(query: string, section: string, page: number) {
  const params = new URLSearchParams({ q: query });
  if (section) params.set("sekcia", section);
  if (page > 1) params.set("page", String(page));
  return `/hladat?${params}`;
}

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = (first(params.q) ?? "").trim().slice(0, SEARCH_MAX_QUERY_LENGTH);
  const rawSection = first(params.sekcia);
  const section = rawSection === "starostlivost" || rawSection === "aktivity" || rawSection === "steniatka" ? rawSection : "";
  const requestedPage = Math.max(1, Number.parseInt(first(params.page) ?? "1", 10) || 1);
  const result = await searchPortal(query, { page: requestedPage, section });
  const fallbacks = portalSearchFallbacks(result.parsed);

  return (
    <main id="obsah" className="portal-search-page">
      <header className="portal-search-hero">
        <div className="shell">
          <span className="eyebrow">Celá Psipedia na jednom mieste</span>
          <h1>Čo hľadáš?</h1>
          <p>{section === "starostlivost" ? "Vyhľadávame iba v poradni Zdravie a starostlivosť." : section === "aktivity" ? "Vyhľadávame iba v sekcii Výcvik a aktivity." : section === "steniatka" ? "Vyhľadávame iba v sprievodcovi Šteniatka." : "Článok, plemeno, podujatie, veterinára, trénera, službu alebo pomoc nájdeš jedným vyhľadávaním."}</p>
          <form action="/hladat" method="get" className="portal-search-form" role="search">
            <SearchIcon size={24} />
            {section && <input type="hidden" name="sekcia" value={section} />}
            <label className="sr-only" htmlFor="portal-query">Hľadaný výraz</label>
            <input
              id="portal-query"
              name="q"
              defaultValue={query}
              maxLength={SEARCH_MAX_QUERY_LENGTH}
              placeholder="Skús „veterinár v Trnave“, „labrador“…"
              autoComplete="off"
              autoFocus
            />
            <button type="submit">Hľadať</button>
          </form>
        </div>
      </header>

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
              {result.items.map((item) => (
                <Link href={item.href} key={item.href} className={styles.result}>
                  <span className={styles.copy}>
                    <small className={styles.type}>{item.type}</small>
                    <strong>{item.title}</strong>
                    {item.description ? <span className={styles.description}>{item.description}</span> : null}
                  </span>
                  <ArrowIcon size={20} />
                </Link>
              ))}
            </div>

            {result.capped ? <p className={styles.limitNote}>Pri veľmi širokom dotaze zobrazujeme najrelevantnejších 480 výsledkov. Pre úplný zoznam použi príslušnú sekciu alebo adresár.</p> : null}

            {result.totalPages > 1 ? (
              <nav className={styles.pagination} aria-label="Stránkovanie výsledkov">
                {result.page > 1 ? <Link href={searchHref(query, section, result.page - 1)} rel="prev">← Predchádzajúca</Link> : <span />}
                <span>Strana {result.page} z {result.totalPages}</span>
                {result.page < result.totalPages ? <Link href={searchHref(query, section, result.page + 1)} rel="next">Ďalšia →</Link> : <span />}
              </nav>
            ) : null}
          </>
        ) : (
          <div className="portal-search-start">
            <span aria-hidden="true">🐾</span>
            <h2>Nenašli sme presnú zhodu</h2>
            <p>
              Pre dotaz „{query}“ momentálne nemáme zodpovedajúci publikovaný výsledok.
              Skús upraviť názov, službu alebo lokalitu.
            </p>
            {fallbacks.length ? <div>{fallbacks.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}</div> : null}
          </div>
        )}
      </section>
    </main>
  );
}
