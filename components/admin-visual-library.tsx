"use client";

import { useMemo, useState } from "react";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import { visualLibraryBanners } from "@/lib/visual-library-banners";
import type { ArticleBannerUsageResult } from "@/lib/visual-library-usage-store";
import styles from "./admin-visual-library.module.css";

export function AdminVisualLibrary({ articleUsage }: { articleUsage: ArticleBannerUsageResult }) {
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState<"all" | "clanky" | "stranky">("all");
  const [selectedId, setSelectedId] = useState("clanky:veterinari");
  const [variantIndex, setVariantIndex] = useState(0);
  const [usageFilter, setUsageFilter] = useState("");
  const [usageLimit, setUsageLimit] = useState(30);
  const articleUsesFor = (id: string) => id.startsWith("clanky:")
    ? (articleUsage.byKey[id.slice(7)] ?? []) : [];
  const usageCountFor = (id: string) => {
    const banner = visualLibraryBanners.find((item) => item.id === id);
    return (banner?.uses.length ?? 0) + articleUsesFor(id).length;
  };

  const filtered = useMemo(() => visualLibraryBanners.filter((banner) =>
    (group === "all" || banner.group === group) &&
    [banner.label, banner.title, banner.description].join(" ")
      .toLocaleLowerCase("sk").includes(filter.trim().toLocaleLowerCase("sk"))
  ), [filter, group]);

  const chosen = filtered.find((banner) => banner.id === selectedId) ?? filtered[0];
  const variant = chosen?.variants?.[Math.min(variantIndex, chosen.variants.length - 1)];
  const uses: Array<{ url: string; label: string; placement: string; evidence: string }> = chosen
    ? [...chosen.uses, ...articleUsesFor(chosen.id)] : [];
  const visibleUses = uses.filter((use) =>
    [use.url, use.label, use.placement].join(" ").toLocaleLowerCase("sk")
      .includes(usageFilter.trim().toLocaleLowerCase("sk")),
  );
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
          <p className={styles.kicker}>Vizuálna knižnica · 2. etapa</p>
          <h2>Čo používame na webe</h2>
          <p>Vyber banner, pozri si jeho reálny vzhľad a otvor konkrétne stránky, kde sa používa.</p>
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
                onClick={() => {setSelectedId(banner.id);setVariantIndex(0);setUsageFilter("");setUsageLimit(30);}}>
                <span>{banner.label}</span>
                <small>{usageCountFor(banner.id) > 0
                  ? `${usageCountFor(banner.id)} výskytov na stránkach`
                  : (banner.group === "clanky" && articleUsage.status === "complete"
                    ? "Dnes bez nájdeného použitia" : "Použitie zatiaľ neoverené")}</small>
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
                <p>Zobrazujeme konkrétne URL, nie technické šablóny ani odhadované adresy.</p>
              </div>
              <strong>{uses.length} výskytov</strong>
            </div>
            {chosen.group === "clanky" && (
              <p className={styles.scanState}>
                {articleUsage.status === "complete" ? "Údaje zo všetkých nájdených publikovaných článkov." :
                  articleUsage.status === "partial" ? "Údaje sú neúplné." :
                  "Údaje z publikovaných článkov sú dočasne nedostupné."}
                {" "}Kontrolovaných článkov: {articleUsage.scannedArticles}.
                {" "}Stav k {new Date(articleUsage.generatedAt).toLocaleString("sk-SK", { timeZone: "Europe/Bratislava" })}.
                {articleUsage.notice ? ` ${articleUsage.notice}` : ""}
              </p>
            )}
            {chosen.group === "clanky" && articleUsage.status !== "unavailable" && (
              <p className={styles.explanation}>
                „V obsahu článku“ znamená vložený banner. „Automaticky dnes“ znamená banner
                vybraný systémom pre dnešný deň (UTC); zajtra sa môže na tej istej URL zmeniť.
              </p>
            )}
            {uses.length > 5 && (
              <label className={styles.usageSearch}>
                <span>Hľadať medzi stránkami ({uses.length})</span>
                <input type="search" value={usageFilter} onChange={(event) => {setUsageFilter(event.target.value);setUsageLimit(30);}}
                  placeholder="Názov článku alebo URL" />
              </label>
            )}
            {visibleUses.length > 0 && (
              <ul className={styles.usages}>
                {visibleUses.slice(0, usageLimit).map((use, index) => (
                  <li key={use.url + use.placement + index}>
                    <div>
                      <strong>{use.label}</strong>
                      <small>{use.placement}</small>
                      <code>{use.url}</code>
                    </div>
                    <a href={use.url} target="_blank" rel="noopener noreferrer">Otvoriť stránku ↗</a>
                  </li>
                ))}
              </ul>
            )}
            {visibleUses.length > usageLimit && (
              <button className={styles.moreButton} type="button"
                onClick={() => setUsageLimit((value) => value + 50)}>
                Zobraziť ďalšie ({visibleUses.length - usageLimit})
              </button>
            )}
            {uses.length > 0 && visibleUses.length === 0 && (
              <p className={styles.pending}>Pre zadané hľadanie sa nenašlo žiadne použitie.</p>
            )}
            {chosen.group === "clanky" && articleUsage.status === "complete" && uses.length === 0 && (
              <p className={styles.pending}>V aktuálne publikovaných článkoch sa tento banner dnes nenašiel.</p>
            )}
            {chosen.group === "clanky" && articleUsage.status !== "complete" && uses.length === 0 && (
              <p className={styles.pending}>Zoznam použitia momentálne nie je možné potvrdiť ako úplný.</p>
            )}
            {chosen.group !== "clanky" && uses.length === 0 && (
              <p className={styles.pending}>Konkrétne URL zatiaľ nie sú overené.</p>
            )}
            <p className={styles.nextStep}>Úpravy farieb, textu a zjednocovanie duplicitných bannerov doplníme až v ďalších etapách. Teraz sa nič na verejnom webe nemení.</p>
          </div>
        ) : <p className={styles.empty}>Vyber iný filter alebo hľadaný výraz.</p>}
      </div>
    </section>
  );
}
