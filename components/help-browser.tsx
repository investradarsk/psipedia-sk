import { PublicHeading } from "@/components/public-heading";
import { helpListing, helpListingHref } from "@/lib/help-listing";
import { PublicPagination } from "@/components/public-visual-system/public-result-states";
import {
  PublicFilterLayout,
  PublicFilterPanel,
  PublicActiveFilters,
  PublicResultsToolbar,
} from "@/components/public-filters";
import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import { PublicSelect } from "@/components/public-visual-system/public-form-controls";
import Link from "next/link";
import type { ReactNode } from "react";
import { HelpCard } from "@/components/help-card";
import {
  PublicActionButton,
  PublicActionLink,
  PublicContentShell,
  PublicFilterTag,
} from "@/components/public-visual-system";
import { PublicFilterDisclosure } from "@/components/public-filter-disclosure";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import type { PublicHelpCard, HelpCategorySlug } from "@/lib/help";
import styles from "./help-public.module.css";

type CategoryFilter = "all" | HelpCategorySlug;
type RegionFilter = "all" | SlovakRegion;

export function HelpBrowser({
  items,
  initialCategory = "all",
  children,
  initialQuery = "",
  initialActiveOnly = true,
  initialRegion = "all",
  initialPage = 1,
}: {
  items: PublicHelpCard[];
  initialCategory?: CategoryFilter;
  children?: ReactNode;
  initialQuery?: string;
  initialActiveOnly?: boolean;
  initialRegion?: RegionFilter;
  initialPage?: number;
}) {
  const query = initialQuery.trim().slice(0, 120);
  const region = initialRegion;
  const activeOnly = initialActiveOnly;
  const basePath = initialCategory === "all" ? "/pomoc-psom" : `/pomoc-psom/${initialCategory}`;
  const listing = helpListing(items, {
    category: initialCategory,
    query,
    region,
    activeOnly,
    page: initialPage,
  });
  const pageHref = (page: number) => helpListingHref(basePath, { query, region, activeOnly, page });
  const activeSecondaryCount = Number(region !== "all") + Number(!activeOnly);
  const activeSelections = [
    { key: "q", label: "Hľadanie", value: query },
    { key: "region", label: "Kraj", value: region === "all" ? "" : region },
    { key: "stav", label: "Stav", value: activeOnly ? "" : "Aj ukončené" },
  ].filter((entry) => Boolean(entry.value));
  const clearOneHref = (key: string) => {
    const next = new URLSearchParams();
    if (query && key !== "q") next.set("q", query);
    if (region !== "all" && key !== "region") next.set("region", region);
    if (!activeOnly && key !== "stav") next.set("stav", "vsetky");
    return basePath + (next.size ? `?${next.toString()}` : "");
  };

  return (
    <section className={styles.browserShell} aria-labelledby="help-results-heading">
      <PublicContentShell variant="listing" className={styles.browserTop}>
        {children}
        <PublicFilterLayout>
          <PublicFilterPanel title="Filtrovať pomoc" resetHref={basePath}>
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
                <PublicActionButton className={styles.searchSubmit} type="submit">
                  Použiť filtre
                </PublicActionButton>
                <PublicActionLink
                  className={styles.resetFilters}
                  variant="tertiary"
                  href={basePath}
                >
                  Zrušiť filtre
                </PublicActionLink>
              </PublicFilterDisclosure>
            </form>
            {activeSelections.length > 0 && (
              <PublicActiveFilters aria-label="Aktívne filtre Pomoci psom">
                {activeSelections.map(({ key, label, value }) => (
                  <PublicFilterTag
                    key={key}
                    href={clearOneHref(key)}
                    removeLabel={`Odstrániť filter ${label}: ${value}`}
                  >
                    <span>
                      {label}: {value}
                    </span>
                    <span aria-hidden="true">×</span>
                  </PublicFilterTag>
                ))}
                <Link href={basePath} data-public-filter-reset>
                  Vymazať všetko
                </Link>
              </PublicActiveFilters>
            )}
          </PublicFilterPanel>
          <div data-public-filter-results>
            <PublicResultsToolbar className={styles.resultHeading}>
              <div>
                <PublicHeading role="section" as="h2" id="help-results-heading">
                  {initialCategory === "all" ? "Aktuálne prípady a organizácie" : "Výsledky"}
                </PublicHeading>
                <p>
                  {initialCategory === "all"
                    ? "Tento prehľad zahŕňa prípady a organizácie. Psy na adopciu nájdete v samostatnom prehľade adopcií."
                    : "Výsledky zodpovedajú aktuálnemu vyhľadávaniu a filtrom."}
                </p>
              </div>
              <strong className={styles.resultCount}>
                {listing.total}{" "}
                {listing.total === 1
                  ? "záznam"
                  : listing.total > 1 && listing.total < 5
                    ? "záznamy"
                    : "záznamov"}
              </strong>
            </PublicResultsToolbar>

            {listing.total ? (
              <div className={styles.grid}>
                {listing.items.map((item) => (
                  <HelpCard item={item} key={item.category + ":" + item.id} />
                ))}
              </div>
            ) : (
              <PublicEmptyState variant="context" className={styles.empty}>
                <PublicHeading role="section" as="h2">
                  Momentálne nemáme publikovaný prípad pre tieto filtre.
                </PublicHeading>
                <p>Upravte vyhľadávanie alebo zrušte filtre a vráťte sa k celému zoznamu.</p>
                <Link className={styles.emptyReset} href={basePath}>
                  Zobraziť celý zoznam
                </Link>
              </PublicEmptyState>
            )}
            <PublicPagination
              currentPage={listing.page}
              totalPages={listing.totalPages}
              previousHref={listing.page > 1 ? pageHref(listing.page - 1) : undefined}
              nextHref={listing.page < listing.totalPages ? pageHref(listing.page + 1) : undefined}
              label="Stránkovanie Pomoci psom"
            />
          </div>
        </PublicFilterLayout>
      </PublicContentShell>
    </section>
  );
}
