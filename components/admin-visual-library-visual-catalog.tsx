"use client";

import { useMemo, useState } from "react";
import {
  AdminComponentVisualPreview,
  adminComponentPreviewSamples,
} from "@/components/admin-component-visual-preview";
import { AdminVisualLibraryMissingPreviews } from "@/components/admin-visual-library-missing-previews";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import type { CoverageRegistry } from "@/components/admin-visual-library-coverage";
import styles from "./admin-visual-library.module.css";

type Sample = (typeof adminComponentPreviewSamples)[number];
type Family = Sample["family"];
type Group = {
  id: string;
  family: Family;
  title: string;
  samples: Sample[];
  paths: string[];
  routes: string[];
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
  "help-resolved": "help-card",
  "help-urgent": "help-card",
  "directory-services-expanded": "directory-services-short",
  "event-listing-empty": "event-listing-filtered",
};

export function AdminVisualLibraryVisualCatalog({
  registry, onCompare,
}: {
  registry: CoverageRegistry;
  onCompare: () => void;
}) {
  const groups = useMemo(() => {
    const sources = new Map(registry.components.map((item) => [item.path, item]));
    const result = new Map<string, Group>();

    for (const sample of adminComponentPreviewSamples) {
      const id = VARIANT_OF[sample.id] ?? sample.id;
      let group = result.get(id);
      if (!group) {
        group = { id, family: sample.family, title: sample.title, samples: [], paths: [], routes: [] };
        result.set(id, group);
      }
      group.samples.push(sample);
      if (!group.paths.includes(sample.path)) group.paths.push(sample.path);
      for (const route of sources.get(sample.path)?.routes ?? []) {
        if (!group.routes.includes(route)) group.routes.push(route);
      }
    }
    return [...result.values()];
  }, [registry.components]);

  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<Family | "all">("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedId, setSelectedId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [routesLimit, setRoutesLimit] = useState(12);

  const lower = query.trim().toLocaleLowerCase("sk");
  const matches = groups.filter((item) =>
    (family === "all" || item.family === family) &&
    (!lower || [
      item.title, item.id, ...item.paths, ...item.routes,
      ...item.samples.flatMap((sample) => [sample.title, sample.description]),
    ].join(" ").toLocaleLowerCase("sk").includes(lower))
  );
  const chosen = matches.find((item) => item.id === selectedId) ?? matches[0];
  const variant = chosen?.samples.find((item) => item.id === variantId) ?? chosen?.samples[0];
  const staticUrls = (chosen?.routes ?? []).map((route) => ({
    route, href: publicRegistryRouteHref(route),
  })).filter((item): item is { route: string; href: string } => item.href !== null);
  const dynamicRoutes = (chosen?.routes ?? []).filter((route) =>
    route.includes("[") && publicRegistryRouteHref(route) === null);

  const resetFilter = () => {
    setLimit(PAGE_SIZE);
    setSelectedId("");
    setVariantId("");
    setRoutesLimit(12);
  };

  return (
    <section className={styles.visualCatalog} aria-label="Vizuálny katalóg komponentov">
      <header className={styles.visualCatalogIntro}>
        <div>
          <h3>Všetky dostupné grafické náhľady na jednom mieste</h3>
          <p>Najprv si prezri, ako prvky naozaj vyzerajú. Varianty jedného komponentu
            sú pod spoločnou kartou. Technické podobnosti nájdeš v samostatnej karte.</p>
        </div>
        <div className={styles.visualCatalogStat}>
          <strong>{groups.length}</strong>
          <span>skupín s náhľadom · {adminComponentPreviewSamples.length} variantov</span>
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
        <button type="button" onClick={onCompare}>Porovnať podobné prvky</button>
      </div>

      <div className={styles.visualCatalogGrid}>
        {matches.slice(0, limit).map((item) => {
          const sample = item.samples[0];
          return <article key={item.id} className={styles.visualCatalogCard}
            data-selected={chosen?.id === item.id}>
            <div className={styles.visualCatalogCardPreview} inert>
              <div><AdminComponentVisualPreview id={sample.id} /></div>
            </div>
            <div className={styles.visualCatalogCardBody}>
              <span className={styles.visualCatalogTag}>
                {FAMILY_LABELS.find((f) => f.id === item.family)?.label ?? "Komponent"}
              </span>
              <h4>{item.title}</h4>
              <p>{item.samples.length > 1
                ? String(item.samples.length) + " varianty jedného prvku"
                : "Jeden dostupný náhľad"}</p>
              <button type="button" aria-pressed={chosen?.id === item.id}
                onClick={() => { setSelectedId(item.id); setVariantId(""); setRoutesLimit(12); }}>
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

      {chosen && variant && <section className={styles.visualCatalogDetail} aria-label="Detail vybraného komponentu">
        <div className={styles.visualCatalogDetailHead}>
          <div>
            <span>Vybraný komponent · skutočné vykreslenie s demo údajmi</span>
            <h3>{chosen.title}</h3>
          </div>
          <button type="button" onClick={onCompare}>Prejsť na porovnávanie</button>
        </div>
        {chosen.samples.length > 1 && <div className={styles.visualCatalogVariants}>
          <strong>Varianty toho istého komponentu</strong>
          <div>
            {chosen.samples.map((sample) => <button key={sample.id} type="button"
              aria-pressed={variant.id === sample.id}
              onClick={() => setVariantId(sample.id)}>{sample.title}</button>)}
          </div>
        </div>}
        <div className={styles.visualCatalogLargePreview} inert>
          <AdminComponentVisualPreview id={variant.id} />
        </div>
        <p className={styles.explanation}>{variant.description}</p>
        <div className={styles.visualCatalogUses}>
          <h4>Kde by sa mohol používať</h4>
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
        <details className={styles.visualCatalogTechnical}>
          <summary>Technické informácie (voliteľné)</summary>
          {chosen.paths.map((path) => <code key={path}>{path}</code>)}
        </details>
      </section>}

      <AdminVisualLibraryMissingPreviews registry={registry} />
      <p className={styles.nextStep}>Toto je prvá etapa vizuálneho katalógu.
        Zatiaľ sa nič automaticky nespája, nemaže ani nepublikuje.
        Reálne zlúčenie do jedného spoločného komponentu príde až po výbere a overení výskytov.</p>
    </section>
  );
}
