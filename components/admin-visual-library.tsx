"use client";

import { useMemo, useState } from "react";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import { visualLibraryBanners } from "@/lib/visual-library-banners";
import { AdminVisualLibraryOther } from "@/components/admin-visual-library-other";
import { AdminVisualLibraryGallery } from "@/components/admin-visual-library-gallery";
import { AdminVisualLibraryVisualCatalog } from "@/components/admin-visual-library-visual-catalog";
import { AdminVisualLibraryDeepAudit } from "@/components/admin-visual-library-deep-audit";
import { adminComponentPreviewSamples } from "@/components/admin-component-visual-preview";
import { AdminVisualLibraryDuplicates } from "@/components/admin-visual-library-duplicates";
import { AdminVisualLibraryEditor } from "@/components/admin-visual-library-editor";
import { AdminVisualLibraryCoverage, type CoverageRegistry } from "@/components/admin-visual-library-coverage";
import type { VisualLibraryExample, VisualExampleCategory } from "@/lib/visual-library-example-types";
import type { ArticleBannerUsageResult } from "@/lib/visual-library-usage-store";
import styles from "./admin-visual-library.module.css";

export function AdminVisualLibrary({ articleUsage, examples, registry }: {
  articleUsage: ArticleBannerUsageResult;
  examples: readonly VisualLibraryExample[];
  registry: CoverageRegistry;
}) {
  const [category, setCategory] = useState<"prehlad" | "register" | "bannery" | "podobne" | "vsetko" | "galeria" | "filtre" | "navigacia" | "ostatne" | VisualExampleCategory>("prehlad");
  const [editorOpen, setEditorOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [group, setGroup] = useState<"all" | "clanky" | "stranky">("all");
  const [selectedId, setSelectedId] = useState("clanky:veterinari");
  const [variantIndex, setVariantIndex] = useState(0);
  const [usageFilter, setUsageFilter] = useState("");
  const [usageLimit, setUsageLimit] = useState(30);
  const previewPaths = useMemo(
    () => new Set(adminComponentPreviewSamples.map((sample) => sample.path)), [],
  );
  const publicSourceComponents = registry.components.filter((item) => item.area !== "admin");
  const publicSourceWithPreview = publicSourceComponents.filter((item) => previewPaths.has(item.path)).length;
  const publicRouteTemplates = registry.routeEntries?.filter((item) => item.area === "public").length;
  const unavailableRegistry = registry.components.length === 0;

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
  const uses: Array<{ url: string; label: string; placement: string; evidence: string; anchorId?: string }> = chosen
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
          <p className={styles.kicker}>Vizuálna knižnica · priebežné pokrytie</p>
          <h2>Čo používame na webe</h2>
          <p>Ako prvé si pozri skutočné grafické náhľady. Podobné prvky môžeš porovnať, technický register je dostupný samostatne.</p>
        </div>
        <div className={styles.count}><strong>{adminComponentPreviewSamples.length}</strong><span>živých variantov v galérii</span></div>
      </header>

      <div className={styles.coverageSummary} aria-label="Stav pokrytia vizuálnej knižnice">
        <div><strong>{adminComponentPreviewSamples.length}</strong><span>Živých náhľadov</span></div>
        <div><strong>{unavailableRegistry ? "—" : publicSourceWithPreview + " / " + publicSourceComponents.length}</strong><span>Verejných súborov s náhľadom</span></div>
        <div><strong>{publicRouteTemplates ?? "—"}</strong><span>Verejných šablón v registri</span></div>
        <div><strong>4</strong><span>Typy s editorom návrhov</span></div>
      </div>
      <p className={styles.explanation}>
        Náhľad je ukážka komponentu, nie potvrdený výskyt na všetkých verejných URL.
        Priame publikovanie na desktope zostáva obmedzené na samostatne overené bannery.
        Ostatné editory ukladajú iba návrhy. {unavailableRegistry ? "Zdrojový register sa v tejto zostave nenačítal." : ""}
      </p>
      <nav className={styles.types} aria-label="Kategórie knižnice">
        {([
          ["prehlad", "Vizuálny prehľad"],
          ["podobne", "Podobnosti a duplicity"],
          ["register", "Technický register"],
          ["bannery", "Bannery"],
          ["hero", "Hero sekcie"],
          ["cta", "CTA tlačidlá"],
          ["karty", "Karty"],
          ["filtre", "Filtre a formuláre"],
          ["navigacia", "Navigácia"],
          ["ostatne", "Ostatné prvky"],
          ["galeria", "Všetky náhľady"],
          ["vsetko", "Kde všade sa používa"],
        ] as const).map(([id, label]) => (
          <button type="button" key={id} aria-pressed={category === id}
            onClick={() => setCategory(id)}>{label}</button>
        ))}
      </nav>

      {category === "prehlad" ? (
        <AdminVisualLibraryVisualCatalog registry={registry} onCompare={() => setCategory("podobne")} />
      ) : category === "register" ? (
        <AdminVisualLibraryDeepAudit registry={registry} />
      ) : category === "bannery" ? (
      <>
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
                onClick={() => {setSelectedId(banner.id);setVariantIndex(0);setUsageFilter("");setUsageLimit(30);setEditorOpen(false);}}>
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
              <button className={styles.moreButton} type="button" aria-expanded={editorOpen}
                onClick={() => setEditorOpen((current) => !current)}>
                {editorOpen ? "Skryť editor návrhu" : "Upraviť vzhľad"}
              </button>
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
              <div className={styles.previewComponent} inert>
                <PublicMagazineBanner compact={chosen.group === "clanky"}
                  photoTone={chosen.photoTone}
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

            {editorOpen && (
              <AdminVisualLibraryEditor key={chosen.id + ":" + variantIndex}
                banner={chosen}
                variantIndex={variantIndex}
                knownUses={uses.length}
                canConfirmAllUses={chosen.group !== "clanky" && chosen.uses.length > 0}
              />
            )}
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
                      <code>{use.url}{use.anchorId ? `#${use.anchorId}` : ""}</code>
                    </div>
                    <a href={use.anchorId ? `${use.url}#${use.anchorId}` : use.url} target="_blank" rel="noopener noreferrer">
                      Otvoriť umiestnenie ↗
                    </a>
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
            <p className={styles.nextStep}>Text a základné farby môžeš skúšať a uložiť ako pracovný návrh. Publikovať možno iba sedem individuálne overených bannerov a iba na desktope; ostatné zostávajú návrhmi.</p>
          </div>
        ) : <p className={styles.empty}>Vyber iný filter alebo hľadaný výraz.</p>}
      </div>
      <AdminVisualLibraryGallery registry={registry} fixedFamily="banner" />
      </>
      ) : category === "vsetko" ? (
        <AdminVisualLibraryCoverage registry={registry} articleUsage={articleUsage} examples={examples} />
      ) : category === "podobne" ? (
        <AdminVisualLibraryDuplicates articleUsage={articleUsage} examples={examples} registry={registry} />
      ) : category === "galeria" ? (
        <AdminVisualLibraryGallery registry={registry} />
      ) : category === "filtre" ? (
        <AdminVisualLibraryGallery registry={registry} fixedFamily="filter" />
      ) : category === "navigacia" ? (
        <AdminVisualLibraryGallery registry={registry} fixedFamily="category" />
      ) : category === "ostatne" ? (
        <AdminVisualLibraryGallery registry={registry} fixedFamily="other" />
      ) : (
        <>
          <AdminVisualLibraryOther key={category} category={category} examples={examples} />
          <AdminVisualLibraryGallery key={category + "-gallery"} registry={registry}
            fixedFamily={category === "karty" ? "card" : category} />
        </>
      )}
    </section>
  );
}
