"use client";

import { useState } from "react";
import { AdminComponentVisualPreview, adminComponentPreviewSamples } from "@/components/admin-component-visual-preview";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import type { VisualLibraryExample } from "@/lib/visual-library-example-types";
import type { VisualBanner } from "@/lib/visual-library-banners";
import type { OwnerKnownUse } from "@/lib/visual-library-owner-evidence";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import { buildOwnerDecisionRequest, OWNER_DECISION_OPTIONS, type OwnerDecisionKind } from "@/lib/visual-library-owner-decision";
import styles from "./admin-visual-library.module.css";

type Sample = (typeof adminComponentPreviewSamples)[number];
export type OwnerCompareGroup = {
  id: string;
  title: string;
  samples: Sample[];
  examples: VisualLibraryExample[];
  banners: VisualBanner[];
  paths: string[];
  routes: string[];
  knownUses: OwnerKnownUse[];
};

type OwnerDecision = OwnerDecisionKind | "";
const DECISIONS = OWNER_DECISION_OPTIONS;

function variants(group: OwnerCompareGroup) {
  return [
    ...group.samples.map((item) => ({ id: item.id, label: item.title })),
    ...group.examples.map((item) => ({ id: item.id, label: item.label })),
    ...group.banners.map((item) => ({ id: item.id, label: item.label })),
  ];
}

function GroupPreview({group, selectedId}: {group: OwnerCompareGroup; selectedId: string}) {
  const sample = group.samples.find((item) => item.id === selectedId);
  if (sample) return <AdminComponentVisualPreview id={sample.id} />;
  const example = group.examples.find((item) => item.id === selectedId);
  if (example) return <>{example.preview}</>;
  const banner = group.banners.find((item) => item.id === selectedId);
  if (banner) return <PublicMagazineBanner
    compact={banner.group === "clanky"}
    photoTone={banner.photoTone}
    testId={"owner-compare-" + banner.id.replaceAll(":", "-")}
    eyebrow={banner.eyebrow}
    title={banner.title}
    description={banner.description}
    label={banner.ctaLabel}
    href={banner.ctaHref}
  />;
  return <p>Pre vybraný variant nie je k dispozícii náhľad.</p>;
}


export function AdminVisualLibraryOwnerCompare({
  groups, initialLeftId, onAdvanced,
}: {
  groups: OwnerCompareGroup[];
  initialLeftId: string;
  onAdvanced: () => void;
}) {
  const [leftId, setLeftId] = useState(initialLeftId);
  const [rightId, setRightId] = useState(groups.find((item) => item.id !== initialLeftId)?.id ?? "");
  const [leftVariant, setLeftVariant] = useState("");
  const [rightVariant, setRightVariant] = useState("");
  const [decision, setDecision] = useState<OwnerDecision>("");
  const [notes, setNotes] = useState("");
  const [showLeft, setShowLeft] = useState(8);
  const [showRight, setShowRight] = useState(8);
  const [copied, setCopied] = useState<"idle" | "ok" | "error">("idle");

  const left = groups.find((item) => item.id === leftId);
  const right = groups.find((item) => item.id === rightId);
  const selectedLeftVariant = left?.samples.find((s) => s.id === leftVariant)?.id
    ?? left?.examples.find((s) => s.id === leftVariant)?.id
    ?? left?.banners.find((s) => s.id === leftVariant)?.id
    ?? (left && variants(left)[0]?.id) ?? "";
  const selectedRightVariant = right?.samples.find((s) => s.id === rightVariant)?.id
    ?? right?.examples.find((s) => s.id === rightVariant)?.id
    ?? right?.banners.find((s) => s.id === rightVariant)?.id
    ?? (right && variants(right)[0]?.id) ?? "";
  const valid = Boolean(left && right && left.id !== right.id);

  const task = valid && left && right && decision
    ? buildOwnerDecisionRequest({
      left, right,
      leftVariant: variants(left).find((item) => item.id === selectedLeftVariant)?.label ?? "",
      rightVariant: variants(right).find((item) => item.id === selectedRightVariant)?.label ?? "",
      decision, notes,
    }) : "";

  const reset = () => {
    setDecision("");
    setNotes("");
    setCopied("idle");
    setShowLeft(8);
    setShowRight(8);
  };

  const renderSide = (group: OwnerCompareGroup, id: string, side: "left" | "right") => {
    const variant = side === "left" ? selectedLeftVariant : selectedRightVariant;
    const changeVariant = side === "left" ? setLeftVariant : setRightVariant;
    const visible = side === "left" ? showLeft : showRight;
    const setVisible = side === "left" ? setShowLeft : setShowRight;

    return <article className={styles.ownerCompareSide} key={group.id}>
      <div className={styles.ownerCompareSideTitle}>
        <strong>Komponent {id}</strong>
        <h4>{group.title}</h4>
      </div>
      {variants(group).length > 1 && <label className={styles.ownerCompareVariant}>
        <span>Vybrať vizuálny variant</span>
        <select value={variant} onChange={(event) => { changeVariant(event.target.value); setCopied("idle"); }}>
          {variants(group).map((item) =>
            <option key={item.id} value={item.id}>{item.label}</option>)}
        </select>
      </label>}
      <div className={styles.ownerComparePreview} inert>
        <GroupPreview group={group} selectedId={variant} />
      </div>
      <div className={styles.ownerCompareLinks}>
        <strong>Zdokumentované konkrétne stránky ({group.knownUses.length})</strong>
        <small>Doložené podľa zdrojového kódu alebo publikovaných dát, nie potvrdené screenshotom.</small>
        {group.knownUses.slice(0, visible).map((item, index) =>
          <div key={item.url + item.placement + index}>
            <span>{item.label}</span>
            <a href={item.url + (item.anchorId ? "#" + item.anchorId : "")}
              target="_blank" rel="noopener noreferrer">Otvoriť umiestnenie</a>
            <small>{item.placement}</small>
          </div>)}
        {group.knownUses.length > visible && <button type="button" onClick={() => setVisible((n) => n + 20)}>
          Ďalšie URL ({group.knownUses.length - visible})
        </button>}
        {group.knownUses.length === 0 && <small>Konkrétne umiestnenia zatiaľ neboli doložené.</small>}
        {group.routes.length > 0 && <details>
          <summary>Možné trasy podľa kódu ({group.routes.length})</summary>
          <ul>
            {group.routes.map((route) => {
              const href = publicRegistryRouteHref(route);
              return <li key={route}>{href
                ? <a href={href} target="_blank" rel="noopener noreferrer">{route}</a>
                : <code>{route}</code>}</li>;
            })}
          </ul>
        </details>}
      </div>
    </article>;
  };

  return <section className={styles.ownerComparePanel} aria-label="Vizuálne porovnanie a rozhodnutie o zjednotení">
    <div className={styles.ownerCompareHeader}>
      <div>
        <h3>Porovnaj dva prvky</h3>
        <p>Vyber vzhľad, ktorý chceš zachovať. Rozhodnutie pripraví zadanie na zjednotenie
          jedného spoločného komponentu – nič samo nemení.</p>
      </div>
      <button type="button" onClick={onAdvanced}>Pozrieť aj technické podobnosti</button>
    </div>
    <div className={styles.ownerCompareSelectors}>
      <label>Komponent A
        <select value={leftId} onChange={(event) => { setLeftId(event.target.value); setLeftVariant(""); reset(); }}>
          {groups.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <label>Komponent B
        <select value={rightId} onChange={(event) => { setRightId(event.target.value); setRightVariant(""); reset(); }}>
          {groups.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
    </div>
    {valid && left && right ? <>
      <div className={styles.ownerCompareGrid}>
        {renderSide(left, "A", "left")}
        {renderSide(right, "B", "right")}
      </div>
      <fieldset className={styles.ownerCompareDecisions}>
        <legend>Čo chceš urobiť s týmito prvkami?</legend>
        <div>
          {DECISIONS.map((item) => <label key={item.value} data-active={decision === item.value}>
            <input type="radio" name="visual-owner-decision" value={item.value}
              checked={decision === item.value}
              onChange={() => { setDecision(item.value); setCopied("idle"); }} />
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
          </label>)}
        </div>
      </fieldset>
      {decision && <div className={styles.ownerCompareDraft}>
        <label>Dodatočné pokyny (nepovinné)
          <textarea value={notes} rows={3}
            placeholder="Napr. zachovať obrázok z A, ale tlačidlo z B..."
            onChange={(event) => { setNotes(event.target.value); setCopied("idle"); }} />
        </label>
        <button type="button" onClick={() => {
          try {
            if (!navigator.clipboard?.writeText || !task) {
              setCopied("error");
              return;
            }
            void navigator.clipboard.writeText(task)
              .then(() => setCopied("ok"), () => setCopied("error"));
          } catch {
            setCopied("error");
          }
        }}>Skopírovať rozhodnutie pre ChatGPT</button>
        {copied === "ok" && <p role="status">Skopírované. Vlož zadanie do nášho chatu, aby sme podľa neho pripravili úpravu.</p>}
        {copied === "error" && <p role="status">Nepodarilo sa skopírovať. Skús kopírovanie znova.</p>}
        <p>Rozhodnutie je zatiaľ len na tejto obrazovke. Neukladá sa do databázy
          a nespúšťa zmeny na webe. Na trvalé spracovanie skopíruj zadanie do chatu.</p>
      </div>}
    </> : <p className={styles.pending}>Vyber dva odlišné komponenty. Dva varianty jedného spoločného
      komponentu si môžeš porovnať prepnutím variantu v jeho detaile.</p>}
  </section>;
}
