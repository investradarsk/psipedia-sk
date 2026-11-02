"use client";

import { useMemo, useState } from "react";
import {
  adminComponentPreviewSamples,
  AdminComponentVisualPreview,
} from "@/components/admin-component-visual-preview";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import type { CoverageRegistry } from "@/components/admin-visual-library-coverage";
import styles from "./admin-visual-library.module.css";

type RouteFilter = "all" | "static" | "dynamic" | "missing-preview";

const PAGE_SIZE = 45;

/**
 * Source-route inventory only. A transitive import is a possible dependency,
 * NOT proof that a visual node is visible on a particular public page.
 * Concrete published profile URLs live in the separate D1-based inventory.
 */
export function AdminVisualLibraryRouteAudit({ registry }: { registry: CoverageRegistry }) {
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<RouteFilter>("all");
  const [selectedSource, setSelectedSource] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selectedPreview, setSelectedPreview] = useState("");

  const inventory = useMemo(() => {
    const previews = new Map<string, (typeof adminComponentPreviewSamples)[number][]>();
    for (const sample of adminComponentPreviewSamples) {
      const group = previews.get(sample.path) ?? [];
      group.push(sample);
      previews.set(sample.path, group);
    }
    return (registry.routeEntries ?? [])
      .filter((route) => route.area === "public")
      .map((route) => {
        const candidates = registry.components.filter((component) =>
          component.area !== "admin" && component.routes.includes(route.route)
        );
        const sampleCount = candidates.reduce((total, component) =>
          total + (previews.get(component.path)?.length ?? 0), 0);
        return { ...route, candidates, sampleCount };
      });
  }, [registry]);

  const normalized = search.trim().toLocaleLowerCase("sk");
  const matching = inventory.filter((route) =>
    (kind === "all" ||
      (kind === "static" && !route.dynamic) ||
      (kind === "dynamic" && route.dynamic) ||
      (kind === "missing-preview" && route.sampleCount === 0)) &&
    (!normalized || [
      route.route, route.source,
      ...route.candidates.flatMap((c) => [c.name, c.label ?? "", c.path]),
    ].join(" ").toLocaleLowerCase("sk").includes(normalized))
  );
  const selected = matching.find((route) => route.source === selectedSource) ?? matching[0];
  const publicHref = selected ? publicRegistryRouteHref(selected.route) : null;
  const samples = selected
    ? adminComponentPreviewSamples.filter((sample) =>
      selected.candidates.some((component) => component.path === sample.path))
    : [];
  const preview = samples.find((sample) => sample.id === selectedPreview) ?? samples[0];

  return (
    <section className={styles.dynamicCoverage} aria-label="Pokrytie všetkých verejných stránok">
      <div className={styles.usageHead}>
        <div>
          <h4>Inventár stránok z kódu</h4>
          <p>
            Všetky verejné stránkové vstupy z aktuálne zostaveného projektu,
            vrátane právnych stránok a dynamických šablón.
            Ukazuje kandidátov podľa importov, nie potvrdený vizuálny výskyt.
          </p>
        </div>
        <strong>{inventory.length} šablón</strong>
      </div>

      {registry.routeEntries === undefined && <p className={styles.pending}>
        Táto zostava registra ešte neobsahuje úplný zoznam stránkových súborov.
        Over obnovu registra pri zostavení; nič neoznačujeme za kompletné.
      </p>}
      <div className={styles.controls}>
        <label>
          <span>Hľadať stránku, komponent alebo súbor</span>
          <input type="search" value={search}
            onChange={(event) => { setSearch(event.target.value); setSelectedSource(""); setLimit(PAGE_SIZE); setSelectedPreview(""); }}
            placeholder="Napr. /adresar, kontakt, privacy, footer" />
        </label>
        <label>
          <span>Zobraziť šablóny</span>
          <select value={kind} onChange={(event) => {
            setKind(event.target.value as RouteFilter);
            setSelectedSource(""); setLimit(PAGE_SIZE); setSelectedPreview("");
          }}>
            <option value="all">Všetky verejné stránky</option>
            <option value="static">Priamo otvoriteľné stránky</option>
            <option value="dynamic">Dynamické šablóny profilov</option>
            <option value="missing-preview">Bez dostupného náhľadu</option>
          </select>
        </label>
      </div>

      <div className={styles.workspace}>
        <aside className={styles.catalog} aria-label="Verejné stránky">
          <strong>Nájdené: {matching.length}</strong>
          <div className={styles.catalogItems}>
            {matching.slice(0, limit).map((route) => (
              <button type="button" key={route.source} className={styles.catalogItem}
                aria-pressed={selected?.source === route.source}
                onClick={() => { setSelectedSource(route.source); setSelectedPreview(""); }}>
                <span>{route.route}</span>
                <small>
                  {route.dynamic ? "Dynamická šablóna" : "Statická stránka"} ·
                  {" "}{route.candidates.length} možných komponentov ·
                  {" "}{route.sampleCount} ukážok
                </small>
              </button>
            ))}
            {!matching.length && <p>Pre zadaný filter sa nenašli stránky.</p>}
          </div>
          {matching.length > limit &&
            <button type="button" className={styles.moreButton}
              onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              Zobraziť ďalšie ({matching.length - limit})
            </button>}
        </aside>

        {selected ? <article className={styles.details}>
          <div className={styles.detailHead}>
            <div>
              <span>{selected.dynamic ? "Dynamická šablóna" : "Stránková šablóna"}</span>
              <h3>{selected.route}</h3>
            </div>
            <span className={styles.readOnly}>Audit bez zmien</span>
          </div>
          <p className={styles.explanation}>
            Súbor: <code>{selected.source}</code>
          </p>
          {publicHref
            ? <a href={publicHref} className={styles.moreButton}
                style={{width:"fit-content",textDecoration:"none"}}
                target="_blank" rel="noopener noreferrer">
                Otvoriť verejnú stránku
              </a>
            : <p className={styles.pending}>
                Ide o vzor URL, nie o konkrétny profil. Skutočné publikované URL
                sú nižšie v samostatnom databázovom zozname.
              </p>}
          <div className={styles.usageHead}>
            <div><h4>Možné vizuálne komponenty</h4>
              <p>Tranzitívna závislosť v kóde môže byť podmienená dátami alebo typom profilu.</p>
            </div>
            <strong>{selected.candidates.length}</strong>
          </div>
          {selected.candidates.length ? <ul className={styles.usages}>
            {selected.candidates.slice(0, 75).map((item) => (
              <li key={item.path}>
                <div>
                  <strong>{item.label ?? item.name}</strong>
                  <code>{item.path}</code>
                  <small>
                    {adminComponentPreviewSamples.some((sample) => sample.path === item.path)
                      ? "Náhľad existuje" : "Náhľad zatiaľ chýba"}
                  </small>
                </div>
              </li>
            ))}
          </ul> : <p className={styles.pending}>
            Statický register nepozná k tejto šablóne vizuálne komponenty.
            Môže používať dynamické importy alebo ich treba samostatne preveriť.
          </p>}
          {selected.candidates.length > 75 && <p className={styles.explanation}>
            Zobrazených prvých 75 z {selected.candidates.length} kandidátov.
            Zostávajúce sú stále zarátané.
          </p>}

          {samples.length > 0 && <div className={styles.dynamicCoverage}>
            <div className={styles.usageHead}>
              <div><h4>Dostupné živé ukážky kandidátov</h4>
                <p>Bez záruky, že sa tento variant na konkrétnej stránke zobrazuje.</p>
              </div>
              <strong>{samples.length}</strong>
            </div>
            <label className={styles.usageSearch}>
              <span>Vybrať náhľad</span>
              <select value={preview?.id ?? ""} onChange={(event) => setSelectedPreview(event.target.value)}>
                {samples.map((sample) =>
                  <option key={sample.id} value={sample.id}>{sample.title}</option>)}
              </select>
            </label>
            {preview && <div className={styles.preview}>
              <div className={styles.previewComponent} inert>
                <AdminComponentVisualPreview id={preview.id}/>
              </div>
            </div>}
          </div>}
          <p className={styles.nextStep}>
            Tu sa nič neupravuje. Presné umiestnenie komponentu musí najprv
            potvrdiť individuálna kontrola konkrétnej URL alebo jej renderu.
          </p>
        </article> : <p className={styles.empty}>Vyber stránku z inventára.</p>}
      </div>
    </section>
  );
}
