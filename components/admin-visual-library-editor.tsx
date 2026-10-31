"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import type { VisualBanner } from "@/lib/visual-library-banners";
import { defaultBannerDraft, validateBannerDraft, type BannerDraft } from "@/lib/visual-library-drafts";
import styles from "./admin-visual-library.module.css";

type ServerRecord = {
  draft: BannerDraft; revision: number;
  publishedRevision: number | null; published: BannerDraft | null;
};
const BASE = "/api/admin/visual-library/banners";
const BACKGROUND_OPTIONS = {
  original: "Pôvodné pozadie", sage: "Svetlozelené", cream: "Krémové", white: "Biele",
} as const;
const BUTTON_OPTIONS = {
  original: "Pôvodná farba", green: "Tmavozelená", red: "Tehlovočervená",
} as const;
const backgroundValues: Record<BannerDraft["background"], string | undefined> = {
  original: undefined, sage: "#e1ebdf", cream: "#f9f1e5", white: "#ffffff",
};
const buttonValues: Record<BannerDraft["button"], string | undefined> = {
  original: undefined, green: "#20543e", red: "#b44939",
};

export function AdminVisualLibraryEditor({
  banner, variantIndex, knownUses, canConfirmAllUses,
}: {
  banner: VisualBanner;
  variantIndex: number;
  knownUses: number;
  canConfirmAllUses: boolean;
}) {
  const original = useMemo(() => defaultBannerDraft(banner, variantIndex), [banner, variantIndex]);
  const [draft, setDraft] = useState<BannerDraft>(original);
  const [server, setServer] = useState<ServerRecord | null>(null);
  const [publishTarget, setPublishTarget] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setConfirmed(false);
    setDirty(false);
    setDraft(original);
    const url = BASE + "?id=" + encodeURIComponent(banner.id) + "&variant=" + variantIndex;
    fetch(url, { method: "GET", cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json() as {
          draft?: ServerRecord | null; target?: string | null; error?: string;
        };
        if (!response.ok) throw new Error(json.error ?? "Server nie je dostupný.");
        return json;
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setServer(result.draft ?? null);
        setPublishTarget(result.target ?? null);
        setDraft(result.draft?.draft ?? original);
        setStatus(result.draft
          ? "Načítaný návrh zo servera. Zatiaľ nemusí byť publikovaný."
          : "Zatiaľ nemáš uložený serverový návrh.");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setServer(null);
        setPublishTarget(null);
        setStatus(error instanceof Error ? error.message : "Načítanie návrhu sa nepodarilo.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [banner.id, variantIndex, original]);

  const change = <K extends keyof BannerDraft>(field: K, value: BannerDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setConfirmed(false);
    setStatus("");
  };

  const valid = Boolean(validateBannerDraft(draft, original));
  const originalTexts = draft.eyebrow === original.eyebrow &&
    draft.title === original.title && draft.description === original.description &&
    draft.ctaLabel === original.ctaLabel;
  const publishAllowed = publishTarget !== null && originalTexts &&
    draft.scope === "one" && canConfirmAllUses &&
    knownUses === 1 && !dirty && server !== null && valid;

  const previewStyle = {
    "--visual-library-bg": banner.photoTone ? undefined : backgroundValues[draft.background],
    "--visual-library-button": buttonValues[draft.button],
    "--visual-library-button-text": banner.photoTone && draft.button === "original"
      ? "#174b38" : "#ffffff",
  } as CSSProperties;

  const save = async () => {
    if (!valid) { setStatus("Vyplň všetky texty a dodrž povolenú dĺžku."); return; }
    setBusy(true);
    try {
      const response = await fetch(BASE, {
        method: "PUT", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: banner.id, variantIndex, revision: server?.revision ?? 0, draft,
        }),
      });
      const result = await response.json() as { draft?: ServerRecord; error?: string };
      if (!response.ok || !result.draft) throw new Error(result.error ?? "Uloženie zlyhalo.");
      setServer(result.draft);
      setDraft(result.draft.draft);
      setDirty(false);
      setConfirmed(false);
      setStatus("Návrh je uložený na serveri. Verejný web sa zatiaľ nezmenil.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Uloženie zlyhalo.");
    } finally { setBusy(false); }
  };

  const release = async (action: "publish" | "revert") => {
    if (!server || !publishTarget || !confirmed || (action === "publish" && !publishAllowed)) return;
    setBusy(true);
    try {
      const response = await fetch(BASE, {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: banner.id, variantIndex, revision: server.revision,
          action, acknowledged: true, confirmedUrl: publishTarget,
        }),
      });
      const result = await response.json() as { draft?: ServerRecord; error?: string };
      if (!response.ok || !result.draft) throw new Error(result.error ?? "Akcia zlyhala.");
      setServer(result.draft);
      setConfirmed(false);
      setStatus(action === "publish"
        ? "Desktopové farby boli publikované pre potvrdenú URL. Mobilné farby a texty zostali pôvodné."
        : "Publikované desktopové farby boli vrátené na pôvodné.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Akcia zlyhala.");
    } finally { setBusy(false); }
  };

  const restoreOriginal = () => {
    setDraft(original);
    setDirty(true);
    setConfirmed(false);
    setStatus("Pôvodný vzhľad je obnovený v náhľade. Ak ho chceš uložiť, klikni Uložiť návrh.");
  };
  const copy = async () => {
    if (!valid) { setStatus("Najprv vyplň všetky povinné texty."); return; }
    const instructions = [
      "PSIPEDIA – návrh vizuálnej úpravy",
      "Banner: " + banner.label + " (" + banner.id + ")",
      "Variant: " + (variantIndex + 1),
      "Rozsah: " + (draft.scope === "one" ? "len tento banner" : "spoločná šablóna na osobitný audit"),
      "Známych použití: " + knownUses + (canConfirmAllUses ? "" : " – neúplné"),
      "Nadpis: " + draft.title, "Malý nadpis: " + draft.eyebrow,
      "Popis: " + draft.description, "Text tlačidla: " + draft.ctaLabel,
      "Pozadie: " + BACKGROUND_OPTIONS[draft.background],
      "Farba tlačidla: " + BUTTON_OPTIONS[draft.button],
      "Zachovať nezmenený mobil; texty nasadiť až po vyriešení desktop-only variantu.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(instructions);
      setStatus("Zadanie je skopírované.");
    } catch { setStatus("Kopírovanie sa nepodarilo."); }
  };

  return (
    <section className={styles.editor} aria-label={"Upraviť návrh: " + banner.label}>
      <div className={styles.editorHeading}>
        <div>
          <h4>Jednoduchá úprava</h4>
          <p>Texty a farby si najprv pozri v náhľade. Návrh možno bezpečne uložiť na server.</p>
        </div>
        <span className={styles.readOnly}>{server?.published ? "Desktopové farby publikované" : "Návrh"}</span>
      </div>
      <div className={styles.editorFields}>
        <label>Malý nadpis
          <input maxLength={100} value={draft.eyebrow} onChange={(event) => change("eyebrow", event.target.value)} />
        </label>
        <label>Hlavný nadpis
          <input maxLength={140} value={draft.title} onChange={(event) => change("title", event.target.value)} />
        </label>
        <label className={styles.editorWide}>Popis
          <textarea rows={2} maxLength={360} value={draft.description}
            onChange={(event) => change("description", event.target.value)} />
        </label>
        <label>Text tlačidla
          <input maxLength={80} value={draft.ctaLabel}
            onChange={(event) => change("ctaLabel", event.target.value)} />
        </label>
        <label>Farba pozadia
          <select disabled={Boolean(banner.photoTone)} value={banner.photoTone ? "original" : draft.background}
            onChange={(event) => change("background", event.target.value as BannerDraft["background"])}>
            {Object.entries(BACKGROUND_OPTIONS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {banner.photoTone && <small>Fotografické bannery zachovávajú bezpečné prekrytie.</small>}
        </label>
        <label>Farba tlačidla
          <select value={draft.button} onChange={(event) => change("button", event.target.value as BannerDraft["button"])}>
            {Object.entries(BUTTON_OPTIONS).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className={styles.editorWide}>Plánovaný rozsah
          <select value={draft.scope} onChange={(event) => change("scope", event.target.value as BannerDraft["scope"])}>
            <option value="one">Len tento banner</option>
            <option value="template">Všetky použitia spoločnej šablóny – iba návrh</option>
          </select>
        </label>
      </div>

      <p className={styles.editorScope}>
        Evidovaných výskytov: {knownUses}{canConfirmAllUses ? "." : " (neúplný zoznam)."}
        {" "}Priame publikovanie je povolené iba pre overený samostatný banner, keď sa nemenia jeho texty a rozsah je „Len tento banner“.
      </p>
      <strong className={styles.editorPreviewTitle}>Náhľad zmien – desktop</strong>
      <div className={styles.editorPreview} style={previewStyle}>
        <div className={styles.previewComponent} inert>
          <PublicMagazineBanner
            compact={banner.group === "clanky"} photoTone={banner.photoTone}
            testId={"editor-preview-" + banner.id} eyebrow={draft.eyebrow}
            title={draft.title} description={draft.description}
            label={draft.ctaLabel} href={banner.ctaHref}
          />
        </div>
      </div>

      <div className={styles.editorActions}>
        <button className={styles.moreButton} type="button" onClick={restoreOriginal} disabled={busy || loading}>Obnoviť pôvodné</button>
        <button className={styles.editorSave} type="button" onClick={() => void save()}
          disabled={busy || loading || !valid || (!dirty && server !== null)}>
          {busy ? "Spracúvam…" : "Uložiť návrh na server"}
        </button>
        <button className={styles.moreButton} type="button" onClick={() => void copy()} disabled={!valid}>
          Skopírovať na implementáciu
        </button>
      </div>

      <div className={styles.publishPanel}>
        <h5>Publikovať na verejný web</h5>
        {publishTarget ? (
          <>
            <p>Overené umiestnenie: <a target="_blank" rel="noopener noreferrer" href={publishTarget}>{publishTarget}</a></p>
            <p>Publikujeme iba <strong>desktopové farby</strong>. Mobilné farby a všetky pôvodné texty ostávajú nezmenené.</p>
            {!originalTexts && <p className={styles.pending}>Zmenil si texty. Ulož návrh, ale farby možno publikovať až po vrátení textov do pôvodného stavu.</p>}
            <label className={styles.publishConfirm}>
              <input type="checkbox" checked={confirmed} disabled={busy || loading}
                onChange={(event) => setConfirmed(event.target.checked)}/>
              Potvrdzujem zmenu iba na uvedenej URL a iba pre desktop.
            </label>
            <div className={styles.editorActions}>
              <button type="button" className={styles.editorSave} disabled={busy || loading || !confirmed || !publishAllowed}
                onClick={() => void release("publish")}>Publikovať desktopové farby</button>
              {server?.published && (
                <button type="button" className={styles.moreButton} disabled={busy || loading || !confirmed}
                  onClick={() => void release("revert")}>Vrátiť publikované farby</button>
              )}
            </div>
          </>
        ) : <p>Tento banner zatiaľ umožňuje len uloženie návrhu. Priame publikovanie vyžaduje overenie všetkých umiestnení.</p>}
      </div>
      <p role="status" aria-live="polite" className={styles.editorMessage}>
        {status || "Nič sa nepublikuje bez samostatného potvrdenia."}
      </p>
    </section>
  );
}
