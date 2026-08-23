import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, SearchIcon } from "@/components/icons";
import { filterPortalSearch, getPortalSearchIndex } from "@/lib/portal-search";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hľadať na Psipedii",
  description: "Vyhľadávanie článkov, plemien, podujatí, odborníkov a pomoci na Psipedia.sk.",
  robots: { index: false, follow: true },
};

type Props = { searchParams: Promise<{ q?: string | string[] }> };

export default async function SearchPage({ searchParams }: Props) {
  const raw = (await searchParams).q;
  const query = (Array.isArray(raw) ? raw[0] : raw ?? "").trim().slice(0, 120);
  const results = filterPortalSearch(await getPortalSearchIndex(), query);
  const grouped = results.reduce((groups, item) => {
    const group = groups.get(item.type) ?? [];
    group.push(item);
    groups.set(item.type, group);
    return groups;
  }, new Map<string, typeof results>());

  return (
    <main id="obsah" className="portal-search-page">
      <header className="portal-search-hero">
        <div className="shell">
          <span className="eyebrow">Celá Psipedia na jednom mieste</span>
          <h1>Čo hľadáš?</h1>
          <p>Článok, plemeno, podujatie, trénera, útulok alebo konkrétnu pomoc nájdeš jedným vyhľadávaním.</p>
          <form action="/hladat" method="get" className="portal-search-form">
            <SearchIcon size={24} />
            <label className="sr-only" htmlFor="portal-query">Hľadaný výraz</label>
            <input id="portal-query" name="q" defaultValue={query} maxLength={120} placeholder="Skús „labrador“, „výstava“, „tréner“…" autoFocus />
            <button type="submit">Hľadať</button>
          </form>
        </div>
      </header>

      <section className="section shell portal-search-results" aria-live="polite">
        {query.length < 2 ? (
          <div className="portal-search-start"><span aria-hidden="true">🔎</span><h2>Napíš aspoň dve písmená</h2><p>Vyhľadávame bez ohľadu na diakritiku v celom portáli.</p><div><Link href="/plemena">Atlas plemien</Link><Link href="/podujatia">Kalendár</Link><Link href="/adresar">Adresár</Link><Link href="/pomoc-psom">Pomoc psom</Link></div></div>
        ) : results.length ? (
          <>
            <div className="portal-search-summary"><span>Výsledky pre</span><h2>„{query}“</h2><strong>{results.length} {results.length === 1 ? "výsledok" : results.length < 5 ? "výsledky" : "výsledkov"}</strong></div>
            <div className="portal-search-groups">
              {[...grouped.entries()].map(([type, items]) => (
                <section className="portal-search-group" key={type}>
                  <header><span>{type}</span><b>{items.length}</b></header>
                  <div>{items.map((item) => <Link href={item.href} key={item.href}><span><strong>{item.title}</strong><small>{item.description}</small></span><ArrowIcon size={20} /></Link>)}</div>
                </section>
              ))}
            </div>
          </>
        ) : (
          <div className="portal-search-start"><span aria-hidden="true">🐾</span><h2>Nič sme nenašli</h2><p>Skús kratšie alebo všeobecnejšie slovo. Ak ti na Psipedii chýba dôležitá téma, môžeš nám poslať námet.</p><div><Link href="/novinky/poslat-tip">Pošli tip redakcii</Link><Link href="/clanky">Všetky články</Link></div></div>
        )}
      </section>
    </main>
  );
}
