"use client";

import { useMemo, useState } from "react";
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

/** No fabricated URLs: dynamic route patterns are not individual profile URLs. */
function concreteRoute(route: string) {
  return new RegExp("^/[A-Za-z0-9/_-]*$").test(route) && !route.startsWith("/admin");
}

export function AdminComponentRegistry({ registry }: { registry: Registry }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("all");
  const [area, setArea] = useState("all");
  const [family, setFamily] = useState("all");
  const families = registry.families ?? [];
  const groups = registry.relatedGroups ?? [];
  const familyNames = Object.fromEntries(families.map(x=>[x.id,x.label]));
  const items = useMemo(() => registry.components.filter((component) => {
    const searched = ((component.label ?? component.name) + " " + component.name + " " + component.path + " " +
      (familyNames[component.family ?? ""] ?? "") + " " + component.routes.join(" ")).toLocaleLowerCase("sk");
    if (!searched.includes(query.trim().toLocaleLowerCase("sk"))) return false;
    if (family !== "all" && component.family !== family) return false;
    if (scope === "shared" && !component.shared) return false;
    if (scope === "unreferenced" && !component.unreferenced) return false;
    if (scope === "single" && component.routeCount !== 1) return false;
    if (area === "public" && component.area === "admin") return false;
    if (area === "admin" && component.area === "public") return false;
    return true;
  }), [registry.components, query, scope, area, family, familyNames]);
  const limited = items.slice(0, 100);

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
        {items.length > limited.length && <span>Zobrazených prvých {limited.length}. Spresni filter.</span>}
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
                  <li key={route}>{concreteRoute(route)
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
