"use client";
import { useProfileEditorHydrated, useProfileEditorSectionPager } from "@/components/admin-profile-editor-section-pager";
import { AdminEditorFooter } from "@/components/admin-editor-footer";
import { AdminSharedEditorNavigation } from "@/components/admin-shared-editor-navigation";
import { AdminEditorSectionVisibility } from "@/components/admin-editor-section-visibility";
import { AdminEditorSection } from "@/components/admin-interaction-system";
import {AdminSingleImageUpload} from "@/components/admin-single-image-upload";
import {adminSelectedImage} from "@/lib/admin-selected-image";
import { AdminLexicalAppendButton } from "@/components/admin-lexical-append-button";
import { AdminLexicalTextField } from "@/components/admin-lexical-text-field";
import { appendLexicalPlainText } from "@/lib/editorial-lexical-append";

import Link from "next/link";
import { AdminActionButton, AdminModalDialog } from "@/components/admin-interaction-system";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import { AdminShareToFacebook } from "@/components/admin-share-to-facebook";
import { EditorUnsavedChangesGuard } from "@/components/admin-editor-workspace";
import { useAdminUnsavedFormLinks } from "@/components/admin-unsaved-form-links";
import { ChangeEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import {
  defaultHelpActionLabel,
  getHelpCategory,
  type HelpCase,
  type HelpCaseStatus,
  type HelpCategorySlug,
} from "@/lib/help";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { ImageDisplayEditor } from "@/components/image-display-editor";
import { ImageDisplay } from "@/components/image-display";
import type { ImageDisplayConfig } from "@/lib/image-display";
import { AdminSeoFields } from "@/components/admin-seo-fields";
import { AdminAutomationUpdateSuggestions } from "@/components/admin-automation-update-suggestions";
import type { CanonicalUpdateSuggestion } from "@/lib/data-automation-update-review";
import { helpSeoFallback } from "@/lib/content-seo";
import { HELP_ADMIN_CREATE_CATEGORIES } from "@/lib/help-admin-query";
import styles from "./admin-help-bulk.module.css";

const HELP_SECTIONS = [
  { id: "help-basics", label: "Základné údaje" },
  { id: "help-place", label: "Zaradenie a lokalita" },
  { id: "help-story", label: "Prípad a pes" },
  { id: "help-action", label: "Výzva a zbierka" },
  { id: "help-media", label: "Fotografia a stav" },
  { id: "help-seo", label: "SEO" },
] as const;

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

export function AdminHelpEditor({ item, automationSuggestions = [] }: { item?: HelpCase; automationSuggestions?: CanonicalUpdateSuggestion[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? "");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const titleDraftRef = useRef(item?.title ?? "");
  const [slug, setSlug] = useState(item?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(item));
  const [category, setCategory] = useState<HelpCategorySlug>(item?.category ?? "docasna-opatera");
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
  const [actionLabel, setActionLabel] = useState(item?.actionLabel ?? defaultHelpActionLabel("docasna-opatera"));
  const [actionUrl, setActionUrl] = useState(item?.actionUrl ?? "");
  const [contactNote, setContactNote] = useState(item?.contactNote ?? "");
  const [goalAmount, setGoalAmount] = useState(item?.goalAmount?.toString() ?? "");
  const [raisedAmount, setRaisedAmount] = useState(item?.raisedAmount?.toString() ?? "");
  const [imageUrl, setImageUrl] = useState(item?.imageUrl ?? "");
  const [imageKey, setImageKey] = useState(item?.imageKey ?? "");
  const [thumbnailImageDisplay, setThumbnailImageDisplay] = useState<ImageDisplayConfig | null>(item?.thumbnailImageDisplay ?? null);
  const [detailImageDisplay, setDetailImageDisplay] = useState<ImageDisplayConfig | null>(item?.detailImageDisplay ?? null);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [verified, setVerified] = useState(item?.verified ?? false);
  const [urgent, setUrgent] = useState(item?.urgent ?? false);
  const [resolved, setResolved] = useState(item?.resolved ?? false);
  const [status, setStatus] = useState<HelpCaseStatus>(item?.status ?? "draft");
  const [seo, setSeo] = useState(item?.seo ?? {});
  const [confirmUnpublish, setConfirmUnpublish] = useState(false);
  const mutationPending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeHelpSection, setActiveHelpSection] = useState<string>(HELP_SECTIONS[0].id);
  const activeHelpIndex = HELP_SECTIONS.findIndex((section) => section.id === activeHelpSection);
  const navigateHelpPager = useProfileEditorSectionPager(activeHelpSection, setActiveHelpSection);
  const hydrated = useProfileEditorHydrated();
  const navigation = useAdminUnsavedFormLinks();

  function changeTitle(value: string) {
    titleDraftRef.current = value;
    setTitle(value); if (!slugEdited) setSlug(slugify(value));
  }

  function changeCategory(value: HelpCategorySlug) {
    const oldDefault = defaultHelpActionLabel(category);
    setCategory(value);
    if (!actionLabel || actionLabel === oldDefault) setActionLabel(defaultHelpActionLabel(value));
  }

  async function uploadImage(event: File | ChangeEvent<HTMLInputElement>) {
    const file = adminSelectedImage(event); if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "help");
      navigation.markDirty();
      setImageUrl(data.imageUrl); setImageKey(data.imageKey); setThumbnailImageDisplay(null); setDetailImageDisplay(null); setMessage(adminImageUploadMessage(data, "Ulož prípad."));
    } catch (uploadError) { setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať."); }
    finally { setUploading(false); }
  }

  function applyAutomationUpdate(values: Record<string, unknown>) {
    if (Object.keys(values).length) navigation.markDirty();
    for (const [field, value] of Object.entries(values)) {
      const text = value === null || value === undefined ? "" : String(value);
      if (field === "title") { titleDraftRef.current = text; setTitle(text); }
      else if (field === "excerpt") setExcerpt(text);
      else if (field === "description") setDescription(text);
      else if (field === "organization") setOrganization(text);
      else if (field === "dogName") setDogName(text);
      else if (field === "breed") setBreed(text);
      else if (field === "ageNote") setAgeNote(text);
      else if (field === "city") setCity(text);
      else if (field === "region") setRegion(text as SlovakRegion);
      else if (field === "locationNote") setLocationNote(text);
      else if (field === "reportedDate") setReportedDate(text);
      else if (field === "deadlineDate") setDeadlineDate(text);
      else if (field === "actionUrl") setActionUrl(text);
      else if (field === "contactNote") setContactNote(text);
      else if (field === "goalAmount") setGoalAmount(value === null || value === undefined ? "" : String(value));
      else if (field === "raisedAmount") setRaisedAmount(value === null || value === undefined ? "" : String(value));
    }
  }

  async function save(nextStatus: HelpCaseStatus) {
    if (mutationPending.current || uploading) return;
    // A hidden native required field cannot be focused. Show the matching
    // mounted panel before submitting; keep canonical server validation.
    const missing = [
      { section: "help-basics", valid: Boolean((titleDraftRef.current || title).trim()), label: "Názov prípadu" },
      { section: "help-media", valid: Boolean(slug.trim() || slugify(titleDraftRef.current || title)), label: "Adresa prípadu" },
      ...(nextStatus === "published" ? [
        { section: "help-basics", valid: excerpt.trim().length >= 20, label: "Krátky popis (aspoň 20 znakov)" },
        { section: "help-story", valid: description.trim().length >= 40, label: "Podrobný popis (aspoň 40 znakov)" },
        { section: "help-place", valid: Boolean(organization.trim()), label: "Zodpovedná organizácia alebo osoba" },
        { section: "help-place", valid: Boolean(city.trim()), label: "Mesto" },
      ] : []),
    ].find((field) => !field.valid);
    if (missing) {
      setActiveHelpSection(missing.section);
      setMessage("");
      setError("Vyplň alebo oprav: " + missing.label + ".");
      return;
    }
    // Preserve the server's existing rule: public fundraisers must be verified.
    if (nextStatus === "published" && category === "zbierky" && !verified) {
      setActiveHelpSection("help-media");
      setMessage("");
      setError("Zbierku možno publikovať až po overení prípadu.");
      return;
    }
    const submittedRevision = navigation.getRevision();
    mutationPending.current = true;
    setConfirmUnpublish(false);
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(item ? `/api/admin/help/${item.id}` : "/api/admin/help", {
        method: item ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: titleDraftRef.current || titleInputRef.current?.value || title, slug, category, status: nextStatus, excerpt, description, organization, dogName, breed, ageNote, city, region, locationNote, reportedDate: reportedDate || null, deadlineDate: deadlineDate || null, actionLabel, actionUrl: actionUrl || null, contactNote, goalAmount: goalAmount || null, raisedAmount: raisedAmount || null, imageUrl: imageUrl || null, imageKey: imageKey || null, thumbnailImageDisplay, detailImageDisplay, verified, urgent, resolved, seo }),
      });
      const data = await response.json() as { item?: HelpCase; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error || "Prípad sa nepodarilo uložiť.");
      if (item) navigation.markSavedIfUnchanged(submittedRevision);
      else navigation.markSavedBeforeRedirect();
      setStatus(data.item.status); setMessage(nextStatus === "published" ? "Prípad je publikovaný v sekcii Pomoc psom." : "Koncept je bezpečne uložený.");
      if (!item) router.replace(`/admin/pomoc/${data.item.id}?vytvorene=1`);
    } catch (saveError) {
      const details = saveError instanceof Error ? saveError.message : "Prípad sa nepodarilo uložiť.";
      if (/odkaz|zbierk|suma|sumu/i.test(details)) setActiveHelpSection("help-action");
      else if (/podrobný popis|dátum|termín/i.test(details)) setActiveHelpSection("help-story");
      else if (/organizáci|mesto|obec|kraj|kategóri/i.test(details)) setActiveHelpSection("help-place");
      else if (/adresa prípadu|obrázk|fotograf/i.test(details)) setActiveHelpSection("help-media");
      else if (/názov|krátky popis/i.test(details)) setActiveHelpSection("help-basics");
      setError(details);
    }
    finally { mutationPending.current = false; setSaving(false); }
  }

  const categoryInfo = getHelpCategory(category);
  const categoryOptions = HELP_ADMIN_CREATE_CATEGORIES.map((slug) => getHelpCategory(slug)).filter((entry): entry is NonNullable<ReturnType<typeof getHelpCategory>> => Boolean(entry));
  if (item?.category === "urgentne-pripady") { const legacy = getHelpCategory("urgentne-pripady"); if (legacy) categoryOptions.push(legacy); }
  return <form inert={saving} aria-busy={saving} noValidate data-admin-help-editor data-hydrated={hydrated ? "true" : "false"} data-admin-form-system="v4" className={`${styles.editor} admin-event-editor admin-help-editor`} onChangeCapture={navigation.captureChange} onClickCapture={navigation.captureLinkClick} onSubmit={(event) => { event.preventDefault(); void save(status); }}><fieldset className="admin-profile-hydration-gate" disabled={!hydrated}><EditorUnsavedChangesGuard active={navigation.dirty} open={navigation.confirmOpen} onStay={navigation.stay} onDiscard={navigation.discard} allowNativeExitRef={navigation.allowNativeExitRef} /><div className={styles.editorBoundary} role="note"><strong>Pomoc psom – prípady a výzvy</strong><span>Adopcie, stratené či nájdené psy a organizácie majú samostatné editory.</span><nav className={styles.moduleLinks} aria-label="Samostatné admin moduly"><Link href="/admin/adopcie">Adopcie</Link><Link href="/admin/stratene-najdene">Stratené / nájdené</Link><Link href="/admin/organizacie">Organizácie</Link></nav></div><AdminEditorSectionVisibility.Provider value={{ activeId: activeHelpSection, mode: "switch" }}>
    <div className={styles.helpEditorLayout} data-admin-help-editor-workspace>
      <AdminSharedEditorNavigation sections={HELP_SECTIONS} activeId={activeHelpSection} onNavigate={setActiveHelpSection}
        layout="sidebar" mode="switch" ariaLabel="Sekcie editora Pomoc psom" />
      <div className={styles.helpEditorBody}>
        <AdminFormFeedback message={message} error={error} pending={saving} className="admin-editor-message" errorClassName="is-error" successClassName="is-success" />
        <div className="admin-event-editor-grid"><div className="admin-event-fields">
    <AdminAutomationUpdateSuggestions initialSuggestions={automationSuggestions} onAccepted={applyAutomationUpdate} />
    <AdminEditorSection id="help-basics" className="admin-form-card admin-form-card--intro"><div className="admin-card-heading"><div><span>01</span><div><h2>Základné údaje</h2><p>Názov a krátke vysvetlenie, aká pomoc je potrebná.</p></div></div></div><div className="admin-field admin-field--title"><label htmlFor="help-title">Názov prípadu alebo výzvy</label><input ref={titleInputRef} id="help-title" value={title} onChange={(event) => changeTitle(event.target.value)} placeholder="Napríklad: Ben hľadá pokojný domov" required /></div><div className="admin-field"><label htmlFor="help-excerpt">Krátky popis</label><AdminLexicalTextField id="help-excerpt" rows={3} value={excerpt} onChange={(next) => { setExcerpt(next); navigation.markDirty(); }} placeholder="Čo sa deje a aká pomoc je potrebná?" required ariaLabel="Krátky popis" /><small>{excerpt.length} znakov · odporúčame 80–180</small></div></AdminEditorSection>
    <AdminEditorSection id="help-place" className="admin-form-card"><div className="admin-card-heading"><div><span>02</span><div><h2>Zaradenie a lokalita</h2><p>Kategória, organizácia a miesto prípadu.</p></div></div></div><div className="admin-field-grid"><div className="admin-field"><label htmlFor="help-category">Kategória</label><select id="help-category" value={category} onChange={(event) => changeCategory(event.target.value as HelpCategorySlug)}>{categoryOptions.map((entry) => <option value={entry.slug} key={entry.slug}>{entry.label}</option>)}</select></div><div className="admin-field"><label htmlFor="help-organization">Zodpovedná organizácia alebo osoba</label><input id="help-organization" value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="Názov útulku alebo overenej osoby" required /></div><div className="admin-field"><label htmlFor="help-region">Kraj</label><select id="help-region" value={region} onChange={(event) => setRegion(event.target.value as SlovakRegion)}>{slovakRegions.filter((entry) => entry !== "Online").map((entry) => <option key={entry}>{entry}</option>)}</select></div><div className="admin-field"><label htmlFor="help-city">Mesto</label><input id="help-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Zlaté Moravce" required /></div></div><div className="admin-field"><label htmlFor="help-location">Spresnenie lokality <small>nepovinné</small></label><input id="help-location" value={locationNote} onChange={(event) => setLocationNote(event.target.value)} placeholder="Mestská časť, ulica alebo približné miesto" /></div></AdminEditorSection>
    <AdminEditorSection id="help-story" className="admin-form-card"><div className="admin-card-heading"><div><span>03</span><div><h2>Prípad a pes</h2><p>Príbeh, pes a dôležité termíny.</p></div></div></div><div className="admin-field"><label htmlFor="help-description">Podrobný popis</label><AdminLexicalTextField id="help-description" rows={9} value={description} onChange={(next) => { setDescription(next); navigation.markDirty(); }} placeholder={"Vysvetli situáciu, čo už bolo urobené a aká konkrétna pomoc je potrebná.\n\nNový odsek začni po prázdnom riadku."} required ariaLabel="Podrobný popis" /><AdminLexicalAppendButton disabled={saving} onAppend={text=>{ navigation.markDirty(); setDescription(appendLexicalPlainText(description,text)); }}/></div><div className="admin-field-grid"><div className="admin-field"><label htmlFor="help-dog-name">Meno psa <small>nepovinné</small></label><input id="help-dog-name" value={dogName} onChange={(event) => setDogName(event.target.value)} placeholder="Ben" /></div><div className="admin-field"><label htmlFor="help-breed">Plemeno alebo typ <small>nepovinné</small></label><input id="help-breed" value={breed} onChange={(event) => setBreed(event.target.value)} placeholder="Kríženec, labrador…" /></div><div className="admin-field"><label htmlFor="help-age">Vek <small>nepovinné</small></label><input id="help-age" value={ageNote} onChange={(event) => setAgeNote(event.target.value)} placeholder="asi 3 roky" /></div><div className="admin-field"><label htmlFor="help-reported">Dátum prípadu <small>nepovinné</small></label><input id="help-reported" type="date" value={reportedDate} onChange={(event) => setReportedDate(event.target.value)} /></div><div className="admin-field"><label htmlFor="help-deadline">Termín pomoci <small>nepovinné</small></label><input id="help-deadline" type="date" value={deadlineDate} onChange={(event) => setDeadlineDate(event.target.value)} /></div></div></AdminEditorSection>
    <AdminEditorSection id="help-action" className="admin-form-card"><div className="admin-card-heading"><div><span>04</span><div><h2>Výzva a zbierka</h2><p>Oficiálny odkaz, cieľ zbierky a informácie pre záujemcov.</p></div></div></div><div className="admin-field-grid"><div className="admin-field"><label htmlFor="help-action-label">Text hlavného tlačidla</label><input id="help-action-label" value={actionLabel} onChange={(event) => setActionLabel(event.target.value)} placeholder={defaultHelpActionLabel(category)} /></div><div className="admin-field"><label htmlFor="help-action-url">Oficiálny odkaz <small>nepovinné</small></label><input id="help-action-url" type="url" value={actionUrl} onChange={(event) => setActionUrl(event.target.value)} placeholder="https://…" /></div><div className="admin-field"><label htmlFor="help-goal">Cieľ zbierky v € <small>iba zbierky</small></label><input id="help-goal" type="number" min="0" step="1" value={goalAmount} onChange={(event) => setGoalAmount(event.target.value)} placeholder="3000" /></div><div className="admin-field"><label htmlFor="help-raised">Doteraz vyzbierané v €</label><input id="help-raised" type="number" min="0" step="1" value={raisedAmount} onChange={(event) => setRaisedAmount(event.target.value)} placeholder="1250" /></div></div><div className="admin-field"><label htmlFor="help-contact-note">Poznámka pred kontaktovaním <small>nepovinné</small></label><textarea id="help-contact-note" rows={3} value={contactNote} onChange={(event) => setContactNote(event.target.value)} placeholder="Čo má záujemca uviesť alebo vedieť pred kontaktovaním?" /></div></AdminEditorSection>
    <AdminEditorSection id="help-media" className="admin-form-card">
      <div className="admin-card-heading"><div><span>05</span><div><h2>Fotografia a stav prípadu</h2><p>Adresa profilu, titulný obrázok, overenie a aktuálny stav.</p></div></div></div><div className="admin-field"><label htmlFor="help-slug">Adresa prípadu</label><div className="admin-slug-input"><span>psipedia.sk/pomoc-psom/{category}/</span><input id="help-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} placeholder="nazov-pripadu" required /></div></div><div className="admin-upload-row"><div className="admin-upload-preview admin-upload-preview--coral">{imageUrl ? <ImageDisplay roleHint="generic" context="thumbnail" config={thumbnailImageDisplay} src={imageUrl} alt="Náhľad fotografie prípadu" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div><div className="admin-upload-actions"><AdminSingleImageUpload label={imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"} onFile={uploadImage} busy={uploading} onRejected={setError}/>{imageUrl && <button type="button" onClick={() => { navigation.markDirty(); setImageUrl(""); setImageKey(""); setThumbnailImageDisplay(null); setDetailImageDisplay(null); }}>Odstrániť fotku</button>}<small>Odporúčaný pomer 4 : 3, najviac 8 MB.</small>{imageUrl && <button type="button" className="admin-upload-button" onClick={() => setImageEditorOpen(true)}>Upraviť zobrazenie</button>}</div></div><div className="admin-help-flags"><label className="admin-event-cancelled"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /><span><strong>Overený prípad</strong><small>Redakcia preverila organizáciu a základné údaje.</small></span></label><label className="admin-event-cancelled"><input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /><span><strong>Urgentné</strong><small>Zobrazí sa medzi prvými a s výrazným označením.</small></span></label><label className="admin-event-cancelled"><input type="checkbox" checked={resolved} onChange={(event) => setResolved(event.target.checked)} /><span><strong>Vybavené</strong><small>Prípad zostane dohľadateľný, ale nebude žiadať ďalšiu pomoc.</small></span></label></div>
    {item && <AdminShareToFacebook title={title} imageUrl={imageUrl} publicPath={"/pomoc-psom/" + item.category + "/" + item.slug} />}
    </AdminEditorSection>
    <AdminEditorSection id="help-seo" className="admin-form-card">
      <div className="admin-card-heading"><div><span>06</span><div><h2>SEO</h2><p>Texty pre vyhľadávače a sociálne siete.</p></div></div></div>
    <AdminSeoFields value={seo} onChange={nextSeo => { navigation.markDirty(); setSeo(nextSeo); }} canonicalPath={`/pomoc-psom/${category}/${slug}`} fallbackTitle={helpSeoFallback(title||"Názov prípadu",categoryInfo?.singular??"Pomoc psom",city).title} fallbackDescription={helpSeoFallback(title||"Názov prípadu",categoryInfo?.singular??"Pomoc psom",city).description}/>
    </AdminEditorSection>
    <nav data-admin-editor-pager className={styles.helpSectionPager} aria-label="Prechod medzi sekciami pomoci psom">
      <button type="button" disabled={activeHelpIndex <= 0} onClick={() => navigateHelpPager(HELP_SECTIONS[activeHelpIndex - 1]?.id ?? HELP_SECTIONS[0].id)}>Predchádzajúca</button>
      <span role="status">Sekcia {activeHelpIndex + 1} z {HELP_SECTIONS.length}</span>
      <button type="button" disabled={activeHelpIndex >= HELP_SECTIONS.length - 1} onClick={() => navigateHelpPager(HELP_SECTIONS[activeHelpIndex + 1]?.id ?? HELP_SECTIONS[HELP_SECTIONS.length - 1].id)}>Ďalšia</button>
    </nav>
  </div><aside className="admin-event-preview admin-help-preview"><span className="admin-eyebrow">Živý súhrn</span><div className="admin-event-preview-visual">{imageUrl ? <ImageDisplay roleHint="generic" context="thumbnail" config={thumbnailImageDisplay} src={imageUrl} alt="" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div><span className="eyebrow">{categoryInfo?.singular}{verified ? " · Overené" : ""}</span><h2>{title || "Názov prípadu"}</h2><p>{excerpt || "Krátky popis prípadu sa zobrazí tu."}</p><dl><div><dt>Lokalita</dt><dd>{city || "Mesto"} · {region}</dd></div><div><dt>Zodpovedá</dt><dd>{organization || "Organizácia"}</dd></div><div><dt>Stav</dt><dd>{resolved ? "Vybavené" : urgent ? "Urgentné" : "Aktívne"}</dd></div></dl></aside></div></div></div></AdminEditorSectionVisibility.Provider>{imageEditorOpen && imageUrl && <ImageDisplayEditor src={imageUrl} alt={title || "Pomoc psom"} title={title} excerpt={excerpt} entityLabel="prípadu pomoci" thumbnailAspectRatio="4 / 3"
    thumbnail={thumbnailImageDisplay} detail={detailImageDisplay} onCancel={() => setImageEditorOpen(false)}
    onSave={(thumbnail, detail) => { navigation.markDirty(); setThumbnailImageDisplay(thumbnail); setDetailImageDisplay(detail); setImageEditorOpen(false); }} />}{navigation.dirty && <p className="admin-message" role="status">Neuložené zmeny</p>}<AdminEditorFooter dirty={navigation.dirty} pending={saving || uploading}>
      <div className="admin-editor-actions"><div><Link href="/admin/pomoc">← Späť na prípady</Link></div><div>{status === "published" && <button className="admin-unpublish" type="button" disabled={saving || uploading} onClick={() => setConfirmUnpublish(true)}>Stiahnuť z webu</button>}<button className="admin-save-draft" type="submit" disabled={saving || uploading}>{saving ? "Ukladám…" : status === "published" ? "Uložiť zmeny" : "Uložiť koncept"}</button>{status !== "published" && <button className="admin-publish" type="button" disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : "Publikovať prípad"}</button>}</div></div></AdminEditorFooter><AdminModalDialog open={confirmUnpublish} title="Stiahnuť prípad z webu?" description="Prípad sa zmení na koncept a prestane byť verejne dostupný." onClose={() => setConfirmUnpublish(false)} footer={<><AdminActionButton variant="neutral" onClick={() => setConfirmUnpublish(false)}>Ponechať publikované</AdminActionButton><AdminActionButton variant="destructive" disabled={saving || uploading} onClick={() => void save("draft")}>Potvrdiť stiahnutie</AdminActionButton></>}><p>Aktuálne úpravy sa uložia spolu so zmenou stavu.</p></AdminModalDialog></fieldset></form>;
}
