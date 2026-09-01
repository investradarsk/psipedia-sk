"use client";

import Link from "next/link";
import { useState } from "react";
import type { ManagedPortalSection } from "@/lib/section-store";
import type { PortalSubpage } from "@/lib/portal";

function lines(value?: string[]) { return value?.join("\n") ?? ""; }
function fromLines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }
function serviceLines(value?: { label: string; href: string }[]) { return value?.map((item) => `${item.label} | ${item.href}`).join("\n") ?? ""; }
function fromServiceLines(value: string) {
  return value.split("\n").map((item) => {
    const [label, ...href] = item.split("|");
    return { label: label.trim(), href: href.join("|").trim() };
  }).filter((item) => item.label && item.href);
}

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
  const moveSubpage = (slug: string, index: number, direction: -1 | 1) => setSections((current) => current.map((section) => {
    if (section.slug !== slug) return section;
    const target = index + direction;
    if (target < 0 || target >= section.subpages.length) return section;
    const subpages = [...section.subpages];
    [subpages[index], subpages[target]] = [subpages[target], subpages[index]];
    return { ...section, subpages };
  }));
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
        <div className="admin-navigation-actions"><Link href={`/${section.slug}`} target="_blank">Náhľad</Link><button type="button" className={section.visible ? "is-visible" : ""} onClick={() => update(section.slug, { visible: !section.visible })}>{section.visible ? "Zobrazená" : "Skrytá"}</button><button type="button" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" disabled={index === sections.length - 1} onClick={() => move(index, 1)}>↓</button></div>
      </header>
      {open === section.slug && <div className="admin-section-body">
        <div className="admin-field-grid"><label className="admin-field">Názov sekcie<input value={section.label} onChange={(event) => update(section.slug, { label: event.target.value })} /></label><label className="admin-field">Krátky nadpis<input value={section.eyebrow} onChange={(event) => update(section.slug, { eyebrow: event.target.value })} /></label></div>
        <label className="admin-field">Popis pre karty a vyhľadávače<textarea rows={2} value={section.description} onChange={(event) => update(section.slug, { description: event.target.value })} /></label>
        <label className="admin-field">Úvodný text sekcie<textarea rows={4} value={section.intro} onChange={(event) => update(section.slug, { intro: event.target.value })} /></label>
        <div className="admin-subsection-heading"><div><strong>Podsekcie</strong><small>Názov, adresa a vysvetlenie, ktoré sa zobrazia na verejnej stránke.</small></div><button type="button" onClick={() => addSubpage(section.slug)}>+ Pridať podsekciu</button></div>
        <div className="admin-subsection-list">{section.subpages.map((subpage, subIndex) => {
          const completeness = [subpage.intro, subpage.popularTopics?.length, subpage.commonQuestions?.length, subpage.warningSigns?.length, subpage.serviceLinks?.length].filter(Boolean).length;
          const isStructuredSection = section.slug === "starostlivost" || section.slug === "aktivity";
          const isActivitySection = section.slug === "aktivity";
          return <article className="admin-subsection-row" key={`${subpage.slug}-${subIndex}`}>
            <header className="admin-subsection-row-header">
              <div><span aria-hidden="true">{subpage.icon || "🐾"}</span><strong>{subpage.label || "Nová podsekcia"}</strong>{isStructuredSection && <small>{completeness}/5 častí vyplnených</small>}</div>
              <div><button type="button" className={subpage.visible === false ? "" : "is-visible"} onClick={() => updateSubpage(section.slug, subIndex, { visible: subpage.visible === false })}>{subpage.visible === false ? "Skrytá" : "Zobrazená"}</button><button type="button" disabled={subIndex === 0} onClick={() => moveSubpage(section.slug, subIndex, -1)}>↑</button><button type="button" disabled={subIndex === section.subpages.length - 1} onClick={() => moveSubpage(section.slug, subIndex, 1)}>↓</button></div>
            </header>
            <div className="admin-subsection-basic">
              <label>Ikona<input value={subpage.icon ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { icon: event.target.value })} placeholder="🐾" /></label>
              <label>Názov<input value={subpage.label} onChange={(event) => updateSubpage(section.slug, subIndex, { label: event.target.value })} /></label>
              <label>Adresa<input value={subpage.slug} onChange={(event) => updateSubpage(section.slug, subIndex, { slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} /></label>
            </div>
            <label>Popis na karte<textarea rows={2} value={subpage.description} onChange={(event) => updateSubpage(section.slug, subIndex, { description: event.target.value })} /></label>
            <label>Úvod podstránky<textarea rows={3} value={subpage.intro ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { intro: event.target.value })} /></label>
            <div className="admin-subsection-basic admin-subsection-media">
              <label>Obrázok<input value={subpage.imageUrl ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { imageUrl: event.target.value })} placeholder="/media/... alebo https://..." /></label>
              <label>ALT text<input value={subpage.imageAlt ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { imageAlt: event.target.value })} /></label>
            </div>
            {isStructuredSection && <details className={`admin-care-area-fields ${isActivitySection ? "admin-activity-area-fields" : ""}`} open={subIndex === 0}>
              <summary>{isActivitySection ? "Obsah oblasti výcviku a aktivít" : "Obsah poradenskej oblasti"}</summary>
              <p>Každú položku zoznamu napíš na samostatný riadok. Odkazy zapisuj ako <code>Názov | /adresa</code>.</p>
              <div className="admin-field-grid">
                <label>{isActivitySection ? "Aktivity a témy" : "Najčastejšie témy"}<textarea rows={5} value={lines(subpage.popularTopics)} onChange={(event) => updateSubpage(section.slug, subIndex, { popularTopics: fromLines(event.target.value) })} /></label>
                <label>Najčastejšie otázky<textarea rows={5} value={lines(subpage.commonQuestions)} onChange={(event) => updateSubpage(section.slug, subIndex, { commonQuestions: fromLines(event.target.value) })} /></label>
                <label>{isActivitySection ? "Ako začať" : "Čo sledovať alebo urobiť doma"}<textarea rows={6} value={lines(subpage.homeSteps)} onChange={(event) => updateSubpage(section.slug, subIndex, { homeSteps: fromLines(event.target.value) })} /></label>
                <label>{isActivitySection ? "Bezpečnosť a limity" : "Varovné signály"}<textarea rows={6} value={lines(subpage.warningSigns)} onChange={(event) => updateSubpage(section.slug, subIndex, { warningSigns: fromLines(event.target.value) })} /></label>
                <label className="admin-field--full">{isActivitySection ? "Čo zvážiť pri výbere" : "Kedy vyhľadať odborníka"}<textarea rows={3} value={subpage.expertAdvice ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { expertAdvice: event.target.value })} /></label>
                <label>{isActivitySection ? "Kontakty a súvisiace služby" : "Užitočné kontakty"}<textarea rows={4} value={serviceLines(subpage.serviceLinks)} onChange={(event) => updateSubpage(section.slug, subIndex, { serviceLinks: fromServiceLines(event.target.value) })} /></label>
                <label>Pripnuté články – slugy<textarea rows={4} value={lines(subpage.featuredArticleSlugs)} onChange={(event) => updateSubpage(section.slug, subIndex, { featuredArticleSlugs: fromLines(event.target.value) })} /></label>
                <label>SEO title<input value={subpage.seoTitle ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { seoTitle: event.target.value })} /></label>
                <label>Meta description<textarea rows={3} value={subpage.metaDescription ?? ""} onChange={(event) => updateSubpage(section.slug, subIndex, { metaDescription: event.target.value })} /></label>
              </div>
            </details>}
            <button type="button" className="admin-subsection-remove" onClick={() => removeSubpage(section.slug, subIndex)}>Odstrániť podsekciu</button>
          </article>;
        })}</div>
      </div>}
    </article>)}</div>
    <div className="admin-navigation-savebar">{message && <p role="status">{message}</p>}<button type="button" className="admin-primary-action" disabled={saving} onClick={save}>{saving ? "Ukladám…" : "Uložiť sekcie"}</button></div>
  </section>;
}
