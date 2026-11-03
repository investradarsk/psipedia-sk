"use client";

import { useMemo, useState } from "react";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import { AdminVisualLibraryDynamicUrls } from "@/components/admin-visual-library-dynamic-urls";
import { AdminVisualLibraryRouteAudit } from "@/components/admin-visual-library-route-audit";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import { visualLibraryBanners } from "@/lib/visual-library-banners";
import type { VisualLibraryExample } from "@/lib/visual-library-example-types";
import type { ArticleBannerUsageResult } from "@/lib/visual-library-usage-store";
import styles from "./admin-visual-library.module.css";

export type CoverageRegistry = {
  routeEntries?: Array<{
    route: string;
    source: string;
    area: "public" | "admin";
    dynamic: boolean;
  }>;
  relatedGroups?: Array<{
    id: string; title: string; description: string; paths: string[];
  }>;
  components: Array<{
    name: string;
    label?: string;
    family?: "banner" | "hero" | "cta" | "filter" | "card" | "category" | "other";
    path: string;
    routes: string[];
    styleModules?: string[];
    area: "public" | "admin" | "mixed";
  }>;
};
type KnownUse = { url: string; label: string; placement: string; anchorId?: string };
type CoverageItem = {
  id: string; title: string; kind: "banner" | "visual" | "component";
  uses: KnownUse[]; candidates: string[]; path?: string;
};

/** All known components are searchable. Explicitly separate verified live
 * placements from possible paths inferred only from static imports. */
export function AdminVisualLibraryCoverage({
  registry, articleUsage, examples,
}: {
  registry: CoverageRegistry;
  articleUsage: ArticleBannerUsageResult;
  examples: readonly VisualLibraryExample[];
}) {
  const entries = useMemo<CoverageItem[]>(() => [
    ...visualLibraryBanners.map(banner => ({
      id: banner.id, title: banner.label, kind: "banner" as const,
      uses: [...banner.uses, ...(banner.id.startsWith("clanky:")
        ? (articleUsage.byKey[banner.id.slice(7)] ?? []) : [])],
      candidates: [],
    })),
    ...examples.map(example => ({
      id: example.id, title: example.label, kind: "visual" as const,
      uses: [...example.uses], candidates: [],
    })),
    ...registry.components.filter(component => component.area !== "admin").map(component => ({
      id: "source:" + component.path,
      title: component.label ?? component.name,
      kind: "component" as const,
      uses: [],
      candidates: component.routes,
      path: component.path,
    })),
  ], [articleUsage, examples, registry]);

  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [limit, setLimit] = useState(40);
  const searched = query.trim().toLocaleLowerCase("sk");
  const matched = entries.filter(item => !searched ||
    [item.title, item.id, item.path ?? "",
      ...item.uses.flatMap(use => [use.url, use.label, use.placement]),
      ...item.candidates].join(" ").toLocaleLowerCase("sk").includes(searched));
  const chosen = matched.find(item => item.id === selectedId) ?? matched[0];
  const visualBanner = chosen?.kind === "banner" ? visualLibraryBanners.find(b => b.id === chosen.id) : undefined;
  const visualExample = chosen?.kind === "visual" ? examples.find(e => e.id === chosen.id) : undefined;
  const clickableStatic = chosen?.candidates.map(route => ({route, href: publicRegistryRouteHref(route)})) ?? [];
  const knownUrls = new Set(chosen?.uses.map(use => new URL(use.url).pathname) ?? []);
  const listedStatic = clickableStatic.filter(item => item.href && !knownUrls.has(item.href));

  return (
    <div className={styles.dynamicCoverage}>
      <AdminVisualLibraryRouteAudit registry={registry} examples={examples} />
      <AdminVisualLibraryDynamicUrls />
      <section aria-label="Vyhľadávanie všetkých známych komponentov" className={styles.workspace}>
      <aside className={styles.catalog}>
        <strong>Hľadať na celom webe</strong>
        <label className={styles.usageSearch}>
          <span>Názov, stránka alebo URL</span>
          <input type="search" value={query} onChange={event => {
            setQuery(event.target.value); setSelectedId(""); setLimit(40);
          }} placeholder="Napr. veterinári, banner, /plemena" />
        </label>
        <p className={styles.explanation}>Evidovaných položiek: {entries.length}. Nájdené: {matched.length}.
          Vyhľadávanie zahŕňa aj všetky komponenty odhalené statickou analýzou kódu.</p>
        <div className={styles.catalogItems}>
          {matched.slice(0,limit).map(item => (
            <button type="button" key={item.id} className={styles.catalogItem}
              aria-pressed={item.id === chosen?.id} onClick={() => setSelectedId(item.id)}>
              <span>{item.title}</span>
              <small>{item.kind === "banner" ? "Banner · reálny náhľad" :
                item.kind === "visual" ? "Vizuálny prvok · reálny náhľad" :
                "Komponent · zatiaľ bez náhľadu"}</small>
            </button>
          ))}
          {!matched.length && <p>Žiadny komponent sa nenašiel.</p>}
        </div>
        {matched.length > limit && <button type="button" className={styles.moreButton}
          onClick={() => setLimit(limit + 60)}>Zobraziť ďalšie ({matched.length - limit})</button>}
      </aside>

      {chosen ? <article className={styles.details}>
        <div className={styles.detailHead}><div>
          <span>Miesta použitia</span><h3>{chosen.title}</h3>
        </div><span className={styles.readOnly}>Len na kontrolu</span></div>

        {visualBanner ? <div className={styles.preview}><div className={styles.previewComponent} inert>
          <PublicMagazineBanner testId={"coverage-" + visualBanner.id}
            photoTone={visualBanner.photoTone} compact={visualBanner.group === "clanky"}
            eyebrow={visualBanner.eyebrow} title={visualBanner.title}
            description={visualBanner.description} label={visualBanner.ctaLabel}
            href={visualBanner.ctaHref} />
        </div></div> : visualExample ? <div className={styles.preview}>
          <div className={styles.previewComponent} inert>{visualExample.preview}</div>
        </div> : <p className={styles.pending}>Pre tento komponent zatiaľ nie je overený vizuálny náhľad.
          Register pozná jeho súbor a statické väzby, nie skutočný vzhľad na každom profile.</p>}

        <div className={styles.usageHead}><div><h4>Overené konkrétne URL</h4>
          <p>Založené na existujúcom bannere, stránke alebo publikovaných článkoch.</p>
        </div><strong>{chosen.uses.length}</strong></div>
        {chosen.uses.length ? <ul className={styles.usages}>
          {chosen.uses.slice(0,150).map((use, i) => (
            <li key={use.url + use.placement + i}><div><strong>{use.label}</strong>
              <small>{use.placement}</small>
              <code>{use.url}{use.anchorId ? "#" + use.anchorId : ""}</code>
            </div><a href={use.url + (use.anchorId ? "#" + use.anchorId : "")}
              target="_blank" rel="noopener noreferrer">Otvoriť umiestnenie</a></li>
          ))}
        </ul> : <p className={styles.pending}>Pre túto položku nemáme individuálne overené URL.</p>}
        {chosen.uses.length > 150 && <p>Zobrazených prvých 150 výskytov. Spresni hľadanie vo vizuálnej galérii.</p>}

        {chosen.kind === "component" && <>
          <div className={styles.usageHead}><div><h4>Možné použitie podľa kódu</h4>
            <p>Statické prepojenie ešte neznamená, že sa komponent na danej stránke viditeľne vykreslí.</p>
          </div><strong>{chosen.candidates.length}</strong></div>
          {listedStatic.length ? <ul className={styles.usages}>{listedStatic.slice(0,100).map(({route,href}) =>
            <li key={route}><div><strong>{route}</strong><small>Statická verejná trasa</small></div>
              <a href={href!} target="_blank" rel="noopener noreferrer">Otvoriť stránku</a></li>
          )}</ul> : null}
          {chosen.candidates.filter(route => !publicRegistryRouteHref(route)).length > 0 &&
            <p className={styles.pending}>Niektoré použitia sú iba dynamické šablóny
              (napr. /adresar/[slug]). Konkrétne URL z nich nevymýšľame.</p>}
          {chosen.candidates.length === 0 && <p className={styles.pending}>
            Automatická analýza nenašla použitie; komponent môže byť načítaný dynamicky.</p>}
        </>}
        <p className={styles.nextStep}>Konkrétne publikované URL dynamických profilov sú uvedené v evidencii vyššie.
          Statické prepojenie komponentu s trasou stále neznamená overené vykreslenie na každom profile.</p>
      </article> : null}
      </section>
    </div>
  );
}
