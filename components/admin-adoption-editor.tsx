"use client";
import { AdminEditorFooter } from "@/components/admin-editor-footer";
import { AdminSharedEditorNavigation } from "@/components/admin-shared-editor-navigation";
import { AdminEditorSectionVisibility } from "@/components/admin-editor-section-visibility";
import { AdminEditorSection } from "@/components/admin-interaction-system";
import styles from "./admin-adoption-editor.module.css";
import {AdminSingleImageUpload} from "@/components/admin-single-image-upload";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import { AdminShareToFacebook } from "@/components/admin-share-to-facebook";
import { EditorStatus, EditorUnsavedChangesGuard } from "@/components/admin-editor-workspace";
import { useAdminUnsavedFormLinks } from "@/components/admin-unsaved-form-links";
import {adminSelectedImage} from "@/lib/admin-selected-image";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  adoptionStatusLabels,
  canTransitionAdoptionStatus,
  slugifyAdoptionSlug,
  type AdoptionDog,
  type AdoptionStatus,
  type ManagedAdoptionInput,
} from "@/lib/adoption";
import type { AdoptionAdminBreedOptionsResult, AdoptionAdminOrganizationOption } from "@/lib/adoption-admin-write";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { ImageDisplay } from "@/components/image-display";
import { ImageDisplayEditor } from "@/components/image-display-editor";
import type { ImageDisplayConfig } from "@/lib/image-display";
import { AdminAdoptionEditorProfile } from "./admin-adoption-editor-profile";
import { AdminAdoptionEditorDetails } from "./admin-adoption-editor-details";
import { AdminAutomationUpdateSuggestions } from "@/components/admin-automation-update-suggestions";
import type { CanonicalUpdateSuggestion } from "@/lib/data-automation-update-review";

const publicStatuses = new Set<AdoptionStatus>(["ACTIVE", "RESERVED"]);
const ADOPTION_SECTIONS = [
  { id: "adoption-basics", label: "Základné údaje" },
  { id: "adoption-dog", label: "Plemeno a profil" },
  { id: "adoption-location", label: "Lokalita" },
  { id: "adoption-personality", label: "Povaha a kompatibilita" },
  { id: "adoption-medical", label: "Zdravie" },
  { id: "adoption-contact", label: "Organizácia a kontakt" },
  { id: "adoption-media", label: "Fotografie" },
  { id: "adoption-verification", label: "Stav a overenie" },
] as const;
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const nullableNumber = (data: FormData, key: string) => { const value = text(data, key); return value ? Number(value) : null; };
const nullableBoolean = (data: FormData, key: string) => { const value = text(data, key); return value === "true" ? true : value === "false" ? false : null; };
const checked = (data: FormData, key: string) => data.get(key) === "on";

export function AdminAdoptionEditor({ item, breeds, organizations, automationSuggestions = [] }: { item?: AdoptionDog; breeds: AdoptionAdminBreedOptionsResult; organizations: AdoptionAdminOrganizationOption[]; automationSuggestions?: CanonicalUpdateSuggestion[] }) {
  const [name, setName] = useState(item?.name ?? "");
  const [slug, setSlug] = useState(item?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(item));
  const [status, setStatus] = useState<AdoptionStatus>(item?.status ?? "DRAFT");
  const [persistedStatus, setPersistedStatus] = useState<AdoptionStatus>(item?.status ?? "DRAFT");
  const [gallery, setGallery] = useState(item?.gallery ?? []);
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [mainImage, setMainImage] = useState(item?.mainImage ?? "");
  const [thumbnailImageDisplay, setThumbnailImageDisplay] = useState<ImageDisplayConfig | null>(item?.thumbnailImageDisplay ?? null);
  const [detailImageDisplay, setDetailImageDisplay] = useState<ImageDisplayConfig | null>(item?.detailImageDisplay ?? null);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  function replaceMainImage(value: string) { if (value !== mainImage) { navigation.markDirty(); setThumbnailImageDisplay(null); setDetailImageDisplay(null); } setMainImage(value); }
  const [version, setVersion] = useState(item?.updatedAt ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeAdoptionSection, setActiveAdoptionSection] = useState<string>(ADOPTION_SECTIONS[0].id);
  const activeAdoptionIndex = ADOPTION_SECTIONS.findIndex((section) => section.id === activeAdoptionSection);
  const formRef = useRef<HTMLFormElement>(null);
  const navigation = useAdminUnsavedFormLinks();
  // Local Playwright/SSR gate: do not type into an inert server-rendered form.
  useEffect(() => { if (formRef.current) formRef.current.dataset.hydrated = "true"; }, []);

  const lifecycleOptions = useMemo(() => item
    ? (["DRAFT", "ACTIVE", "RESERVED", "ADOPTED", "ARCHIVED"] as AdoptionStatus[]).filter((next) => canTransitionAdoptionStatus(persistedStatus, next))
    : (["DRAFT", "ACTIVE", "RESERVED"] as AdoptionStatus[]), [item, persistedStatus]);
  const publishing = publicStatuses.has(status);

  function changeName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugifyAdoptionSlug(value));
  }

  async function uploadImage(event: File | ChangeEvent<HTMLInputElement>) {
    const file = adminSelectedImage(event);
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const result = await uploadAdminImage(file, "help");
      replaceMainImage(result.imageUrl);
      setMessage(adminImageUploadMessage(result, "Ulož adopčný profil."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
    }
  }

  function applyAutomationUpdate(values: Record<string, unknown>, updatedAt: string) {
    if (Object.keys(values).length) navigation.markDirty();
    for (const [field, value] of Object.entries(values)) {
      if (field === "name") { setName(value === null || value === undefined ? "" : String(value)); continue; }
      const control = formRef.current?.elements.namedItem(field);
      if (control instanceof HTMLInputElement) {
        if (control.type === "checkbox") control.checked = Boolean(value);
        else control.value = value === null || value === undefined ? "" : String(value);
      } else if (control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
        control.value = value === null || value === undefined ? "" : String(value);
        if (control instanceof HTMLTextAreaElement && control.hasAttribute("data-lexical-value")) {
          control.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
    }
    setVersion(updatedAt);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || uploading || galleryUploading) return;
    // A selected panel is visible; other form fields remain mounted but
    // hidden. Native submit validation cannot focus hidden required inputs.
    // Check every mounted field before the request and reveal its own panel.
    const invalid = Array.from(event.currentTarget.elements).find((control): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
      && control.willValidate && !control.checkValidity()
    );
    if (invalid) {
      const owner = invalid.closest("[data-admin-editor-section]") as HTMLElement | null;
      setActiveAdoptionSection(owner?.id ?? "adoption-basics");
      const label = invalid.labels?.[0]?.textContent?.trim() || "Pole formulára";
      setMessage("");
      setError("Vyplň alebo oprav: " + label + ".");
      return;
    }
    setSaving(true); setError(""); setMessage("");
    try {
      const data = new FormData(event.currentTarget);
      const payload: ManagedAdoptionInput = {
        name, slug, status,
        sex: text(data, "sex"), birthDate: text(data, "birthDate") || null,
        approximateAgeMonths: nullableNumber(data, "approximateAgeMonths"), size: text(data, "size"), weight: nullableNumber(data, "weight"),
        breedId: nullableNumber(data, "breedId"), breedName: text(data, "breedName"), breedMix: checked(data, "breedMix"), color: text(data, "color"),
        region: text(data, "region"), district: text(data, "district"), city: text(data, "city"),
        organizationId: nullableNumber(data, "organizationId"), organizationName: text(data, "organizationName"), organizationSlug: text(data, "organizationSlug") || null,
        mainImage: mainImage || null, thumbnailImageDisplay, detailImageDisplay, gallery, shortDescription: text(data, "shortDescription"), description: text(data, "description"),
        temperament: text(data, "temperament"), activityLevel: text(data, "activityLevel"),
        suitableForChildren: text(data, "suitableForChildren"), suitableForDogs: text(data, "suitableForDogs"), suitableForCats: text(data, "suitableForCats"), suitableForOtherAnimals: text(data, "suitableForOtherAnimals"),
        apartmentSuitable: nullableBoolean(data, "apartmentSuitable"), beginnerSuitable: nullableBoolean(data, "beginnerSuitable"), needsExperiencedOwner: checked(data, "needsExperiencedOwner"),
        vaccinationStatus: text(data, "vaccinationStatus"), chipped: nullableBoolean(data, "chipped"), neutered: nullableBoolean(data, "neutered"),
        healthNotes: text(data, "healthNotes"), specialNeeds: text(data, "specialNeeds"), adoptionRequirements: text(data, "adoptionRequirements"),
        externalSourceUrl: text(data, "externalSourceUrl") || null, contactEmail: text(data, "contactEmail") || null, contactPhone: text(data, "contactPhone") || null, contactUrl: text(data, "contactUrl") || null,
        lastVerifiedAt: text(data, "lastVerifiedAt") || null,
      };
      const response = await fetch(item ? `/api/admin/adoptions/${item.id}` : "/api/admin/adoptions", {
        method: item ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(item ? { payload, expectedUpdatedAt: version } : { payload }),
      });
      const body = await response.json() as { item?: AdoptionDog; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Adopčný profil sa nepodarilo uložiť.");
      if (item) navigation.markSaved();
      else navigation.markSavedBeforeRedirect();
      setVersion(body.item.updatedAt); setStatus(body.item.status); setPersistedStatus(body.item.status);
      setMessage("Adopčný profil bol bezpečne uložený.");
      if (!item) window.location.assign(`/admin/adopcie/${body.item.id}?vytvorene=1`);
    } catch (saveError) {
      const details = saveError instanceof Error ? saveError.message : "Adopčný profil sa nepodarilo uložiť.";
      // Server-side lifecycle and publication rules are authoritative;
      // guide the editor to the relevant persisted input without rewriting them.
      if (/organization|organizáci|kontakt|e-mail|telefón/i.test(details)) setActiveAdoptionSection("adoption-contact");
      else if (/fotograf|obrázk|galéri/i.test(details)) setActiveAdoptionSection("adoption-media");
      else if (/overen|verified|lastVerifiedAt|posledné/i.test(details)) setActiveAdoptionSection("adoption-verification");
      else if (/mesto|okres|kraj|region|city/i.test(details)) setActiveAdoptionSection("adoption-location");
      else if (/popis|príbeh|povah|temperament|compatib/i.test(details)) setActiveAdoptionSection("adoption-personality");
      else if (/plemen|vek|pohlav|veľkosť|naroden|weight|breed/i.test(details)) setActiveAdoptionSection("adoption-dog");
      else if (/zdrav|očkov|kastr|čip/i.test(details)) setActiveAdoptionSection("adoption-medical");
      else if (/slug|name|meno|status|stav/i.test(details)) setActiveAdoptionSection("adoption-basics");
      setError(details);
    } finally { setSaving(false); }
  }

  return <form ref={formRef} noValidate data-admin-form-system="v4" className={`admin-event-editor ${styles.editor}`} onChangeCapture={navigation.captureChange} onClickCapture={navigation.captureLinkClick} onSubmit={save}>
    <EditorUnsavedChangesGuard active={navigation.dirty} open={navigation.confirmOpen} onStay={navigation.stay} onDiscard={navigation.discard} allowNativeExitRef={navigation.allowNativeExitRef} />
    <AdminEditorSectionVisibility.Provider value={{ activeId: activeAdoptionSection, mode: "switch" }}>
      <div className={styles.layout} data-admin-adoption-editor-workspace>
        <AdminSharedEditorNavigation sections={ADOPTION_SECTIONS} activeId={activeAdoptionSection}
          onNavigate={setActiveAdoptionSection} layout="sidebar" mode="switch" ariaLabel="Sekcie editora adopcií" />
        <div className={styles.content}>
          <AdminFormFeedback message={message} error={error} pending={saving} className="admin-message" errorClassName="admin-message--error" />
          <div className="admin-event-editor-grid"><div className="admin-event-fields">
      <AdminAutomationUpdateSuggestions initialSuggestions={automationSuggestions} onAccepted={applyAutomationUpdate} />
      <AdminEditorSection id="adoption-basics" className="admin-form-card admin-form-card--intro">
        <div className="admin-card-heading"><div><span>01</span><div><h2>Základné údaje</h2><p>Meno, adresa profilu a lifecycle stav.</p></div></div></div>
        <div className="admin-field-grid">
          <div className="admin-field"><label htmlFor="adoption-name">Meno *</label><input id="adoption-name" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => changeName(event.target.value)} required/></div>
          <div className="admin-field"><label htmlFor="adoption-slug">Slug *</label><input id="adoption-slug" value={slug} onChange={(event: ChangeEvent<HTMLInputElement>) => { setSlugEdited(true); setSlug(slugifyAdoptionSlug(event.target.value)); }} required/></div>
          <div className="admin-field"><label htmlFor="adoption-status">Lifecycle stav *</label><select id="adoption-status" value={status} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatus(event.target.value as AdoptionStatus)}>{lifecycleOptions.map((value) => <option key={value} value={value}>{adoptionStatusLabels[value]}</option>)}</select></div>
        </div>
        {publishing && <p className="admin-help">Pri ACTIVE/RESERVED server vyžaduje všetky publikačné údaje vrátane canonical organization_id a znovu ich validuje.</p>}
      </AdminEditorSection>
      <AdminAdoptionEditorProfile item={item} breeds={breeds} publishing={publishing} onProgrammaticChange={navigation.markDirty}/>
      <AdminAdoptionEditorDetails item={item} organizations={organizations} publishing={publishing} mainImage={mainImage} uploading={uploading || saving} gallery={gallery} onGalleryChange={nextGallery => { navigation.markDirty(); setGallery(nextGallery); }} onGalleryBusyChange={setGalleryUploading} onMainImageChange={replaceMainImage} onUpload={uploadImage} onEditDisplay={() => setImageEditorOpen(true)} onContentChange={navigation.markDirty}/>
      <nav className={styles.pager} aria-label="Prechod medzi sekciami adopcie">
        <button type="button" disabled={activeAdoptionIndex <= 0}
          onClick={() => setActiveAdoptionSection(ADOPTION_SECTIONS[activeAdoptionIndex - 1]?.id ?? ADOPTION_SECTIONS[0].id)}>Predchádzajúca</button>
        <span role="status">Sekcia {activeAdoptionIndex + 1} z {ADOPTION_SECTIONS.length}</span>
        <button type="button" disabled={activeAdoptionIndex >= ADOPTION_SECTIONS.length - 1}
          onClick={() => setActiveAdoptionSection(ADOPTION_SECTIONS[activeAdoptionIndex + 1]?.id ?? ADOPTION_SECTIONS[ADOPTION_SECTIONS.length - 1].id)}>Ďalšia</button>
      </nav>
    </div><aside className="admin-event-preview"><span className="admin-eyebrow">Súhrn</span>{mainImage && <div className="admin-event-preview-visual"><ImageDisplay roleHint="generic" context="thumbnail" config={thumbnailImageDisplay} src={mainImage} alt=""/></div>}<span className="eyebrow">{adoptionStatusLabels[status]}</span><h2>{name || "Meno psa"}</h2><p>{publishing ? "Verejný stav – server vyžaduje kompletné publikačné údaje." : "Koncept môže zostať neúplný."}</p><Link href="/admin/adopcie">← Späť na adopcie</Link>{item && <AdminShareToFacebook title={name} imageUrl={mainImage} publicPath={"/pomoc-psom/adopcia/" + item.slug} />}</aside></div>
        </div>
      </div>
    </AdminEditorSectionVisibility.Provider>
    {imageEditorOpen && mainImage && <ImageDisplayEditor src={mainImage} alt={name || "Pes na adopciu"} title={name} entityLabel="adopčného psa" thumbnailAspectRatio="4 / 3" thumbnail={thumbnailImageDisplay} detail={detailImageDisplay} onCancel={() => setImageEditorOpen(false)} onSave={(thumbnail, detail) => { navigation.markDirty(); setThumbnailImageDisplay(thumbnail); setDetailImageDisplay(detail); setImageEditorOpen(false); }} />}
    {navigation.dirty && <EditorStatus label="Neuložené zmeny" tone="warning" />}
    <AdminEditorFooter dirty={navigation.dirty} pending={saving || uploading || galleryUploading}>
      <div className="admin-editor-actions"><Link href="/admin/adopcie">Zrušiť</Link><button type="submit" disabled={saving || uploading || galleryUploading}>{saving ? "Ukladám…" : item ? "Uložiť zmeny" : "Vytvoriť psa"}</button></div>
    </AdminEditorFooter>
  </form>;
}
