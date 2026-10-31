"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { PublicMagazineBanner } from "@/components/public-visual-system/public-magazine-banner";
import type { VisualBanner } from "@/lib/visual-library-banners";
import { BANNER_DRAFT_STORAGE_PREFIX, defaultBannerDraft, validateBannerDraft, type BannerDraft } from "@/lib/visual-library-drafts";
import styles from "./admin-visual-library.module.css";

const BACKGROUND_OPTIONS = {
  original: "Pôvodné pozadie",
  sage: "Svetlozelené",
  cream: "Krémové",
  white: "Biele",
} as const;
const BUTTON_OPTIONS = {
  original: "Pôvodná farba",
  green: "Tmavozelená",
  red: "Tehlovočervená",
} as const;

const backgroundValues: Record<BannerDraft["background"], string | undefined> = {
  original: undefined,
  sage: "#e1ebdf",
  cream: "#f9f1e5",
  white: "#ffffff",
};
const buttonValues: Record<BannerDraft["button"], string | undefined> = {
  original: undefined,
  green: "#20543e",
  red: "#b44939",
};

export function AdminVisualLibraryEditor({
  banner,
  variantIndex,
  knownUses,
  canConfirmAllUses,
}: {
  banner: VisualBanner;
  variantIndex: number;
  knownUses: number;
  canConfirmAllUses: boolean;
}) {
  const key = BANNER_DRAFT_STORAGE_PREFIX + banner.id + ":" + variantIndex;
  const initial = useMemo(() => defaultBannerDraft(banner, variantIndex), [banner, variantIndex]);
  const [draft, setDraft] = useState<BannerDraft>(initial);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState("");
  const [loadedKey, setLoadedKey] = useState("");

  useEffect(() => {
    setDraft(initial);
    setSaved(false);
    setStatus("");
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        const parsed = validateBannerDraft(JSON.parse(stored), initial);
        if (parsed) {
          setDraft(parsed);
          setSaved(true);
          setStatus("Uložený návrh bol načítaný z tohto prehliadača.");
        }
      }
    } catch {
      setStatus("Návrh sa nepodarilo načítať z prehliadača.");
    }
    setLoadedKey(key);
  }, [initial, key]);

  const change = <K extends keyof BannerDraft>(field: K, value: BannerDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaved(false);
    setStatus("");
  };

  const valid = Boolean(validateBannerDraft(draft, initial));
  const previewStyle = {
    "--visual-library-bg": banner.photoTone ? undefined : backgroundValues[draft.background],
    "--visual-library-button": buttonValues[draft.button],
    "--visual-library-button-text": banner.photoTone && draft.button === "original" ? "#174b38" : "#ffffff",
  } as CSSProperties;

  const save = () => {
    const normalized = validateBannerDraft(draft, initial);
    if (!normalized) {
      setStatus("Vyplň všetky texty a dodrž povolenú dĺžku.");
      return;
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(normalized));
      setSaved(true);
      setStatus("Návrh je uložený iba v tomto prehliadači. Verejný web sa nezmenil.");
    } catch {
      setStatus("Uloženie sa nepodarilo. Skontroluj, či prehliadač povoľuje miestne ukladanie.");
    }
  };
  const reset = () => {
    setDraft(initial);
    setSaved(false);
    try {
      window.localStorage.removeItem(key);
      setStatus("Návrh bol z tohto prehliadača vymazaný. Verejný web sa nezmenil.");
    } catch {
      setStatus("Pôvodný náhľad bol obnovený, ale uložený návrh sa nepodarilo vymazať.");
    }
  };
  const copy = async () => {
    if (!valid) {
      setStatus("Najprv vyplň všetky povinné texty.");
      return;
    }
    const instructions = [
      "PSIPEDIA – schválený návrh vizuálnej úpravy na implementáciu",
      "Banner: " + banner.label + " (" + banner.id + ")",
      "Textový variant: " + (variantIndex + 1),
      "Rozsah: " + (draft.scope === "one" ? "Len tento konkrétny banner" : "Spoločná šablóna – vyžaduje audit všetkých použití"),
      "Známych použití: " + knownUses + (canConfirmAllUses ? "" : " (neúplný zoznam)"),
      "Malý nadpis: " + draft.eyebrow,
      "Nadpis: " + draft.title,
      "Popis: " + draft.description,
      "Tlačidlo: " + draft.ctaLabel,
      "Pozadie: " + BACKGROUND_OPTIONS[draft.background],
      "Farba tlačidla: " + BUTTON_OPTIONS[draft.button],
      "Pri implementácii zachovať mobilný vzhľad bez zmeny; preveriť vplyv na všetky stránky.",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(instructions);
      setStatus("Zadanie bolo skopírované. Vlož ho do nášho chatu na implementáciu.");
    } catch {
      setStatus("Skopírovanie sa nepodarilo. Skús to znovu.");
    }
  };

  return (
    <section className={styles.editor} aria-label={"Upraviť návrh: " + banner.label}>
      <div className={styles.editorHeading}>
        <div>
          <h4>Jednoduchá úprava</h4>
          <p>Zmeň text a základné farby, okamžite uvidíš výsledok. Toto je zatiaľ bezpečný pracovný návrh.</p>
        </div>
        <span className={styles.readOnly}>Bez publikovania</span>
      </div>
      <div className={styles.editorFields}>
        <label>Malý nadpis
          <input type="text" maxLength={100} value={draft.eyebrow}
            onChange={(event) => change("eyebrow", event.target.value)} />
        </label>
        <label>Hlavný nadpis
          <input type="text" maxLength={140} value={draft.title}
            onChange={(event) => change("title", event.target.value)} />
        </label>
        <label className={styles.editorWide}>Popis
          <textarea rows={2} maxLength={360} value={draft.description}
            onChange={(event) => change("description", event.target.value)} />
        </label>
        <label>Text tlačidla
          <input type="text" maxLength={80} value={draft.ctaLabel}
            onChange={(event) => change("ctaLabel", event.target.value)} />
        </label>
        <label>Farba pozadia
          <select disabled={Boolean(banner.photoTone)} value={banner.photoTone ? "original" : draft.background}
            onChange={(event) => change("background", event.target.value as BannerDraft["background"])}>
            {Object.entries(BACKGROUND_OPTIONS).map(([value, label]) =>
              <option value={value} key={value}>{label}</option>)}
          </select>
          {banner.photoTone ? <small>Fotografický banner si zachováva svoje bezpečné prekrytie fotografie.</small> : null}
        </label>
        <label>Farba tlačidla
          <select value={draft.button} onChange={(event) => change("button", event.target.value as BannerDraft["button"])}>
            {Object.entries(BUTTON_OPTIONS).map(([value, label]) =>
              <option value={value} key={value}>{label}</option>)}
          </select>
        </label>
        <label className={styles.editorWide}>Plánovaný rozsah zmeny
          <select value={draft.scope} onChange={(event) => change("scope", event.target.value as BannerDraft["scope"])}>
            <option value="one">Len tento konkrétny banner</option>
            <option value="template">Všetky použitia spoločnej šablóny – po kontrole</option>
          </select>
        </label>
      </div>
      <p className={styles.editorScope}>
        {draft.scope === "one"
          ? "Zmena by sa týkala iba vybraného banneru a textového variantu."
          : "Pozor: spoločnú šablónu môžu používať aj iné stránky. Pred publikovaním treba skontrolovať celý zoznam a výslovne potvrdiť rozsah."}
        {" "}Aktuálne evidovaných výskytov: {knownUses}
        {!canConfirmAllUses ? " (zoznam nemusí byť úplný)." : "."}
      </p>

      <strong className={styles.editorPreviewTitle}>Náhľad tvojich zmien – desktop</strong>
      <div className={styles.editorPreview} style={previewStyle}>
        <div className={styles.previewComponent} inert>
          <PublicMagazineBanner
            compact={banner.group === "clanky"}
            photoTone={banner.photoTone}
            testId={"editor-preview-" + banner.id}
            eyebrow={draft.eyebrow}
            title={draft.title}
            description={draft.description}
            label={draft.ctaLabel}
            href={banner.ctaHref}
          />
        </div>
      </div>
      <div className={styles.editorActions}>
        <button type="button" className={styles.moreButton} onClick={reset} disabled={loadedKey !== key}>
          Obnoviť pôvodné
        </button>
        <button type="button" className={styles.editorSave} onClick={save} disabled={!valid || loadedKey !== key || saved}>
          {saved ? "Návrh uložený" : "Uložiť návrh"}
        </button>
        <button type="button" className={styles.moreButton} onClick={() => void copy()} disabled={!valid || loadedKey !== key}>
          Skopírovať na implementáciu
        </button>
      </div>
      <p role="status" aria-live="polite" className={styles.editorMessage}>{status || "Uloženie návrhu nemení verejný web ani mobilný vzhľad."}</p>
    </section>
  );
}
