"use client";

import { useEffect, useState } from "react";
import { AdminComponentVisualPreview, adminComponentPreviewSamples } from "@/components/admin-component-visual-preview";
import { AdminVisualLibraryBannerPreview } from "@/components/admin-visual-library-banner-preview";
import type { VisualLibraryExample } from "@/lib/visual-library-example-types";
import type { VisualBanner } from "@/lib/visual-library-banners";
import type { OwnerKnownUse } from "@/lib/visual-library-owner-evidence";
import { publicRegistryRouteHref } from "@/lib/component-registry-route";
import { suggestOwnerVisualPairs } from "@/lib/visual-library-owner-suggestions";
import { buildOwnerDecisionRequest, OWNER_DECISION_OPTIONS, type OwnerDecisionKind } from "@/lib/visual-library-owner-decision";
import {
  isMergeRequest, orientSavedDecision, ownerDecisionLabel,
  type OwnerDecisionDraft, type SavedOwnerDecision,
} from "@/lib/visual-library-owner-decision-queue";
import styles from "./admin-visual-library.module.css";

type Sample = (typeof adminComponentPreviewSamples)[number];
export type OwnerCompareGroup = {
  id: string;
  title: string;
  family: string;
  samples: Sample[];
  examples: VisualLibraryExample[];
  banners: VisualBanner[];
  paths: string[];
  routes: string[];
  knownUses: OwnerKnownUse[];
};

type OwnerDecision = OwnerDecisionKind | "";
const DECISIONS = OWNER_DECISION_OPTIONS;
const DECISIONS_API = "/api/admin/visual-library/owner-decisions";

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
  if (banner) return <AdminVisualLibraryBannerPreview
    banner={banner} testId={"owner-compare-" + banner.id.replaceAll(":", "-")} />;
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
  const [stored, setStored] = useState<SavedOwnerDecision | null>(null);
  const [loadingPair, setLoadingPair] = useState(true);
  const [pairError, setPairError] = useState(false);
  const [pairRefresh, setPairRefresh] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [queue, setQueue] = useState<SavedOwnerDecision[]>([]);
  const [queueNext, setQueueNext] = useState<number | null>(null);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueMessage, setQueueMessage] = useState("");

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
  const suggestions = suggestOwnerVisualPairs(groups, 10);

  const loadQueue = async (offset: number) => {
    setQueueLoading(true);
    try {
      const response = await fetch(DECISIONS_API + "?offset=" + offset + "&limit=25", {
        credentials: "same-origin", cache: "no-store",
      });
      const data = await response.json() as {
        items?: SavedOwnerDecision[]; nextOffset?: number | null; error?: string;
      };
      if (!response.ok || !data.items) throw new Error(data.error ?? "Nepodarilo sa načítať uložené rozhodnutia.");
      setQueue((current) => offset === 0
        ? data.items!
        : [...current, ...data.items!.filter((item) => !current.some((record) => record.key === item.key))]);
      setQueueNext(data.nextOffset ?? null);
      setQueueMessage("");
    } catch (error) {
      setQueueMessage(error instanceof Error ? error.message : "Načítanie rozhodnutí sa nepodarilo.");
    } finally {
      setQueueLoading(false);
    }
  };

  useEffect(() => {
    // The initial server read happens asynchronously. No synchronous
    // React state transitions are started inside an effect.
    const controller = new AbortController();
    fetch(DECISIONS_API + "?offset=0&limit=25", {
      credentials: "same-origin", cache: "no-store", signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json() as {
        items?: SavedOwnerDecision[]; nextOffset?: number | null; error?: string;
      };
      if (!response.ok || !data.items) {
        throw new Error(data.error ?? "Nepodarilo sa načítať uložené rozhodnutia.");
      }
      return data;
    }).then((data) => {
      if (controller.signal.aborted) return;
      setQueue(data.items ?? []);
      setQueueNext(data.nextOffset ?? null);
      setQueueMessage("");
    }).catch((error) => {
      if (!controller.signal.aborted) {
        setQueueMessage(error instanceof Error ? error.message : "Načítanie rozhodnutí sa nepodarilo.");
      }
    }).finally(() => {
      if (!controller.signal.aborted) setQueueLoading(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!leftId || !rightId || leftId === rightId) {
      return () => controller.abort();
    }
    fetch(DECISIONS_API + "?leftId=" + encodeURIComponent(leftId) +
      "&rightId=" + encodeURIComponent(rightId), {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      }).then(async (response) => {
        const data = await response.json() as { decision?: SavedOwnerDecision | null; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Nepodarilo sa načítať existujúce rozhodnutie.");
        return data;
      }).then((data) => {
        if (controller.signal.aborted) return;
        const record = data.decision ?? null;
        setStored(record);
        const oriented = record ? orientSavedDecision(record, leftId, rightId) : null;
        setDecision(oriented?.decision ?? "");
        setLeftVariant(oriented?.leftVariantId ?? "");
        setRightVariant(oriented?.rightVariantId ?? "");
        setNotes(oriented?.notes ?? "");
      }).catch((error) => {
        if (!controller.signal.aborted) {
          setPairError(true);
          setSaveMessage(error instanceof Error ? error.message : "Rozhodnutie nie je dostupné.");
        }
      }).finally(() => {
        if (!controller.signal.aborted) setLoadingPair(false);
      });
    return () => controller.abort();
  }, [leftId, rightId, pairRefresh]);

  const saveDecision = async () => {
    if (!left || !right || !decision || saving || loadingPair || pairError) return;
    const draft: OwnerDecisionDraft = {
      leftId: left.id, rightId: right.id,
      leftTitle: left.title, rightTitle: right.title,
      leftVariantId: selectedLeftVariant,
      rightVariantId: selectedRightVariant,
      decision, notes,
    };
    setSaving(true);
    setSaveMessage("");
    try {
      const response = await fetch(DECISIONS_API, {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: stored?.revision ?? 0, draft }),
      });
      const data = await response.json() as { decision?: SavedOwnerDecision; error?: string };
      if (!response.ok || !data.decision) throw new Error(
        data.error === "KONFLIKT_VERZIE"
          ? "Medzitým bolo rozhodnutie upravené. Obnov porovnanie a skontroluj poslednú verziu."
          : (data.error ?? "Rozhodnutie sa nepodarilo uložiť."),
      );
      setStored(data.decision);
      setSaveMessage("Rozhodnutie je uložené v administrácii. Verejný web zostal nezmenený.");
      void loadQueue(0);
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Uloženie zlyhalo.");
    } finally {
      setSaving(false);
    }
  };

  const selectSuggested = (a: string, b: string) => {
    setLeftId(a);
    setRightId(b);
    setLeftVariant("");
    setRightVariant("");
    reset();
  };

  const openSaved = (record: SavedOwnerDecision) => {
    setLeftId(record.draft.leftId);
    setRightId(record.draft.rightId);
    setLeftVariant(record.draft.leftVariantId);
    setRightVariant(record.draft.rightVariantId);
    setDecision(record.draft.decision);
    setNotes(record.draft.notes);
    setStored(record);
    setSaveMessage("");
    setCopied("idle");
  };

  const task = valid && left && right && decision
    ? buildOwnerDecisionRequest({
      left, right,
      leftVariant: variants(left).find((item) => item.id === selectedLeftVariant)?.label ?? "",
      rightVariant: variants(right).find((item) => item.id === selectedRightVariant)?.label ?? "",
      decision, notes,
    }) : "";

  const reset = () => {
    setStored(null);
    setLoadingPair(true);
    setPairError(false);
    setSaveMessage("");
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
    <section className={styles.ownerCompareQueue} aria-label="Uložené rozhodnutia o komponentoch">
      <div className={styles.ownerCompareQueueHeading}>
        <div>
          <h4>Uložené rozhodnutia</h4>
          <p>Rozhodnutia zostanú v administrácii aj po zatvorení stránky. Žiadne nespúšťa automatické úpravy.</p>
        </div>
        <button type="button" disabled={queueLoading} onClick={() => void loadQueue(0)}>
          Obnoviť zoznam
        </button>
      </div>
      <div className={styles.ownerCompareQueueStats}>
        <span>Na zjednotenie (načítané): {queue.filter((item) => isMergeRequest(item.draft.decision)).length}</span>
        <span>Ponechať / už spoločné (načítané): {queue.filter((item) => !isMergeRequest(item.draft.decision)).length}</span>
      </div>
      {queueMessage && <p role="status">{queueMessage}</p>}
      {queue.length > 0 && <div className={styles.ownerCompareQueueList}>
        {queue.map((item) => <article key={item.key}>
          <div>
            <strong>{item.draft.leftTitle} × {item.draft.rightTitle}</strong>
            <small>{ownerDecisionLabel(item.draft.decision)}
              {" · "}Uložené {new Date(item.updatedAt).toLocaleString("sk-SK", {timeZone:"Europe/Bratislava"})}
              {" · "}Verzia {item.revision}</small>
          </div>
          <button type="button" onClick={() => openSaved(item)}>Otvoriť</button>
        </article>)}
      </div>}
      {!queueLoading && queue.length === 0 && !queueMessage &&
        <p className={styles.explanation}>Zatiaľ nemáš uložené žiadne rozhodnutie.</p>}
      {queueNext !== null && <button type="button" disabled={queueLoading}
        onClick={() => void loadQueue(queueNext)}>Zobraziť ďalšie uložené rozhodnutia</button>}
    </section>
    {suggestions.length > 0 && <section className={styles.ownerCompareSuggestions}
      aria-label="Navrhované podobné prvky na vizuálnu kontrolu">
      <div>
        <h4>Podobné prvky na porovnanie ({suggestions.length})</h4>
        <p>Návrhy vznikajú podľa kategórie, účelu a doložených či kandidátskych stránok.
          Nejde o potvrdené grafické ani kódové duplicity; over ich vzhľad A/B.</p>
      </div>
      <div className={styles.ownerCompareSuggestionsList}>
        {suggestions.map((candidate) => {
          const a = groups.find((item) => item.id === candidate.leftId);
          const b = groups.find((item) => item.id === candidate.rightId);
          if (!a || !b) return null;
          return <button type="button" key={candidate.leftId + "|" + candidate.rightId}
            aria-pressed={(leftId === a.id && rightId === b.id) ||
              (leftId === b.id && rightId === a.id)}
            onClick={() => selectSuggested(a.id, b.id)}>
            <strong>{a.title} × {b.title}</strong>
            <small>{candidate.reasons.join(" · ")}</small>
            <span>Porovnať dvojicu</span>
          </button>;
        })}
      </div>
    </section>}
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
          <textarea value={notes} rows={3} maxLength={1200}
            placeholder="Napr. zachovať obrázok z A, ale tlačidlo z B..."
            onChange={(event) => { setNotes(event.target.value); setCopied("idle"); }} />
        </label>
        <button type="button" disabled={loadingPair || saving || pairError || !task}
          onClick={() => void saveDecision()}>
          {saving ? "Ukladám rozhodnutie…" : stored ? "Aktualizovať uložené rozhodnutie" : "Uložiť rozhodnutie do administrácie"}
        </button>
        {saveMessage && <p role="status">{saveMessage}</p>}
        <button type="button" disabled={loadingPair || saving}
          onClick={() => {
            setLoadingPair(true);
            setPairError(false);
            setStored(null);
            setPairRefresh((value) => value + 1);
          }}>
          Načítať poslednú uloženú verziu
        </button>
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
        <p>Uloženie zachová výber na serveri, ale nevytvorí GitHub PR, nič nezlučuje
          ani nepublikuje. Skopírovanie zadania do chatu zostáva voliteľné.</p>
      </div>}
    </> : <p className={styles.pending}>Vyber dva odlišné komponenty. Dva varianty jedného spoločného
      komponentu si môžeš porovnať prepnutím variantu v jeho detaile.</p>}
  </section>;
}
