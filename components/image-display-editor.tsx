"use client";

import { useEffect, useRef, useState, type PointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ImageDisplay } from "@/components/image-display";
import {
  DEFAULT_DETAIL, DEFAULT_THUMBNAIL,
  type ImageDisplayConfig,
} from "@/lib/image-display";
import styles from "./image-display-editor.module.css";

type Context = "thumbnail" | "detail";
type Props = {
  src: string;
  alt: string;
  title: string;
  excerpt: string;
  thumbnail: ImageDisplayConfig | null;
  detail: ImageDisplayConfig | null;
  onSave: (thumbnail: ImageDisplayConfig | null, detail: ImageDisplayConfig | null) => void;
  onCancel: () => void;
  entityLabel?: string;
  thumbnailAspectRatio?: string;
  thumbnailLayout?: "standard" | "compact";
  detailAspectRatio?: string;
  thumbnailLabel?: string;
  saveNotice?: string;
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function ImageDisplayEditor({
  src, alt, title, excerpt, thumbnail, detail, onSave, onCancel,
  entityLabel = "článku", thumbnailLabel, thumbnailAspectRatio = "16 / 9", thumbnailLayout = "standard",
  detailAspectRatio = "16 / 9", saveNotice,
}: Props) {
  const [tab, setTab] = useState<Context>("thumbnail");
  const [draftThumbnail, setDraftThumbnail] = useState<ImageDisplayConfig | null>(thumbnail);
  const [draftDetail, setDraftDetail] = useState<ImageDisplayConfig | null>(detail);
  const dialog = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; original: ImageDisplayConfig } | null>(null);
  const current = (tab === "thumbnail" ? draftThumbnail : draftDetail) ?? (tab === "thumbnail" ? DEFAULT_THUMBNAIL : DEFAULT_DETAIL);
  const natural = tab === "detail" && current.mode === "natural";
  const [guidesVisible, setGuidesVisible] = useState(false);
  const guideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCentered = Math.abs(current.x - 50) <= .5 && Math.abs(current.y - 50) <= .5;
  function showGuides() {
    if (guideTimer.current !== null) clearTimeout(guideTimer.current);
    guideTimer.current = null;
    setGuidesVisible(true);
  }
  function hideGuides(delay = 650) {
    if (guideTimer.current !== null) clearTimeout(guideTimer.current);
    guideTimer.current = setTimeout(() => {
      guideTimer.current = null;
      setGuidesVisible(false);
    }, delay);
  }
  useEffect(() => () => { if (guideTimer.current !== null) clearTimeout(guideTimer.current); }, []);

  function change(value: ImageDisplayConfig | null) {
    if (tab === "thumbnail") setDraftThumbnail(value);
    else setDraftDetail(value);
  }

  useEffect(() => {
    const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onCancel(); }
      if (event.key !== "Tab" || !dialog.current) return;
      const enabled = [...dialog.current.querySelectorAll<HTMLElement>('button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex="0"]')];
      if (!enabled.length) return;
      const first = enabled[0], last = enabled[enabled.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); previousActive?.focus({ preventScroll: true }); };
  }, [onCancel]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (natural || event.button !== 0) return;
    showGuides();
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, original: current };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    change({
      ...start.original,
      x: Math.round(clamp(start.original.x - (event.clientX - start.x) / rect.width * 100 / start.original.zoom) * 100) / 100,
      y: Math.round(clamp(start.original.y - (event.clientY - start.y) / rect.height * 100 / start.original.zoom) * 100) / 100,
    });
  }
  function onPointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) { drag.current = null; hideGuides(); }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onPreviewKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (natural) return;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2],
    };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    showGuides();
    change({ ...current, x: clamp(current.x + delta[0]), y: clamp(current.y + delta[1]) });
  }

  return (
    <div className={styles.backdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="image-display-editor-title" className={styles.dialog}>
        <div className={styles.header}>
          <div><h2 id="image-display-editor-title">Upraviť zobrazenie obrázka</h2><p>Originál fotografie zostane nezmenený.</p></div>
          <button type="button" className={styles.close} onClick={onCancel} aria-label="Zavrieť editor obrázka">×</button>
        </div>
        <div role="tablist" aria-label="Miesto zobrazenia obrázka" className={styles.tabs}>
          <button type="button" role="tab" id="image-tab-thumbnail" aria-selected={tab === "thumbnail"} aria-controls="image-panel"
            className={tab === "thumbnail" ? styles.active : ""} onClick={() => { setTab("thumbnail"); setGuidesVisible(false); }}>Náhľad</button>
          <button type="button" role="tab" id="image-tab-detail" aria-selected={tab === "detail"} aria-controls="image-panel"
            className={tab === "detail" ? styles.active : ""} onClick={() => { setTab("detail"); setGuidesVisible(false); }}>Detail {entityLabel}</button>
        </div>
        <div id="image-panel" role="tabpanel" aria-labelledby={tab === "thumbnail" ? "image-tab-thumbnail" : "image-tab-detail"} className={styles.panel}>
          {tab === "thumbnail" ? (
            <div className={`article-card article-card--forest article-card--grid ${styles.card} ${thumbnailLayout === "compact" ? styles.compactCard : ""}`}>
              <div className={`article-card-media ${styles.interactive} ${thumbnailLayout === "compact" ? styles.compactMedia : ""}`} style={{ aspectRatio: thumbnailAspectRatio }} role="group" aria-label="Presuň fotografiu potiahnutím alebo šípkami">
                <div className={styles.dragSurface} tabIndex={0} aria-label="Pozícia obrázka, šípky posúvajú výrez"
                  onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={onPreviewKey} onBlur={() => hideGuides()}>
                  <ImageDisplay roleHint={entityLabel === "článku" ? "article" : "generic"} context="thumbnail" src={src} alt={alt} config={current} loading="eager" />
                  {guidesVisible && <div className={`${styles.guides} ${isCentered ? styles.centered : ""}`} aria-hidden="true"><span className={styles.guideVertical}/><span className={styles.guideHorizontal}/><span className={styles.centerPoint}/></div>}
                </div>
              </div>
              <div className="article-card-body"><div className="article-card-meta">{thumbnailLabel || `Ukážka karty ${entityLabel}`}</div>
                <h3 className="article-card-title">{title || "Názov"}</h3>
                <p className="article-card-excerpt">{excerpt || "Krátky úvod v náhľadovej karte."}</p>
              </div>
            </div>
          ) : (
            <div className={styles.detailPreview}>
              <h3>{title || "Názov"}</h3>
              <div className={[styles.detailSlot, natural && styles.naturalSlot].filter(Boolean).join(" ")} style={natural ? undefined : { aspectRatio: detailAspectRatio }}>
                <div className={styles.dragSurface} tabIndex={natural ? -1 : 0} aria-label="Pozícia hlavného obrázka"
                  onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={onPreviewKey} onBlur={() => hideGuides()}>
                  <ImageDisplay roleHint={entityLabel === "článku" ? "article" : "generic"} context="detail" src={src} alt={alt} config={current} loading="eager" />
                  {!natural && guidesVisible && <div className={`${styles.guides} ${isCentered ? styles.centered : ""}`} aria-hidden="true"><span className={styles.guideVertical}/><span className={styles.guideHorizontal}/><span className={styles.centerPoint}/></div>}
                </div>
              </div>
            </div>
          )}
          <p className={styles.help}>{natural ? "Prirodzený režim zobrazuje celú fotografiu bez výrezu." : "Potiahni fotografiu myšou alebo prstom. Výrez možno posúvať aj šípkami na klávesnici."}</p>
        </div>
        <div className={styles.controls}>
          <label>Režim zobrazenia
            <select value={current.mode} onChange={(event) => change({ ...current, mode: event.target.value as ImageDisplayConfig["mode"], zoom: event.target.value === "natural" ? 1 : current.zoom })}>
              {tab === "thumbnail" ? <option value="auto">Automaticky</option> : <option value="natural">Prirodzene</option>}
              <option value="crop">Orezať</option>
              <option value="blur">Rozmazať pozadie</option>
            </select>
          </label>
          {!natural && <label>Priblíženie: {Math.round(current.zoom * 100)} %
            <input type="range" min="1" max="2.5" step=".05" value={current.zoom}
              onPointerDown={showGuides} onPointerUp={() => hideGuides()} onFocus={showGuides} onBlur={() => hideGuides()}
              onChange={(event) => change({ ...current, zoom: Number(event.target.value) })} />
          </label>}
        </div>
        <div className={styles.footer}>
          {!natural && <button type="button" className={styles.secondary} onClick={() => { change({ ...current, x: 50, y: 50 }); showGuides(); hideGuides(900); }}>Vycentrovať obrázok</button>}
          <button type="button" className={styles.secondary} onClick={() => change(null)}>Obnoviť predvolené</button>
          <span className={styles.spacer} />
          <button type="button" className={styles.secondary} onClick={onCancel}>Zrušiť</button>
          <button type="button" className={styles.primary} onClick={() => onSave(draftThumbnail, draftDetail)}>Uložiť zobrazenie</button>
        </div>
        <p className={styles.saveNotice}>{saveNotice ?? "Nastavenia sa zachovajú po uložení záznamu. Náhľad a detail majú nezávislé nastavenia."}</p>
      </div>
    </div>
  );
}
