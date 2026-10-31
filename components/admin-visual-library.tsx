"use client";

import { useMemo, useState } from "react";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import { visualLibraryBanners } from "@/lib/visual-library-banners";
import styles from "./admin-visual-library.module.css";

export function AdminVisualLibrary() {
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState<"all" | "clanky" | "stranky">("all");
  const [selectedId, setSelectedId] = useState("clanky:veterinari");
  const [variantIndex, setVariantIndex] = useState(0);

  const filtered = useMemo(() => visualLibraryBanners.filter((banner) =>
    (group === "all" || banner.group === group) &&
    [banner.label, banner.title, banner.description].join(" ")
      .toLocaleLowerCase("sk").includes(filter.trim().toLocaleLowerCase("sk"))
  ), [filter, group]);

  const chosen = filtered.find((banner) => banner.id === selectedId) ?? filtered[0];
  const variant = chosen?.variants?.[Math.min(variantIndex, chosen.variants.length - 1)];
  const preview = chosen ? {
    eyebrow: variant?.eyebrow ?? chosen.eyebrow,
    title: variant?.title ?? chosen.title,
    description: variant?.description ?? chosen.description,
    label: variant?.ctaLabel ?? chosen.ctaLabel,
  } : null;

  return (
    <section className={styles.library} aria-label="Vizuálna knižnica Psipedie">
      <header className={styles.intro}>
        <div>
          <p className={styles.kicker}>Vizuálna knižnica · 1. etapa</p>
          <h2>Čo používame na webe</h2>
          <p>Vyber banner, pozri si jeho skutočný komponent a otvor presné adresy, ktoré sme overili v kóde.</p>
        </div>
        <div className={styles.count}><strong>{visualLibraryBanners.length}</strong><span>nájdených druhov bannerov</span></div>
      </header>

      <nav className={styles.types} aria-label="Kategórie knižnice">
        <span className={styles.activeType}>Bannery</span>
        <span title="Nasledujúca etapa">Hero · pripravujeme</span>
        <span title="Nasledujúca etapa">CTA tlačidlá · pripravujeme</span>
        <span title="Nasledujúca etapa">Karty · pripravujeme</span>
      </nav>

      <div className={styles.controls}>
        <label>
          <span>Hľadať banner</span>
          <input type="search" value={filter} onChange={(event) => {setFilter(event.target.value);setVariantIndex(0);}}
            placeholder="Napr. Hľadáte veterinára" />
        </label>
        <label>
          <span>Zobraziť</span>
          <select value={group} onChange={(event) => {setGroup(event.target.value as typeof group);setVariantIndex(0);}}>
            <option value="all">Všetky bannery</option>
            <option value="clanky">Bannery v článkoch</option>
            <option value="stranky">Bannery na stránkach</option>
          </select>
        </label>
      </div>

      <div className={styles.workspace}>
        <div className={styles.catalog} aria-label="Zoznam bannerov">
          <strong>Vyber, čo chceš skontrolovať</strong>
          <div className={styles.catalogItems}>
            {filtered.map((banner) => (
              <button type="button" className={styles.catalogItem}
                aria-pressed={chosen?.id === banner.id} key={banner.id}
                onClick={() => {setSelectedId(banner.id);setVariantIndex(0);}}>
                <span>{banner.label}</span>
                <small>{banner.uses.length > 0 ? `${banner.uses.length} overených URL` : "Presné URL zatiaľ nezistené"}</small>
              </button>
            ))}
            {filtered.length === 0 && <p>Žiadny banner sa nenašiel. Skús iné hľadanie.</p>}
          </div>
        </div>

        {chosen && preview ? (
          <div className={styles.details} key={chosen.id}>
            <div className={styles.detailHead}>
              <div><span>Náhľad existujúceho komponentu</span><h3>{chosen.label}</h3></div>
              <span className={styles.readOnly}>Iba na čítanie</span>
            </div>
            {chosen.variants && (
              <div className={styles.variants} aria-label="Verzie textu banneru">
                {chosen.variants.map((item, index) => (
                  <button key={index} type="button"
                    aria-pressed={variantIndex === index}
                    onClick={() => setVariantIndex(index)}>Text {index + 1}</button>
                ))}
              </div>
            )}

            <div className={styles.preview} aria-label={`Skutočný vizuálny náhľad: ${preview.title}`}>
              <div className={styles.previewComponent}>
                <PublicMagazineBanner compact
                  testId={`library-${chosen.id}`}
                  eyebrow={preview.eyebrow}
                  title={preview.title}
                  description={preview.description}
                  label={preview.label}
                  href={chosen.ctaHref}
                />
              </div>
            </div>
            <p className={styles.explanation}>
              Náhľad používa ten istý bannerový komponent a jeho štýly ako verejný web.
              Zobrazuje kompaktnú ukážku; šírka, umiestnenie a text sa na konkrétnej stránke môžu líšiť.
              {chosen.variants ? " Pri článkoch sa môže zobraziť ktorýkoľvek z troch textových variantov." : ""}
            </p>

            <div className={styles.usageHead}>
              <div>
                <h4>Kde sa používa</h4>
                <p>Konkrétne URL ukazujeme len po overení. Zatiaľ nič neodhadujeme.</p>
              </div>
              <strong>{chosen.uses.length} overených</strong>
            </div>
            {chosen.uses.length > 0 && (
              <ul className={styles.usages}>
                {chosen.uses.map((use) => (
                  <li key={use.url + use.placement}>
                    <div><strong>{use.label}</strong><small>{use.placement}</small><code>{use.url}</code></div>
                    <a href={use.url} target="_blank" rel="noopener noreferrer">Otvoriť stránku ↗</a>
                  </li>
                ))}
              </ul>
            )}
            {chosen.dynamicNote && <p className={styles.pending}><strong>Články – overenie pokračuje.</strong> {chosen.dynamicNote}</p>}
            {!chosen.dynamicNote && chosen.uses.length === 0 && <p className={styles.pending}>Konkrétne URL zatiaľ nie sú overené.</p>}
            <p className={styles.nextStep}>Úpravy farieb, textu a zjednocovanie duplicitných bannerov doplníme až v ďalších etapách. Teraz sa nič na verejnom webe nemení.</p>
          </div>
        ) : <p className={styles.empty}>Vyber iný filter alebo hľadaný výraz.</p>}
      </div>
    </section>
  );
}
