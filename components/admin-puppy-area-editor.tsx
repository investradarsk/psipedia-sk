"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { ManagedPortalSection } from "@/lib/section-store";
import type { PortalSubpage } from "@/lib/portal";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { EditorActionBar, EditorStatus, EditorWorkspace } from "@/components/admin-editor-workspace";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import { AdminActionButton } from "@/components/admin-interaction-system";
import { AdminSingleImageUpload } from "@/components/admin-single-image-upload";
import { adminSelectedImage } from "@/lib/admin-selected-image";
import { AdminLexicalAppendButton } from "@/components/admin-lexical-append-button";
import { appendLexicalPlainText } from "@/lib/editorial-lexical-append";

export function AdminPuppyAreaEditor({ initialSections }: { initialSections: ManagedPortalSection[] }) {
  const [sections, setSections] = useState(initialSections);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const puppy = sections.find((section) => section.slug === "steniatka");
  const areas = puppy?.subpages.filter((area) => !area.href) ?? [];

  function replaceAreas(nextAreas: PortalSubpage[]) {
    setDirty(true);
    // Keep linked subpages in the canonical PUT payload: the area editor must not silently delete them.
    setSections((current) => current.map((section) => {
      if (section.slug !== "steniatka") return section;
      let areaIndex = 0;
      return { ...section, subpages: section.subpages.map((subpage) => subpage.href ? subpage : nextAreas[areaIndex++]) };
    }));
  }

  function update(index: number, patch: Partial<PortalSubpage>) {
    replaceAreas(areas.map((area, areaIndex) => areaIndex === index ? { ...area, ...patch } : area));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= areas.length) return;
    const next = [...areas];
    [next[index], next[target]] = [next[target], next[index]];
    replaceAreas(next);
  }

  async function upload(index: number, event: File | ChangeEvent<HTMLInputElement>) {
    const file = adminSelectedImage(event);
    if (!file) return;
    setUploading(areas[index].slug); setError(""); setMessage("");
    try {
      const result = await uploadAdminImage(file, "articles");
      update(index, { imageUrl: result.imageUrl, imageAlt: areas[index].imageAlt || areas[index].label });
      setMessage(adminImageUploadMessage(result, "Ulož zmeny oblasti."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading("");
    }
  }

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/sections", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sections }) });
      const data = await response.json() as { sections?: ManagedPortalSection[]; error?: string };
      if (!response.ok || !data.sections) throw new Error(data.error || "Zmeny sa nepodarilo uložiť.");
      setSections(data.sections); setDirty(false); setMessage("Obsah oblastí Šteniatok je uložený a zobrazuje sa na verejnom webe.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Zmeny sa nepodarilo uložiť.");
    } finally { setSaving(false); }
  }

  return <EditorWorkspace
    mode="page"
    title="Obsah oblastí Šteniatok"
    description="Úprava oblastí, fotografií a poradia v jednotnom Admin V3 pracovisku."
    status={<><EditorStatus label={dirty ? "Neuložené zmeny" : "Uložené"} tone={dirty ? "warning" : "success"} /><EditorStatus label={uploading ? "Nahrávanie obrázka" : "Pripravené"} tone={uploading ? "warning" : "neutral"} /></>}
    sections={areas.map((area, index) => ({ id: `puppy-area-${index}`, label: area.label }))}
    dirty={dirty}
    closeLabel="Späť do administrácie"
    onClose={() => { setDirty(false); window.setTimeout(() => window.location.assign("/admin"), 0); }}
    actions={<EditorActionBar
      feedback={<AdminFormFeedback error={error} message={message || (dirty ? "Neuložené zmeny" : "Všetky zmeny uložené")} pending={saving} />}
      primary={<AdminActionButton variant="primary" disabled={saving || Boolean(uploading) || !dirty} onClick={() => void save()}>{saving ? "Ukladám…" : "Uložiť všetky oblasti"}</AdminActionButton>}
    />}
  >
  <section className="admin-form-card admin-puppy-content-card" data-admin-content-editor>
    <div className="admin-puppy-areas-heading"><div><h2>Obsah oblastí Šteniatok</h2><p>Tu upravíš stránku oblasti. Články sa pridávajú samostatne pod ňu.</p></div></div>
    <div className="admin-puppy-content-list">{areas.map((area, index) => <details key={area.slug} id={`puppy-area-${index}`} data-admin-editor-section tabIndex={-1} className="admin-puppy-content-item" open={index === 0} onFocus={(event) => { if (event.target === event.currentTarget) event.currentTarget.open = true; }}>
      <summary><span>{String(index + 1).padStart(2, "0")}</span><strong>{area.label}</strong><small>Upraviť obsah</small></summary>
      <div className="admin-puppy-content-fields">
        <div className="admin-field-grid"><div className="admin-field"><label>Názov oblasti</label><input value={area.label} onChange={(event) => update(index, { label: event.target.value })} /></div><div className="admin-field"><label>Adresa URL</label><input value={area.slug} disabled /></div></div>
        <div className="admin-field"><label>Krátky opis</label><textarea rows={2} value={area.description} onChange={(event) => update(index, { description: event.target.value })} /></div>
        <div className="admin-field"><label>Úvodný text stránky</label><textarea rows={6} value={area.intro ?? ""} onChange={(event) => update(index, { intro: event.target.value })} placeholder="Vlastný praktický úvod pre túto oblasť…" /><AdminLexicalAppendButton disabled={saving || Boolean(uploading)} onAppend={text => update(index, { intro: appendLexicalPlainText(area.intro ?? "", text) })}/></div>
        <div className="admin-upload-row"><div className="admin-upload-preview admin-upload-preview--coral">{area.imageUrl ? <img src={area.imageUrl} alt="Náhľad oblasti" /> : <span>🐶</span>}</div><div className="admin-upload-actions"><AdminSingleImageUpload label={area.imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"} onFile={file=>upload(index,file)} busy={uploading === area.slug} disabled={saving || Boolean(uploading)} onRejected={setError}/>{area.imageUrl && <button type="button" onClick={() => update(index, { imageUrl: "", imageAlt: "" })}>Odstrániť fotku</button>}<small>JPG, PNG, WebP alebo AVIF, najviac 8 MB.</small></div></div>
        {area.imageUrl && <div className="admin-field"><label>Alt text obrázka</label><input value={area.imageAlt ?? ""} onChange={(event) => update(index, { imageAlt: event.target.value })} placeholder={`Fotografia: ${area.label}`} /></div>}
        <div className="admin-puppy-content-actions"><button type="button" onClick={() => move(index, -1)} disabled={index === 0}>↑ Vyššie</button><button type="button" onClick={() => move(index, 1)} disabled={index === areas.length - 1}>↓ Nižšie</button><Link href={`/admin/novy?sekcia=steniatka&oblast=${area.slug}`}>+ Pridať článok do oblasti</Link><Link href={`/steniatka/${area.slug}`} target="_blank">Pozrieť stránku ↗</Link></div>
      </div>
    </details>)}</div>
  </section>
  </EditorWorkspace>;
}
