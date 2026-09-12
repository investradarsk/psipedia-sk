import Link from "next/link";
import { slovakRegions } from "@/lib/events";
import { listPublicDogReports, listPublishedBreedOptions } from "@/lib/lost-found-dog-store";
import { dogReportBasePath, dogReportHref, dogReportTypeLabel, dogReportTypeShortLabel, dogSexLabel, dogSizeLabel, formatDogReportDate, type DogReportType, type DogSex, type DogSize } from "@/lib/lost-found-dogs";
import styles from "./lost-found-dogs.module.css";

type Search = Record<string, string | string[] | undefined>;
const scalar = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] || "" : value || "";

function pageHref(type: DogReportType, params: URLSearchParams, page: number) {
  const next = new URLSearchParams(params);
  if (page <= 1) next.delete("page"); else next.set("page", String(page));
  const query = next.toString();
  return `${dogReportBasePath(type)}${query ? `?${query}` : ""}`;
}

export async function LostFoundDogsPage({ type, searchParams }: { type: DogReportType; searchParams: Promise<Search> }) {
  const raw = await searchParams;
  const q = scalar(raw.q).slice(0, 120);
  const region = scalar(raw.region).slice(0, 80);
  const locality = scalar(raw.locality).slice(0, 120);
  const date = scalar(raw.date).slice(0, 10);
  const sex = scalar(raw.sex) as DogSex | "";
  const size = scalar(raw.size) as DogSize | "";
  const breedIdValue = Number(scalar(raw.breed));
  const page = Math.max(1, Number.parseInt(scalar(raw.page) || "1", 10) || 1);
  const breedId = Number.isInteger(breedIdValue) && breedIdValue > 0 ? breedIdValue : null;

  const [result, breeds] = await Promise.all([
    listPublicDogReports(type, { q, region, locality, date, sex, size, breedId, page, pageSize: 24 }),
    listPublishedBreedOptions(),
  ]);
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ q, region, locality, date, sex, size, breed: breedId ? String(breedId) : "" })) if (value) params.set(key, value);
  const label = dogReportTypeShortLabel(type).toLowerCase();

  return <main id="obsah" tabIndex={-1} className={styles.shell}>
    <section className={styles.hero}>
      <span className={styles.eyebrow}>Pomoc psom · aktuálne hlásenia</span>
      <h1>{type === "LOST" ? "Stratené psy" : "Nájdené psy"}</h1>
      <p>{type === "LOST" ? "Aktívne hlásenia o stratených psoch. Zobrazená lokalita je zámerne iba približná a súkromné kontaktné údaje nezverejňujeme automaticky." : "Aktívne hlásenia o nájdených psoch. Pomôžte spojiť psa s oprávneným majiteľom bez zverejňovania zbytočne presných osobných údajov."}</p>
      <nav className={styles.switcher} aria-label="Typ hlásenia"><Link href="/pomoc-psom/stratene-psy" aria-current={type === "LOST" ? "page" : undefined}>Stratené psy</Link><Link href="/pomoc-psom/najdene-psy" aria-current={type === "FOUND" ? "page" : undefined}>Nájdené psy</Link></nav>
    </section>

    <form className={styles.filters} method="get" aria-label={`Filtrovať ${label} psy`}>
      <div className={styles.field}><label htmlFor="lf-q">Hľadať</label><input id="lf-q" name="q" defaultValue={q} placeholder="meno, farba, popis…" /></div>
      <div className={styles.field}><label htmlFor="lf-region">Kraj</label><select id="lf-region" name="region" defaultValue={region}><option value="">Všetky kraje</option>{slovakRegions.filter((item) => item !== "Online").map((item) => <option key={item} value={item}>{item}</option>)}</select></div>
      <div className={styles.field}><label htmlFor="lf-locality">Okres alebo lokalita</label><input id="lf-locality" name="locality" defaultValue={locality} placeholder="napr. Nitra" /></div>
      <div className={styles.field}><label htmlFor="lf-date">Dátum udalosti</label><input id="lf-date" name="date" type="date" defaultValue={date} /></div>
      <div className={styles.field}><label htmlFor="lf-sex">Pohlavie</label><select id="lf-sex" name="sex" defaultValue={sex}><option value="">Všetky</option><option value="MALE">Pes</option><option value="FEMALE">Sučka</option><option value="UNKNOWN">Neznáme</option></select></div>
      <div className={styles.field}><label htmlFor="lf-size">Veľkosť</label><select id="lf-size" name="size" defaultValue={size}><option value="">Všetky</option><option value="SMALL">Malý</option><option value="MEDIUM">Stredný</option><option value="LARGE">Veľký</option><option value="UNKNOWN">Neznáma</option></select></div>
      <div className={styles.field}><label htmlFor="lf-breed">Plemeno</label><select id="lf-breed" name="breed" defaultValue={breedId ? String(breedId) : ""}><option value="">Všetky plemená</option>{breeds.map((breed) => <option key={breed.id} value={breed.id}>{breed.name}</option>)}</select></div>
      <div className={styles.actions}><button type="submit">Filtrovať</button><Link href={dogReportBasePath(type)}>Vyčistiť</Link></div>
    </form>

    <div className={styles.summary}><h2>{dogReportTypeLabel(type)}</h2><p>{result.total} aktívnych hlásení</p></div>
    {result.items.length ? <div className={styles.grid}>{result.items.map((report) => <article className={styles.card} key={report.id}>
      <div className={styles.visual}>{report.mainImage ? <img src={report.mainImage} alt={report.dogName ? `${dogReportTypeShortLabel(type)} pes ${report.dogName}` : dogReportTypeLabel(type)} /> : <span aria-hidden="true">🐕</span>}</div>
      <div className={styles.cardBody}><div className={styles.badges}><span className={`${styles.badge} ${type === "LOST" ? styles.lost : styles.found}`}>{dogReportTypeLabel(type)}</span>{report.breed && <span className={styles.badge}>{report.breed}</span>}</div>
        <h3>{report.dogName || report.breed || "Pes bez známeho mena"}</h3>
        <div className={styles.meta}><span>📍 {report.city}{report.district ? ` · ${report.district}` : ""}</span><span>📅 {formatDogReportDate(report.eventDate)}</span><span>{dogSexLabel[report.sex]} · {dogSizeLabel[report.size]}</span></div>
        <p>{report.description.length > 150 ? `${report.description.slice(0, 147)}…` : report.description}</p><Link className={styles.cardLink} href={dogReportHref(report)}>Zobraziť hlásenie →</Link>
      </div></article>)}</div> : <div className={styles.empty}><h2>Žiadne aktívne hlásenia</h2><p>Pre zvolené filtre momentálne nemáme aktívny záznam.</p></div>}

    {result.pages > 1 && <nav className={styles.pagination} aria-label="Stránkovanie hlásení">{result.page > 1 && <Link href={pageHref(type, params, result.page - 1)}>←</Link>}{Array.from({ length: Math.min(result.pages, 7) }, (_, index) => {
      const start = Math.max(1, Math.min(result.page - 3, result.pages - 6)); const item = start + index; if (item > result.pages) return null;
      return item === result.page ? <span key={item} aria-current="page">{item}</span> : <Link key={item} href={pageHref(type, params, item)}>{item}</Link>;
    })}{result.page < result.pages && <Link href={pageHref(type, params, result.page + 1)}>→</Link>}</nav>}
  </main>;
}
