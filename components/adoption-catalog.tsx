import Link from "next/link";
import {
  adoptionCatalogAgeLabels,
  adoptionCatalogHref,
  adoptionCatalogSexLabels,
  adoptionCatalogSizeLabels,
  adoptionCatalogStatusLabels,
  buildAdoptionCatalogView,
  formatAdoptionCatalogAge,
  type AdoptionCatalogFilters,
  type AdoptionPublicDog,
} from "@/lib/adoption-catalog";
import type { AdoptionBreedOption, AdoptionPagination } from "@/lib/adoption-store";
import type { AdoptionDog } from "@/lib/adoption";
import styles from "./adoption.module.css";

type CatalogResult = {
  items: AdoptionDog[];
  pagination: AdoptionPagination;
};

type Props = {
  result: CatalogResult;
  filters: AdoptionCatalogFilters;
  breeds: AdoptionBreedOption[];
};

function DogImage({ dog }: { dog: AdoptionDog }) {
  if (dog.mainImage) return <img src={dog.mainImage} alt={`${dog.name} – pes na adopciu`} />;
  return <div className={styles.imageFallback} aria-hidden="true"><span /></div>;
}

function DogCard({ dog }: { dog: AdoptionPublicDog }) {
  return <article className={styles.card}>
    <div className={styles.visual}>
      <DogImage dog={dog} />
      <span className={`${styles.statusBadge} ${dog.status === "RESERVED" ? styles.reserved : styles.active}`}>
        {adoptionCatalogStatusLabels[dog.status]}
      </span>
    </div>
    <div className={styles.cardBody}>
      {(dog.city || dog.region) && <p className={styles.location}>{[dog.city, dog.region].filter(Boolean).join(" · ")}</p>}
      <h2>{dog.name}</h2>
      {dog.breedName && <p className={styles.breed}>{dog.breedMix ? "Kríženec · " : ""}{dog.breedName}</p>}
      {dog.shortDescription && <p className={styles.description}>{dog.shortDescription}</p>}
      <dl className={styles.quickFacts}>
        <div><dt>Vek</dt><dd>{formatAdoptionCatalogAge(dog)}</dd></div>
        <div><dt>Pohlavie</dt><dd>{adoptionCatalogSexLabels[dog.sex]}</dd></div>
        <div><dt>Veľkosť</dt><dd>{adoptionCatalogSizeLabels[dog.size]}</dd></div>
      </dl>
      {dog.status === "RESERVED" && <p className={styles.reservedNote}>Tento pes je momentálne rezervovaný.</p>}
    </div>
  </article>;
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
  return values.filter(([name, value]) => name !== omit && value).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

export function AdoptionCatalog({ result, filters, breeds }: Props) {
  const view = buildAdoptionCatalogView(result.items);
  const pagination = result.pagination;
  return <>
    <section className={styles.hero}>
      <nav className={styles.breadcrumbs} aria-label="Drobečková navigácia">
        <Link href="/">Domov</Link><span>/</span><Link href="/pomoc-psom">Pomoc psom</Link><span>/</span><span>Psy na adopciu</span>
      </nav>
      <span className={styles.eyebrow}>Pomoc psom · nový domov</span>
      <h1>Psy na adopciu</h1>
      <p>Vyhľadajte psa podľa plemena, veku, pohlavia, veľkosti alebo lokality. Zobrazené sú iba aktuálne adopčné a rezervované profily.</p>
    </section>

    <form className={styles.filters} method="get" aria-label="Filtrovať psy na adopciu">
      <div className={`${styles.field} ${styles.searchField}`}><label htmlFor="adoption-q">Hľadať</label><input id="adoption-q" name="q" defaultValue={filters.q} placeholder="meno, mesto, plemeno…" /></div>
      <div className={styles.field}><label htmlFor="adoption-breed">Plemeno</label><select id="adoption-breed" name="plemeno" defaultValue={filters.breedId ? String(filters.breedId) : ""}><option value="">Všetky plemená</option>{breeds.map((breed) => <option key={breed.id} value={breed.id}>{breed.name}</option>)}</select></div>
      <div className={styles.field}><label htmlFor="adoption-age">Vek</label><select id="adoption-age" name="vek" defaultValue={filters.age}><option value="">Všetky veky</option>{Object.entries(adoptionCatalogAgeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <div className={styles.field}><label htmlFor="adoption-sex">Pohlavie</label><select id="adoption-sex" name="pohlavie" defaultValue={filters.sex}><option value="">Všetky</option><option value="MALE">Pes</option><option value="FEMALE">Sučka</option></select></div>
      <div className={styles.field}><label htmlFor="adoption-size">Veľkosť</label><select id="adoption-size" name="velkost" defaultValue={filters.size}><option value="">Všetky veľkosti</option><option value="SMALL">Malý</option><option value="MEDIUM">Stredný</option><option value="LARGE">Veľký</option><option value="GIANT">Obrovský</option></select></div>
      <div className={styles.field}><label htmlFor="adoption-region">Kraj</label><select id="adoption-region" name="kraj" defaultValue={filters.region}><option value="">Všetky kraje</option><option>Bratislavský kraj</option><option>Trnavský kraj</option><option>Trenčiansky kraj</option><option>Nitriansky kraj</option><option>Žilinský kraj</option><option>Banskobystrický kraj</option><option>Prešovský kraj</option><option>Košický kraj</option></select></div>
      <div className={styles.field}><label htmlFor="adoption-status">Stav</label><select id="adoption-status" name="stav" defaultValue={filters.status}><option value="">Na adopciu aj rezervované</option><option value="ACTIVE">Na adopciu</option><option value="RESERVED">Rezervované</option></select></div>
      <fieldset className={styles.compatibility}><legend>Vhodný do domácnosti</legend><label><input type="checkbox" name="deti" value="1" defaultChecked={filters.children} /> k deťom</label><label><input type="checkbox" name="psy" value="1" defaultChecked={filters.dogs} /> k psom</label><label><input type="checkbox" name="macky" value="1" defaultChecked={filters.cats} /> k mačkám</label></fieldset>
      <div className={styles.actions}><button type="submit">Filtrovať</button><Link href="/pomoc-psom/adopcia">Vyčistiť</Link></div>
    </form>

    <div className={styles.summary}>
      <div><h2>Aktuálne profily</h2><p>{pagination.total} {pagination.total === 1 ? "pes" : "psov"}</p></div>
      <form method="get" className={styles.sortForm}>{hiddenFilterInputs(filters, "radenie")}<label htmlFor="adoption-sort">Zoradiť</label><select id="adoption-sort" name="radenie" defaultValue={filters.sort}><option value="newest">Najnovšie</option><option value="verified">Naposledy overené</option><option value="youngest">Najmladšie</option><option value="oldest">Najstaršie</option></select><button type="submit">Použiť</button></form>
    </div>

    {!view.isEmpty ? <div className={styles.grid}>{view.items.map((dog) => <DogCard dog={dog} key={dog.id} />)}</div> : <div className={styles.empty}>
      <div className={styles.emptyIcon} aria-hidden="true">🐾</div><h2>Žiadne psy nezodpovedajú filtrom</h2><p>Skúste zmeniť vyhľadávanie alebo odstrániť niektorý filter.</p><Link href="/pomoc-psom/adopcia">Zobraziť všetky aktuálne adopcie</Link>
    </div>}

    {pagination.totalPages > 1 && <nav className={styles.pagination} aria-label="Stránkovanie adopcií">
      {pagination.page > 1 && <Link href={adoptionCatalogHref(filters, { page: pagination.page - 1 })}>← Predchádzajúca</Link>}
      <span aria-current="page">Strana {pagination.page} z {pagination.totalPages}</span>
      {pagination.page < pagination.totalPages && <Link href={adoptionCatalogHref(filters, { page: pagination.page + 1 })}>Ďalšia →</Link>}
    </nav>}
  </>;
}
