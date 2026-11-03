"use client";

import { useMemo, useState } from "react";
import inventory from "@/lib/generated/visual-library-public-inventory.json";
import { adminComponentPreviewSamples } from "@/components/admin-component-visual-preview";
import type { CoverageRegistry } from "@/components/admin-visual-library-coverage";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import styles from "./admin-visual-library.module.css";

type Coverage = "live-preview" | "server-preview" | "page-composite" | "nonvisual" | "needs-preview";
const NAMES: Record<Coverage, string> = {
  "live-preview": "Živý náhľad",
  "server-preview": "Serverový náhľad",
  "page-composite": "Celá stránka / zostava",
  "nonvisual": "Bez samostatného vzhľadu",
  "needs-preview": "Chýba náhľad",
};
const DETAILS: Record<Coverage, string> = {
  "live-preview": "Reálny pôvodný React komponent sa vykresľuje v katalógu s ukážkovými údajmi.",
  "server-preview": "Reálny komponent sa vykresľuje na serveri v existujúcich ukážkach.",
  "page-composite": "Zdroj tvorí celú stránku alebo zložený blok. Potrebuje vizuálny dôkaz stránky; nemožno ho považovať za samostatný hotový náhľad.",
  "nonvisual": "Pomocná funkcionalita bez samostatného vizuálneho výstupu; klasifikovaná explicitne, nie podľa názvu.",
  "needs-preview": "Komponent v súčasnom katalógu nemá nezávislý náhľad ani overený screenshot.",
};
const PAGE = 30;

/**
 * Full tracked-source inventory. Never hides unpreviewed components under a
 * generic "other" category. Source routes are candidate paths, not verified
 * screenshot or DOM observations.
 */
export function AdminVisualLibraryFullInventory({
  registry, onOpenPreview,
}: {
  registry: CoverageRegistry;
  onOpenPreview: (path: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Coverage | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState(false);
  const entries = useMemo(() => {
    const live = new Set(adminComponentPreviewSamples.map((sample) => sample.path));
    const fromRegistry = new Map(registry.components.map((entry) => [entry.path, entry]));
    const snapshot = new Set(inventory.files.map((entry) => entry.path));
    const known = inventory.files.map((entry) => ({
      path: entry.path,
      coverage: (live.has(entry.path) ? "live-preview" : entry.coverage) as Coverage,
      routes: fromRegistry.get(entry.path)?.routes ?? [],
    }));
    // Never silently drop a newly added TSX source before the snapshot is refreshed.
    const additional = registry.components
      .filter((entry) => entry.area !== "admin" && entry.path.endsWith(".tsx") &&
        entry.path.startsWith("components/") && !entry.path.startsWith("components/admin-") &&
        !snapshot.has(entry.path))
      .map((entry) => ({
        path: entry.path,
        coverage: (live.has(entry.path) ? "live-preview" : "needs-preview") as Coverage,
        routes: entry.routes,
      }));
    return [...known, ...additional].sort((a,b) => a.path.localeCompare(b.path, "sk"));
  }, [registry.components]);
  const stats = useMemo(() => {
    const summary = { "live-preview": 0, "server-preview": 0,
      "page-composite": 0, "nonvisual": 0, "needs-preview": 0 };
    for (const entry of entries) summary[entry.coverage]++;
    return summary;
  }, [entries]);

  const normalized = query.toLocaleLowerCase("sk").trim();
  const matched = entries.filter((entry) =>
    (status === "all" || entry.coverage === status) &&
    (!normalized || [entry.path, entry.path.split("/").pop(), ...entry.routes]
      .join(" ").toLocaleLowerCase("sk").includes(normalized))
  );

  return (
    <section className={styles.fullCoverageInventory} aria-label="Úplný inventár verejných zdrojových komponentov">
      <div className={styles.fullCoverageHeader}>
        <div>
          <h4>Kompletný inventár verejných komponentov</h4>
          <p>Jednoznačný stav pre každý súbor. Počet grafických variantov nie je
            počet pokrytých komponentov; pomocné moduly ani celé stránky
            nevydávame za hotové živé náhľady.</p>
        </div>
        <strong>{entries.length} súborov</strong>
      </div>
      <div className={styles.fullCoverageStats}>
        <span>{stats["live-preview"] + stats["server-preview"]} s reálnym náhľadom</span>
        <span>{stats["page-composite"]} celých stránok / zostáv</span>
        <span>{stats.nonvisual} technických bez vzhľadu</span>
        <span>{stats["needs-preview"]} bez samostatného náhľadu</span>
      </div>
      {registry.components.length === 0 && <p className={styles.pending}>
        Zoznam súborov je dostupný aj bez buildového registra.
        Kandidátske trasy sa doplnia až pri jeho načítaní.
      </p>}
      <button type="button" className={styles.moreButton} aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}>
        {expanded ? "Zatvoriť úplný inventár" : "Otvoriť všetky zdrojové komponenty a stav náhľadov"}
      </button>
      {expanded && <>
        <div className={styles.fullCoverageControls}>
          <label><span>Hľadať zdroj alebo trasu</span>
            <input type="search" value={query}
              onChange={(value) => { setQuery(value.target.value); setLimit(PAGE); }}
              placeholder="napr. adopcia, článok, filter..." />
          </label>
          <label><span>Stav pokrytia</span>
            <select value={status}
              onChange={(value) => { setStatus(value.target.value as Coverage | "all"); setLimit(PAGE); }}>
              <option value="all">Všetky ({entries.length})</option>
              {Object.entries(NAMES).map(([key,label]) => <option key={key} value={key}>
                {label} ({stats[key as Coverage]})
              </option>)}
            </select>
          </label>
        </div>
        <p className={styles.explanation}>Zobrazených {Math.min(matched.length,limit)} z {matched.length}.
          Každý súbor má jednu explicitnú klasifikáciu.</p>
        <ul className={styles.usages}>
          {matched.slice(0,limit).map((entry) => {
            const hrefs = entry.routes.map((route) => ({route,href:publicRegistryRouteHref(route)}))
              .filter((route):route is {route:string;href:string} => Boolean(route.href));
            return <li key={entry.path}>
              <div>
                <strong>{entry.path.split("/").pop()?.replace(/\.tsx$/, "").replace(/-/g," ")}</strong>
                <code>{entry.path}</code>
                <small><b>{NAMES[entry.coverage]}</b> – {DETAILS[entry.coverage]}</small>
                {entry.routes.length > 0 && <small>Možné šablóny podľa importov:
                  {" "}{entry.routes.slice(0,3).join(", ")}{entry.routes.length > 3 ? "…" : ""}
                </small>}
                {hrefs.length > 0 && <small>
                  <a href={hrefs[0].href} target="_blank" rel="noopener noreferrer">
                    Otvoriť súvisiacu stránku (kandidát podľa importov)
                  </a>
                </small>}
              </div>
              <div className={styles.fullCoverageActions}>
                {(entry.coverage === "live-preview" || entry.coverage === "server-preview") &&
                  <button type="button" onClick={() => onOpenPreview(entry.path)}>Zobraziť náhľad</button>}
                <a target="_blank" rel="noopener noreferrer"
                  href={"https://github.com/investradarsk/psipedia-sk/blob/main/" + entry.path}>
                  Zdrojový kód
                </a>
              </div>
            </li>;
          })}
        </ul>
        {matched.length > limit && <button type="button" className={styles.moreButton}
          onClick={() => setLimit((n) => n + PAGE)}>
          Zobraziť ďalšie ({matched.length - limit})
        </button>}
        {matched.length === 0 && <p className={styles.pending}>Žiadne súbory nezodpovedajú filtru.</p>}
      </>}
    </section>
  );
}
