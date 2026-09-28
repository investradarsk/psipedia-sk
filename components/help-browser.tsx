"use client";

import { useMemo, useState, type ReactNode } from "react";
import { HelpCard } from "@/components/help-card";
import { SearchIcon } from "@/components/icons";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import { helpCategories, type HelpCase, type HelpCategorySlug } from "@/lib/help";
import styles from "./help-public.module.css";

type CategoryFilter = "all" | HelpCategorySlug;
type RegionFilter = "all" | SlovakRegion;

const dedicatedCategories = new Set<HelpCategorySlug>(["adopcia", "stratene-a-najdene"]);

export function HelpBrowser({
  items,
  initialCategory = "all",
  children,
}: {
  items: HelpCase[];
  initialCategory?: CategoryFilter;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [region, setRegion] = useState<RegionFilter>("all");
  const [activeOnly, setActiveOnly] = useState(true);

  const categoryOptions = useMemo(
    () => helpCategories.filter((item) => !dedicatedCategories.has(item.slug) && (initialCategory === item.slug || items.some((entry) => entry.category === item.slug))),
    [initialCategory, items],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk");
    return items.filter((item) => {
      const searchable = [item.title, item.excerpt, item.organization, item.dogName, item.breed, item.city, item.region].join(" ").toLocaleLowerCase("sk");
      return (category === "all" || item.category === category)
        && (region === "all" || item.region === region)
        && (!activeOnly || !item.resolved)
        && (!needle || searchable.includes(needle));
    });
  }, [items, query, category, region, activeOnly]);

  function reset() {
    setQuery("");
    setCategory(initialCategory);
    setRegion("all");
    setActiveOnly(true);
  }

  return (
    <section className={styles.browserShell} aria-labelledby="help-results-heading">
      <div className={[styles.shell, styles.browserTop].join(" ")}>
        <form className={styles.toolbar} onSubmit={(event) => event.preventDefault()} aria-label="Filtrovať pomoc">
          <label>
            <span className={styles.label}>Hľadať</span>
            <div className={styles.searchBox}><SearchIcon size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Meno, mesto alebo organizácia" /></div>
          </label>
          {initialCategory === "all" ? <label>
            <span className={styles.label}>Typ pomoci</span>
            <select value={category} onChange={(event) => setCategory(event.target.value as CategoryFilter)}>
              <option value="all">Všetky dostupné typy</option>
              {categoryOptions.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}
            </select>
          </label> : null}
          <label>
            <span className={styles.label}>Kraj</span>
            <select value={region} onChange={(event) => setRegion(event.target.value as RegionFilter)}>
              <option value="all">Všetky kraje</option>
              {slovakRegions.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <label className={styles.checkbox}><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /><span>Len aktívne</span></label>
        </form>

        {children}
      </div>

      <div className={styles.resultsBand}>
        <div className={[styles.shell, styles.results].join(" ")}>
          <div className={styles.resultHeading}>
            <div><h2 id="help-results-heading">{initialCategory === "all" ? "Aktuálne prípady a organizácie" : "Výsledky"}</h2><p>{initialCategory === "all" ? "Tento prehľad zahŕňa prípady a organizácie. Psy na adopciu nájdete v samostatnom prehľade adopcií." : "Výsledky zodpovedajú aktuálne zvoleným filtrom."}</p></div>
            <strong className={styles.resultCount}>{filtered.length} {filtered.length === 1 ? "záznam" : filtered.length > 1 && filtered.length < 5 ? "záznamy" : "záznamov"}</strong>
          </div>

          {filtered.length ? (
            <div className={styles.grid}>{filtered.map((item) => <HelpCard item={item} key={item.category + ":" + item.id} />)}</div>
          ) : (
            <div className={styles.empty}>
              <h2>Momentálne nemáme publikovaný prípad pre tieto filtre.</h2>
              <p>Skúste zmeniť vyhľadávanie, kraj alebo zobraziť aj ukončené záznamy.</p>
              {items.length > 0 ? <button type="button" onClick={reset}>Vyčistiť filtre</button> : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
