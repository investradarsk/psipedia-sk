"use client";

import { useMemo, useState } from "react";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import {
  AdminComponentVisualPreview, adminComponentPreviewSamples,
} from "@/components/admin-component-visual-preview";
import {
  findVisualSourceCandidates, type VisualSourceCandidate,
} from "@/lib/visual-library-source-comparison";
import type { CoverageRegistry } from "@/components/admin-visual-library-coverage";
import styles from "./admin-visual-library.module.css";

const ROUTES_PAGE = 30;

export function AdminVisualLibrarySourceSimilarity({
  registry,
}: {
  registry: CoverageRegistry;
}) {
  const candidates = useMemo(
    () => findVisualSourceCandidates(registry.components, registry.relatedGroups ?? []),
    [registry],
  );
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState("");
  const [showRoutes, setShowRoutes] = useState(ROUTES_PAGE);
  const [copied, setCopied] = useState<"idle" | "yes" | "error">("idle");
  const [leftVariant, setLeftVariant] = useState("");
  const [rightVariant, setRightVariant] = useState("");

  const searched = query.trim().toLocaleLowerCase("sk");
  const filtered = candidates.filter((candidate) =>
    !searched || [candidate.group, candidate.leftPath, candidate.rightPath,
      candidate.explanation, ...candidate.affectedRoutes].join(" ")
      .toLocaleLowerCase("sk").includes(searched),
  );
  const chosen = filtered.find((candidate) => candidate.id === selection) ?? filtered[0];
  const components = new Map(registry.components.map((component) => [component.path, component]));

  const select = (candidate: VisualSourceCandidate) => {
    setSelection(candidate.id);
    setShowRoutes(ROUTES_PAGE);
    setCopied("idle");
    setLeftVariant("");
    setRightVariant("");
  };

  const copyReview = () => {
    if (!chosen) return;
    const report = [
      "Psipedia – audit podobných zdrojových komponentov (bez publikovania)",
      "Dôvod: " + chosen.explanation,
      "A: " + chosen.leftPath,
      "CSS A: " + (chosen.leftStyleModules.join(", ") || "bez samostatného CSS modulu"),
      "B: " + chosen.rightPath,
      "CSS B: " + (chosen.rightStyleModules.join(", ") || "bez samostatného CSS modulu"),
      "Spoločné kandidátske šablóny: " + chosen.sharedRoutes.join(", "),
      "Všetky dotknuté kandidátske šablóny: " + chosen.affectedRoutes.join(", "),
      "Import neznamená overené vykreslenie; dynamické URL nie sú konkrétne profily.",
      "Pred návrhom zmien over vizuál, CSS pravidlá a skutočné URL; mobil neupravovať.",
    ].join("\n");
    void navigator.clipboard.writeText(report)
      .then(() => setCopied("yes"), () => setCopied("error"));
  };

  return (
    <section className={styles.similarity} aria-label="Podobné zdrojové komponenty a CSS">
      <div className={styles.similarityIntro}>
        <h3>Podobné komponenty v zdrojovom kóde</h3>
        <p>
          Rozšírená kontrola už nie je obmedzená na bannery. Porovnáva pomenovanie,
          príbuzný účel, importované CSS moduly a možné verejné trasy. Ide o
          <strong> návrhy na audit, nie potvrdené duplicity alebo chybné CSS.</strong>
        </p>
      </div>
      <div className={styles.usageHead}>
        <div><h4>Kandidáti na preverenie</h4>
          <p>Vyber dvojicu a pozri si spoločný zdroj, CSS a dopad na šablóny.</p></div>
        <strong>{candidates.length} dvojíc</strong>
      </div>
      <label className={styles.usageSearch}>
        <span>Hľadať komponent, CSS alebo stránku</span>
        <input value={query} type="search" onChange={(event) => {
          setQuery(event.target.value); setSelection(""); setShowRoutes(ROUTES_PAGE);
        }} placeholder="Napr. hero, banner, karta, /adresar" />
      </label>
      {registry.relatedGroups === undefined && <p className={styles.pending}>
        Zostavený register nemá zoznam príbuzných skupín; porovnanie môže byť
        neúplné. Žiadne podobnosti z tohto dôvodu neoznačujeme za potvrdené.
      </p>}
      <div className={styles.workspace}>
        <aside className={styles.catalog} aria-label="Zdrojové dvojice na audit">
          <strong>Nájdené: {filtered.length}</strong>
          <div className={styles.catalogItems}>
            {filtered.map((candidate) => (
              <button key={candidate.id} type="button" className={styles.catalogItem}
                aria-pressed={chosen?.id === candidate.id}
                onClick={() => select(candidate)}>
                <span>{candidate.group}</span>
                <small>{components.get(candidate.leftPath)?.label ?? candidate.leftPath}</small>
                <small>{components.get(candidate.rightPath)?.label ?? candidate.rightPath}</small>
                <small>{candidate.sharedRoutes.length} spoločných možných stránok</small>
              </button>
            ))}
            {filtered.length === 0 && <p>Žiadna dvojica nevyhovuje hľadaniu.</p>}
          </div>
        </aside>
        {chosen ? <article className={styles.details} key={chosen.id}>
          <div className={styles.detailHead}>
            <div><span>{chosen.group}</span><h3>Porovnanie komponentov</h3></div>
            <span className={styles.readOnly}>Iba audit</span>
          </div>
          <p className={styles.explanation}>{chosen.explanation}</p>
          <div className={styles.comparisonGrid}>
            {([chosen.leftPath, chosen.rightPath] as const).map((path, index) => {
              const component = components.get(path);
              const modules = index === 0 ? chosen.leftStyleModules : chosen.rightStyleModules;
              const variantId = index === 0 ? leftVariant : rightVariant;
              const setVariant = index === 0 ? setLeftVariant : setRightVariant;
              const previews = adminComponentPreviewSamples.filter((sample) => sample.path === path);
              const selectedPreview = previews.find((sample) => sample.id === variantId) ?? previews[0];
              return <section className={styles.comparisonSide} key={path}>
                <h4>{component?.label ?? component?.name ?? path}</h4>
                <code>{path}</code>
                {selectedPreview ? <>
                  {previews.length > 1 && <label className={styles.usageSearch}>
                    <span>Vizuálny variant</span>
                    <select value={selectedPreview.id}
                      onChange={(event) => setVariant(event.target.value)}>
                      {previews.map((preview) =>
                        <option key={preview.id} value={preview.id}>{preview.title}</option>)}
                    </select>
                  </label>}
                  <div className={styles.comparisonPreview}>
                    <div className={styles.previewComponent} inert>
                      <AdminComponentVisualPreview id={selectedPreview.id} />
                    </div>
                  </div>
                  <p className={styles.explanation}>
                    Skutočný React komponent s ukážkovým obsahom;
                    nie potvrdený vzhľad na každej kandidátskej URL.
                  </p>
                </> : <p className={styles.pending}>
                  Tento zdroj zatiaľ nemá samostatný živý náhľad.
                  Porovnaj reálne verejné stránky pred úpravou.
                </p>}
                <strong>Priamo importované CSS moduly ({modules.length})</strong>
                {modules.length
                  ? <ul className={styles.usages}>{modules.map((file) =>
                      <li key={file}><code>{file}</code></li>)}</ul>
                  : <p className={styles.explanation}>
                      V tomto súbore sa nenašiel priamy import vlastného CSS modulu.
                      Štýly môžu pochádzať zo zdieľaných alebo globálnych súborov.
                    </p>}
                <a href={"https://github.com/investradarsk/psipedia-sk/blob/main/" + path}
                  target="_blank" rel="noopener noreferrer">Pozrieť zdroj na GitHube</a>
              </section>;
            })}
          </div>
          <div className={styles.usageHead}>
            <div>
              <h4>Možné stránky dotknuté úpravou</h4>
              <p>
                Zjednotenie zdieľaného komponentu môže ovplyvniť obe vetvy použitia.
                Sú to <strong>vzory podľa importov</strong>, nie potvrdené individuálne URL.
              </p>
            </div>
            <strong>{chosen.affectedRoutes.length}</strong>
          </div>
          <p className={styles.scanState}>
            Spoločné kandidátske šablóny: {chosen.sharedRoutes.length}.
            Celkom možných šablón z oboch komponentov: {chosen.affectedRoutes.length}.
          </p>
          {chosen.affectedRoutes.length > 0
            ? <ul className={styles.usages}>
                {chosen.affectedRoutes.slice(0, showRoutes).map((route) => {
                  const href = publicRegistryRouteHref(route);
                  return <li key={route}>
                    <div><strong>{route}</strong>
                      <small>{chosen.sharedRoutes.includes(route)
                        ? "Možné použitie oboch zdrojov" : "Možné použitie jedného zdroja"}</small>
                    </div>
                    {href
                      ? <a href={href} target="_blank" rel="noopener noreferrer">Otvoriť stránku</a>
                      : <small>Dynamická šablóna – bez overeného profilu</small>}
                  </li>;
                })}
              </ul>
            : <p className={styles.pending}>
                Statická analýza nezistila verejné trasy. Komponent môže byť
                dynamicky načítaný; nejde o dôkaz nepoužívania.
              </p>}
          {chosen.affectedRoutes.length > showRoutes &&
            <button type="button" className={styles.moreButton}
              onClick={() => setShowRoutes((n) => n + ROUTES_PAGE)}>
              Zobraziť ďalšie ({chosen.affectedRoutes.length - showRoutes})
            </button>}
          <div className={styles.compareAction}>
            <button className={styles.moreButton} type="button" onClick={copyReview}>
              Kopírovať podklady na bezpečné zjednotenie
            </button>
            {copied !== "idle" &&
              <span role="status">{copied === "yes" ? "Podklady skopírované." : "Kopírovanie zlyhalo."}</span>}
          </div>
          <p className={styles.nextStep}>
            Žiadne automatické zlučovanie ani zásah do verejného webu.
            Najprv treba skontrolovať skutočný render, CSS pravidlá a mobilné rozloženie.
          </p>
        </article> : <p className={styles.empty}>Vyber dvojicu na kontrolu.</p>}
      </div>
    </section>
  );
}
