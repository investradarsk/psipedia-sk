import { PublicHeading } from "@/components/public-heading";
import { formatSlovakCount } from "@/lib/slovak-count";
import {
  PublicFilterLayout,
  PublicFilterPanel,
  PublicResultsToolbar,
  PublicActiveFilters,
} from "@/components/public-filters";
import { PublicHelpProfileCard } from "@/components/public-visual-system/public-help-profile-card";
import {
  PublicHelpCategoryNav,
  publicHelpCategoryItems,
} from "@/components/public-visual-system/public-help-category-nav";
import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import { PublicFilterDisclosure } from "@/components/public-filter-disclosure";
import {
  PublicChoiceInput,
  PublicSelect,
} from "@/components/public-visual-system/public-form-controls";
import Link from "next/link";
import { ImageDisplay } from "@/components/image-display";
import { PublicMediaFallback } from "@/components/public-visual-system/public-media-fallback";
import { PawMark } from "@/components/icons";
import {
  PublicContentShell,
  PublicFoundation,
  PublicPagination,
  PublicFilterTag,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { HomePortalSearch } from "@/components/home-portal-search";
import {
  adoptionCatalogAgeLabels,
  adoptionCatalogHref,
  buildAdoptionCatalogView,
  type AdoptionCatalogFilters,
  type AdoptionPublicDog,
} from "@/lib/adoption-catalog";
import { adoptionDetailPath } from "@/lib/adoption-detail";
import type { AdoptionBreedOptionsResult, AdoptionPagination } from "@/lib/adoption-store";
import type { PublicAdoptionCard } from "@/lib/adoption";
import { getSectionHeroVisual } from "@/lib/section-visual-store";
import styles from "./adoption.module.css";

type CatalogResult = {
  items: PublicAdoptionCard[];
  pagination: AdoptionPagination;
};

type Props = {
  result: CatalogResult;
  filters: AdoptionCatalogFilters;
  breeds: AdoptionBreedOptionsResult;
};

function DogCard({ dog }: { dog: AdoptionPublicDog }) {
  const href = adoptionDetailPath(dog.slug);
  const meta = [dog.organizationName, dog.city, dog.region].filter(Boolean).join(" · ");
  return (
    <PublicHelpProfileCard
      data-adoption-card={dog.slug}
      href={href}
      title={dog.name}
      actionLabel="Zobraziť profil"
      category="Pes na adopciu"
      titleLevel="h2"
      badge={dog.status === "RESERVED"
        ? <span className={styles.cardReservedBadge}>Rezervovaný</span>
        : null}
      media={
        <Link href={href} aria-label={`Otvoriť: ${dog.name}`}>
          {dog.mainImage ? (
            <ImageDisplay
              roleHint="generic"
              context="thumbnail"
              fallbackOnError
              config={dog.thumbnailImageDisplay}
              src={dog.mainImage}
              alt={`${dog.name} – pes na adopciu`}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <PublicMediaFallback appearance="context" decorative />
          )}
        </Link>
      }
      meta={meta}
      excerpt={dog.shortDescription}
    />
  );
}

function hiddenFilterInputs(filters: AdoptionCatalogFilters, omit: string) {
  const values: Array<[string, string | undefined]> = [
    ["q", filters.q],
    ["plemeno", filters.breedId ? String(filters.breedId) : undefined],
    ["kraj", filters.region],
    ["pohlavie", filters.sex || undefined],
    ["vek", filters.age || undefined],
    ["velkost", filters.size || undefined],
    ["deti", filters.children ? "1" : undefined],
    ["psy", filters.dogs ? "1" : undefined],
    ["macky", filters.cats ? "1" : undefined],
    ["stav", filters.status || undefined],
  ];
  return values
    .filter(([name, value]) => name !== omit && value)
    .map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />);
}

export async function AdoptionCatalog({ result, filters, breeds }: Props) {
  const view = buildAdoptionCatalogView(result.items);
  const selectedFilters = [
    { key: "q", label: "Hľadanie", value: filters.q },
    {
      key: "plemeno",
      label: "Plemeno",
      value: filters.breedId
        ? (breeds.options.find((b) => b.id === filters.breedId)?.name ?? "Vybrané plemeno")
        : "",
    },
    { key: "kraj", label: "Kraj", value: filters.region },
    {
      key: "pohlavie",
      label: "Pohlavie",
      value: filters.sex === "MALE" ? "Pes" : filters.sex === "FEMALE" ? "Sučka" : "",
    },
    { key: "vek", label: "Vek", value: filters.age ? adoptionCatalogAgeLabels[filters.age] : "" },
    {
      key: "velkost",
      label: "Veľkosť",
      value: filters.size
        ? {
            SMALL: "Malý",
            MEDIUM: "Stredný",
            LARGE: "Veľký",
            GIANT: "Obrovský",
            UNKNOWN: "Neznáma",
          }[filters.size]
        : "",
    },
    {
      key: "stav",
      label: "Stav",
      value:
        filters.status === "RESERVED"
          ? "Rezervované"
          : filters.status === "ACTIVE"
            ? "Na adopciu"
            : "",
    },
    { key: "deti", label: "K deťom", value: filters.children ? "Áno" : "" },
    { key: "psy", label: "K psom", value: filters.dogs ? "Áno" : "" },
    { key: "macky", label: "K mačkám", value: filters.cats ? "Áno" : "" },
  ].filter((entry) => entry.value && entry.value !== "all");
  const removeFilterHref = (key: string) => {
    const query = new URLSearchParams(adoptionCatalogHref(filters).split("?")[1] ?? "");
    query.delete(key);
    query.delete("strana");
    query.delete("page");
    return "/pomoc-psom/adopcia" + (query.size ? "?" + query.toString() : "");
  };

  const pagination = result.pagination;
  const heroVisual = await getSectionHeroVisual("help.adopcia");
  return (
    <PublicFoundation className={styles.foundation}>
      <UnifiedSectionHeroShell>
        <UnifiedSectionHero
          breadcrumbs={
            <nav className={styles.breadcrumbs} aria-label="Drobečková navigácia">
              <Link href="/">Domov</Link>
              <span aria-hidden="true">/</span>
              <Link href="/pomoc-psom">Pomoc psom</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Psy na adopciu</span>
            </nav>
          }
          eyebrow="Pomoc psom · adopcie"
          title="Psy na adopciu"
          intro="Vyhľadajte psa podľa plemena, veku, pohlavia, veľkosti alebo lokality. Zobrazené sú iba aktuálne adopčné a rezervované profily."
          visual={heroVisual}
          portalSearchSlot={
            <HomePortalSearch
              action="/pomoc-psom/adopcia"
              id="adoption-hero-query"
              label="Hľadať psa na adopciu"
              panelLabel="Vyhľadávanie adopcií"
              eyebrow="ČO HĽADÁŠ?"
              title="Nájdi psa na adopciu"
              placeholder="Hľadať psa, plemeno alebo mesto…"
              buttonLabel="Hľadať"
              defaultValue={filters.q}
              allowEmpty
              hidden={[
                { name: "plemeno", value: filters.breedId ? String(filters.breedId) : "" },
                { name: "kraj", value: filters.region },
                { name: "pohlavie", value: filters.sex },
                { name: "vek", value: filters.age },
                { name: "velkost", value: filters.size },
                { name: "deti", value: filters.children ? "1" : "" },
                { name: "psy", value: filters.dogs ? "1" : "" },
                { name: "macky", value: filters.cats ? "1" : "" },
                { name: "stav", value: filters.status },
              ].filter((field): field is { name: string; value: string } => Boolean(field.value))}
              shortcuts={[]}
              searchScope="adoptions"
            />
          }
        />
      </UnifiedSectionHeroShell>

      <PublicContentShell variant="listing">
        <div className={styles.categoryNavShell}>
          <PublicHelpCategoryNav items={publicHelpCategoryItems("adopcia")} />
        </div>
        <PublicFilterLayout>
          <PublicFilterPanel title="Filtrovať psy" resetHref="/pomoc-psom/adopcia">
            <PublicFilterDisclosure
              label="Filtrovať psy"
              activeCount={
                [
                  filters.breedId,
                  filters.region !== "all" && filters.region,
                  filters.sex,
                  filters.age,
                  filters.size,
                  filters.status,
                  filters.children,
                  filters.dogs,
                  filters.cats,
                ].filter(Boolean).length
              }
              buttonClassName={styles.filterToggle}
              contentClassName={styles.filterDisclosure}
              openContentClassName={styles.filterDisclosureOpen}
            >
              <form className={styles.filters} method="get" aria-label="Filtrovať psy na adopciu">
                <input type="hidden" name="q" value={filters.q} />
                <div className={styles.field}>
                  <label htmlFor="adoption-breed">Plemeno</label>
                  {!breeds.available && filters.breedId ? (
                    <input type="hidden" name="plemeno" value={filters.breedId} />
                  ) : null}
                  <PublicSelect
                    appearance="context"
                    id="adoption-breed"
                    name="plemeno"
                    defaultValue={filters.breedId ? String(filters.breedId) : ""}
                    disabled={!breeds.available}
                  >
                    <option value="">
                      {breeds.available ? "Všetky plemená" : "Plemená sú momentálne nedostupné"}
                    </option>
                    {breeds.options.map((breed) => (
                      <option key={breed.id} value={breed.id}>
                        {breed.name}
                      </option>
                    ))}
                  </PublicSelect>
                </div>
                <div className={styles.field}>
                  <label htmlFor="adoption-age">Vek</label>
                  <PublicSelect
                    appearance="context"
                    id="adoption-age"
                    name="vek"
                    defaultValue={filters.age}
                  >
                    <option value="">Všetky veky</option>
                    {Object.entries(adoptionCatalogAgeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </PublicSelect>
                </div>
                <div className={styles.field}>
                  <label htmlFor="adoption-sex">Pohlavie</label>
                  <PublicSelect
                    appearance="context"
                    id="adoption-sex"
                    name="pohlavie"
                    defaultValue={filters.sex}
                  >
                    <option value="">Všetky</option>
                    <option value="MALE">Pes</option>
                    <option value="FEMALE">Sučka</option>
                  </PublicSelect>
                </div>
                <div className={styles.field}>
                  <label htmlFor="adoption-size">Veľkosť</label>
                  <PublicSelect
                    appearance="context"
                    id="adoption-size"
                    name="velkost"
                    defaultValue={filters.size}
                  >
                    <option value="">Všetky veľkosti</option>
                    <option value="SMALL">Malý</option>
                    <option value="MEDIUM">Stredný</option>
                    <option value="LARGE">Veľký</option>
                    <option value="GIANT">Obrovský</option>
                  </PublicSelect>
                </div>
                <div className={styles.field}>
                  <label htmlFor="adoption-region">Kraj</label>
                  <PublicSelect
                    appearance="context"
                    id="adoption-region"
                    name="kraj"
                    defaultValue={filters.region}
                  >
                    <option value="">Všetky kraje</option>
                    <option>Bratislavský kraj</option>
                    <option>Trnavský kraj</option>
                    <option>Trenčiansky kraj</option>
                    <option>Nitriansky kraj</option>
                    <option>Žilinský kraj</option>
                    <option>Banskobystrický kraj</option>
                    <option>Prešovský kraj</option>
                    <option>Košický kraj</option>
                  </PublicSelect>
                </div>
                <div className={styles.field}>
                  <label htmlFor="adoption-status">Stav</label>
                  <PublicSelect
                    appearance="context"
                    id="adoption-status"
                    name="stav"
                    defaultValue={filters.status}
                  >
                    <option value="">Na adopciu aj rezervované</option>
                    <option value="ACTIVE">Na adopciu</option>
                    <option value="RESERVED">Rezervované</option>
                  </PublicSelect>
                </div>
                <fieldset className={styles.compatibility}>
                  <legend>Vhodný do domácnosti</legend>
                  <label>
                    <PublicChoiceInput
                      type="checkbox"
                      name="deti"
                      value="1"
                      defaultChecked={filters.children}
                    />{" "}
                    k deťom
                  </label>
                  <label>
                    <PublicChoiceInput
                      type="checkbox"
                      name="psy"
                      value="1"
                      defaultChecked={filters.dogs}
                    />{" "}
                    k psom
                  </label>
                  <label>
                    <PublicChoiceInput
                      type="checkbox"
                      name="macky"
                      value="1"
                      defaultChecked={filters.cats}
                    />{" "}
                    k mačkám
                  </label>
                </fieldset>
                <div className={styles.actions}>
                  <button type="submit">Filtrovať</button>
                  <Link href="/pomoc-psom/adopcia">Vyčistiť</Link>
                </div>
              </form>
            </PublicFilterDisclosure>
            {selectedFilters.length ? (
              <PublicActiveFilters>
                {selectedFilters.map((entry) => (
                  <PublicFilterTag
                    key={entry.key}
                    href={removeFilterHref(entry.key)}
                    removeLabel={`Odstrániť filter ${entry.label}`}
                  >
                    {entry.label}: {entry.value} ×
                  </PublicFilterTag>
                ))}
              </PublicActiveFilters>
            ) : null}
          </PublicFilterPanel>
          <div data-public-filter-results>
            <PublicResultsToolbar className={styles.summary}>
              <div>
                <PublicHeading role="section" as="h2">
                  Aktuálne profily
                </PublicHeading>
                <p>
                  {formatSlovakCount(pagination.total, { one: "pes", few: "psy", many: "psov" })}
                </p>
              </div>
              <form method="get" className={styles.sortForm}>
                {hiddenFilterInputs(filters, "radenie")}
                <label htmlFor="adoption-sort">Zoradiť</label>
                <PublicSelect
                  appearance="context"
                  id="adoption-sort"
                  name="radenie"
                  defaultValue={filters.sort}
                >
                  <option value="newest">Najnovšie</option>
                  <option value="verified">Naposledy potvrdená dostupnosť</option>
                  <option value="youngest">Najmladšie</option>
                  <option value="oldest">Najstaršie</option>
                </PublicSelect>
                <button type="submit">Použiť</button>
              </form>
            </PublicResultsToolbar>

            {!view.isEmpty ? (
              <div className={styles.grid}>
                {view.items.map((dog) => (
                  <DogCard dog={dog} key={dog.id} />
                ))}
              </div>
            ) : (
              <PublicEmptyState variant="context" className={styles.empty}>
                <div className={styles.emptyIcon} aria-hidden="true">
                  <PawMark size={34} />
                </div>
                <PublicHeading role="section" as="h2">
                  Momentálne nemáme publikovaný profil pre tieto filtre.
                </PublicHeading>
                <p>Skúste zmeniť vyhľadávanie alebo odstrániť niektorý filter.</p>
                <Link href="/pomoc-psom/adopcia">Zobraziť všetky aktuálne adopcie</Link>
              </PublicEmptyState>
            )}

            <PublicPagination
              className={styles.pagination}
              label="Stránkovanie adopcií"
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              previousHref={
                pagination.page > 1
                  ? adoptionCatalogHref(filters, { page: pagination.page - 1 })
                  : undefined
              }
              nextHref={
                pagination.page < pagination.totalPages
                  ? adoptionCatalogHref(filters, { page: pagination.page + 1 })
                  : undefined
              }
              showDisabledControls={false}
            />
          </div>
        </PublicFilterLayout>
      </PublicContentShell>
    </PublicFoundation>
  );
}
