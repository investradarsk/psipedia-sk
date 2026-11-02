"use client";

import { useMemo, useState } from "react";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import { AdminComponentVisualPreview, adminComponentPreviewSamples } from "./admin-component-visual-preview";
import previewStyles from "./admin-component-visual-preview.module.css";
import styles from "./admin-component-registry.module.css";

type RegistryComponent = {
  name: string;
  label?: string;
  family?: string;
  path: string;
  routes: string[];
  consumers: string[];
  routeCount: number;
  shared: boolean;
  unreferenced: boolean;
  area: "public" | "admin" | "mixed";
};
type Registry = {
  version: number;
  generatedAt: string | null;
  totals: { components: number; pages: number; shared: number; unreferenced: number };
  sameNameCandidates: { name: string; paths: string[] }[];
  families?: {id:string;label:string}[];
  relatedGroups?: {id:string;title:string;description:string;paths:string[]}[];
  components: RegistryComponent[];
};

export function AdminComponentRegistry({ registry }: { registry: Registry }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [area, setArea] = useState("all");
  const [family, setFamily] = useState("all");
  const [previewStatus, setPreviewStatus] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const families = registry.families ?? [];
  const groups = registry.relatedGroups ?? [];
  const familyNames = Object.fromEntries(families.map(x=>[x.id,x.label]));
  const previewPaths = useMemo(() => new Set(adminComponentPreviewSamples.map(sample => sample.path)), []);
  const previewCount = registry.components.filter(component => previewPaths.has(component.path)).length;
  const items = useMemo(() => registry.components.filter((component) => {
    const searched = ((component.label ?? component.name) + " " + component.name + " " + component.path + " " +
      (familyNames[component.family ?? ""] ?? "") + " " + component.routes.join(" ")).toLocaleLowerCase("sk");
    if (!searched.includes(query.trim().toLocaleLowerCase("sk"))) return false;
    if (family !== "all" && component.family !== family &&
      !groups.some(group => group.id === family && group.paths.includes(component.path))) return false;
    if (previewStatus === "available" && !previewPaths.has(component.path)) return false;
    if (previewStatus === "missing" && previewPaths.has(component.path)) return false;
    if (scope === "shared" && !component.shared) return false;
    if (scope === "unreferenced" && !component.unreferenced) return false;
    if (scope === "single" && component.routeCount !== 1) return false;
    if (area === "public" && component.area === "admin") return false;
    if (area === "admin" && component.area === "public") return false;
    return true;
  }), [registry.components, query, scope, area, family, familyNames, groups, previewStatus, previewPaths]);
  const limited = showAll ? items : items.slice(0, 100);
  const previewSamples = adminComponentPreviewSamples.filter((sample) => {
    if (previewStatus === "missing") return false;
    if (family === "all" && !query.trim()) return sample.featured;
    if (family !== "all" && sample.family !== family &&
      !groups.some(group => group.id === family && group.paths.includes(sample.path))) return false;
    if (!query.trim()) return true;
    const search = query.trim().toLocaleLowerCase("sk");
    return (sample.title + " " + sample.description + " " + sample.path).toLocaleLowerCase("sk").includes(search)
      || items.some(component => component.path === sample.path);
  });

  return (
    <section className={styles.root} aria-label="Register komponentov a šablón">
      <div className={styles.stats}>
        <div><strong>{registry.totals.components}</strong><span>Komponentov</span></div>
        <div><strong>{registry.totals.pages}</strong><span>Stránkových vstupov</span></div>
        <div><strong>{registry.totals.shared}</strong><span>Zdieľaných komponentov</span></div>
        <div><strong>{registry.totals.unreferenced}</strong><span>Bez statického importéra</span></div>
      </div>
      <p className={styles.note}>
        Údaje sú odvodené zo statických importov zdrojového kódu počas zostavenia.
        Počet stránok znamená počet ciest k šablóne, nie počet jej zobrazení.
        Dynamické importy, runtime mapovanie a vizuálne podobné kópie sa nemusia zachytiť.
        Pri dynamických profiloch ide len o vzor trasy, nie o konkrétnu overenú URL.
        {registry.generatedAt ? " Posledné generovanie: " + new Date(registry.generatedAt).toLocaleString("sk-SK") + "." : " Register sa naplní pri ďalšom zostavení webu."}
      </p>
      <section className={styles.previewCoverage} aria-label="Pokrytie vizuálnymi náhľadmi">
        <strong>Vizuálny náhľad: {previewCount} z {registry.components.length} súborov</strong>
        <span>V galérii je {adminComponentPreviewSamples.length} bezpečných ukážok, pretože jeden komponent môže mať viac variantov.
          Zvyšné komponenty zostávajú evidované, ale bez samostatného živého náhľadu. Môžeš si otvoriť ich stránky použitia.</span>
      </section>
      {groups.length > 0 && (
        <section className={styles.familySection} aria-label="Podobné komponenty na kontrolu">
          <div className={styles.familyIntro}>
            <strong>Čo môže byť podobné?</strong>
            <span>Vyber skupinu. Toto sú kandidáti na kontrolu, nie automaticky potvrdené duplicity.</span>
          </div>
          <div className={styles.familyGrid}>
            {groups.map(group => (
              <button key={group.id} type="button"
                className={family === group.id ? styles.familySelected : styles.familyButton}
                aria-pressed={family === group.id}
                onClick={() => { setFamily(current=>current === group.id ? "all" : group.id); setQuery(""); }}>
                <strong>{group.title}</strong><span>{group.paths.length} príbuzných súborov</span>
              </button>
            ))}
          </div>
          {family !== "all" && groups.some(g=>g.id===family) &&
            <p className={styles.familyExplanation}>{groups.find(g=>g.id===family)?.description}</p>}
        </section>
      )}
      <section className={previewStyles.visualGallery} aria-label="Vizuálne náhľady komponentov" id="komponenty-nahlady">
        <header className={previewStyles.visualHeading}>
          <div>
            <strong>Vizuálne náhľady</strong>
            <p>Skutočné komponenty so vzorovým obsahom; žiadne dáta nemenia.
              Vyber typ komponentu alebo použi vyhľadávanie. Ukážky sa vykreslia až po rozbalení.</p>
          </div>
        </header>
        {previewSamples.length ? (
          <div className={previewStyles.visualList}>
            {previewSamples.map((sample, index) => (
              <VisualPreviewDisclosure key={sample.id} sample={sample}
                initiallyOpen={index === 0 && family === "all" && !query.trim()} />
            ))}
          </div>
        ) : (
          <p className={previewStyles.visualEmpty}>Pre túto skupinu zatiaľ nemáme bezpečnú vizuálnu ukážku. V zozname nižšie zostávajú technické súvislosti a stránky použitia.</p>
        )}
      </section>
      <div className={styles.filters}>
        <label>
          <span>Hľadať komponent, súbor alebo stránku</span>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Napr. banner, /plemena, karta" />
        </label>
        <label>
          <span>Typ komponentu</span>
          <select value={family} onChange={(e) => setFamily(e.target.value)}>
            <option value="all">Všetky typy</option>
            {families.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            <option value="other">Ostatné</option>
          </select>
        </label>
        <label>
          <span>Použitie</span>
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="all">Všetky</option>
            <option value="shared">Zdieľané (2+ stránok)</option>
            <option value="single">Na jednej stránke</option>
            <option value="unreferenced">Bez statického importéra</option>
          </select>
        </label>
        <label>
          <span>Živý náhľad</span>
          <select value={previewStatus} onChange={(e) => setPreviewStatus(e.target.value)}>
            <option value="all">Všetky komponenty</option>
            <option value="available">S náhľadom</option>
            <option value="missing">Bez náhľadu</option>
          </select>
        </label>
        <label>
          <span>Oblasť</span>
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="all">Verejný web aj admin</option>
            <option value="public">Verejný web</option>
            <option value="admin">Administrácia</option>
          </select>
        </label>
      </div>
      <div className={styles.headline}>
        <strong>Nájdené: {items.length}</strong>
        {items.length > limited.length && <span>Zobrazených prvých {limited.length} z {items.length}.</span>}
      </div>
      <div className={styles.results}>
        {limited.map((component) => (
          <details key={component.path} className={styles.item}>
            <summary>
              <span className={styles.title}>
                <strong>{component.label ?? component.name}</strong>
                <small>{component.path}</small>
              </span>
              <span className={styles.meta}>
                {component.shared && <em>Zdieľaný</em>}
                {component.unreferenced && <em>Nezistené použitie</em>}
                <b>{component.routeCount} stránok</b>
              </span>
            </summary>
            <div className={styles.detail}>
              {previewPaths.has(component.path) ? (
                <div className={styles.inlinePreview}>
                  <strong>Vizuálne varianty ({adminComponentPreviewSamples.filter(sample => sample.path === component.path).length})</strong>
                  {adminComponentPreviewSamples.filter(sample => sample.path === component.path).map(sample => (
                    <VisualPreviewDisclosure key={sample.id} sample={sample} />
                  ))}
                </div>
              ) : (
                <p className={styles.noPreview}>Tento komponent zatiaľ nemá bezpečný samostatný náhľad.
                  Nižšie sú stránky, na ktorých môžeš vidieť jeho použitie.</p>
              )}
              <details className={styles.technical}>
                <summary>Technické informácie</summary>
                <a href={"https://github.com/investradarsk/psipedia-sk/blob/main/" + component.path}
                  target="_blank" rel="noopener noreferrer">Otvoriť zdrojový súbor na GitHube</a>
                <h3>Priami importéri ({component.consumers.length})</h3>
                {component.consumers.length ? (
                  <ul>{component.consumers.map((consumer) => (
                    <li key={consumer}><code>{consumer}</code></li>
                  ))}</ul>
                ) : <p>Bez priameho statického importéra.</p>}
              </details>
              <h3>Na ktorých stránkach môže byť použitý</h3>
              {component.routes.length ? (
                <ul>{component.routes.map((route) => (
                  <li key={route}>{publicRegistryRouteHref(route)
                    ? <a href={route} target="_blank" rel="noopener noreferrer">{route} – otvoriť stránku</a>
                    : <span><code>{route}</code> <small>Šablóna / dynamická adresa – konkrétna URL nie je známa</small></span>}
                  </li>
                ))}</ul>
              ) : <p>Nenašla sa cesta zo stránkového vstupu. Môže ísť o nevyužitý alebo dynamicky načítavaný komponent.</p>}
            </div>
          </details>
        ))}
        {items.length === 0 && <p className={styles.empty}>Pre zadané filtre sa nenašli komponenty.</p>}
      </div>
      {items.length > limited.length && (
        <button type="button" className={styles.loadMore} onClick={() => setShowAll(true)}>
          Zobraziť všetkých {items.length} komponentov
        </button>
      )}
      {showAll && items.length > 100 && (
        <button type="button" className={styles.loadMore} onClick={() => setShowAll(false)}>
          Zobraziť iba prvých 100
        </button>
      )}
      {registry.sameNameCandidates.length > 0 && (
        <section className={styles.duplicates}>
          <h2>Kandidáti na kontrolu duplicitných názvov</h2>
          <p>Rovnaký názov súboru neznamená rovnaký komponent. Nič sa automaticky nemaže ani nespája.</p>
          {registry.sameNameCandidates.slice(0, 30).map((candidate) => (
            <details key={candidate.name}>
              <summary>{candidate.name} ({candidate.paths.length})</summary>
              <ul>{candidate.paths.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
            </details>
          ))}
        </section>
      )}
    </section>
  );
}

/** Render complex public components only after explicit expansion to keep admin responsive. */
function VisualPreviewDisclosure({ sample, initiallyOpen = false }: {
  sample: (typeof adminComponentPreviewSamples)[number];
  initiallyOpen?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyOpen);
  return (
    <details className={previewStyles.visualSample} open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>
        <span className={previewStyles.visualSampleTitle}>
          <strong>{sample.title}</strong>
          <small>{sample.description}</small>
        </span>
      </summary>
      {expanded && (
        <>
          <div className={previewStyles.visualStage} inert aria-hidden="true">
            <AdminComponentVisualPreview id={sample.id} />
          </div>
          <div className={previewStyles.visualCaption}>
            Vzorový obsah · skutočný komponent · bez aktívnych odkazov
          </div>
        </>
      )}
    </details>
  );
}
