import { PublicEmptyState } from "@/components/public-visual-system/public-result-states";
import { PublicFilterDisclosure } from "@/components/public-filter-disclosure";
import {
  PublicChoiceInput,
  PublicSelect,
} from "@/components/public-visual-system/public-form-controls";
import Link from "next/link";
import { AdoptionCardMedia } from "@/components/adoption-card-media";
import { PawMark } from "@/components/icons";
import {
  PublicContentShell,
  PublicFoundation,
  PublicPagination,
  UnifiedSectionHero,
  UnifiedSectionHeroShell,
} from "@/components/public-visual-system";
import { HomePortalSearch } from "@/components/home-portal-search";
import {
  adoptionCatalogAgeLabels,
  adoptionCatalogHref,
  adoptionCatalogSexLabels,
  adoptionCatalogSizeLabels,
  buildAdoptionCatalogView,
  formatAdoptionCatalogAge,
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

function formatCatalogDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("sk-SK", {
        timeZone: "Europe/Bratislava",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(date);
}

function DogCard({ dog }: { dog: AdoptionPublicDog }) {
  const href = adoptionDetailPath(dog.slug);
  return (
    <article className={styles.card}>
      <AdoptionCardMedia
        href={href}
        name={dog.name}
        status={dog.status}
        mainImage={dog.mainImage}
        imageConfig={dog.thumbnailImageDisplay}
      />
      <div className={styles.cardBody}>
        {(dog.city || dog.region) && (
          <p className={styles.location}>{[dog.city, dog.region].filter(Boolean).join(" · ")}</p>
        )}
        <h2>
          <Link href={href}>{dog.name}</Link>
        </h2>
        {dog.organizationName ? (
          <p className={styles.organization}>
            Organizácia:{" "}
            {dog.organizationSlug ? (
              <Link href={"/organizacie/" + dog.organizationSlug}>{dog.organizationName}</Link>
            ) : (
              dog.organizationName
            )}
          </p>
        ) : null}
        {dog.breedName && (
          <p className={styles.breed}>
            {dog.breedMix ? "Kríženec · " : ""}
            {dog.breedName}
          </p>
        )}
        {dog.shortDescription && <p className={styles.description}>{dog.shortDescription}</p>}
        <dl className={styles.quickFacts}>
          <div>
            <dt>Vek</dt>
            <dd>{formatAdoptionCatalogAge(dog)}</dd>
          </div>
          <div>
            <dt>Pohlavie</dt>
            <dd>{adoptionCatalogSexLabels[dog.sex]}</dd>
          </div>
          <div>
            <dt>Veľkosť</dt>
            <dd>{adoptionCatalogSizeLabels[dog.size]}</dd>
          </div>
        </dl>
        {dog.status === "RESERVED" && (
          <p className={styles.reservedNote}>Tento pes je momentálne rezervovaný.</p>
        )}
        {dog.lastVerifiedAt ? (
          <p className={styles.freshness}>
            Dostupnosť potvrdená: {formatCatalogDate(dog.lastVerifiedAt)}
          </p>
        ) : dog.publishedAt ? (
          <p className={styles.freshness}>Publikované: {formatCatalogDate(dog.publishedAt)}</p>
        ) : null}
        <Link href={href}>Zobraziť profil →</Link>
      </div>
    </article>
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
              ].filter((field) => Boolean(field.value))}
              shortcuts={[]}
              searchScope="adoptions"
            />
          }
          metaSlot={
            <span>
              <strong>{pagination.total}</strong>{" "}
              {pagination.total === 1 ? "publikovaný profil" : "publikovaných profilov"}
            </span>
          }
        />
      </UnifiedSectionHeroShell>

      <PublicContentShell variant="listing">
        <PublicFilterDisclosure
          label="Filtrovať psy"
          activeCount={[
            filters.breedId, filters.region !== "all" && filters.region,
            filters.sex, filters.age, filters.size, filters.status,
            filters.children, filters.dogs, filters.cats,
          ].filter(Boolean).length}
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

        <div className={styles.summary}>
          <div>
            <h2>Aktuálne profily</h2>
            <p>
              {pagination.total} {pagination.total === 1 ? "pes" : "psov"}
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
        </div>

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
            <h2>Momentálne nemáme publikovaný profil pre tieto filtre.</h2>
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
      </PublicContentShell>
    </PublicFoundation>
  );
}
