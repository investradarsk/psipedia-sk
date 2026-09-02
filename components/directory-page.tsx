import Link from "next/link";
import { DirectoryResults } from "@/components/directory-results";
import { ArrowIcon } from "@/components/icons";
import {
  directoryCategories,
  directoryCategoryHref,
  getDirectoryCategory,
  type DirectoryCategorySlug,
} from "@/lib/directory";
import type { DirectoryFilters, PublicDirectoryProfilePage } from "@/lib/directory-store";

export function DirectoryPage({ result, filters, categoryCounts, initialCategory = "all", showResults = true }: {
  result: PublicDirectoryProfilePage;
  filters: DirectoryFilters;
  categoryCounts: Partial<Record<DirectoryCategorySlug, number>>;
  initialCategory?: "all" | DirectoryCategorySlug;
  showResults?: boolean;
}) {
  const active = initialCategory === "all" ? null : getDirectoryCategory(initialCategory);
  const heroImage = active?.slug === "veterinari" || active?.slug === "fyzioterapia"
    ? "/images/zdravie-veterinar.webp"
    : active?.slug === "treneri" || active?.slug === "kynologicke-kluby"
      ? "/images/trening-pri-nohe.webp"
      : "/images/hero-labrador.webp";
  return (
    <main id="obsah">
      <header className={`directory-hero directory-hero--photo${active ? " directory-hero--category" : ""}`}>
        <img className="section-hero-photo" src={heroImage} alt="" aria-hidden="true" decoding="async" />
        <div className="shell">
          <nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span>{active ? <><Link href="/adresar">Služby pre psov</Link><span>/</span><span>{active.label}</span></> : <span>Služby pre psov</span>}</nav>
          <div className="directory-hero-copy">
            <span className="eyebrow">{active ? active.singular : "Adresár služieb na Slovensku"}</span>
            <h1>{active ? active.label : "Nájdi službu pre svojho psa"}</h1>
            <p>{active?.description ?? "Vyhľadávaj podľa služby, mesta, okresu, kraja alebo plemena — aj bez diakritiky."}</p>
          </div>
          {!active && <form className="directory-main-search" action="/adresar" method="get">
            <label><span>Čo hľadáš?</span><select name="category" defaultValue={filters.category}><option value="">Všetky služby</option>{directoryCategories.map((category) => <option value={category.slug} key={category.slug}>{category.label}</option>)}</select></label>
            <label className="directory-main-search-query"><span>Kde alebo čo konkrétne?</span><input name="q" defaultValue={filters.query} placeholder="Nitra, fyzioterapia, labrador…" /></label>
            <button type="submit">Hľadať</button>
          </form>}
          {!active && <div className="directory-search-examples"><span>Skús napríklad:</span><Link href="/adresar?category=veterinari&q=nitra">veterinár Nitra</Link><Link href="/adresar?category=fyzioterapia&q=zilina">fyzioterapia Žilina</Link><Link href="/adresar?category=chovatelske-stanice&q=labrador">labrador chovateľská stanica</Link></div>}
        </div>
      </header>

      {!active && <section className="section shell directory-categories" aria-labelledby="directory-categories-heading">
        <div className="section-heading split-heading"><div><span className="eyebrow">Vyber si oblasť</span><h2 id="directory-categories-heading">Koho hľadáš?</h2></div><p>Každá kategória aj každý profil má vlastnú adresu, ktorú môžeš uložiť alebo zdieľať.</p></div>
        <div className="directory-category-grid">
          {directoryCategories.map((category) => {
            const count = categoryCounts[category.slug] ?? 0;
            return <Link href={directoryCategoryHref(category)} key={category.slug}><span aria-hidden="true">{category.icon}</span><div><h3>{category.label}</h3><p>{category.description}</p><small>{count} {count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov"}</small></div><ArrowIcon size={20} /></Link>;
          })}
        </div>
      </section>}

      {(active || showResults) && <section className={`section section--tint${active ? " directory-category-results" : ""}`}><div className="shell"><DirectoryResults result={result} filters={filters} basePath={active ? `/adresar/${active.slug}` : "/adresar"} title={active ? active.label : "Výsledky vyhľadávania"} category={active?.slug} showCategory={!active} /></div></section>}
    </main>
  );
}
