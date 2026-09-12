import Link from "next/link";
import styles from "@/components/adoption.module.css";
import { slovakRegions } from "@/lib/events";
import { helpCaseHref, type HelpCase } from "@/lib/help";
import {
  adoptionAgeLabels, adoptionHref, adoptionSexLabels, adoptionSizeLabels, adoptionStatusLabels,
  formatAdoptionAge, type AdoptionDog, type AdoptionPublicFilters,
} from "@/lib/adoption";

type Result = { items: AdoptionDog[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } };

function href(filters: AdoptionPublicFilters, patch: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  const values: Record<string, string | number | boolean | undefined> = {
    q: filters.q, kraj: filters.region, pohlavie: filters.sex || undefined, vek: filters.age || undefined,
    velkost: filters.size || undefined, deti: filters.children || undefined, psy: filters.dogs || undefined,
    macky: filters.cats || undefined, stav: filters.status === "ACTIVE" ? undefined : filters.status,
    radenie: filters.sort === "newest" ? undefined : filters.sort, strana: filters.page && filters.page > 1 ? filters.page : undefined,
    ...patch,
  };
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== false && value !== "") params.set(key, value === true ? "1" : String(value));
  const query = params.toString();
  return `/pomoc-psom/adopcia${query ? `?${query}` : ""}`;
}

function DogCard({ dog }: { dog: AdoptionDog }) {
  return <article className={styles.card}>
    <Link className={styles.photo} href={adoptionHref(dog)}>{dog.mainImage ? <img src={dog.mainImage} alt={`${dog.name} hľadá domov`} /> : <span aria-hidden="true">🐕</span>}<strong data-status={dog.status}>{adoptionStatusLabels[dog.status]}</strong></Link>
    <div className={styles.cardBody}><p className={styles.location}>{dog.city}{dog.region ? ` · ${dog.region}` : ""}</p><h2><Link href={adoptionHref(dog)}>{dog.name}</Link></h2><p>{dog.shortDescription}</p>
      <dl className={styles.quick}><div><dt>Vek</dt><dd>{formatAdoptionAge(dog)}</dd></div><div><dt>Pohlavie</dt><dd>{adoptionSexLabels[dog.sex]}</dd></div><div><dt>Veľkosť</dt><dd>{adoptionSizeLabels[dog.size]}</dd></div></dl>
      <Link className={styles.cardLink} href={adoptionHref(dog)}>Pozrieť profil →</Link>
    </div>
  </article>;
}

export function AdoptionCatalog({ result, filters, legacy }: { result: Result; filters: AdoptionPublicFilters; legacy: HelpCase[] }) {
  const { items, pagination } = result;
  return <>
    <section className={styles.hero}><div className="shell"><nav className={styles.breadcrumbs}><Link href="/">Domov</Link><span>/</span><Link href="/pomoc-psom">Pomoc psom</Link><span>/</span><span>Psy na adopciu</span></nav><span className="eyebrow">Nový domov</span><h1>Psy na adopciu</h1><p>Nájdi psa podľa lokality a potrieb domácnosti. Profil vždy skontroluj aj priamo s organizáciou – povaha a kompatibilita sa nedajú zredukovať len na filter.</p></div></section>
    <section className={`shell ${styles.layout}`}>
      <aside className={styles.filters} aria-label="Filtre adopcií"><form method="get"><h2>Filtrovať</h2><label>Hľadať<input name="q" defaultValue={filters.q} placeholder="Meno, mesto, plemeno…" /></label><label>Kraj<select name="kraj" defaultValue={filters.region}><option value="">Všetky kraje</option>{slovakRegions.filter((r) => r !== "Online").map((r) => <option key={r}>{r}</option>)}</select></label><label>Pohlavie<select name="pohlavie" defaultValue={filters.sex}><option value="">Všetky</option><option value="MALE">Pes</option><option value="FEMALE">Sučka</option></select></label><label>Vek<select name="vek" defaultValue={filters.age}><option value="">Všetky veky</option>{Object.entries(adoptionAgeLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Veľkosť<select name="velkost" defaultValue={filters.size}><option value="">Všetky veľkosti</option><option value="SMALL">Malý</option><option value="MEDIUM">Stredný</option><option value="LARGE">Veľký</option><option value="GIANT">Obrovský</option></select></label><fieldset><legend>Vhodný do domácnosti</legend><label className={styles.check}><input type="checkbox" name="deti" value="1" defaultChecked={filters.children} /> k deťom</label><label className={styles.check}><input type="checkbox" name="psy" value="1" defaultChecked={filters.dogs} /> k psom</label><label className={styles.check}><input type="checkbox" name="macky" value="1" defaultChecked={filters.cats} /> k mačkám</label></fieldset><button type="submit">Použiť filtre</button><Link href="/pomoc-psom/adopcia">Vymazať filtre</Link></form></aside>
      <div className={styles.results}><div className={styles.statusTabs} aria-label="Stav adopcie"><Link className={filters.status === "ACTIVE" ? styles.activeTab : ""} href={href(filters,{ stav: undefined, strana: 1 })}>Aktívne adopcie</Link><Link className={filters.status === "RESERVED" ? styles.activeTab : ""} href={href(filters,{ stav: "RESERVED", strana: 1 })}>Rezervované</Link><Link className={filters.status === "ADOPTED" ? styles.activeTab : ""} href={href(filters,{ stav: "ADOPTED", strana: 1 })}>Adoptované</Link></div>
        <div className={styles.resultHeader}><p><strong>{pagination.total}</strong> {pagination.total === 1 ? "profil" : "profilov"}</p><form method="get">{Object.entries({ q: filters.q, kraj: filters.region, pohlavie: filters.sex, vek: filters.age, velkost: filters.size, deti: filters.children ? "1" : "", psy: filters.dogs ? "1" : "", macky: filters.cats ? "1" : "", stav: filters.status === "ACTIVE" ? "" : filters.status }).filter(([,v])=>v).map(([k,v])=><input type="hidden" name={k} value={String(v)} key={k}/>)}<label>Radenie<select name="radenie" defaultValue={filters.sort}><option value="newest">Najnovšie</option><option value="verified">Naposledy overené</option><option value="youngest">Najmladšie</option><option value="oldest">Najstaršie</option></select></label><button type="submit">Zoradiť</button></form></div>
        {items.length ? <div className={styles.grid}>{items.map((dog) => <DogCard dog={dog} key={dog.id} />)}</div> : <div className={styles.empty}><span aria-hidden="true">🐾</span><h2>Žiadne profily nezodpovedajú filtrom</h2><p>Skús rozšíriť lokalitu alebo zrušiť niektorú podmienku.</p><Link href="/pomoc-psom/adopcia">Zobraziť všetky aktívne adopcie</Link></div>}
        {pagination.totalPages > 1 && <nav className={styles.pagination} aria-label="Stránkovanie">{pagination.page > 1 && <Link href={href(filters,{ strana: pagination.page - 1 })}>← Predchádzajúca</Link>}<span>Strana {pagination.page} z {pagination.totalPages}</span>{pagination.page < pagination.totalPages && <Link href={href(filters,{ strana: pagination.page + 1 })}>Ďalšia →</Link>}</nav>}
        {filters.status === "ACTIVE" && legacy.length > 0 && <section className={styles.legacy}><h2>Staršie adopčné záznamy</h2><p>Tieto profily vznikli v pôvodnej databáze Pomoc psom a zostávajú dostupné počas prechodu na nový katalóg.</p>{legacy.map((item)=><article key={item.id}><h3><Link href={helpCaseHref(item)}>{item.title}</Link></h3><p>{item.city} · {item.organization}</p></article>)}</section>}
      </div>
    </section>
  </>;
}
