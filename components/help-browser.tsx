import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import { PublicSelect } from "@/components/public-visual-system/public-form-controls";
import Link from "next/link";
import type { ReactNode } from "react";
import { HelpCard } from "@/components/help-card";
import { PageContainer } from "@/components/page-system";
import { PublicActionButton, PublicActionLink, PublicContentShell } from "@/components/public-visual-system";
import { PublicFilterDisclosure } from "@/components/public-filter-disclosure";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import type { PublicHelpCard, HelpCategorySlug } from "@/lib/help";
import styles from "./help-public.module.css";

type CategoryFilter = "all" | HelpCategorySlug;
type RegionFilter = "all" | SlovakRegion;

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .trim();
}

export function HelpBrowser({
  items,
  initialCategory = "all",
  children,
  initialQuery = "",
  initialActiveOnly = true,
  initialRegion = "all",
}: {
  items: PublicHelpCard[];
  initialCategory?: CategoryFilter;
  children?: ReactNode;
  initialQuery?: string;
  initialActiveOnly?: boolean;
  initialRegion?: RegionFilter;
}) {
  const query = initialQuery.trim().slice(0, 120);
  const region = initialRegion;
  const activeOnly = initialActiveOnly;
  const needle = normalizeSearch(query);
  const basePath = initialCategory === "all" ? "/pomoc-psom" : `/pomoc-psom/${initialCategory}`;
  const filtered = items.filter((item) => {
    const searchable = normalizeSearch(
      [
        item.title,
        item.excerpt,
        item.organization,
        item.dogName,
        item.breed,
        item.city,
        item.region,
      ].join(" "),
    );
    return (
      (initialCategory === "all" || item.category === initialCategory) &&
      (region === "all" || item.region === region) &&
      (!activeOnly || !item.resolved) &&
      (!needle || searchable.includes(needle))
    );
  });
  const activeSecondaryCount = Number(region !== "all") + Number(!activeOnly);

  return (
    <section className={styles.browserShell} aria-labelledby="help-results-heading">
      <PublicContentShell variant="listing" className={styles.browserTop}>
        <form
          className={styles.toolbar}
          method="get"
          action={basePath}
          aria-label="Filtre Pomoci psom"
          data-help-secondary-filters
        >
          <input type="hidden" name="q" value={query} />
          <PublicFilterDisclosure
            activeCount={activeSecondaryCount}
            buttonClassName={styles.filterToggle}
            contentClassName={styles.secondaryFilters}
            openContentClassName={styles.secondaryFiltersOpen}
          >
            <label>
              <span className={styles.label}>Kraj</span>
              <PublicSelect
                appearance="context"
                name="region"
                defaultValue={region === "all" ? "" : region}
              >
                <option value="">Všetky kraje</option>
                {slovakRegions
                  .filter((item) => item !== "Online")
                  .map((item) => (
                    <option value={item} key={item}>
                      {item}
                    </option>
                  ))}
              </PublicSelect>
            </label>
            <label>
              <span className={styles.label}>Stav</span>
              <PublicSelect
                appearance="context"
                name="stav"
                defaultValue={activeOnly ? "" : "vsetky"}
              >
                <option value="">Len aktívne</option>
                <option value="vsetky">Aj ukončené</option>
              </PublicSelect>
            </label>
            <PublicActionButton className={styles.searchSubmit} type="submit">Použiť filtre</PublicActionButton>
            <PublicActionLink className={styles.resetFilters} variant="tertiary" href={basePath}>Zrušiť filtre</PublicActionLink>
          </PublicFilterDisclosure>
        </form>

        {children}
      </PublicContentShell>

      <div className={styles.resultsBand}>
        <PageContainer className={styles.results}>
          <div className={styles.resultHeading}>
            <div>
              <h2 id="help-results-heading">
                {initialCategory === "all" ? "Aktuálne prípady a organizácie" : "Výsledky"}
              </h2>
              <p>
                {initialCategory === "all"
                  ? "Tento prehľad zahŕňa prípady a organizácie. Psy na adopciu nájdete v samostatnom prehľade adopcií."
                  : "Výsledky zodpovedajú aktuálnemu vyhľadávaniu a filtrom."}
              </p>
            </div>
            <strong className={styles.resultCount}>
              {filtered.length}{" "}
              {filtered.length === 1
                ? "záznam"
                : filtered.length > 1 && filtered.length < 5
                  ? "záznamy"
                  : "záznamov"}
            </strong>
          </div>

          {filtered.length ? (
            <div className={styles.grid}>
              {filtered.map((item) => (
                <HelpCard item={item} key={item.category + ":" + item.id} />
              ))}
            </div>
          ) : (
            <PublicEmptyState variant="context" className={styles.empty}>
              <h2>Momentálne nemáme publikovaný prípad pre tieto filtre.</h2>
              <p>Upravte vyhľadávanie alebo zrušte filtre a vráťte sa k celému zoznamu.</p>
              <Link className={styles.emptyReset} href={basePath}>
                Zobraziť celý zoznam
              </Link>
            </PublicEmptyState>
          )}
        </PageContainer>
      </div>
    </section>
  );
}
