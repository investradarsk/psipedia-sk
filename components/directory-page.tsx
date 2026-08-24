import Link from "next/link";
import { DirectoryBrowser } from "@/components/directory-browser";
import { ArrowIcon } from "@/components/icons";
import {
  directoryCategories,
  directoryCategoryHref,
  getDirectoryCategory,
  type DirectoryCategorySlug,
  type PublicDirectoryProfile,
} from "@/lib/directory";

export function DirectoryPage({ profiles, initialCategory = "all" }: { profiles: PublicDirectoryProfile[]; initialCategory?: "all" | DirectoryCategorySlug }) {
  const active = initialCategory === "all" ? null : getDirectoryCategory(initialCategory);
  return (
    <main id="obsah">
      <header className="directory-hero">
        <div className="shell">
          <nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span>{active ? <><Link href="/adresar">Služby pre psov</Link><span>/</span><span>{active.label}</span></> : <span>Služby pre psov</span>}</nav>
          <div className="directory-hero-grid">
            <div>
              <span className="eyebrow">{active ? active.singular : "Nájdi pomoc nablízku"}</span>
              <h1>{active ? active.label : "Služby pre psov"}</h1>
              <p>{active?.description ?? "Veterinári, tréneri, školy, kluby a ďalšie služby — prehľadne podľa kraja a zamerania."}</p>
            </div>
            <div className="directory-hero-trust">
              <span aria-hidden="true">✓</span>
              <div><strong>Kontakt cez Psipediu</strong><p>Tvoj dopyt najprv prijme redakcia. Kontaktné údaje poskytovateľa nezverejňujeme bez jeho súhlasu.</p></div>
            </div>
          </div>
          <div className="directory-hero-stats"><div><strong>{directoryCategories.length}</strong><span>kategórií</span></div><div><strong>8 + online</strong><span>krajov a možnosti</span></div><div><strong>1 formulár</strong><span>bez hľadania kontaktov</span></div></div>
        </div>
      </header>

      <section className="section shell directory-categories" aria-labelledby="directory-categories-heading">
        <div className="section-heading split-heading"><div><span className="eyebrow">Vyber si oblasť</span><h2 id="directory-categories-heading">Koho hľadáš?</h2></div><p>Každá kategória aj každý profil má vlastnú adresu, ktorú môžeš uložiť alebo zdieľať.</p></div>
        <div className="directory-category-grid">
          {directoryCategories.map((category) => {
            const count = profiles.filter((profile) => profile.category === category.slug).length;
            return <Link className={active?.slug === category.slug ? "is-active" : ""} href={directoryCategoryHref(category)} key={category.slug}><span aria-hidden="true">{category.icon}</span><div><h3>{category.label}</h3><p>{category.description}</p><small>{count} {count === 1 ? "profil" : count > 1 && count < 5 ? "profily" : "profilov"}</small></div><ArrowIcon size={20} /></Link>;
          })}
        </div>
      </section>

      <section className="section section--tint"><div className="shell"><DirectoryBrowser profiles={profiles} initialCategory={initialCategory} /></div></section>
    </main>
  );
}
