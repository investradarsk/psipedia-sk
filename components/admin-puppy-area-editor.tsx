"use client";

import { useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { ManagedPortalSection } from "@/lib/section-store";
import type { PortalSubpage } from "@/lib/portal";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";

export function AdminPuppyAreaEditor({ initialSections }: { initialSections: ManagedPortalSection[] }) {
  const [sections, setSections] = useState(initialSections);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const puppy = sections.find((section) => section.slug === "steniatka");
  const areas = puppy?.subpages.filter((area) => !area.href) ?? [];

  function replaceAreas(nextAreas: PortalSubpage[]) {
    setSections((current) => current.map((section) => section.slug === "steniatka" ? { ...section, subpages: nextAreas } : section));
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

  async function upload(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(areas[index].slug); setError(""); setMessage("");
    try {
      const result = await uploadAdminImage(file, "articles");
      update(index, { imageUrl: result.imageUrl, imageAlt: areas[index].imageAlt || areas[index].label });
      setMessage(adminImageUploadMessage(result, "Ulož zmeny oblasti."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(""); event.target.value = "";
    }
  }

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/sections", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sections }) });
      const data = await response.json() as { sections?: ManagedPortalSection[]; error?: string };
      if (!response.ok || !data.sections) throw new Error(data.error || "Zmeny sa nepodarilo uložiť.");
      setSections(data.sections); setMessage("Obsah oblastí Šteniatok je uložený a zobrazuje sa na verejnom webe.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Zmeny sa nepodarilo uložiť.");
    } finally { setSaving(false); }
  }

  return <section className="admin-form-card admin-puppy-content-card">
    <div className="admin-puppy-areas-heading"><div><h2>Obsah oblastí Šteniatok</h2><p>Tu upravíš stránku oblasti. Články sa pridávajú samostatne pod ňu.</p></div><button className="admin-publish" type="button" onClick={() => void save()} disabled={saving || Boolean(uploading)}>{saving ? "Ukladám…" : "Uložiť všetky oblasti"}</button></div>
    <div className="admin-puppy-content-list">{areas.map((area, index) => <details key={area.slug} className="admin-puppy-content-item" open={index === 0}>
      <summary><span>{String(index + 1).padStart(2, "0")}</span><strong>{area.label}</strong><small>Upraviť obsah</small></summary>
      <div className="admin-puppy-content-fields">
        <div className="admin-field-grid"><div className="admin-field"><label>Názov oblasti</label><input value={area.label} onChange={(event) => update(index, { label: event.target.value })} /></div><div className="admin-field"><label>Adresa URL</label><input value={area.slug} disabled /></div></div>
        <div className="admin-field"><label>Krátky opis</label><textarea rows={2} value={area.description} onChange={(event) => update(index, { description: event.target.value })} /></div>
        <div className="admin-field"><label>Úvodný text stránky</label><textarea rows={6} value={area.intro ?? ""} onChange={(event) => update(index, { intro: event.target.value })} placeholder="Vlastný praktický úvod pre túto oblasť…" /></div>
        <div className="admin-upload-row"><div className="admin-upload-preview admin-upload-preview--coral">{area.imageUrl ? <img src={area.imageUrl} alt="Náhľad oblasti" /> : <span>🐶</span>}</div><div className="admin-upload-actions"><label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => void upload(index, event)} disabled={Boolean(uploading)} />{uploading === area.slug ? "Nahrávam…" : area.imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"}</label>{area.imageUrl && <button type="button" onClick={() => update(index, { imageUrl: "", imageAlt: "" })}>Odstrániť fotku</button>}<small>JPG, PNG, WebP alebo AVIF, najviac 8 MB.</small></div></div>
        {area.imageUrl && <div className="admin-field"><label>Alt text obrázka</label><input value={area.imageAlt ?? ""} onChange={(event) => update(index, { imageAlt: event.target.value })} placeholder={`Fotografia: ${area.label}`} /></div>}
        <div className="admin-puppy-content-actions"><button type="button" onClick={() => move(index, -1)} disabled={index === 0}>↑ Vyššie</button><button type="button" onClick={() => move(index, 1)} disabled={index === areas.length - 1}>↓ Nižšie</button><Link href={`/admin/novy?sekcia=steniatka&oblast=${area.slug}`}>+ Pridať článok do oblasti</Link><Link href={`/steniatka/${area.slug}`} target="_blank">Pozrieť stránku ↗</Link></div>
      </div>
    </details>)}</div>
    {(message || error) && <p className={`admin-editor-message ${error ? "is-error" : "is-success"}`} role="status">{error || message}</p>}
  </section>;
}
