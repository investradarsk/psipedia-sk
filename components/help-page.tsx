import Link from "next/link";
import { HelpBrowser } from "@/components/help-browser";
import { ArrowIcon } from "@/components/icons";
import {
  getHelpCategory,
  helpCategories,
  helpCategoryHref,
  type HelpCase,
  type HelpCategorySlug,
} from "@/lib/help";

export function HelpPage({ items, initialCategory = "all" }: { items: HelpCase[]; initialCategory?: "all" | HelpCategorySlug }) {
  const active = initialCategory === "all" ? null : getHelpCategory(initialCategory);
  const activeCount = items.filter((item) => !item.resolved).length;
  const verifiedCount = items.filter((item) => item.verified).length;
  const heroImage = items.find((item) => item.imageUrl)?.imageUrl || "/images/hero-labrador.webp";
  return (
    <main id="obsah">
      <header className="help-hero help-hero--photo">
        <img className="section-hero-photo" src={heroImage} alt="" aria-hidden="true" decoding="async" />
        <div className="shell">
          <nav className="article-breadcrumbs" aria-label="Navigácia"><Link href="/">Domov</Link><span>/</span>{active ? <><Link href="/pomoc-psom">Pomoc psom</Link><span>/</span><span>{active.label}</span></> : <span>Pomoc psom</span>}</nav>
          <div className="help-hero-grid"><div><span className="eyebrow">{active ? active.singular : "Pomoc, ktorá má cieľ"}</span><h1>{active ? active.label : "Pomôžme psom správne"}</h1><p>{active?.description ?? "Adopcie, pátrania, urgentné prípady a transparentné zbierky na jednom dôveryhodnom mieste."}</p></div><aside><span aria-hidden="true">🛡️</span><div><strong>Najprv overujeme</strong><p>Pri prípadoch uvádzame zodpovednú osobu alebo organizáciu. Zbierku nezverejníme bez overeného odkazu a cieľa.</p></div></aside></div>
          <div className="help-hero-stats"><div><strong>{helpCategories.length}</strong><span>spôsobov pomoci</span></div><div><strong>{activeCount}</strong><span>aktívnych prípadov</span></div><div><strong>{verifiedCount}</strong><span>overených výziev</span></div></div>
        </div>
      </header>

      <section className="section shell help-categories" aria-labelledby="help-categories-heading">
        <div className="section-heading split-heading"><div><span className="eyebrow">Vyber si spôsob</span><h2 id="help-categories-heading">Ako chceš pomôcť?</h2></div><p>Každá kategória aj každý prípad má vlastnú adresu na jednoduché uloženie a zdieľanie.</p></div>
        <div className="help-category-grid">{helpCategories.map((category) => { const count = items.filter((item) => item.category === category.slug && !item.resolved).length; return <Link className={active?.slug === category.slug ? "is-active" : ""} href={helpCategoryHref(category)} key={category.slug}><span aria-hidden="true">{category.icon}</span><div><h3>{category.label}</h3><p>{category.description}</p><small>{count} aktívnych</small></div><ArrowIcon size={20} /></Link>; })}</div>
        <div className="help-report-banner"><div><span aria-hidden="true">🚨</span><div><strong>Našiel si psa v núdzi?</strong><p>Najprv zaisti bezpečnosť a potom postupuj podľa krátkeho kontrolného zoznamu.</p></div></div><Link href="/pomoc-psom/nahlasit-psa-v-nudzi">Čo urobiť teraz <ArrowIcon size={18} /></Link></div>
      </section>

      <section className="section section--tint"><div className="shell"><HelpBrowser items={items} initialCategory={initialCategory} /></div></section>
    </main>
  );
}
