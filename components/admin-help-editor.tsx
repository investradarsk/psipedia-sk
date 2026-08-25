"use client";

import Link from "next/link";
import { ChangeEvent, useState } from "react";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import {
  defaultHelpActionLabel,
  getHelpCategory,
  helpCategories,
  type HelpCase,
  type HelpCaseStatus,
  type HelpCategorySlug,
} from "@/lib/help";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { AdminSeoFields } from "@/components/admin-seo-fields";
import { helpSeoFallback } from "@/lib/content-seo";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

export function AdminHelpEditor({ item }: { item?: HelpCase }) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [slug, setSlug] = useState(item?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(item));
  const [category, setCategory] = useState<HelpCategorySlug>(item?.category ?? "adopcia");
  const [excerpt, setExcerpt] = useState(item?.excerpt ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [organization, setOrganization] = useState(item?.organization ?? "");
  const [dogName, setDogName] = useState(item?.dogName ?? "");
  const [breed, setBreed] = useState(item?.breed ?? "");
  const [ageNote, setAgeNote] = useState(item?.ageNote ?? "");
  const [city, setCity] = useState(item?.city ?? "");
  const [region, setRegion] = useState<SlovakRegion>(item?.region ?? "Nitriansky kraj");
  const [locationNote, setLocationNote] = useState(item?.locationNote ?? "");
  const [reportedDate, setReportedDate] = useState(item?.reportedDate ?? "");
  const [deadlineDate, setDeadlineDate] = useState(item?.deadlineDate ?? "");
  const [actionLabel, setActionLabel] = useState(item?.actionLabel ?? defaultHelpActionLabel("adopcia"));
  const [actionUrl, setActionUrl] = useState(item?.actionUrl ?? "");
  const [contactNote, setContactNote] = useState(item?.contactNote ?? "");
  const [goalAmount, setGoalAmount] = useState(item?.goalAmount?.toString() ?? "");
  const [raisedAmount, setRaisedAmount] = useState(item?.raisedAmount?.toString() ?? "");
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [imageKey, setImageKey] = useState(item?.imageKey ?? "");
  const [verified, setVerified] = useState(item?.verified ?? false);
  const [urgent, setUrgent] = useState(item?.urgent ?? false);
  const [resolved, setResolved] = useState(item?.resolved ?? false);
  const [status, setStatus] = useState<HelpCaseStatus>(item?.status ?? "draft");
  const [seo, setSeo] = useState(item?.seo ?? {});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function changeTitle(value: string) {
    setTitle(value); if (!slugEdited) setSlug(slugify(value));
  }

  function changeCategory(value: HelpCategorySlug) {
    const oldDefault = defaultHelpActionLabel(category);
    setCategory(value);
    if (!actionLabel || actionLabel === oldDefault) setActionLabel(defaultHelpActionLabel(value));
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "help");
      setImageUrl(data.imageUrl); setImageKey(data.imageKey); setMessage(adminImageUploadMessage(data, "Ulož prípad."));
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať."); }
    finally { setUploading(false); event.target.value = ""; }
  }

  async function save(nextStatus: HelpCaseStatus) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(item ? `/api/admin/help/${item.id}` : "/api/admin/help", {
        method: item ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, slug, category, status: nextStatus, excerpt, description, organization, dogName, breed, ageNote, city, region, locationNote, reportedDate: reportedDate || null, deadlineDate: deadlineDate || null, actionLabel, actionUrl: actionUrl || null, contactNote, goalAmount: goalAmount || null, raisedAmount: raisedAmount || null, imageUrl: imageUrl || null, imageKey: imageKey || null, verified, urgent, resolved, seo }),
      });
      const data = await response.json() as { item?: HelpCase; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error || "Prípad sa nepodarilo uložiť.");
      setStatus(data.item.status); setMessage(nextStatus === "published" ? "Prípad je publikovaný v sekcii Pomoc psom." : "Koncept je bezpečne uložený.");
      if (!item) window.location.assign(`/admin/pomoc/${data.item.id}?vytvorene=1`);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Prípad sa nepodarilo uložiť."); }
    finally { setSaving(false); }
  }

  const categoryInfo = getHelpCategory(category);
  return <form className="admin-event-editor admin-help-editor" onSubmit={(event) => { event.preventDefault(); void save("draft"); }}><div className="admin-event-editor-grid"><div className="admin-event-fields">
    <section className="admin-form-card admin-form-card--intro"><div className="admin-field admin-field--title"><label htmlFor="help-title">Názov prípadu alebo výzvy</label><input id="help-title" value={title} onChange={(event) => changeTitle(event.target.value)} placeholder="Napríklad: Ben hľadá pokojný domov" required /></div><div className="admin-field"><label htmlFor="help-excerpt">Krátky popis</label><textarea id="help-excerpt" rows={3} value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Čo sa deje a aká pomoc je potrebná?" required /><small>{excerpt.length} znakov · odporúčame 80–180</small></div></section>
    <section className="admin-form-card"><div className="admin-card-heading"><div><span>01</span><div><h2>Zaradenie a zodpovednosť</h2><p>Kategória, organizácia a miesto prípadu.</p></div></div></div><div className="admin-field-grid"><div className="admin-field"><label htmlFor="help-category">Kategória</label><select id="help-category" value={category} onChange={(event) => changeCategory(event.target.value as HelpCategorySlug)}>{helpCategories.map((entry) => <option value={entry.slug} key={entry.slug}>{entry.label}</option>)}</select></div><div className="admin-field"><label htmlFor="help-organization">Zodpovedná organizácia alebo osoba</label><input id="help-organization" value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Názov útulku alebo overenej osoby" required /></div><div className="admin-field"><label htmlFor="help-region">Kraj</label><select id="help-region" value={region} onChange={(event) => setRegion(event.target.value as SlovakRegion)}>{slovakRegions.map((entry) => <option key={entry}>{entry}</option>)}</select></div><div className="admin-field"><label htmlFor="help-city">Mesto</label><input id="help-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Zlaté Moravce alebo Online" required /></div></div><div className="admin-field"><label htmlFor="help-location">Spresnenie lokality <small>nepovinné</small></label><input id="help-location" value={locationNote} onChange={(event) => setLocationNote(event.target.value)} placeholder="Mestská časť, ulica alebo približné miesto" /></div></section>
    <section className="admin-form-card"><div className="admin-card-heading"><div><span>02</span><div><h2>Informácie o prípade</h2><p>Príbeh, pes a dôležité termíny.</p></div></div></div><div className="admin-field"><label htmlFor="help-description">Podrobný popis</label><textarea id="help-description" rows={9} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={"Vysvetli situáciu, čo už bolo urobené a aká konkrétna pomoc je potrebná.\n\nNový odsek začni po prázdnom riadku."} required /></div><div className="admin-field-grid"><div className="admin-field"><label htmlFor="help-dog-name">Meno psa <small>nepovinné</small></label><input id="help-dog-name" value={dogName} onChange={(event) => setDogName(event.target.value)} placeholder="Ben" /></div><div className="admin-field"><label htmlFor="help-breed">Plemeno alebo typ <small>nepovinné</small></label><input id="help-breed" value={breed} onChange={(event) => setBreed(event.target.value)} placeholder="Kríženec, labrador…" /></div><div className="admin-field"><label htmlFor="help-age">Vek <small>nepovinné</small></label><input id="help-age" value={ageNote} onChange={(event) => setAgeNote(event.target.value)} placeholder="asi 3 roky" /></div><div className="admin-field"><label htmlFor="help-reported">Dátum prípadu <small>nepovinné</small></label><input id="help-reported" type="date" value={reportedDate} onChange={(event) => setReportedDate(event.target.value)} /></div><div className="admin-field"><label htmlFor="help-deadline">Termín pomoci <small>nepovinné</small></label><input id="help-deadline" type="date" value={deadlineDate} onChange={(event) => setDeadlineDate(event.target.value)} /></div></div></section>
    <section className="admin-form-card"><div className="admin-card-heading"><div><span>03</span><div><h2>Výzva, zbierka a fotografia</h2><p>Oficiálny odkaz, transparentný cieľ a označenia.</p></div></div></div><div className="admin-field-grid"><div className="admin-field"><label htmlFor="help-action-label">Text hlavného tlačidla</label><input id="help-action-label" value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} placeholder={defaultHelpActionLabel(category)} /></div><div className="admin-field"><label htmlFor="help-action-url">Oficiálny odkaz <small>nepovinné</small></label><input id="help-action-url" type="url" value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} placeholder="https://…" /></div><div className="admin-field"><label htmlFor="help-goal">Cieľ zbierky v € <small>iba zbierky</small></label><input id="help-goal" type="number" min="0" step="1" value={goalAmount} onChange={(event) => setGoalAmount(event.target.value)} placeholder="3000" /></div><div className="admin-field"><label htmlFor="help-raised">Doteraz vyzbierané v €</label><input id="help-raised" type="number" min="0" step="1" value={raisedAmount} onChange={(event) => setRaisedAmount(event.target.value)} placeholder="1250" /></div></div><div className="admin-field"><label htmlFor="help-contact-note">Poznámka pred kontaktovaním <small>nepovinné</small></label><textarea id="help-contact-note" rows={3} value={contactNote} onChange={(event) => setContactNote(event.target.value)} placeholder="Čo má záujemca uviesť alebo vedieť pred kontaktovaním?" /></div><div className="admin-field"><label htmlFor="help-slug">Adresa prípadu</label><div className="admin-slug-input"><span>psipedia.sk/pomoc-psom/{category}/</span><input id="help-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} placeholder="nazov-pripadu" required /></div></div><div className="admin-upload-row"><div className="admin-upload-preview admin-upload-preview--coral">{imageUrl ? <img src={imageUrl} alt="Náhľad fotografie prípadu" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div><div className="admin-upload-actions"><label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadImage} disabled={uploading} />{uploading ? "Nahrávam…" : imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"}</label>{imageUrl && <button type="button" onClick={() => { setImageUrl(""); setImageKey(""); }}>Odstrániť fotku</button>}<small>Odporúčaný pomer 4 : 3, najviac 8 MB.</small></div></div><div className="admin-help-flags"><label className="admin-event-cancelled"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /><span><strong>Overený prípad</strong><small>Redakcia preverila organizáciu a základné údaje.</small></span></label><label className="admin-event-cancelled"><input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /><span><strong>Urgentné</strong><small>Zobrazí sa medzi prvými a s výrazným označením.</small></span></label><label className="admin-event-cancelled"><input type="checkbox" checked={resolved} onChange={(event) => setResolved(event.target.checked)} /><span><strong>Vybavené</strong><small>Prípad zostane dohľadateľný, ale nebude žiadať ďalšiu pomoc.</small></span></label></div></section>
    <AdminSeoFields value={seo} onChange={setSeo} canonicalPath={`/pomoc-psom/${category}/${slug}`} fallbackTitle={helpSeoFallback(title||"Názov prípadu",categoryInfo?.singular??"Pomoc psom",city).title} fallbackDescription={helpSeoFallback(title||"Názov prípadu",categoryInfo?.singular??"Pomoc psom",city).description}/>
  </div><aside className="admin-event-preview admin-help-preview"><span className="admin-eyebrow">Živý súhrn</span><div className="admin-event-preview-visual">{imageUrl ? <img src={imageUrl} alt="" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div><span className="eyebrow">{categoryInfo?.singular}{verified ? " · Overené" : ""}</span><h2>{title || "Názov prípadu"}</h2><p>{excerpt || "Krátky popis prípadu sa zobrazí tu."}</p><dl><div><dt>Lokalita</dt><dd>{city || "Mesto"} · {region}</dd></div><div><dt>Zodpovedá</dt><dd>{organization || "Organizácia"}</dd></div><div><dt>Stav</dt><dd>{resolved ? "Vybavené" : urgent ? "Urgentné" : "Aktívne"}</dd></div></dl></aside></div>{(message || error) && <div className={`admin-editor-message ${error ? "is-error" : "is-success"}`} role="status">{error || message}</div>}<div className="admin-editor-actions"><div><Link href="/admin/pomoc">← Späť na prípady</Link></div><div>{status === "published" && <button className="admin-unpublish" type="button" disabled={saving || uploading} onClick={() => void save("draft")}>Stiahnuť z webu</button>}<button className="admin-save-draft" type="submit" disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť koncept"}</button><button className="admin-publish" type="button" disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : status === "published" ? "Uložiť zmeny" : "Publikovať prípad"}</button></div></div></form>;
}
