"use client";

import { useMemo, useState } from "react";
import { adminComponentPreviewSamples } from "@/components/admin-component-visual-preview";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import type { CoverageRegistry } from "@/components/admin-visual-library-coverage";
import styles from "./admin-visual-library.module.css";

type Family = "banner" | "hero" | "cta" | "card" | "filter" | "category" | "other";
const PAGE = 30;

/** Expose missing preview coverage without pretending an import is a render. */
export function AdminVisualLibraryMissingPreviews({
  registry, fixedFamily,
}: {
  registry: CoverageRegistry;
  fixedFamily?: Family;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState(false);
  const records = useMemo(() => {
    const withPreview = new Set(adminComponentPreviewSamples.map((sample) => sample.path));
    return registry.components
      .filter((item) => item.area !== "admin" && !withPreview.has(item.path))
      .filter((item) => !fixedFamily || (item.family ?? "other") === fixedFamily)
      .sort((a, b) => (a.label ?? a.name).localeCompare(b.label ?? b.name, "sk"));
  }, [registry.components, fixedFamily]);

  const normalized = query.trim().toLocaleLowerCase("sk");
  const found = records.filter((item) =>
    !normalized || [item.label ?? item.name, item.name, item.path, ...item.routes]
      .join(" ").toLocaleLowerCase("sk").includes(normalized)
  );

  return (
    <section className={styles.dynamicCoverage} aria-label="Komponenty bez náhľadu">
      <div className={styles.usageHead}>
        <div>
          <h4>Komponenty, ktorým ešte chýba náhľad</h4>
          <p>
            Úplný zoznam ostatných verejných komponentových súborov zo statického registra.
            Niektoré sú pomocné moduly, ktoré ani nemajú samostatný viditeľný vzhľad.
          </p>
        </div>
        <strong>{records.length} bez náhľadu</strong>
      </div>
      {registry.components.length === 0 && <p className={styles.pending}>
        Register nie je naplnený; počet chýbajúcich komponentov nemožno overiť.
      </p>}
      <button className={styles.moreButton} type="button"
        aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        {expanded ? "Skryť chýbajúce náhľady" : "Zobraziť zoznam chýbajúcich náhľadov"}
      </button>
      {expanded && <>
        <label className={styles.usageSearch}>
          <span>Hľadať chýbajúci prvok</span>
          <input type="search" value={query}
            onChange={(event) => { setQuery(event.target.value); setLimit(PAGE); }}
            placeholder="Napr. footer, profil, karta, /podujatia" />
        </label>
        <p className={styles.explanation}>
          Nájdených: {found.length}. Každá položka má zatiaľ len zdrojové
          závislosti a kandidátske stránky, nie overený náhľad.
        </p>
        <ul className={styles.usages}>
          {found.slice(0, limit).map((item) => {
            const staticRoutes = item.routes
              .map((route) => ({route, href:publicRegistryRouteHref(route)}))
              .filter((route): route is {route:string;href:string} => route.href !== null);
            return <li key={item.path}>
              <div>
                <strong>{item.label ?? item.name}</strong>
                <code>{item.path}</code>
                <small>{item.routes.length} možných stránkových šablón (podľa kódu)</small>
                {staticRoutes.length > 0 && <small>
                  Príklady: {staticRoutes.slice(0, 3).map((entry) => entry.route).join(", ")}
                </small>}
                {item.routes.some((route) => route.includes("[")) && <small>
                  Obsahuje dynamické šablóny; konkrétne profilové URL nie sú overené.
                </small>}
              </div>
              <a target="_blank" rel="noopener noreferrer"
                href={"https://github.com/investradarsk/psipedia-sk/blob/main/" + item.path}>
                Zdrojový súbor
              </a>
            </li>;
          })}
        </ul>
        {found.length > limit && <button type="button" className={styles.moreButton}
          onClick={() => setLimit((n) => n + PAGE)}>
          Zobraziť ďalšie ({found.length - limit})
        </button>}
        {found.length === 0 && <p className={styles.pending}>
          V tejto skupine už nie sú ďalšie známe komponenty bez náhľadu
          alebo nič nezodpovedá hľadaniu.
        </p>}
      </>}
    </section>
  );
}
