"use client";

import { useMemo, useState } from "react";
import {
  AdminComponentVisualPreview,
  adminComponentPreviewSamples,
} from "@/components/admin-component-visual-preview";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import type { CoverageRegistry } from "@/components/admin-visual-library-coverage";
import styles from "./admin-visual-library.module.css";

type SampleFamily = (typeof adminComponentPreviewSamples)[number]["family"];

const FAMILY_LABELS: readonly { id: SampleFamily; label: string }[] = [
  { id: "banner", label: "Bannery" },
  { id: "hero", label: "Hero a hlavičky" },
  { id: "cta", label: "CTA a tlačidlá" },
  { id: "card", label: "Karty" },
  { id: "filter", label: "Vyhľadávanie a filtre" },
  { id: "category", label: "Navigácia a kategórie" },
  { id: "other", label: "Ostatné prvky" },
];

/** The demo gallery is deliberately read-only and admin-only.
 * Source import routes are possibilities, not verified visual placements.
 * Only the separately audited banner catalogue may publish edits.
 */
export function AdminVisualLibraryGallery({
  registry, fixedFamily,
}: {
  registry: CoverageRegistry;
  fixedFamily?: SampleFamily;
}) {
  const [search, setSearch] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<SampleFamily | "all">(fixedFamily ?? "all");
  const [selectedId, setSelectedId] = useState<string>("");

  const catalog = useMemo(() => {
    const sources = new Map(registry.components.map((component) => [component.path, component]));
    return adminComponentPreviewSamples.map((sample) => ({
      sample,
      component: sources.get(sample.path),
    }));
  }, [registry.components]);

  const family = fixedFamily ?? selectedFamily;
  const normalizedSearch = search.trim().toLocaleLowerCase("sk");
  const matches = catalog.filter(({ sample, component }) =>
    (family === "all" || sample.family === family) &&
    (!normalizedSearch || [
      sample.title, sample.description, sample.path, sample.id,
      ...(component?.routes ?? []),
    ].join(" ").toLocaleLowerCase("sk").includes(normalizedSearch))
  );
  const chosen = matches.find(({ sample }) => sample.id === selectedId) ?? matches[0];
  const routes = chosen?.component?.routes ?? [];
  const staticRoutes = routes
    .map((route) => ({ route, href: publicRegistryRouteHref(route) }))
    .filter((item): item is { route: string; href: string } => item.href !== null);
  const dynamicRoutes = routes.filter((route) => publicRegistryRouteHref(route) === null);

  return (
    <section className={styles.dynamicCoverage} aria-label="Galéria reálnych komponentov">
      <div className={styles.usageHead}>
        <div>
          <h4>{fixedFamily ? "Ďalšie varianty z existujúcich komponentov" : "Galéria skutočných vizuálnych prvkov"}</h4>
          <p>
            Ukážky používajú pôvodné React komponenty s demo obsahom. Nie sú to
            fotografie každej verejnej stránky ani dôkaz výskytu na každej URL.
          </p>
        </div>
        <strong>{matches.length} / {adminComponentPreviewSamples.length} náhľadov</strong>
      </div>

      <div className={styles.controls}>
        <label>
          <span>Hľadať podľa názvu, súboru alebo stránky</span>
          <input type="search" value={search}
            onChange={(event) => { setSearch(event.target.value); setSelectedId(""); }}
            placeholder="Napr. veterinári, vyhľadávanie, /plemena" />
        </label>
        {!fixedFamily && <label>
          <span>Typ prvku</span>
          <select value={selectedFamily} onChange={(event) => {
            setSelectedFamily(event.target.value as SampleFamily | "all");
            setSelectedId("");
          }}>
            <option value="all">Všetky typy</option>
            {FAMILY_LABELS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>}
      </div>

      <div className={styles.workspace}>
        <aside className={styles.catalog} aria-label="Varianty komponentov">
          <strong>Vyber prvok ({matches.length})</strong>
          <div className={styles.catalogItems}>
            {matches.map(({ sample }) => (
              <button type="button" key={sample.id} className={styles.catalogItem}
                aria-pressed={chosen?.sample.id === sample.id}
                onClick={() => setSelectedId(sample.id)}>
                <span>{sample.title}</span>
                <small>{sample.description}</small>
              </button>
            ))}
            {matches.length === 0 && <p>Žiadny náhľad nezodpovedá hľadaniu.</p>}
          </div>
        </aside>

        {chosen ? <article key={chosen.sample.id} className={styles.details}>
          <div className={styles.detailHead}>
            <div>
              <span>Skutočný komponent · ukážkové údaje</span>
              <h3>{chosen.sample.title}</h3>
            </div>
            <span className={styles.readOnly}>Iba náhľad</span>
          </div>
          <p className={styles.explanation}>{chosen.sample.description}</p>
          <div className={styles.preview}>
            <div className={styles.previewComponent} inert>
              <AdminComponentVisualPreview id={chosen.sample.id} />
            </div>
          </div>
          <div className={styles.usageHead}>
            <div>
              <h4>Zdroj a možné miesta použitia</h4>
              <p>
                Zoznam pochádza zo statických importov. Samotný import nepotvrdzuje,
                že sa komponent na danej URL naozaj zobrazí.
              </p>
            </div>
            <strong>{routes.length} kandidátov</strong>
          </div>
          <p className={styles.explanation}>
            Zdrojový komponent: <code>{chosen.sample.path}</code>
          </p>
          <a className={styles.moreButton} style={{width:"fit-content",textDecoration:"none"}}
            href={"https://github.com/investradarsk/psipedia-sk/blob/main/" + chosen.sample.path}
            target="_blank" rel="noopener noreferrer">
            Otvoriť zdroj komponentu
          </a>
          {staticRoutes.length ? <ul className={styles.usages}>
            {staticRoutes.slice(0, 50).map(({ route, href }) => (
              <li key={route}>
                <div><strong>{route}</strong><small>Možné použitie podľa kódu</small></div>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  Otvoriť stránku
                </a>
              </li>
            ))}
          </ul> : <p className={styles.pending}>
            K tomuto súboru zatiaľ nie je priradená žiadna bezpečne otvoriteľná statická verejná URL.
          </p>}
          {staticRoutes.length > 50 && <p className={styles.explanation}>
            Zobrazených prvých 50 statických kandidátov z {staticRoutes.length}.
          </p>}
          {dynamicRoutes.length > 0 && <div>
            <strong>Dynamické šablóny ({dynamicRoutes.length})</strong>
            <p className={styles.explanation}>
              Ide o vzory ciest, nie o overené URL konkrétnych profilov.
              Publikované profily nájdeš v záložke „Kde všade sa používa“.
            </p>
            <ul className={styles.usages}>
              {dynamicRoutes.slice(0, 30).map((route) => (
                <li key={route}><code>{route}</code></li>
              ))}
            </ul>
          </div>}
          {registry.components.length === 0 && <p className={styles.pending}>
            Statický register sa v tejto zostave nenačítal. Náhľady fungujú,
            ale možnosť priradiť komponent k stránkam zatiaľ nie je potvrdená.
          </p>}
          <p className={styles.nextStep}>
            Galéria nič neupravuje ani nepublikuje. Bezpečný editor je samostatne
            pri overených banneroch. Mobilný verejný dizajn sa nemení.
          </p>
        </article> : <p className={styles.empty}>Skús iné hľadanie alebo kategóriu.</p>}
      </div>
    </section>
  );
}
