"use client";

import { useState } from "react";
import type { ManagedPortalSection } from "@/lib/section-store";
import type { PortalSubpage } from "@/lib/portal";

export function AdminSectionEditor({ initialSections }: { initialSections: ManagedPortalSection[] }) {
  const [sections, setSections] = useState(initialSections);
  const [open, setOpen] = useState<string | null>(initialSections[0]?.slug ?? null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const update = (slug: string, patch: Partial<ManagedPortalSection>) => { setSections((current) => current.map((section) => section.slug === slug ? { ...section, ...patch } : section)); setMessage(""); };
  const updateSubpage = (sectionSlug: string, index: number, patch: Partial<PortalSubpage>) => setSections((current) => current.map((section) => section.slug === sectionSlug ? { ...section, subpages: section.subpages.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) } : section));
  const move = (index: number, direction: -1 | 1) => setSections((current) => { const target = index + direction; if (target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next.map((section, position) => ({ ...section, position })); });
  const addSubpage = (slug: string) => setSections((current) => current.map((section) => section.slug === slug ? { ...section, subpages: [...section.subpages, { slug: "nova-podsekcia", label: "Nová podsekcia", description: "" }] } : section));
  const removeSubpage = (slug: string, index: number) => setSections((current) => current.map((section) => section.slug === slug ? { ...section, subpages: section.subpages.filter((_, itemIndex) => itemIndex !== index) } : section));
  async function save() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/sections", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sections }) });
      const data = await response.json() as { sections?: ManagedPortalSection[]; error?: string };
      if (!response.ok || !data.sections) throw new Error(data.error || "Sekcie sa nepodarilo uložiť.");
      setSections(data.sections); setMessage("Sekcie sú uložené a verejný web používa nové texty aj poradie.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sekcie sa nepodarilo uložiť."); }
    finally { setSaving(false); }
  }
  return <section className="admin-section-manager">
    <div className="admin-section-list">{sections.map((section, index) => <article className="admin-section-item" key={section.slug}>
      <header>
        <button type="button" className="admin-section-toggle" onClick={() => setOpen(open === section.slug ? null : section.slug)}><span>{section.icon}</span><strong>{section.label}</strong><small>/{section.slug}</small></button>
        <div className="admin-navigation-actions"><button type="button" className={section.visible ? "is-visible" : ""} onClick={() => update(section.slug, { visible: !section.visible })}>{section.visible ? "Zobrazená" : "Skrytá"}</button><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === sections.length - 1} onClick={() => move(index, 1)}>↓</button></div>
      </header>
      {open === section.slug && <div className="admin-section-body">
        <div className="admin-field-grid"><label className="admin-field">Názov sekcie<input value={section.label} onChange={(event) => update(section.slug, { label: event.target.value })} /></label><label className="admin-field">Krátky nadpis<input value={section.eyebrow} onChange={(event) => update(section.slug, { eyebrow: event.target.value })} /></label></div>
        <label className="admin-field">Popis pre karty a vyhľadávače<textarea rows={2} value={section.description} onChange={(event) => update(section.slug, { description: event.target.value })} /></label>
        <label className="admin-field">Úvodný text sekcie<textarea rows={4} value={section.intro} onChange={(event) => update(section.slug, { intro: event.target.value })} /></label>
        <div className="admin-subsection-heading"><div><strong>Podsekcie</strong><small>Názov, adresa a vysvetlenie, ktoré sa zobrazia na verejnej stránke.</small></div><button type="button" onClick={() => addSubpage(section.slug)}>+ Pridať podsekciu</button></div>
        <div className="admin-subsection-list">{section.subpages.map((subpage, subIndex) => <div className="admin-subsection-row" key={`${subpage.slug}-${subIndex}`}><label>Názov<input value={subpage.label} onChange={(event) => updateSubpage(section.slug, subIndex, { label: event.target.value })} /></label><label>Adresa<input value={subpage.slug} onChange={(event) => updateSubpage(section.slug, subIndex, { slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></label><label>Popis<textarea rows={2} value={subpage.description} onChange={(event) => updateSubpage(section.slug, subIndex, { description: event.target.value })} /></label><button type="button" onClick={() => removeSubpage(section.slug, subIndex)}>Odstrániť</button></div>)}</div>
      </div>}
    </article>)}</div>
    <div className="admin-navigation-savebar">{message && <p role="status">{message}</p>}<button type="button" className="admin-primary-action" disabled={saving} onClick={save}>{saving ? "Ukladám…" : "Uložiť sekcie"}</button></div>
  </section>;
}
