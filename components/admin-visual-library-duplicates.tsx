"use client";

import { useMemo, useState } from "react";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import { visualLibraryBanners, type VisualBanner } from "@/lib/visual-library-banners";
import type { ArticleBannerUsageResult } from "@/lib/visual-library-usage-store";
import type { VisualLibraryExample } from "@/lib/visual-library-example-types";
import { findSimilarityCandidates, type SimilarityItem } from "@/lib/visual-library-similarity";
import styles from "./admin-visual-library.module.css";

type Usage = { url: string; label: string; placement: string; anchorId?: string };
type ComparedItem = {
  id: string;
  label: string;
  kind: "banner" | "hero" | "cta" | "card";
  banner?: VisualBanner;
  example?: VisualLibraryExample;
  uses: Usage[];
};

export function AdminVisualLibraryDuplicates({
  articleUsage,
  examples,
}: {
  articleUsage: ArticleBannerUsageResult;
  examples: readonly VisualLibraryExample[];
}) {
  const allItems = useMemo<ComparedItem[]>(() => [
    ...visualLibraryBanners.map((banner) => ({
      id: banner.id,
      label: banner.label,
      kind: "banner" as const,
      banner,
      uses: [...banner.uses, ...(banner.id.startsWith("clanky:")
        ? (articleUsage.byKey[banner.id.slice(7)] ?? []) : [])],
    })),
    ...examples.map((example) => ({
      id: example.id,
      label: example.label,
      kind: (example.category === "karty" ? "card" : example.category) as "hero" | "cta" | "card",
      example,
      uses: [...example.uses],
    })),
  ], [articleUsage, examples]);

  const suggested = useMemo(() => findSimilarityCandidates(
    visualLibraryBanners.map((banner): SimilarityItem => ({
      id: banner.id,
      label: banner.label,
      title: banner.title,
      description: banner.description,
      ctaHref: banner.ctaHref,
      kind: "banner",
    })),
  ), []);

  const [leftId, setLeftId] = useState(suggested[0]?.leftId ?? allItems[0]?.id ?? "");
  const [rightId, setRightId] = useState(suggested[0]?.rightId ?? allItems[1]?.id ?? "");
  const [showLeft, setShowLeft] = useState(10);
  const [showRight, setShowRight] = useState(10);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");

  const left = allItems.find((item) => item.id === leftId);
  const right = allItems.find((item) => item.id === rightId);
  const validPair = Boolean(left && right && left.id !== right.id);
  const match = suggested.find((item) =>
    (item.leftId === leftId && item.rightId === rightId) ||
    (item.leftId === rightId && item.rightId === leftId));

  const choose = (a: string, b: string) => {
    setLeftId(a);
    setRightId(b);
    setShowLeft(10);
    setShowRight(10);
    setCopyStatus("idle");
  };

  const compareText = validPair && left && right
    ? [
        "Psipedia.sk – návrh na preverenie dvoch podobných prvkov",
        "A: " + left.label + " (" + left.id + ")",
        ...left.uses.map((use) => "A URL: " + use.url + (use.anchorId ? "#" + use.anchorId : "")),
        "B: " + right.label + " (" + right.id + ")",
        ...right.uses.map((use) => "B URL: " + use.url + (use.anchorId ? "#" + use.anchorId : "")),
        "Dôvod: " + (match?.explanation ?? "Dvojicu som vybral na vizuálne porovnanie."),
        "Prever, či ide o skutočnú duplicitu, a navrhni bezpečné zjednotenie bez zmeny mobilu.",
      ].join("\n") : "";

  const render = (item: ComparedItem, side: "left" | "right") => {
    const showCount = side === "left" ? showLeft : showRight;
    const setShowCount = side === "left" ? setShowLeft : setShowRight;
    return (
      <article key={item.id} className={styles.comparisonSide}>
        <h4>{item.label}</h4>
        <p className={styles.comparisonKind}>
          {item.kind === "banner" ? "Banner" : item.kind === "hero" ? "Hero sekcia" :
            item.kind === "cta" ? "CTA tlačidlo" : "Karta"}
        </p>
        <div className={styles.comparisonPreview}>
          <div className={styles.previewComponent} inert>
            {item.banner ? (
              <PublicMagazineBanner
                compact={item.banner.group === "clanky"}
                photoTone={item.banner.photoTone}
                testId={"compare-" + side + "-" + item.id}
                eyebrow={item.banner.eyebrow}
                title={item.banner.title}
                description={item.banner.description}
                label={item.banner.ctaLabel}
                href={item.banner.ctaHref}
              />
            ) : item.example?.preview}
          </div>
        </div>
        <div className={styles.comparisonUses}>
          <strong>Kde sa používa ({item.uses.length})</strong>
          {item.uses.slice(0, showCount).map((use, index) => (
            <div key={use.url + use.placement + index} className={styles.comparisonUse}>
              <strong>{use.label}</strong>
              <span>{use.placement}</span>
              <code>{use.url}{use.anchorId ? "#" + use.anchorId : ""}</code>
              <a target="_blank" rel="noopener noreferrer"
                href={use.url + (use.anchorId ? "#" + use.anchorId : "")}>Otvoriť umiestnenie ↗</a>
            </div>
          ))}
          {item.uses.length > showCount && (
            <button type="button" className={styles.moreButton} onClick={() => setShowCount((n) => n + 25)}>
              Zobraziť ďalšie ({item.uses.length - showCount})
            </button>
          )}
          {!item.uses.length && (
            <p className={styles.pending}>
              {item.banner?.group === "clanky" && articleUsage.status !== "complete"
                ? "Zoznam článkov je neúplný alebo nedostupný."
                : "Momentálne nemáme overené konkrétne URL použitia."}
            </p>
          )}
        </div>
      </article>
    );
  };

  return (
    <section className={styles.similarity} aria-label="Kontrola podobných prvkov">
      <div className={styles.similarityIntro}>
        <h3>Možné duplicity a podobné prvky</h3>
        <p>Porovnaj vzhľad a miesta použitia vedľa seba. Systém upozorňuje na spoločný cieľ alebo veľmi podobný text,
          no <strong>rovnaký vzhľad alebo odkaz automaticky neznamená chybu.</strong> Nič sa samo nezlučuje ani nemení.</p>
      </div>
      <div className={styles.similaritySuggestions}>
        <h4>Návrhy na preverenie ({suggested.length})</h4>
        {suggested.length ? (
          <div className={styles.suggestionList}>
            {suggested.map((candidate) => {
              const a = allItems.find((item) => item.id === candidate.leftId);
              const b = allItems.find((item) => item.id === candidate.rightId);
              if (!a || !b) return null;
              return (
                <button type="button" key={candidate.leftId + "|" + candidate.rightId}
                  className={styles.suggestion}
                  aria-pressed={(leftId === candidate.leftId && rightId === candidate.rightId) ||
                    (rightId === candidate.leftId && leftId === candidate.rightId)}
                  onClick={() => choose(candidate.leftId, candidate.rightId)}>
                  <strong>{a.label} × {b.label}</strong>
                  <span>{candidate.explanation}</span>
                </button>
              );
            })}
          </div>
        ) : <p>Zatiaľ sa nenašla dvojica s dostatočne silnou podobnosťou. Môžeš si porovnať ľubovoľné dva prvky nižšie.</p>}
      </div>

      <div className={styles.compareControls}>
        <label>Prvý prvok
          <select value={leftId} onChange={(event) => choose(event.target.value, rightId)}>
            {allItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Druhý prvok
          <select value={rightId} onChange={(event) => choose(leftId, event.target.value)}>
            {allItems.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
      </div>
      {validPair && left && right ? (
        <>
          <div className={styles.comparisonGrid}>{render(left, "left")}{render(right, "right")}</div>
          <p className={styles.explanation}>
            {match?.explanation ?? "Vlastný výber: obe položky sú z existujúcej knižnice, ale systém ich neoznačil za pravdepodobnú duplicitu."}
          </p>
          <div className={styles.compareAction}>
            <button type="button" className={styles.moreButton}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(compareText);
                  setCopyStatus("copied");
                } catch {
                  setCopyStatus("failed");
                }
              }}>Kopírovať zadanie na zjednotenie</button>
            {copyStatus === "copied" && <span role="status">Skopírované. Môžeš ho vložiť do nášho chatu.</span>}
            {copyStatus === "failed" && <span role="status">Kopírovanie sa nepodarilo. Použi ručne názvy a URL.</span>}
          </div>
        </>
      ) : (
        <p className={styles.pending}>Vyber dva rôzne prvky na porovnanie.</p>
      )}
      <p className={styles.nextStep}>
        Toto je kontrola možných podobností evidovaných komponentov, nie automatický vizuálny audit každej URL. Zlúčenie bude vždy samostatná schválená úprava.
      </p>
    </section>
  );
}
