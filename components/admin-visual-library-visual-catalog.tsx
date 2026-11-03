"use client";

import { useMemo, useState } from "react";
import {
  AdminComponentVisualPreview,
  adminComponentPreviewSamples,
} from "@/components/admin-component-visual-preview";
import { AdminVisualLibraryMissingPreviews } from "@/components/admin-visual-library-missing-previews";
import { AdminVisualLibraryOwnerCompare } from "@/components/admin-visual-library-owner-compare";
import { AdminVisualLibraryDynamicUrls } from "@/components/admin-visual-library-dynamic-urls";
import { relatedDynamicUrlKindForPreview } from "@/lib/visual-library-preview-related-urls";
import { componentHtmlProbeIdForOwnerGroup } from "@/lib/visual-library-html-evidence";
import { verifiedCanonicalRendererForGroup } from "@/lib/visual-library-canonical-renderers";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import { visualLibraryBanners, type VisualBanner } from "@/lib/visual-library-banners";
import { AdminVisualLibraryBannerPreview } from "@/components/admin-visual-library-banner-preview";
import { OWNER_EXAMPLE_GROUPS, ownerGroupForBanner, ownerKnownUsesForGroup, type OwnerKnownUse } from "@/lib/visual-library-owner-evidence";
import type { ArticleBannerUsageResult } from "@/lib/visual-library-usage-store";
import type { VisualLibraryExample } from "@/lib/visual-library-example-types";
import type { CoverageRegistry } from "@/components/admin-visual-library-coverage";
import styles from "./admin-visual-library.module.css";

type Sample = (typeof adminComponentPreviewSamples)[number];
type Family = Sample["family"];
type Group = {
  id: string;
  family: Family;
  title: string;
  samples: Sample[];
  examples: VisualLibraryExample[];
  banners: VisualBanner[];
  paths: string[];
  routes: string[];
  knownUses: OwnerKnownUse[];
  matchingLabels: string[];
};

const PAGE_SIZE = 12;
const FAMILY_LABELS: readonly { id: Family; label: string }[] = [
  { id: "banner", label: "Bannery" },
  { id: "hero", label: "Hlavičky a hero" },
  { id: "card", label: "Karty" },
  { id: "cta", label: "Tlačidlá a výzvy" },
  { id: "filter", label: "Vyhľadávanie a filtre" },
  { id: "category", label: "Navigácia" },
  { id: "other", label: "Ďalšie prvky" },
];

/**
 * Only variants KNOWN to render the same component are grouped.
 * A shared source FILE is not proof that two exports are one component:
 * e.g. public-visual-system.tsx contains several unrelated components.
 */
const VARIANT_OF: Readonly<Record<string, string>> = {
  "magazine-photo": "magazine",
  "context-photo": "context",
  "sponsored": "article",
  "section-header-image": "section-header",
  "landing-hero-events": "landing-hero",
  "event-grid": "event-list",
  "event-cancelled": "event-list",
  "help-resolved": "help-card",
  "help-urgent": "help-card",
  "help-profile-urgent": "help-profile",
  "directory-services-expanded": "directory-services-short",
  "event-listing-empty": "event-listing-filtered",
};

export function AdminVisualLibraryVisualCatalog({
  registry, onCompare, examples, articleUsage,
}: {
  registry: CoverageRegistry;
  examples: readonly VisualLibraryExample[];
  articleUsage: ArticleBannerUsageResult;
  onCompare: () => void;
}) {
  const groups = useMemo(() => {
    const sources = new Map(registry.components.map((item) => [item.path, item]));
    const result = new Map<string, Group>();

    for (const sample of adminComponentPreviewSamples) {
      const id = VARIANT_OF[sample.id] ?? sample.id;
      let group = result.get(id);
      if (!group) {
        group = { id, family: sample.family, title: sample.title, samples: [], examples: [], banners: [], paths: [], routes: [], knownUses: [], matchingLabels: [] };
        result.set(id, group);
      }
      group.samples.push(sample);
      if (!group.paths.includes(sample.path)) group.paths.push(sample.path);
      for (const route of sources.get(sample.path)?.routes ?? []) {
        if (!group.routes.includes(route)) group.routes.push(route);
      }
    }
    // Existing server-rendered examples are also real components; display them
    // in the owner's gallery rather than hiding them in separate legacy tabs.
    // Only known source identities are joined, not arbitrary similar filenames.
    for (const example of examples) {
      const spec = OWNER_EXAMPLE_GROUPS[example.id];
      const id = spec?.root ?? "example:" + example.id;
      let group = result.get(id);
      if (!group) {
        const family = spec?.family ?? (example.category === "karty" ? "card" : example.category);
        group = {
          id, family, title: id === "unified-section-hero" ? "Spoločná hero sekcia" : example.label,
          samples: [], examples: [], paths: [], routes: [], knownUses: [], matchingLabels: [],
        };
        result.set(id, group);
      }
      group.examples.push(example);
      if (spec && !group.paths.includes(spec.path)) group.paths.push(spec.path);
      for (const route of spec ? sources.get(spec.path)?.routes ?? [] : []) {
        if (!group.routes.includes(route)) group.routes.push(route);
      }
    }
    // A magazine banner exists once in code but has multiple real content presets.
    // Expose those presets as variants of the SAME component, never as duplicates.
    for (const banner of visualLibraryBanners) {
      const root = ownerGroupForBanner(banner);
      if (root === "magazine") result.get(root)?.banners.push(banner);
    }
    return [...result.values()].map((group) => {
      const evidence = ownerKnownUsesForGroup(group.id, visualLibraryBanners, examples, articleUsage);
      return { ...group, knownUses: evidence.uses, matchingLabels: evidence.matchingLabels };
    });
  }, [registry.components, examples, articleUsage]);

  const coveredSourcePaths = useMemo(
    () => [...new Set(groups.flatMap((group) => group.paths))],
    [groups],
  );
  const pendingSourceFiles = registry.components.filter(
    (item) => item.area !== "admin" && !coveredSourcePaths.includes(item.path)
  ).length;

  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<Family | "all">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [routesLimit, setRoutesLimit] = useState(12);
  const [knownLimit, setKnownLimit] = useState(12);
  const [showComparison, setShowComparison] = useState(false);
  const [compareStart, setCompareStart] = useState("");
  const [showRelatedProfiles, setShowRelatedProfiles] = useState(false);

  const lower = query.trim().toLocaleLowerCase("sk");
  const matches = groups.filter((item) =>
    (family === "all" || item.family === family) &&
    (!lower || [
      item.title, item.id, ...item.paths, ...item.routes, ...item.matchingLabels,
      ...item.knownUses.flatMap((use) => [use.label, use.placement, use.url]),
      ...item.samples.flatMap((sample) => [sample.title, sample.description]),
    ].join(" ").toLocaleLowerCase("sk").includes(lower))
  );
  const chosen = matches.find((item) => item.id === selectedId) ?? matches[0];
  const canonicalRenderer = chosen ? verifiedCanonicalRendererForGroup(chosen.id) : null;
  const sharedRendererGroups = canonicalRenderer
    ? groups.filter((item) => item.id !== chosen?.id &&
      verifiedCanonicalRendererForGroup(item.id)?.path === canonicalRenderer.path)
    : [];
  const sharedRendererUses = sharedRendererGroups.flatMap((item) =>
    item.knownUses.map((use) => ({ ...use, groupTitle: item.title }))
  );
  const exactSample = chosen?.samples.find((item) => item.id === variantId);
  const exactExample = chosen?.examples.find((item) => item.id === variantId);
  const exactBanner = chosen?.banners.find((item) => item.id === variantId);
  const variant = exactSample ?? (!exactExample && !exactBanner ? chosen?.samples[0] : undefined);
  const chosenExample = exactExample ?? (!variant && !exactBanner ? chosen?.examples[0] : undefined);
  const chosenBanner = exactBanner ?? (!variant && !chosenExample ? chosen?.banners[0] : undefined);
  const staticUrls = (chosen?.routes ?? []).map((route) => ({
    route, href: publicRegistryRouteHref(route),
  })).filter((item): item is { route: string; href: string } => item.href !== null);
  const relatedKind = chosen ? relatedDynamicUrlKindForPreview(chosen.id) : null;
  const dynamicRoutes = (chosen?.routes ?? []).filter((route) =>
    route.includes("[") && publicRegistryRouteHref(route) === null);

  const openCompare = (id: string) => {
    setCompareStart(id);
    setShowComparison(true);
  };

  const resetFilter = () => {
    setLimit(PAGE_SIZE);
    setSelectedId("");
    setVariantId("");
    setRoutesLimit(12);
    setKnownLimit(12);
    setShowRelatedProfiles(false);
  };

  return (
    <section className={styles.visualCatalog} aria-label="Vizuálny katalóg komponentov">
      <header className={styles.visualCatalogIntro}>
        <div>
          <h3>Všetky dostupné grafické náhľady na jednom mieste</h3>
          <p>Prezri si reálne komponenty, ich varianty a zdokumentované konkrétne URL.
            Kandidáti iba podľa importov sú oddelení od doložených umiestnení.</p>
        </div>
        <div className={styles.visualCatalogStat}>
          <strong>{groups.length}</strong>
          <span>skupín s náhľadom · {adminComponentPreviewSamples.length} demo variantov + {examples.length} serverových ukážok</span>
          {registry.components.length > 0 && <span>
            {pendingSourceFiles} verejných zdrojových súborov bez ukážky (vrátane pomocných modulov)
          </span>}
        </div>
      </header>

      <div className={styles.visualCatalogToolbar}>
        <label>
          <span>Hľadať prvok, účel alebo stránku</span>
          <input type="search" value={query} placeholder="Napr. veterinári, banner, /adresar"
            onChange={(event) => { setQuery(event.target.value); resetFilter(); }} />
        </label>
        <label>
          <span>Typ komponentu</span>
          <select value={family} onChange={(event) => {
            setFamily(event.target.value as Family | "all");
            resetFilter();
          }}>
            <option value="all">Všetky kategórie</option>
            {FAMILY_LABELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>

      <div className={styles.visualCatalogCount}>
        <span>Nájdených {matches.length} skupín · zobrazených {Math.min(matches.length,limit)}</span>
        <button type="button" onClick={() => openCompare(chosen?.id ?? groups[0]?.id ?? "")}>Porovnávanie a uložené rozhodnutia</button>
      </div>

      <div className={styles.visualCatalogGrid}>
        {matches.slice(0, limit).map((item) => {
          const sample = item.samples[0];
          const example = item.examples[0];
          return <article key={item.id} className={styles.visualCatalogCard}
            data-selected={chosen?.id === item.id}>
            <div className={styles.visualCatalogCardPreview} inert>
              <div>{sample ? <AdminComponentVisualPreview id={sample.id} /> : example?.preview}</div>
            </div>
            <div className={styles.visualCatalogCardBody}>
              <span className={styles.visualCatalogTag}>
                {FAMILY_LABELS.find((f) => f.id === item.family)?.label ?? "Komponent"}
              </span>
              <h4>{item.title}</h4>
              <p>{item.samples.length + item.examples.length + item.banners.length > 1
                ? String(item.samples.length + item.examples.length + item.banners.length) + " ukážok a obsahových variantov"
                : "Jeden dostupný náhľad"}
                {item.knownUses.length > 0 ? " · " + item.knownUses.length + " konkrétnych umiestnení" : ""}</p>
              <button type="button" onClick={() => openCompare(item.id)}>
                Porovnať s iným prvkom
              </button>
              <button type="button" aria-pressed={chosen?.id === item.id}
                onClick={() => { setSelectedId(item.id); setVariantId(""); setRoutesLimit(12); setKnownLimit(12); setShowRelatedProfiles(false); }}>
                Pozrieť detail a použitie
              </button>
            </div>
          </article>;
        })}
      </div>
      {matches.length === 0 && <p className={styles.pending}>
        Žiadny dostupný grafický náhľad nezodpovedá hľadaniu. Skontroluj
        aj zoznam komponentov bez náhľadu nižšie.
      </p>}
      {matches.length > limit && <button className={styles.moreButton} type="button"
        onClick={() => setLimit((current) => current + PAGE_SIZE)}>
        Zobraziť ďalšie ({matches.length - limit})
      </button>}

      {showComparison && <AdminVisualLibraryOwnerCompare
        key={compareStart} groups={groups} initialLeftId={compareStart} onAdvanced={onCompare} />}
      {chosen && (variant || chosenExample || chosenBanner) && <section className={styles.visualCatalogDetail} aria-label="Detail vybraného komponentu">
        <div className={styles.visualCatalogDetailHead}>
          <div>
            <span>Vybraný komponent · originálne vykreslenie s demo alebo zdrojovými údajmi</span>
            <h3>{chosen.title}</h3>
          </div>
          <button type="button" onClick={onCompare}>Prejsť na porovnávanie</button>
        </div>
        {chosen.samples.length + chosen.examples.length + chosen.banners.length > 1 && <div className={styles.visualCatalogVariants}>
          <strong>Varianty toho istého komponentu</strong>
          <div>
            {chosen.samples.map((sample) => <button key={sample.id} type="button"
              aria-pressed={variant?.id === sample.id}
              onClick={() => setVariantId(sample.id)}>{sample.title}</button>)}
            {chosen.examples.map((example) => <button key={example.id} type="button"
              aria-pressed={chosenExample?.id === example.id}
              onClick={() => setVariantId(example.id)}>{example.label}</button>)}
            {chosen.banners.map((banner) => <button key={banner.id} type="button"
              aria-pressed={chosenBanner?.id === banner.id}
              onClick={() => setVariantId(banner.id)}>{banner.label}</button>)}
          </div>
        </div>}
        <div className={styles.visualCatalogLargePreview} inert>
          {variant ? <AdminComponentVisualPreview id={variant.id} />
            : chosenExample?.preview ?? (chosenBanner ? <AdminVisualLibraryBannerPreview
              banner={chosenBanner}
              testId={"owner-catalog-" + chosenBanner.id.replaceAll(":", "-")} /> : null)}
        </div>
        <p className={styles.explanation}>{variant?.description ?? chosenExample?.explanation ?? (chosenBanner ? "Skutočný spoločný banner s obsahom z evidencie Psipedie. Ide o variant textu, nie nový komponent." : "")}</p>
        {canonicalRenderer && <section className={styles.ownerSameRendererInfo}>
          <strong>Zdrojový komponent je už spoločný: {canonicalRenderer.name}</strong>
          <p>Preverený reťazec vykreslenia: {canonicalRenderer.chain.join(" → ")}.
            Ide o jeden existujúci verejný React komponent, nie nové kópie pre každú stránku.
            Jeho varianty sa môžu líšiť obsahom. Overenie je zo zdrojového kódu,
            nie zo screenshotu každého profilu.</p>
          {sharedRendererGroups.length > 0 && <p>
            Ďalšie použitia rovnakej implementácie sú evidované pod:
            {" "}{sharedRendererGroups.map((item) => item.title).join(", ")}.
          </p>}
        </section>}
        {sharedRendererUses.length > 0 && <div className={styles.visualCatalogUses}>
          <h4>Ďalšie doložené umiestnenia spoločného zdroja ({sharedRendererUses.length})</h4>
          <ul className={styles.usages}>
            {sharedRendererUses.map((use, index) =>
              <li key={use.groupTitle + use.url + (use.anchorId ?? "") + index}>
                <div><strong>{use.label}</strong>
                  <small>{use.groupTitle} · {use.placement}</small>
                  <code>{use.url}{use.anchorId ? "#" + use.anchorId : ""}</code>
                </div>
                <a href={use.url + (use.anchorId ? "#" + use.anchorId : "")}
                  target="_blank" rel="noopener noreferrer">Otvoriť miesto</a>
              </li>
            )}
          </ul>
        </div>}
        <div className={styles.visualCatalogUses}>
          <h4>Zdokumentované konkrétne stránky ({chosen.knownUses.length})</h4>
          <p>Presné URL sú doložené zdrojovým kódom alebo aktuálnym zoznamom
            publikovaných článkov. Nie sú automatickým dôkazom viditeľnosti v prehliadači.
            {articleUsage.status !== "complete" && chosen.id === "magazine" &&
              " Zoznam článkov môže byť neúplný: " + articleUsage.status + "."}</p>
          {chosen.knownUses.length > 0 && <ul className={styles.usages}>
            {chosen.knownUses.slice(0,knownLimit).map((use, index) => <li key={use.url + use.placement + index}>
              <div>
                <strong>{use.label}</strong>
                <small>{use.placement}</small>
                <small>{use.evidence === "published-auto-today"
                  ? "Automatický článkový banner – platí pre dnešný UTC deň"
                  : use.evidence === "published-manual"
                    ? "Publikovaný článok – ručne vložený banner"
                    : "Doložené v zdrojovom kóde"}</small>
                <code>{use.url}{use.anchorId ? "#" + use.anchorId : ""}</code>
              </div>
              <a href={use.url + (use.anchorId ? "#" + use.anchorId : "")}
                target="_blank" rel="noopener noreferrer">Otvoriť miesto</a>
            </li>)}
          </ul>}
          {chosen.knownUses.length > knownLimit && <button className={styles.moreButton}
            type="button" onClick={() => setKnownLimit((count) => count + 30)}>
            Ďalšie umiestnenia ({chosen.knownUses.length - knownLimit})
          </button>}
          {chosen.knownUses.length === 0 && <p className={styles.pending}>
            Pre tento prvok ešte nemáme konkrétnu doloženú URL. Neznamená to, že sa nepoužíva.
          </p>}
        </div>
        <div className={styles.visualCatalogUses}>
          <h4>Ďalšie možné použitia podľa kódu</h4>
          <p>Nasledujúce trasy pochádzajú z importov v kóde. <strong>Nie sú potvrdenými
            výskytmi na každej stránke.</strong> Konkrétne URL a živé overenie
            sú dostupné v karte „Kde všade sa používa“.</p>
          {staticUrls.length > 0 && <ul className={styles.usages}>
            {staticUrls.slice(0,routesLimit).map(({ route, href }) => <li key={route}>
              <div><strong>{route}</strong><small>Možné použitie – podľa kódu</small></div>
              <a href={href} target="_blank" rel="noopener noreferrer">Otvoriť stránku</a>
            </li>)}
          </ul>}
          {staticUrls.length > routesLimit && <button type="button"
            className={styles.moreButton} onClick={() => setRoutesLimit((n) => n + 24)}>
            Zobraziť ďalšie stránky ({staticUrls.length - routesLimit})
          </button>}
          {dynamicRoutes.length > 0 && <p className={styles.explanation}>
            Dynamické šablóny (nie konkrétne profily): {dynamicRoutes.join(", ")}.
          </p>}
          {chosen.routes.length === 0 && <p className={styles.pending}>
            Statický register zatiaľ nepriradil použitie. Neznamená to, že sa prvok
            na webe nepoužíva.
          </p>}
        </div>
        {relatedKind && <section className={styles.visualCatalogRelatedProfiles}
          aria-label="Publikované profily súvisiace s komponentom">
          <div>
            <h4>Konkrétne publikované profily súvisiace s týmto typom</h4>
            <p>Profilové URL pochádzajú z databázy publikovaných záznamov.
              Sú to stránky na preverenie, <strong>nie dôkaz, že sa tento komponent
              na každej z nich vykresľuje.</strong> Overenie HTML je možné po jednej URL.</p>
            <button type="button" aria-expanded={showRelatedProfiles}
              onClick={() => setShowRelatedProfiles((value) => !value)}>
              {showRelatedProfiles ? "Skryť publikované profily" : "Zobraziť konkrétne publikované profily"}
            </button>
          </div>
          {showRelatedProfiles && <AdminVisualLibraryDynamicUrls
            key={chosen.id + ":" + relatedKind} initialKind={relatedKind}
            componentId={componentHtmlProbeIdForOwnerGroup(chosen.id) ?? undefined} />}
        </section>}
        <details className={styles.visualCatalogTechnical}>
          <summary>Technické informácie (voliteľné)</summary>
          {chosen.paths.map((path) => <code key={path}>{path}</code>)}
        </details>
      </section>}

      <AdminVisualLibraryMissingPreviews registry={registry} extraPreviewPaths={coveredSourcePaths} />
      <p className={styles.nextStep}>Toto je prvá etapa vizuálneho katalógu.
        Zatiaľ sa nič automaticky nespája, nemaže ani nepublikuje.
        Reálne zlúčenie do jedného spoločného komponentu príde až po výbere a overení výskytov.</p>
    </section>
  );
}
