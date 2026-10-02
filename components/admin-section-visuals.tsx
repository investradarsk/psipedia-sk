"use client";

import { useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import {
  SECTION_VISUAL_ZOOM_MAX,
  SECTION_VISUAL_ZOOM_MIN,
  normalizeSectionVisualCrop,
  sectionVisualPositionPercent,
  type ResolvedSectionVisual,
  type SectionVisualAdminItem,
  type SectionVisualCrop,
} from "@/lib/section-visual-contract";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import type { ManagedPortalSection } from "@/lib/section-store";
import type { PortalSubpage, SectionHeroConfig, SectionHeroQuickLink } from "@/lib/portal";
import styles from "./admin-section-visuals.module.css";

type PreviewMode = "desktop" | "mobile";

function imageStyle(crop: SectionVisualCrop): CSSProperties {
  const x = sectionVisualPositionPercent(crop.x);
  const y = sectionVisualPositionPercent(crop.y);
  return {
    objectPosition: `${x} ${y}`,
    transform: `scale(${crop.zoom})`,
    transformOrigin: `${x} ${y}`,
  };
}

function updatedItem(
  items: SectionVisualAdminItem[],
  visualKey: string,
  updater: (item: SectionVisualAdminItem) => SectionVisualAdminItem,
) {
  return items.map((item) => item.definition.visualKey === visualKey ? updater(item) : item);
}

export function AdminSectionVisuals({ initialVisuals, initialSections }: { initialVisuals: SectionVisualAdminItem[]; initialSections: ManagedPortalSection[] }) {
  const [items, setItems] = useState(initialVisuals);
  const [sections, setSections] = useState(initialSections);
  const [activeKey, setActiveKey] = useState(initialVisuals[0]?.definition.visualKey ?? "");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const drag = useRef<{
    pointerId: number;
    mode: PreviewMode;
    startX: number;
    startY: number;
    crop: SectionVisualCrop;
  } | null>(null);

  const active = items.find((item) => item.definition.visualKey === activeKey) ?? items[0];
  const activeSection = active?.definition.sectionSlug ? sections.find((section) => section.slug === active.definition.sectionSlug) ?? null : null;
  const activeSubpage = activeSection && active?.definition.subsectionSlug ? activeSection.subpages.find((subpage) => subpage.slug === active.definition.subsectionSlug) ?? null : null;
  const heroConfig: SectionHeroConfig = activeSubpage?.heroConfig ?? activeSection?.heroConfig ?? {};
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("sk-SK");
    if (!needle) return items;
    return items.filter((item) =>
      [item.definition.name, item.definition.route, item.definition.visualKey]
        .join(" ")
        .toLocaleLowerCase("sk-SK")
        .includes(needle),
    );
  }, [items, query]);

  function patchVisual(patch: Partial<ResolvedSectionVisual>) {
    if (!active) return;
    setItems((current) => updatedItem(current, active.definition.visualKey, (item) => ({
      ...item,
      visual: { ...item.visual, ...patch },
    })));
    setMessage("");
    setError("");
  }

  function clearFeedback() { setMessage(""); setError(""); }

  function patchSection(patch: Partial<ManagedPortalSection>) {
    if (!activeSection) return;
    setSections((current) => current.map((section) => section.slug === activeSection.slug ? { ...section, ...patch } : section));
    clearFeedback();
  }

  function patchSubpage(patch: Partial<PortalSubpage>) {
    if (!activeSection || !activeSubpage) return;
    setSections((current) => current.map((section) => section.slug !== activeSection.slug ? section : ({
      ...section,
      subpages: section.subpages.map((subpage) => subpage.slug === activeSubpage.slug ? { ...subpage, ...patch } : subpage),
    })));
    clearFeedback();
  }

  function patchHeroConfig(patch: Partial<SectionHeroConfig>) {
    const next = { ...heroConfig, ...patch };
    if (activeSubpage) patchSubpage({ heroConfig: next });
    else if (activeSection) patchSection({ heroConfig: next });
  }

  function patchQuickLink(index: number, patch: Partial<SectionHeroQuickLink>) {
    const quickLinks = [...(heroConfig.quickLinks ?? [])];
    while (quickLinks.length <= index) quickLinks.push({ label: "", href: "", visible: true });
    quickLinks[index] = { ...quickLinks[index], ...patch };
    patchHeroConfig({ quickLinks });
  }

  function addQuickLink() {
    const quickLinks = [...(heroConfig.quickLinks ?? [])];
    if (quickLinks.length >= 6) return;
    patchHeroConfig({ quickLinks: [...quickLinks, { label: "", href: "", visible: true }] });
  }

  function removeQuickLink(index: number) {
    patchHeroConfig({ quickLinks: (heroConfig.quickLinks ?? []).filter((_, itemIndex) => itemIndex !== index) });
  }

  function safeHref(value: string) { return value.startsWith("/") || /^https:\/\//i.test(value); }

  function patchCrop(mode: PreviewMode, crop: Partial<SectionVisualCrop>) {
    if (!active) return;
    const current = mode === "desktop" ? active.visual.desktopCrop : active.visual.mobileCrop;
    const normalized = normalizeSectionVisualCrop({ ...current, ...crop }, current);
    patchVisual(mode === "desktop" ? { desktopCrop: normalized } : { mobileCrop: normalized });
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>, mode: PreviewMode) {
    if (!active) return;
    const crop = mode === "desktop" ? active.visual.desktopCrop : active.visual.mobileCrop;
    drag.current = {
      pointerId: event.pointerId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      crop: { ...crop },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (event.clientX - state.startX) / rect.width / state.crop.zoom;
    const dy = (event.clientY - state.startY) / rect.height / state.crop.zoom;
    patchCrop(state.mode, { x: state.crop.x - dx, y: state.crop.y - dy });
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function upload(file: File | null) {
    if (!active || !file) return;
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const result = await uploadAdminImage(file, "section-visuals");
      patchVisual({
        imageUrl: result.imageUrl,
        imageKey: result.imageKey,
        source: "custom",
      });
      setMessage(adminImageUploadMessage(result, "Nastav výrez a klikni Uložiť."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!active) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/section-visuals", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          visualKey: active.definition.visualKey,
          imageUrl: active.visual.imageUrl,
          imageKey: active.visual.imageKey,
          altText: active.visual.altText,
          desktopCrop: active.visual.desktopCrop,
          mobileCrop: active.visual.mobileCrop,
        }),
      });
      const data = await response.json() as { visual?: ResolvedSectionVisual; error?: string };
      if (!response.ok || !data.visual) throw new Error(data.error || "Vizuál sa nepodarilo uložiť.");
      setItems((current) => updatedItem(current, active.definition.visualKey, (item) => ({ ...item, visual: data.visual! })));
      setMessage("Vizuál je uložený.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Vizuál sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    if (!active || !window.confirm("Použiť pre tento vizuál stabilný predvolený obrázok a predvolený výrez?")) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/section-visuals", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visualKey: active.definition.visualKey, reset: true }),
      });
      const data = await response.json() as { visual?: ResolvedSectionVisual; error?: string };
      if (!response.ok || !data.visual) throw new Error(data.error || "Predvolený vizuál sa nepodarilo obnoviť.");
      setItems((current) => updatedItem(current, active.definition.visualKey, (item) => ({ ...item, visual: data.visual! })));
      setMessage("Používa sa stabilný predvolený vizuál.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Predvolený vizuál sa nepodarilo obnoviť.");
    } finally {
      setSaving(false);
    }
  }

  if (!active) return <p>Nie sú dostupné žiadne vizuály.</p>;

  const { definition, visual } = active;
  const recommended = `${definition.recommendedSize.width} × ${definition.recommendedSize.height} px`;
  const minimum = `${definition.minimumSize.width} × ${definition.minimumSize.height} px`;

  return (
    <div className={styles.workspace} data-testid="admin-section-visuals">
      <aside className={styles.sidebar}>
        <label className={styles.search}>
          <span>Hľadať vizuál</span>
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Plemená, veterinári, adopcia…" />
        </label>
        <div className={styles.visualList}>
          {visible.map((item) => (
            <button
              type="button"
              key={item.definition.visualKey}
              className={item.definition.visualKey === active.definition.visualKey ? styles.activeVisual : styles.visualButton}
              onClick={() => {
                setActiveKey(item.definition.visualKey);
                setMessage("");
                setError("");
              }}
            >
              <span>{item.definition.name}</span>
              <small>{item.definition.route}</small>
              <i>{item.visual.source === "custom" ? "Vlastný" : "Default"}</i>
            </button>
          ))}
        </div>
      </aside>

      <section className={styles.editor}>
        <header className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>{definition.type}</span>
            <h2>{definition.name}</h2>
            <p>{definition.target}</p>
          </div>
          <span className={visual.source === "custom" ? styles.customBadge : styles.defaultBadge}>
            {visual.source === "custom" ? "Uložené nastavenie" : "Stabilný default"}
          </span>
        </header>

        <div className={styles.recommendation}>
          <strong>Odporúčanie</strong>
          <span>Nahraj kvalitný obrázok. Odporúčaná veľkosť: <b>{recommended}</b>. Minimálna veľkosť: <b>{minimum}</b>.</span>
          <small>Jeden originál sa používa pre oba náhľady; desktop a mobil majú samostatnú pozíciu a zoom.</small>
        </div>

        <div className={styles.uploadRow}>
          <img src={visual.imageUrl} alt="" />
          <div>
            <strong>Aktuálny obrázok</strong>
            <span>{visual.source === "custom" ? "Vlastný obrázok alebo uložený crop" : "Stabilný Psipedia fallback"}</span>
          </div>
          <label className={styles.uploadButton}>
            {uploading ? "Nahrávam…" : "Nahrať nový obrázok"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              disabled={uploading || saving}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                void upload(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>

        <div className={styles.previewGrid}>
          {(["desktop", "mobile"] as const).map((mode) => {
            const crop = mode === "desktop" ? visual.desktopCrop : visual.mobileCrop;
            const defaultCrop = mode === "desktop" ? definition.defaultDesktopCrop : definition.defaultMobileCrop;
            return (
              <section className={styles.previewSection} key={mode}>
                <div className={styles.previewTitle}>
                  <div>
                    <strong>{mode === "desktop" ? "Desktop výrez" : "Mobilný výrez"}</strong>
                    <small>{mode === "desktop" ? "16 : 7" : "4 : 3"} · potiahni obrázok do správnej polohy</small>
                  </div>
                </div>
                <div
                  className={mode === "desktop" ? styles.desktopPreview : styles.mobilePreview}
                  onPointerDown={(event) => beginDrag(event, mode)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                >
                  <img src={visual.imageUrl} alt="" draggable={false} style={imageStyle(crop)} />
                  {mode === "desktop" ? (
                    <div className={styles.desktopSafeZone}>
                      <span>SAFE ZONE</span>
                      <small>text · vyhľadávanie · CTA</small>
                    </div>
                  ) : null}
                  <div className={styles.dragHint}>↔ potiahnuť</div>
                </div>
                <div className={styles.cropControls}>
                  <label>
                    <span>Zoom</span>
                    <input
                      type="range"
                      min={SECTION_VISUAL_ZOOM_MIN}
                      max={SECTION_VISUAL_ZOOM_MAX}
                      step="0.01"
                      value={crop.zoom}
                      onChange={(event) => patchCrop(mode, { zoom: Number(event.currentTarget.value) })}
                    />
                    <output>{crop.zoom.toFixed(2)}×</output>
                  </label>
                  <div>
                    <button type="button" onClick={() => patchCrop(mode, { x: 0.5, y: 0.5 })}>Vycentrovať</button>
                    <button type="button" onClick={() => patchCrop(mode, defaultCrop)}>Obnoviť</button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <label className={styles.altField}>
          <span>ALT text</span>
          <input
            value={visual.altText}
            maxLength={300}
            onChange={(event) => patchVisual({ altText: event.currentTarget.value })}
            placeholder="Stručne opíš, čo je na obrázku."
          />
          <small>Popíš fotografiu vecne. Text nadpisu sekcie sem neopakuj.</small>
        </label>

        {message ? <p className={styles.success} role="status">{message}</p> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <footer className={styles.actions}>
          <button type="button" className={styles.resetButton} disabled={saving || uploading} onClick={() => void resetToDefault()}>
            Použiť stabilný default
          </button>
          <button type="button" className={styles.saveButton} disabled={saving || uploading} onClick={() => void save()}>
            {saving ? "Ukladám…" : "Uložiť"}
          </button>
        </footer>
      </section>
    </div>
  );
}
