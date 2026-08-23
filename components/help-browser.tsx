"use client";

import { useMemo, useState } from "react";
import { HelpCard } from "@/components/help-card";
import { SearchIcon } from "@/components/icons";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import { helpCategories, type HelpCase, type HelpCategorySlug } from "@/lib/help";

type CategoryFilter = "all" | HelpCategorySlug;
type RegionFilter = "all" | SlovakRegion;

export function HelpBrowser({ items, initialCategory = "all" }: { items: HelpCase[]; initialCategory?: CategoryFilter }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [region, setRegion] = useState<RegionFilter>("all");
  const [activeOnly, setActiveOnly] = useState(true);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return items.filter((item) => {
      const searchable = `${item.title} ${item.excerpt} ${item.organization} ${item.dogName} ${item.breed} ${item.city} ${item.region}`.toLocaleLowerCase("sk");
      return (category === "all" || item.category === category)
        && (region === "all" || item.region === region)
        && (!activeOnly || !item.resolved)
        && (!needle || searchable.includes(needle));
    });
  }, [items, query, category, region, activeOnly]);

  function reset() {
    setQuery(""); setCategory(initialCategory); setRegion("all"); setActiveOnly(true);
  }

  return (
    <section className="help-results" aria-labelledby="help-results-heading">
      <div className="help-toolbar">
        <label className="help-search"><span>Hľadať pomoc</span><div><SearchIcon size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Meno psa, mesto alebo organizácia" /></div></label>
        <label><span>Kategória</span><select value={category} onChange={(event) => setCategory(event.target.value as CategoryFilter)}><option value="all">Všetky kategórie</option>{helpCategories.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}</select></label>
        <label><span>Kraj</span><select value={region} onChange={(event) => setRegion(event.target.value as RegionFilter)}><option value="all">Všetky kraje</option>{slovakRegions.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        <label className="help-active-filter"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /><span>Len aktívne prípady</span></label>
      </div>
      <div className="help-result-heading"><div><span className="eyebrow">Aktuálne a overené</span><h2 id="help-results-heading">Kde je potrebná pomoc</h2></div><strong>{filtered.length} {filtered.length === 1 ? "prípad" : filtered.length > 1 && filtered.length < 5 ? "prípady" : "prípadov"}</strong></div>
      {filtered.length ? <div className="help-grid">{filtered.map((item) => <HelpCard item={item} key={item.id} />)}</div> : <div className="help-empty"><span aria-hidden="true">❤️</span><h2>{items.length ? "Nenašli sme zhodu" : "Prvé overené prípady pripravujeme"}</h2><p>{items.length ? "Skús zmeniť kategóriu, kraj alebo zobraziť aj vybavené prípady." : "Sekcia je pripravená. Nové prípady sa zobrazia po redakčnom overení a publikovaní."}</p>{items.length > 0 && <button type="button" onClick={reset}>Zrušiť filtre</button>}</div>}
    </section>
  );
}
