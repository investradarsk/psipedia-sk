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
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function ImageDisplayEditor({ src, alt, title, excerpt, thumbnail, detail, onSave, onCancel }: Props) {
  const [tab, setTab] = useState<Context>("thumbnail");
  const [draftThumbnail, setDraftThumbnail] = useState<ImageDisplayConfig | null>(thumbnail);
  const [draftDetail, setDraftDetail] = useState<ImageDisplayConfig | null>(detail);
  const dialog = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number; original: ImageDisplayConfig } | null>(null);
  const current = (tab === "thumbnail" ? draftThumbnail : draftDetail) ?? (tab === "thumbnail" ? DEFAULT_THUMBNAIL : DEFAULT_DETAIL);
  const natural = tab === "detail" && current.mode === "natural";

  function change(value: ImageDisplayConfig | null) {
    if (tab === "thumbnail") setDraftThumbnail(value);
    else setDraftDetail(value);
  }

  useEffect(() => {
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
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", onKeyDown); };
  }, [onCancel]);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (natural || event.button !== 0) return;
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
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
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
            className={tab === "thumbnail" ? styles.active : ""} onClick={() => setTab("thumbnail")}>Náhľad</button>
          <button type="button" role="tab" id="image-tab-detail" aria-selected={tab === "detail"} aria-controls="image-panel"
            className={tab === "detail" ? styles.active : ""} onClick={() => setTab("detail")}>Detail článku</button>
        </div>
        <div id="image-panel" role="tabpanel" aria-labelledby={tab === "thumbnail" ? "image-tab-thumbnail" : "image-tab-detail"} className={styles.panel}>
          {tab === "thumbnail" ? (
            <div className={`article-card article-card--forest article-card--grid ${styles.card}`}>
              <div className={`article-card-media ${styles.interactive}`} role="group" aria-label="Presuň fotografiu potiahnutím alebo šípkami">
                <div className={styles.dragSurface} tabIndex={0} aria-label="Pozícia obrázka, šípky posúvajú výrez"
                  onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={onPreviewKey}>
                  <ImageDisplay context="thumbnail" src={src} alt={alt} config={current} loading="eager" />
                </div>
              </div>
              <div className="article-card-body"><div className="article-card-meta">Ukážka karty článku</div>
                <h3 className="article-card-title">{title || "Názov článku"}</h3>
                <p className="article-card-excerpt">{excerpt || "Krátky úvod z článku v náhľadovej karte."}</p>
              </div>
            </div>
          ) : (
            <div className={styles.detailPreview}>
              <h3>{title || "Názov článku"}</h3>
              <div className={[styles.detailSlot, natural && styles.naturalSlot].filter(Boolean).join(" ")}>
                <div className={styles.dragSurface} tabIndex={natural ? -1 : 0} aria-label="Pozícia hlavného obrázka"
                  onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd} onKeyDown={onPreviewKey}>
                  <ImageDisplay context="detail" src={src} alt={alt} config={current} loading="eager" />
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
          <label>Priblíženie: {Math.round(current.zoom * 100)} %
            <input type="range" min="1" max="2.5" step=".05" value={natural ? 1 : current.zoom} disabled={natural}
              onChange={(event) => change({ ...current, zoom: Number(event.target.value) })} />
          </label>
        </div>
        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={() => change(null)}>Obnoviť predvolené</button>
          <span className={styles.spacer} />
          <button type="button" className={styles.secondary} onClick={onCancel}>Zrušiť</button>
          <button type="button" className={styles.primary} onClick={() => onSave(draftThumbnail, draftDetail)}>Uložiť zobrazenie</button>
        </div>
        <p className={styles.saveNotice}>Nastavenia sa zachovajú po uložení článku. Každá karta má vlastné nastavenie.</p>
      </div>
    </div>
  );
}
