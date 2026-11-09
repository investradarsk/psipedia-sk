"use client";
import { useProfileEditorSectionPager } from "@/components/admin-profile-editor-section-pager";
import { AdminEditorFooter } from "@/components/admin-editor-footer";
import { AdminNotionProfileImportButton } from "@/components/admin-notion-profile-import-button";
import { AdminEditorToolFrame } from "@/components/admin-editor-tool-frame";
import { AdminSharedEditorNavigation } from "@/components/admin-shared-editor-navigation";
import { AdminEditorSectionVisibility } from "@/components/admin-editor-section-visibility";
import {AdminSingleImageUpload} from "@/components/admin-single-image-upload";
import dynamic from "next/dynamic";
import { DIRECTORY_BREEDER_GALLERY_LIMIT } from "@/lib/directory-breeder-gallery";
import { breederAdminChangedFields } from "@/lib/notion-breeder-field-events";
import { changedTrainerTrustAdminFields } from "@/lib/notion-trainer-trust-fields";
import { isDirectoryEventPilotCategory, isDirectoryFieldEventCategory } from "@/lib/notion-directory-field-event-scope";
import { readTrainerServicesText } from "@/lib/directory-profile-metadata";
import type { BreederRelationOption, BreederRelationSelection } from "@/lib/breeder-profile-relations";

const AdminPhotoGallery = dynamic(() => import("@/components/admin-photo-gallery").then(mod => mod.AdminPhotoGallery), { ssr: false });
import {adminSelectedImage} from "@/lib/admin-selected-image";
import { AdminLexicalAppendButton } from "@/components/admin-lexical-append-button";
import { AdminLexicalTextField } from "@/components/admin-lexical-text-field";
import { appendLexicalPlainText } from "@/lib/editorial-lexical-append";

import { geminiReviewLabels } from "@/lib/gemini-notion-review-state";

import Link from "next/link";
import { ChangeEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AdminActionButton,
  AdminDrawer,
  AdminEditorSection,
  AdminHelpText,
} from "@/components/admin-interaction-system";
import { AdminSeoFields } from "@/components/admin-seo-fields";
import { EditorStatus, EditorUnsavedChangesGuard } from "@/components/admin-editor-workspace";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import { AdminShareToFacebook } from "@/components/admin-share-to-facebook";
import { AdminAutomationUpdateSuggestions } from "@/components/admin-automation-update-suggestions";
import type { CanonicalUpdateSuggestion } from "@/lib/data-automation-update-review";
import type { ArticleSeo } from "@/lib/content";
import type { GeminiDirectoryDraft } from "@/lib/gemini-notion-directory-review";
import { directoryCategories, getDirectoryCategory, type DirectoryCategorySlug, type DirectoryProfileStatus, type ManagedDirectoryProfile } from "@/lib/directory";
import { SlovakiaLocationSelector } from "@/components/slovakia-location-selector";
import { DirectoryCategoryFilterFields } from "@/components/directory-category-filter-fields";
import { buildDirectoryCategoryFilterPatch, readDirectoryCategoryFilterOriginals, scopeDirectoryCategoryFilterChanges } from "@/lib/directory-category-filter-editor";
import { serviceFilterCategories, type ServiceFilterCategory } from "@/lib/directory-filter-contract";
import { DirectoryAddressAutocomplete } from "@/components/directory-address-autocomplete";
import {
  applyDirectoryStreetSelection,
  directoryAddressQualityWarning,
  directoryCanonicalAddressSemanticallyEqual,
  evaluateDirectoryServiceAddress,
  type DirectoryAddressFormat,
} from "@/lib/directory-service-address";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { ImageDisplay } from "@/components/image-display";
import { ImageDisplayEditor } from "@/components/image-display-editor";
import type { ImageDisplayConfig } from "@/lib/image-display";
import { directorySeoFallback } from "@/lib/content-seo";
import {
  directoryQualityFields,
  readDirectoryPublicContacts,
  type DirectoryQualityField,
  type DirectoryQualityResolutionInput,
  type DirectoryQualityResolutionStatus,
} from "@/lib/directory-profile-metadata";
import styles from "./admin-directory-editor.module.css";

function NotionDraftFields({ enabled, disabled, children }: { enabled: boolean; disabled: boolean; children: ReactNode }) {
  return enabled ? <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: "grid", gap: "1rem" }}>{children}</fieldset> : <>{children}</>;
}

const editorSections = [
  { id: "directory-main", label: "Hlavné" },
  { id: "directory-location", label: "Lokalita" },
  { id: "directory-content", label: "Obsah" },
  { id: "directory-contacts", label: "Kontakty" },
  { id: "directory-media-trust", label: "Médiá a dôvera" },
];

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

function listFromText(value: string) {
  return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

function formatProfileReviewDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("sk-SK", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function qualityResolutionInput(profile?: ManagedDirectoryProfile): DirectoryQualityResolutionInput {
  return Object.fromEntries(
    directoryQualityFields.map((field) => [field, profile?.qualityMetadata[field]?.status ?? ""]),
  ) as DirectoryQualityResolutionInput;
}

function qualityCheckedAtInput(profile?: ManagedDirectoryProfile) {
  return Object.fromEntries(
    directoryQualityFields
      .map((field) => [field, profile?.qualityMetadata[field]?.checkedAt ?? ""] as const)
      .filter(([, value]) => Boolean(value)),
  ) as Partial<Record<DirectoryQualityField, string>>;
}

const qualityResolutionOptions: Array<{ value: DirectoryQualityResolutionStatus; label: string }> = [
  { value: "DOES_NOT_EXIST", label: "Profil tento údaj nemá" },
  { value: "NOT_PUBLIC", label: "Verejne nezverejnené" },
  { value: "NOT_FOUND", label: "Nedohľadateľné" },
  { value: "NOT_APPLICABLE", label: "Nevzťahuje sa na tento profil" },
];

function QualityResolutionField({
  field,
  value,
  checkedAt,
  onChange,
}: {
  field: DirectoryQualityField;
  value: DirectoryQualityResolutionStatus | "";
  checkedAt?: string;
  onChange: (value: DirectoryQualityResolutionStatus | "") => void;
}) {
  const checkedDate = checkedAt ? new Date(checkedAt) : null;
  const checkedLabel = checkedDate && !Number.isNaN(checkedDate.getTime())
    ? new Intl.DateTimeFormat("sk-SK", { day: "2-digit", month: "2-digit", year: "numeric" }).format(checkedDate)
    : "";

  return (
    <div className="admin-field">
      <label htmlFor={`directory-quality-${field}`}>Stav chýbajúceho údaja</label>
      <select
        id={`directory-quality-${field}`}
        value={value}
        onChange={(event) => onChange(event.target.value as DirectoryQualityResolutionStatus | "")}
      >
        <option value="">Treba doplniť / ešte neskontrolované</option>
        {qualityResolutionOptions.map((option) => (
          <option value={option.value} key={option.value}>{option.label}</option>
        ))}
      </select>
      <small>
        {value
          ? checkedLabel
            ? `Skontrolované ${checkedLabel}. Po 12 mesiacoch sa údaj automaticky znovu zaradí na kontrolu.`
            : "Po uložení sa zaznamená dátum kontroly. Po 12 mesiacoch sa údaj automaticky znovu zaradí na kontrolu."
          : "Ak sa údaj dá dohľadať, nechaj tento stav prázdny a doplň ho."}
      </small>
    </div>
  );
}

export function AdminDirectoryEditor({
  profile, notionDraft, onNotionSaved, automationSuggestions = [],
}: {
  profile?: ManagedDirectoryProfile;
  notionDraft?: GeminiDirectoryDraft;
  onNotionSaved?: (keepEditorOpen?: boolean) => void;
  automationSuggestions?: CanonicalUpdateSuggestion[];
}) {
  // Last saved D1 projection; supports one-field saves from a long-open editor.
  const breederSaveBaselineRef = useRef(profile);
  const [reviewState, setReviewState] = useState(notionDraft?.reviewState);
  const [canonicalEditorUrl, setCanonicalEditorUrl] = useState("");
  const [reviewConfirm, setReviewConfirm] = useState<"reject" | "restore" | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const notionReadOnly = Boolean(notionDraft && (canonicalEditorUrl || !["NEW", "IN_PROGRESS"].includes(reviewState ?? "")));
  const [notionVersion, setNotionVersion] = useState(notionDraft?.lastEditedAt ?? "");
  const [logoUrl, setLogoUrl] = useState(notionDraft?.logoUrl ?? "");
  const [name, setName] = useState(profile?.name ?? notionDraft?.name ?? "");
  const [slug, setSlug] = useState(profile?.slug ?? notionDraft?.slug ?? (notionDraft?.name ? slugify(notionDraft.name) : ""));
  const [slugEdited, setSlugEdited] = useState(Boolean(profile || notionDraft?.slug));
  const [category, setCategory] = useState<DirectoryCategorySlug>(profile?.category ?? (notionDraft?.category as DirectoryCategorySlug | undefined) ?? "treneri");
  // Physiotherapy treatments live in Services V3, not duplicate legacy category controls.
  const filterCategory = category !== "fyzioterapia" && (serviceFilterCategories as readonly string[]).includes(category) ? category as ServiceFilterCategory : null;
  // Keep a full baseline so changing category never discards previously stored facets.
  const [filterSourceData, setFilterSourceData] = useState<Record<string, unknown>>(profile?.importData ?? {});
  const [filterChanges, setFilterChanges] = useState<Record<string, string>>({});
  const filterOriginals = useMemo(() => filterCategory
    ? readDirectoryCategoryFilterOriginals(filterCategory, JSON.stringify(filterSourceData))
    : {}, [filterCategory, filterSourceData]);
  const [excerpt, setExcerpt] = useState(profile?.excerpt ?? notionDraft?.summary ?? "");
  const [description, setDescription] = useState(profile?.description ?? notionDraft?.description ?? "");
  const [services, setServices] = useState(profile?.services.join("\n") ?? notionDraft?.services ?? "");
  const [trainerServicesText, setTrainerServicesText] = useState(readTrainerServicesText(profile?.importData));
  const [qualifications, setQualifications] = useState(profile?.qualifications.join("\n") ?? notionDraft?.qualifications ?? "");
  const [city, setCity] = useState(profile?.city ?? notionDraft?.city ?? "");
  const [district, setDistrict] = useState(profile?.district ?? notionDraft?.district ?? "");
  const [region, setRegion] = useState(profile?.region ?? notionDraft?.region ?? "");
  const [publicAddress, setPublicAddress] = useState(profile?.address ?? notionDraft?.address ?? "");
  const [postalCode, setPostalCode] = useState(profile?.postalCode ?? notionDraft?.postalCode ?? "");
  const [street, setStreet] = useState(profile?.street ?? notionDraft?.street ?? "");
  const [houseNumber, setHouseNumber] = useState(profile?.houseNumber ?? notionDraft?.houseNumber ?? "");
  const [addressFormat, setAddressFormat] = useState<DirectoryAddressFormat | "">(profile?.addressFormat ?? (notionDraft?.addressFormat as DirectoryAddressFormat | "") ?? "");
  const [addressProviderResultId, setAddressProviderResultId] = useState("");
  const [numberlessLocalityConfirmed, setNumberlessLocalityConfirmed] = useState(false);
  const [priceNote, setPriceNote] = useState(profile?.priceNote ?? notionDraft?.priceNote ?? "");
  const contacts = readDirectoryPublicContacts(profile?.importData, profile?.websiteUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(profile ? contacts.website : notionDraft?.website ?? "");
  const [publicPhone, setPublicPhone] = useState(profile ? contacts.phone : notionDraft?.phone ?? "");
  const [publicEmail, setPublicEmail] = useState(profile ? contacts.email : notionDraft?.email ?? "");
  const [facebookUrl, setFacebookUrl] = useState(profile ? contacts.facebook : notionDraft?.facebook ?? "");
  const [instagramUrl, setInstagramUrl] = useState(profile ? contacts.instagram : notionDraft?.instagram ?? "");
  const pilotMetadataText = (key: string) => {
    const value = profile?.importData?.[key];
    return typeof value === "string" ? value : "";
  };
  const [pilotOpeningHours, setPilotOpeningHours] = useState(pilotMetadataText("Ordinačné hodiny"));
  const [pilotDataSources, setPilotDataSources] = useState(pilotMetadataText("Zdroj dát"));
  const [pilotImageSource, setPilotImageSource] = useState(pilotMetadataText("Zdroj obrázka"));
  const [pilotImageAlt, setPilotImageAlt] = useState(pilotMetadataText("Alt text obrázka"));
  const [imageUrl, setImageUrl] = useState(profile?.imageUrl ?? notionDraft?.imageUrl ?? "");
  // An explicit remove action must survive a stale full-form save; null alone
  // could merely be the old value of a never-edited image field.
  const removeMainImageRequestedRef = useRef(false);
  const [imageKey, setImageKey] = useState(profile?.imageKey ?? notionDraft?.imageKey ?? "");
  const [galleryUrls, setGalleryUrls] = useState<string[]>(profile?.galleryUrls ?? []);
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [breederRelationOptions, setBreederRelationOptions] = useState<{
    breeds: BreederRelationOption[]; clubs: BreederRelationOption[];
  }>({ breeds: [], clubs: [] });
  const [breederSelection, setBreederSelection] = useState<BreederRelationSelection>({ breedIds: [], clubIds: [] });
  const [breederRelationSearch, setBreederRelationSearch] = useState({ breeds: "", clubs: "" });
  const [breederRelationsDirty, setBreederRelationsDirty] = useState(false);
  const [breederRelationsError, setBreederRelationsError] = useState("");
  const [breederRelationsLoading, setBreederRelationsLoading] = useState(Boolean(profile && ["chovatelske-stanice", "treneri"].includes(profile.category)));
  const [thumbnailImageDisplay, setThumbnailImageDisplay] = useState<ImageDisplayConfig | null>(profile?.thumbnailImageDisplay ?? null);
  const [detailImageDisplay, setDetailImageDisplay] = useState<ImageDisplayConfig | null>(profile?.detailImageDisplay ?? null);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [qualityResolutions, setQualityResolutions] = useState<DirectoryQualityResolutionInput>(() => profile ? qualityResolutionInput(profile) : notionDraft?.qualityResolutions ?? qualityResolutionInput());
  const [qualityCheckedAt, setQualityCheckedAt] = useState<Partial<Record<DirectoryQualityField, string>>>(() => qualityCheckedAtInput(profile));
  const [reviewed, setReviewed] = useState(profile?.reviewed ?? false);
  const [reviewedAt, setReviewedAt] = useState(profile?.reviewedAt ?? "");
  useEffect(() => {
    if (!profile || !["chovatelske-stanice", "treneri"].includes(profile.category)) return;
    let cancelled = false;
    fetch(`/api/admin/directory/${profile.id}/breeder-relations`, { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Prepojenia sa nepodarilo načítať.");
        return response.json() as Promise<{
          selected: BreederRelationSelection;
          breeds: BreederRelationOption[]; clubs: BreederRelationOption[];
        }>;
      }).then(data => {
        if (cancelled) return;
        setBreederRelationOptions({ breeds: data.breeds, clubs: data.clubs });
        setBreederSelection(data.selected);
        setBreederRelationsDirty(false);
        setBreederRelationsError("");
      }).catch(error => {
        if (!cancelled) setBreederRelationsError(error instanceof Error ? error.message : "Prepojenia nie sú dostupné.");
      }).finally(() => { if (!cancelled) setBreederRelationsLoading(false); });
    return () => { cancelled = true; };
  }, [profile?.id, profile?.category]);
  function toggleBreederLink(field: "breedIds" | "clubIds", id: number) {
    setBreederSelection(current => ({
      ...current, [field]: current[field].includes(id)
        ? current[field].filter(item => item !== id)
        : [...current[field], id],
    }));
    setBreederRelationsDirty(true);
    setFormDirty(true);
  }
  const [reviewSaving, setReviewSaving] = useState(false);
  const [verified, setVerified] = useState(profile?.verified ?? notionDraft?.verified ?? false);
  const [featured, setFeatured] = useState(profile?.featured ?? notionDraft?.featured ?? false);
  const [status, setStatus] = useState<DirectoryProfileStatus>(profile?.status ?? "draft");
  const [seo, setSeo] = useState<ArticleSeo>(profile?.seo ?? notionDraft?.seo ?? {});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const editorSectionsForProfile = profile && ["chovatelske-stanice", "treneri"].includes(category)
    ? [...editorSections.slice(0, 4), { id: "directory-breeder-links", label: "Prepojenia" }, ...editorSections.slice(4)]
    : editorSections;
  const [activeDirectorySection, setActiveDirectorySection] = useState(editorSectionsForProfile[0].id);
  // Derive a valid visible section when changing category; avoid a state update in an effect.
  const currentDirectorySection = editorSectionsForProfile.some((section) => section.id === activeDirectorySection)
    ? activeDirectorySection
    : editorSectionsForProfile[0].id;
  const activeDirectoryIndex = editorSectionsForProfile.findIndex((section) => section.id === currentDirectorySection);
  const navigateDirectoryPager = useProfileEditorSectionPager(currentDirectorySection, setActiveDirectorySection);
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const savePendingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [formDirty, setFormDirtyState] = useState(false);
  const formEditRevisionRef = useRef(0);
  const setFormDirty = (next: boolean) => {
    if (next) formEditRevisionRef.current += 1;
    setFormDirtyState(next);
  };
  const [confirmDirectoryExit, setConfirmDirectoryExit] = useState(false);
  const directoryBackLinkRef = useRef<HTMLAnchorElement>(null);
  const createdProfileLinkRef = useRef<HTMLAnchorElement>(null);
  const [createdProfileHref, setCreatedProfileHref] = useState("");
  const restoredProfileLinkRef = useRef<HTMLAnchorElement>(null);
  const allowDirectoryExitRef = useRef(false);

  useEffect(() => {
    if (formRef.current) formRef.current.dataset.hydrated = "true";
  }, [status]);

  useEffect(() => {
    // Follow the existing Next Link after the successful create render. The
    // shared editor is also mounted in Gemini modal fixtures without a router provider.
    if (createdProfileHref) createdProfileLinkRef.current?.click();
  }, [createdProfileHref]);

  function changeName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function setQualityResolution(field: DirectoryQualityField, value: DirectoryQualityResolutionStatus | "") {
    setQualityResolutions((current) => ({ ...current, [field]: value }));
    setQualityCheckedAt((current) => ({ ...current, [field]: "" }));
  }

  function clearQualityResolution(field: DirectoryQualityField) {
    setQualityResolution(field, "");
  }

  async function uploadImage(event: File | ChangeEvent<HTMLInputElement>) {
    const file = adminSelectedImage(event);
    if (!file || saving || uploading || savePendingRef.current) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "directory");
      setImageUrl(data.imageUrl);
      removeMainImageRequestedRef.current = false;
      setFormDirty(true);
      setImageKey(data.imageKey);
      setThumbnailImageDisplay(null); setDetailImageDisplay(null);
      clearQualityResolution("image");
      setMessage(adminImageUploadMessage(data, "Ulož profil."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
    }
  }

  function applyAutomationUpdate(values: Record<string, unknown>) {
    setFormDirty(true);
    for (const [field, value] of Object.entries(values)) {
      const text = value === null || value === undefined ? "" : String(value);
      if (field === "name") setName(text);
      else if (field === "excerpt") setExcerpt(text);
      else if (field === "description") setDescription(text);
      else if (field === "services" && Array.isArray(value)) setServices(value.map(String).join("\n"));
      else if (field === "qualifications" && Array.isArray(value)) setQualifications(value.map(String).join("\n"));
      else if (field === "address") setPublicAddress(text);
      else if (field === "priceNote") setPriceNote(text);
      else if (field === "websiteUrl") { setWebsiteUrl(text); if (text.trim()) clearQualityResolution("website"); }
      else if (field === "publicPhone") { setPublicPhone(text); if (text.trim()) clearQualityResolution("phone"); }
      else if (field === "publicEmail") { setPublicEmail(text); if (text.trim()) clearQualityResolution("email"); }
      else if (field === "facebookUrl") setFacebookUrl(text);
      else if (field === "instagramUrl") setInstagramUrl(text);
    }
  }

  async function reviewNotion() {
    if (!notionDraft || !reviewConfirm || saving) return;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/gemini-automation/notion-drafts/" + encodeURIComponent(notionDraft.id), {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: reviewConfirm, confirm: true, lastEditedAt: notionVersion, reason: rejectionReason }),
      });
      const data = await response.json() as { draft?: GeminiDirectoryDraft; canonicalSave?: { state: string }; error?: string };
      if (!response.ok || !data.draft) throw new Error(data.error || "Zmenu sa nepodarilo potvrdiť. Obnov zoznam pred opakovaním.");
      setReviewState(data.draft.reviewState); setNotionVersion(data.draft.lastEditedAt);
      setReviewConfirm(null);
      setMessage(reviewConfirm === "reject" ? "Koncept bol odmietnutý." : "Koncept bol obnovený bez publikovania.");
      // The latest review state is already in React state; avoid a full reload.
      onNotionSaved?.();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Zmena zlyhala."); }
    finally { setSaving(false); }
  }

  async function save(nextStatus: DirectoryProfileStatus) {
    if (saving || uploading || galleryBusy || savePendingRef.current || notionReadOnly) return;
    if (notionDraft && nextStatus === "published") {
      setError("Najprv bezpečne importuj koncept do D1 a publikuj v natívnom editore.");
      return;
    }
    // Unpublishing must remain possible even if legacy contact/SEO fields are invalid.
    if (!(status === "published" && nextStatus === "draft" && !notionDraft)) {
      // Inactive sections and the closed SEO drawer cannot receive native validation focus.
      // Preserve the current field constraints for both Save and Publish.
      if (!name.trim()) { setActiveDirectorySection("directory-main"); setError("Vyplň názov profilu."); setMessage(""); return; }
      if (!slug.trim()) { setAdvancedOpen(true); setError("Vyplň URL adresu profilu."); setMessage(""); return; }
      // Optional contact/URL/SEO fields are not blockers. The server
      // sanitizes malformed optional values and returns field warnings.
      }
    const submittedRevision = formEditRevisionRef.current;
    savePendingRef.current = true;
    setSaving(true); setError(""); setMessage("");
    try {
      if (notionDraft) {
        // Notion remains the source for this unsynced draft. The canonical D1
        // editor endpoint must not create a second profile on a draft save.
        const response = await fetch(
          "/api/admin/gemini-automation/notion-drafts/" + encodeURIComponent(notionDraft.id), {
            method: "PUT", headers: { "content-type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({
              lastEditedAt: notionVersion,
              name, slug, category, excerpt, description,
              services: isDirectoryEventPilotCategory(category)
                ? listFromText(notionDraft.services ?? "") : listFromText(services),
              qualifications: listFromText(qualifications),
              address: publicAddress, city, district, region, postalCode, street,
              houseNumber, addressFormat, priceNote, websiteUrl,
              publicPhone, publicEmail, facebookUrl, instagramUrl,
              imageUrl, imageKey, logoUrl, qualityResolutions, verified, featured,
              seo: {
                title: seo.title ?? "", description: seo.description ?? "",
                focusKeyword: seo.focusKeyword ?? "", canonicalUrl: seo.canonicalUrl ?? "",
                ogTitle: seo.ogTitle ?? "", ogDescription: seo.ogDescription ?? "",
                ogImage: seo.ogImage ?? "", noindex: seo.noindex === true,
              },
            }),
          },
        );
        const data = await response.json() as { draft?: GeminiDirectoryDraft; canonicalSave?: { state: string; editorUrl?: string }; error?: string };
        if (!response.ok || !data.draft) throw new Error(data.error || "Koncept sa nepodarilo uložiť v Notione.");
        setNotionVersion(data.draft.lastEditedAt);
        setReviewState(data.draft.reviewState);
        // The verified private D1 mapping becomes the only editor for future
        // changes. Prevent duplicate Notion edits against a stale modal.
        if (data.canonicalSave?.state === "CANONICAL_DRAFT_READY" &&
            /^\/admin\/adresar\/[1-9][0-9]*$/.test(data.canonicalSave.editorUrl ?? ""))
          setCanonicalEditorUrl(data.canonicalSave.editorUrl!);
        setMessage(data.canonicalSave?.state === "CANONICAL_DRAFT_READY"
          ? "Koncept uložený v Notione a prepojený s neverejným D1 profilom."
          : "Koncept uložený v Notione; prípadný D1 import zostáva na kontrolu. Nič sa nepublikovalo.");
        if (formEditRevisionRef.current === submittedRevision) setFormDirty(false);
        onNotionSaved?.(Boolean(data.canonicalSave?.state === "CANONICAL_DRAFT_READY" &&
          /^\/admin\/adresar\/[1-9][0-9]*$/.test(data.canonicalSave.editorUrl ?? "")));
        return;
      }
      const filterPatch = filterCategory
        ? buildDirectoryCategoryFilterPatch(filterCategory, filterOriginals, scopeDirectoryCategoryFilterChanges(filterCategory, filterChanges))
        : null;
      const breederBaseline = breederSaveBaselineRef.current;
      const breederChangedPaths = profile && isDirectoryFieldEventCategory(profile.category)
        && category === profile.category && breederBaseline
        ? breederAdminChangedFields(
            {
              ...breederBaseline,
              services: breederBaseline.category === "treneri"
                ? listFromText(readTrainerServicesText(breederBaseline.importData))
                : breederBaseline.services,
              websiteUrl: readDirectoryPublicContacts(breederBaseline.importData, breederBaseline.websiteUrl ?? "").website,
              publicPhone: readDirectoryPublicContacts(breederBaseline.importData, breederBaseline.websiteUrl ?? "").phone,
              publicEmail: readDirectoryPublicContacts(breederBaseline.importData, breederBaseline.websiteUrl ?? "").email,
              facebookUrl: readDirectoryPublicContacts(breederBaseline.importData, breederBaseline.websiteUrl ?? "").facebook,
              instagramUrl: readDirectoryPublicContacts(breederBaseline.importData, breederBaseline.websiteUrl ?? "").instagram,
            },
            {
              name, excerpt, description,
              services: category === "treneri" ? listFromText(trainerServicesText) : listFromText(services),
              qualifications: listFromText(qualifications),
              region, district, city, address: publicAddress, postalCode, street, houseNumber,
              addressFormat, priceNote, websiteUrl, publicPhone, publicEmail,
              facebookUrl, instagramUrl, seo,
            },
          ).filter(path => path !== "services" || !isDirectoryEventPilotCategory(category))
        : undefined;
      const pilotMetadataFields: Record<string, string> = {};
      if (profile && isDirectoryEventPilotCategory(profile.category)) {
        for (const [key, current] of [
          ["Ordinačné hodiny", pilotOpeningHours],
          ["Zdroj dát", pilotDataSources],
          ["Zdroj obrázka", pilotImageSource],
          ["Alt text obrázka", pilotImageAlt],
        ]) {
          const value = breederBaseline?.importData?.[key];
          const baseline = typeof value === "string" ? value : "";
          if (current.trim() !== baseline.trim())
            pilotMetadataFields[key] = current.trim();
        }
      }
      // Trainers use independent free-text Notion prose; pilot categories
      // retain their separate Services V3-only editing contract.
      const trainerServicesEdited = profile && profile.category === "treneri" && category === profile.category && breederBaseline
        ? trainerServicesText !== readTrainerServicesText(breederBaseline.importData)
        : undefined;
      const trainerTrustEditedPaths = profile && category === profile.category && breederBaseline
        ? changedTrainerTrustAdminFields(breederBaseline, { verified, featured })
        : [];
      const response = await fetch(profile ? `/api/admin/directory/${profile.id}` : "/api/admin/directory", {
        method: profile ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(breederChangedPaths ? { breederEditedPaths: breederChangedPaths } : {}),
          ...(category === "treneri" && !notionDraft ? { trainerServicesText } : {}),
          ...(trainerServicesEdited !== undefined ? { trainerServicesEdited } : {}),
          ...(trainerTrustEditedPaths.length ? { trainerTrustEditedPaths } : {}),
          ...(removeMainImageRequestedRef.current ? { clearMainImage: true } : {}),
          ...(Object.keys(pilotMetadataFields).length ? { pilotMetadataFields } : {}),
          name, slug, category, status: nextStatus, excerpt, description,
          services: profile && isDirectoryEventPilotCategory(profile.category)
            ? profile.services : listFromText(services),
          qualifications: listFromText(qualifications),
          address: publicAddress,
          city, district, region, postalCode, street, houseNumber, addressFormat,
          addressProviderResultId: addressProviderResultId || undefined,
          numberlessLocalityConfirmed: numberlessLocalityConfirmed || undefined,
          confirmServiceAddress: false,
          priceNote,
          websiteUrl: websiteUrl || null,
          publicPhone, publicEmail, facebookUrl, instagramUrl,
          imageUrl: imageUrl || null, imageKey: imageKey || null,
          ...(category === "chovatelske-stanice" ? { galleryUrls } : {}),
          thumbnailImageDisplay, detailImageDisplay,
          qualityResolutions,
          verified, featured, seo,
        }),
      });
      const data = await response.json() as { profile?: ManagedDirectoryProfile; error?: string; metadataWarnings?: string[] };
      if (!response.ok || !data.profile) throw new Error(data.error || "Profil sa nepodarilo uložiť.");
      // Verify that the database acknowledges lifecycle and explicit web edits.
      if (data.profile.status !== nextStatus)
        throw new Error("Zmena stavu profilu sa nepotvrdila. Obnov stránku a skontroluj údaje.");
      const unconfirmedWebsite = breederChangedPaths?.includes("websiteUrl") &&
          readDirectoryPublicContacts(data.profile.importData, data.profile.websiteUrl ?? "").website !== websiteUrl.trim();
      // The canonical D1 save already succeeded. Warn, refresh from D1 and
      // never present a false 'save failed' after deleting an optional URL.
      // Write only explicit facet changes through the authenticated, CAS-protected endpoint.
      // The canonical profile save above continues to own all unrelated fields.
      let savedProfile = data.profile;
      if (filterPatch && Object.keys(filterPatch.updates).length) {
        const filterResponse = await fetch(`/api/admin/directory/${savedProfile.id}`, {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "set-category-filters", filterPatch }),
        });
        const filtered = await filterResponse.json() as { profile?: ManagedDirectoryProfile; error?: string };
        if (!filterResponse.ok || !filtered.profile) {
          throw new Error(filtered.error || "Profil bol uložený, ale kategóriové filtre nie. Skontrolujte ich a uložte znova.");
        }
        savedProfile = filtered.profile;
      }
      if (profile && ["chovatelske-stanice", "treneri"].includes(profile.category) && breederRelationsDirty) {
        const response = await fetch(`/api/admin/directory/${profile.id}/breeder-relations`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(breederSelection),
        });
        if (!response.ok) {
          const details = await response.json().catch(() => ({})) as { error?: string };
          throw new Error("Profil je uložený, ale prepojenia sa nepodarilo uložiť: " +
            (details.error || "Neznáma chyba."));
        }
        if (formEditRevisionRef.current === submittedRevision) setBreederRelationsDirty(false);
      }
      const hasNewerEdits = formEditRevisionRef.current !== submittedRevision;
      if (!hasNewerEdits) removeMainImageRequestedRef.current = false;
      if (!hasNewerEdits) {
        setFilterSourceData(savedProfile.importData ?? {});
        setFilterChanges({});
      }
      if (isDirectoryFieldEventCategory(savedProfile.category)) {
        // Refresh form values from the committed D1 result: untouched fields
        // may have been updated through a Notion webhook while this was open.
        breederSaveBaselineRef.current = savedProfile;
        if (!hasNewerEdits) {
        const syncedContacts = readDirectoryPublicContacts(savedProfile.importData, savedProfile.websiteUrl ?? "");
        setName(savedProfile.name); setExcerpt(savedProfile.excerpt); setDescription(savedProfile.description);
        setQualifications(savedProfile.qualifications.join("\n"));
        setServices(savedProfile.services.join("\n"));
        setTrainerServicesText(readTrainerServicesText(savedProfile.importData));
        setCity(savedProfile.city); setDistrict(savedProfile.district); setRegion(savedProfile.region);
        setPublicAddress(savedProfile.address); setPostalCode(savedProfile.postalCode);
        setStreet(savedProfile.street); setHouseNumber(savedProfile.houseNumber);
        setAddressFormat(savedProfile.addressFormat);
        setPriceNote(savedProfile.priceNote);
        setWebsiteUrl(syncedContacts.website); setPublicPhone(syncedContacts.phone);
        setPublicEmail(syncedContacts.email); setFacebookUrl(syncedContacts.facebook);
        setInstagramUrl(syncedContacts.instagram); setSeo(savedProfile.seo ?? {});
        if (isDirectoryEventPilotCategory(savedProfile.category)) {
          const storedText = (key: string) => {
            const value = savedProfile.importData?.[key];
            return typeof value === "string" ? value : "";
          };
          setPilotOpeningHours(storedText("Ordinačné hodiny"));
          setPilotDataSources(storedText("Zdroj dát"));
          setPilotImageSource(storedText("Zdroj obrázka"));
          setPilotImageAlt(storedText("Alt text obrázka"));
        }
        }
      }
      if (!hasNewerEdits) {
        setGalleryUrls(savedProfile.galleryUrls ?? []);
        setQualityResolutions(qualityResolutionInput(savedProfile));
        setQualityCheckedAt(qualityCheckedAtInput(savedProfile));
        setFormDirty(false);
      }
      setStatus(savedProfile.status);
      setMessage(hasNewerEdits
        ? "Predchádzajúce úpravy boli uložené. Novšie zmeny sú stále neuložené."
        : (nextStatus === "published" ? "Profil je publikovaný v adresári." : "Koncept je bezpečne uložený.") +
          (data.metadataWarnings?.length || unconfirmedWebsite
            ? " Upozornenia: " + [
                ...(data.metadataWarnings ?? []),
                ...(unconfirmedWebsite ? ["Verejný web sa neuložil presne podľa zadania. Obnovili sme hodnotu z databázy."] : []),
              ].join("; ") : ""));
      if (!profile) setCreatedProfileHref(`/admin/adresar/${data.profile.id}?vytvorene=1`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profil sa nepodarilo uložiť.");
    } finally {
      savePendingRef.current = false;
      setSaving(false);
    }
  }

  async function changeReviewed(nextReviewed: boolean) {
    if (!profile) return;
    setReviewSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/directory/${profile.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set-reviewed", reviewed: nextReviewed }),
      });
      const data = await response.json() as { profile?: ManagedDirectoryProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "Stav kontroly sa nepodarilo uložiť.");
      setReviewed(data.profile.reviewed);
      setReviewedAt(data.profile.reviewedAt);
      setMessage(data.profile.reviewed ? "Profil je označený ako odkontrolovaný." : "Označenie kontroly bolo zrušené.");
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Stav kontroly sa nepodarilo uložiť.");
    } finally {
      setReviewSaving(false);
    }
  }

  async function restoreArchivedProfile() {
    if (!profile || status !== "archived" || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/directory/${profile.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const data = await response.json() as { profile?: ManagedDirectoryProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "Profil sa nepodarilo obnoviť.");
      setStatus(data.profile.status);
      setMessage("Profil je obnovený do konceptu.");
      // Navigate inside Next.js so the parent header and separate Services V3 editor
      // also receive the fresh draft status, without reloading the browser.
      restoredProfileLinkRef.current?.click();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Profil sa nepodarilo obnoviť.");
    } finally {
      setSaving(false);
    }
  }

  if (profile && status === "archived") {
    return (
      <section className="admin-form-card">
        <Link href={`/admin/adresar/${profile.id}?obnovene=1`} ref={restoredProfileLinkRef} hidden tabIndex={-1} aria-hidden="true">Otvoriť obnovený profil</Link>
        <h2>Archivovaný profil</h2>
        <p>Profil nie je verejný a jeho canonical resource zostáva zachovaný pre historické a trust dáta.</p>
        <label className={styles.reviewControl}>
          <input
            type="checkbox"
            checked={reviewed}
            disabled={reviewSaving}
            onChange={(event) => void changeReviewed(event.target.checked)}
          />
          <span>Odkontrolované</span>
          {reviewedAt && <small>{formatProfileReviewDate(reviewedAt)}</small>}
        </label>
        <AdminFormFeedback message={message} error={error} pending={saving} pendingLabel="Obnovujem…" className="admin-flash" errorClassName="admin-flash--error" />
        <AdminActionButton variant="primary" disabled={saving} onClick={() => void restoreArchivedProfile()}>
          {saving ? "Obnovujem…" : "Obnoviť do konceptu"}
        </AdminActionButton>
      </section>
    );
  }

  const addressMatchesPersistedConfirmed = Boolean(
    profile?.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION"
    && directoryCanonicalAddressSemanticallyEqual(
      { region, district, city, postalCode, street, houseNumber, addressFormat },
      {
        region: profile.region,
        district: profile.district,
        city: profile.city,
        postalCode: profile.postalCode,
        street: profile.street,
        houseNumber: profile.houseNumber,
        addressFormat: profile.addressFormat,
      },
    ),
  );

  const addressEvaluation = evaluateDirectoryServiceAddress({
    region,
    district,
    city,
    postalCode,
    street,
    houseNumber,
    addressFormat,
    serviceAddressConfirmation: addressMatchesPersistedConfirmed
      ? "CONFIRMED_SERVICE_LOCATION"
      : "LEGACY_UNCONFIRMED",
  });

  const addressStatusText = {
    COMPLETE: "Úplná adresa",
    INCOMPLETE: "Neúplná adresa",
    MISSING: "Adresa nie je uvedená",
    NEEDS_REVIEW: "Adresa vyžaduje kontrolu",
  }[addressEvaluation.state];

  const addressQualityWarning = directoryAddressQualityWarning({
    region,
    district,
    city,
    postalCode,
    street,
    houseNumber,
    addressFormat,
    serviceAddressConfirmation: addressMatchesPersistedConfirmed
      ? "CONFIRMED_SERVICE_LOCATION"
      : "LEGACY_UNCONFIRMED",
  }, publicAddress);

  const categoryInfo = getDirectoryCategory(category);
  return (
    <form ref={formRef} inert={saving} aria-busy={saving} noValidate data-hydrated="false" data-admin-form-system="v4" className={`admin-event-editor admin-directory-editor ${styles.editor}`} onSubmit={(event) => { event.preventDefault(); void save(status === "published" && !notionDraft ? "published" : "draft"); }}>
      <AdminEditorSectionVisibility.Provider value={{ activeId: currentDirectorySection, mode: "switch" }}>
      <NotionDraftFields enabled={Boolean(notionDraft)} disabled={notionReadOnly || saving}>

      <div className={styles.editorTopline} data-admin-editor-navigation-container>
        <div className={styles.toplineLabel}>Úprava profilu služby · {editorSectionsForProfile[activeDirectoryIndex]?.label ?? "Hlavné"}</div>
        <div className={styles.toplineActions}>
          <EditorStatus label={status === "published" ? "Publikovaný" : "Koncept"} tone={status === "published" ? "success" : "warning"} />
          {formDirty && <EditorStatus label="Neuložené zmeny" tone="warning" />}
          {profile && (
            <label className={styles.reviewControl}>
              <input
                type="checkbox"
                checked={reviewed}
                disabled={reviewSaving}
                onChange={(event) => void changeReviewed(event.target.checked)}
              />
              <span>Odkontrolované</span>
              {reviewedAt && <small>{formatProfileReviewDate(reviewedAt)}</small>}
            </label>
          )}
          {profile && !notionDraft && <AdminNotionProfileImportButton scope="directory" profileId={profile.id}
            dirty={formDirty} disabled={saving || uploading || galleryBusy} />}
          <AdminActionButton variant="secondary" onClick={() => setAdvancedOpen(true)}>Pokročilé a SEO</AdminActionButton>
        </div>
      </div>

      <AdminFormFeedback message={message} error={error} pending={saving} className="admin-editor-message" errorClassName="is-error" successClassName="is-success" />
      <div className={styles.editorWorkspace} data-admin-directory-editor-workspace>
        <AdminSharedEditorNavigation sections={editorSectionsForProfile} activeId={currentDirectorySection} onNavigate={setActiveDirectorySection}
          layout="sidebar" mode="switch" ariaLabel="Sekcie profilu adresára" />
        <div className={styles.editorWorkspaceContent}>
      <div className="admin-event-editor-grid">
        <div className="admin-event-fields" onChangeCapture={() => setFormDirty(true)}>
          <AdminAutomationUpdateSuggestions initialSuggestions={automationSuggestions} source={profile ? { entityType: "DIRECTORY", canonicalEntityId: profile.id } : undefined} onAccepted={applyAutomationUpdate} />
          <AdminEditorSection id="directory-main" className="admin-form-card admin-form-card--intro">
            <div className="admin-card-heading"><div><span>01</span><div><h2>Hlavné údaje</h2><p>Názov, zaradenie a krátke verejné predstavenie.</p></div></div></div>
            <div className="admin-field admin-field--title"><label htmlFor="directory-name">Názov profilu</label><input id="directory-name" value={name} onChange={(event) => changeName(event.target.value)} placeholder="Napríklad: Psia škola Pod Zoborom" required /></div>
            <div className="admin-field"><label htmlFor="directory-category">Kategória</label><select id="directory-category" value={category} onChange={(event) => {
              const nextCategory = event.target.value as DirectoryCategorySlug;
              if (nextCategory === category) return;
              if (Object.keys(filterChanges).length > 0 && !window.confirm("Zmenou kategórie zahodíš neuložené kategóriové filtre. Pokračovať?")) return;
              setCategory(nextCategory);
              setFilterChanges({});
            }}>{directoryCategories.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}</select></div>
            <div className="admin-field"><label htmlFor="directory-excerpt">Krátky popis</label><AdminLexicalTextField id="directory-excerpt" rows={3} value={excerpt} onChange={(next) => { setExcerpt(next); setFormDirty(true); }} placeholder="Čím je profil zaujímavý a komu pomáha?" ariaLabel="Krátky popis" /><small>{excerpt.length} znakov · odporúčame 80–180</small></div>
          </AdminEditorSection>

          <AdminEditorSection id="directory-location" className="admin-form-card">
            <div className="admin-card-heading"><div><span>02</span><div><h2>Adresa prevádzky / miesta služby</h2><p>Verejná adresa je redakčný obsah profilu. Technické lokalizačné údaje pod ňou slúžia pre filtre, Google Maps a GEO.</p></div></div></div>
            <div className="admin-field">
              <label htmlFor="directory-public-address">Verejná adresa</label>
              <textarea
                id="directory-public-address"
                rows={2}
                value={publicAddress}
                onChange={(event) => setPublicAddress(event.target.value)}
                placeholder="Napríklad: Hviezdoslavova 1892/74, 953 01 Zlaté Moravce"
              />
              <small>Toto je text, ktorý sa zobrazí návštevníkovi. Môžeš ho uložiť a publikovať aj bez potvrdenia Geoapify alebo Google Maps.</small>
            </div>
            {addressQualityWarning ? (
              <p className="admin-message" data-directory-address-warning>
                <strong>⚠️ {addressQualityWarning}</strong><br />
                Adresu môžeš uložiť a publikovať. Upozornenie sa verejne nezobrazuje.
              </p>
            ) : null}
            <p className="admin-help"><strong>Technické lokalizačné údaje — voliteľné.</strong> Pomáhajú pri filtroch a hľadaní mapového bodu, ale nie sú podmienkou uloženia verejnej adresy.</p>
            <SlovakiaLocationSelector
              value={{ region, district, city }}
              required={false}
              idPrefix="directory-service-location"
              onChange={(location) => {
                const changed = location.region !== region || location.district !== district || location.city !== city;
                setRegion(location.region);
                setDistrict(location.district);
                setCity(location.city);
                if (changed) {
                  setAddressProviderResultId("");
                  setPostalCode("");
                  setStreet("");
                  setHouseNumber("");
                  setAddressFormat("");
                  setNumberlessLocalityConfirmed(false);
                }
              }}
            />
            {profile?.city && !city ? (
              <p className="admin-message" role="status" data-directory-missing-city-warning>
                Mesto / obec je teraz prázdne. Po zmene kraja alebo okresu vyber aj mesto, inak sa prázdna hodnota uloží a prenesie do Notionu.
              </p>
            ) : null}
            <DirectoryAddressAutocomplete
              key={`${region}|${district}|${city}|${street}`}
              region={region}
              district={district}
              city={city}
              selectedProviderResultId={addressProviderResultId}
              selectedStreet={street}
              selectedLocalityConfirmed={numberlessLocalityConfirmed}
              onClearSelection={() => {
                setAddressProviderResultId("");
                setNumberlessLocalityConfirmed(false);
              }}
              onUseLocality={(locality) => {
                setAddressProviderResultId("");
                setNumberlessLocalityConfirmed(true);
                setStreet(locality);
                setHouseNumber("");
                setAddressFormat("STREET");
              }}
              onSelect={(suggestion) => {
                const next = applyDirectoryStreetSelection(
                  { region, district, city, postalCode, street, houseNumber, addressFormat },
                  suggestion,
                );
                setAddressProviderResultId(next.addressProviderResultId);
                setNumberlessLocalityConfirmed(false);
                setPostalCode(next.postalCode);
                setStreet(next.street);
                setHouseNumber(next.houseNumber);
                setAddressFormat(next.addressFormat);
              }}
            />
            {street ? (
              <div className="admin-field-grid" aria-label="Adresa prevádzky">
                <div className="admin-field">
                  <label>Ulica</label>
                  <input value={street} readOnly />
                </div>
                <div className="admin-field">
                  <label htmlFor="directory-house-number">Číslo domu <small>nepovinné pri miestach bez prideleného čísla</small></label>
                  <input
                    id="directory-house-number"
                    value={houseNumber}
                    onChange={(event) => {
                      setHouseNumber(event.target.value);
                      if (event.target.value.trim()) {
                        setPostalCode("");
                        setNumberlessLocalityConfirmed(false);
                      }
                    }}
                    placeholder="Napríklad 1892/74 alebo 74"
                  />
                  <small>Ak miesto nemá verejne dohľadateľné číslo domu, nechaj pole prázdne. Polohu potom musí potvrdiť Google Maps.</small>
                </div>
                <div className="admin-field">
                  <label htmlFor="directory-postal-code">PSČ</label>
                  <input
                    id="directory-postal-code"
                    value={postalCode}
                    onChange={(event) => setPostalCode(event.target.value)}
                    placeholder="Napríklad 031 01"
                    inputMode="numeric"
                  />
                  <small>{houseNumber.trim() ? "Ak PSČ nepoznáš, môže zostať prázdne; provider ho môže doplniť." : "PSČ je nepovinné. Ak ho nepoznáš, nechaj ho prázdne."}</small>
                </div>
              </div>
            ) : null}
            {addressEvaluation.state !== "COMPLETE" ? (
              <QualityResolutionField
                field="address"
                value={qualityResolutions.address ?? ""}
                checkedAt={qualityCheckedAt.address}
                onChange={(value) => setQualityResolution("address", value)}
              />
            ) : null}
          </AdminEditorSection>

          <AdminEditorSection id="directory-content" className="admin-form-card">
            <div className="admin-card-heading"><div><span>03</span><div><h2>Obsah profilu</h2><p>Čo ponúka, skúsenosti a praktické informácie.</p></div></div></div>
            <div className="admin-field"><label htmlFor="directory-description">Podrobný popis</label><AdminLexicalTextField id="directory-description" rows={9} value={description} onChange={(next) => { setDescription(next); setFormDirty(true); }} placeholder={"Predstav profil, spôsob práce a pre koho sú služby vhodné.\n\nNový odsek začni po prázdnom riadku."} ariaLabel="Podrobný popis" /><AdminLexicalAppendButton onAppend={text=>setDescription(appendLexicalPlainText(description,text))}/></div>
            <AdminHelpText term="Formát">Lexical ukladá popis do existujúceho textového poľa bez zmeny synchronizácie Notion.</AdminHelpText>
            <div className={isDirectoryEventPilotCategory(category) ? "" : "admin-field-grid"}>
              {!isDirectoryEventPilotCategory(category) ? (
                category === "treneri" && !notionDraft ? (
                  <div className="admin-field">
                    <label htmlFor="directory-trainer-services-text">Služby – voľný text (Notion)</label>
                    <textarea id="directory-trainer-services-text" rows={7} value={trainerServicesText}
                      onChange={event => { setTrainerServicesText(event.target.value); setFormDirty(true); }}
                      placeholder={"Individuálny tréning\nSkupinové kurzy\nPráca so šteniatkami"} />
                    <small>Tento opis sa prenáša do poľa Služby v Notione; katalóg Služby V3 sa nemení.</small>
                    <small>Existujúci katalógový/legacy zoznam: {services || "Bez položiek"}</small>
                  </div>
                ) : (
                  <div className="admin-field"><label htmlFor="directory-services">Služby a zameranie</label><textarea id="directory-services" rows={7} value={services} onChange={(event) => { setServices(event.target.value); setFormDirty(true); }} placeholder={"Individuálny tréning\nSkupinové kurzy\nPráca so šteniatkami"} /><small>Jedna položka na riadok.</small></div>
                )
              ) : null}
              <div className="admin-field"><label htmlFor="directory-qualifications">{category === "chovatelske-stanice" ? "O chovateľovi" : category === "veterinari" ? "Kvalifikácie" : category === "fyzioterapia" ? "Odbornosť a skúsenosti" : "Skúsenosti a kvalifikácie"}</label><textarea id="directory-qualifications" rows={7} value={qualifications} onChange={(event) => setQualifications(event.target.value)} placeholder={category === "chovatelske-stanice" ? "Predstav chovateľa, skúsenosti a doterajšiu prax." : "Certifikácia alebo členstvo\nRoky praxe\nŠpecializované vzdelanie"} /><small>Jedna položka na riadok.</small></div>
            </div>
            <div className="admin-field"><label htmlFor="directory-price">Orientačná cena <small>nepovinné</small></label><input id="directory-price" value={priceNote} onChange={(event) => setPriceNote(event.target.value)} placeholder="Napríklad: od 25 € za lekciu" /></div>
            {profile && isDirectoryEventPilotCategory(category) ? (
              <>
                <div className="admin-field">
                  <label htmlFor="directory-pilot-hours">Ordinačné / otváracie hodiny</label>
                  <textarea id="directory-pilot-hours" rows={6} value={pilotOpeningHours}
                    onChange={event => { setPilotOpeningHours(event.target.value); setFormDirty(true); }}
                    placeholder={"Pondelok: 08:00–16:00\nUtorok: 08:00–16:00\nPodľa dohody"} />
                  <small>Úpravy sa prenášajú samostatne. Vymazanie celého obsahu v Admine vymaže iba tieto hodiny aj v Notione; prázdne hodnoty z Notionu existujúce údaje neprepisujú.</small>
                </div>
                <div className="admin-field">
                  <label htmlFor="directory-pilot-sources">Zdroje údajov</label>
                  <textarea id="directory-pilot-sources" rows={3} value={pilotDataSources}
                    onChange={event => { setPilotDataSources(event.target.value); setFormDirty(true); }}
                    placeholder="https://oficialny-web.sk/kontakt" />
                </div>
                <div className="admin-field">
                  <label htmlFor="directory-pilot-image-source">Zdroj fotografie</label>
                  <input id="directory-pilot-image-source" type="text" value={pilotImageSource}
                    onChange={event => { setPilotImageSource(event.target.value); setFormDirty(true); }}
                    placeholder="Odkaz na zdroj fotografie; bez práv fotografiu nekopírovať" />
                </div>
                <div className="admin-field">
                  <label htmlFor="directory-pilot-image-alt">Alt text obrázka</label>
                  <textarea id="directory-pilot-image-alt" rows={2} value={pilotImageAlt}
                    onChange={event => { setPilotImageAlt(event.target.value); setFormDirty(true); }}
                    placeholder="Stručný opis toho, čo je na fotografii" />
                </div>
              </>
            ) : null}

            {filterCategory && !notionDraft ? (
              <DirectoryCategoryFilterFields
                category={filterCategory}
                originalValues={filterOriginals}
                changes={filterChanges}
                onChange={(next) => setFilterChanges({ ...next })}
                disabled={saving}
                idPrefix="admin-directory"
              />
            ) : null}
          </AdminEditorSection>

          <AdminEditorSection id="directory-contacts" className="admin-form-card">
            <div className="admin-card-heading"><div><span>04</span><div><h2>Kontakty a odkazy</h2><p>Kontaktné údaje, ktoré sa zobrazujú návštevníkom profilu.</p></div></div></div>
<AdminEditorToolFrame kind="contacts">
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="directory-phone">Verejný telefón <small>nepovinné</small></label><input id="directory-phone" type="tel" value={publicPhone} onChange={(event) => { const value = event.target.value; setPublicPhone(value); if (value.trim()) clearQualityResolution("phone"); }} placeholder="+421 900 000 000" />{!publicPhone.trim() ? <QualityResolutionField field="phone" value={qualityResolutions.phone ?? ""} checkedAt={qualityCheckedAt.phone} onChange={(value) => setQualityResolution("phone", value)} /> : null}</div>
              <div className="admin-field"><label htmlFor="directory-public-email">Verejný e-mail <small>nepovinné</small></label><input id="directory-public-email" type={category === "chovatelske-stanice" ? "text" : "email"} value={publicEmail} onChange={(event) => { const value = event.target.value; setPublicEmail(value); if (value.trim()) clearQualityResolution("email"); }} placeholder="kontakt@profil.sk" />{!publicEmail.trim() ? <QualityResolutionField field="email" value={qualityResolutions.email ?? ""} checkedAt={qualityCheckedAt.email} onChange={(value) => setQualityResolution("email", value)} /> : null}</div>
              <div className="admin-field"><label htmlFor="directory-website">Verejný web <small>nepovinné</small></label><input id="directory-website" type={category === "chovatelske-stanice" ? "text" : "url"} value={websiteUrl} onChange={(event) => { const value = event.target.value; setWebsiteUrl(value); if (value.trim()) clearQualityResolution("website"); }} placeholder="https://…" />{!websiteUrl.trim() ? <QualityResolutionField field="website" value={qualityResolutions.website ?? ""} checkedAt={qualityCheckedAt.website} onChange={(value) => setQualityResolution("website", value)} /> : null}</div>
              <div className="admin-field"><label htmlFor="directory-facebook">Facebook <small>nepovinné</small></label><input id="directory-facebook" type={category === "chovatelske-stanice" ? "text" : "url"} value={facebookUrl} onChange={(event) => setFacebookUrl(event.target.value)} placeholder="https://facebook.com/…" /></div>
              <div className="admin-field"><label htmlFor="directory-instagram">Instagram <small>nepovinné</small></label><input id="directory-instagram" type={category === "chovatelske-stanice" ? "text" : "url"} value={instagramUrl} onChange={(event) => setInstagramUrl(event.target.value)} placeholder="https://instagram.com/…" /></div>
            </div>
            </AdminEditorToolFrame>
            <AdminHelpText term="Kvalita údajov">Ak profil web, telefón alebo e-mail naozaj nemá, nie je verejný alebo sa ho nepodarilo dohľadať, označ stav pri prázdnom poli. Taký údaj prestane byť falošným problémom v Kvalite údajov a po 12 mesiacoch sa automaticky znovu skontroluje.</AdminHelpText>
          </AdminEditorSection>

          {profile && ["chovatelske-stanice", "treneri"].includes(category) ? (
            <AdminEditorSection id="directory-breeder-links" className="admin-form-card">
              <div className="admin-card-heading"><div><span>05</span><div>
                <h2>Prepojené plemená a chovateľské kluby</h2>
                <p>Vyber existujúce profily. Prepojenia sa uložia spolu s tlačidlom Uložiť profil.</p>
              </div></div></div>
              {breederRelationsLoading ? <p>Načítavam plemená a kluby…</p> : null}
              {breederRelationsError ? <p role="alert">{breederRelationsError}</p> : null}
              {([
                { key: "breeds" as const, field: "breedIds" as const, label: "Plemená", options: breederRelationOptions.breeds },
                { key: "clubs" as const, field: "clubIds" as const, label: "Chovateľské kluby", options: breederRelationOptions.clubs },
              ]).map(group => {
                const search = breederRelationSearch[group.key].trim().toLocaleLowerCase("sk");
                const matches = group.options.filter(option =>
                  breederSelection[group.field].includes(option.id) ||
                  !search || option.name.toLocaleLowerCase("sk").includes(search));
                const visible = search ? matches.slice(0, 45) : matches.filter(option =>
                  breederSelection[group.field].includes(option.id)).slice(0, 45);
                return (
                  <div className="admin-field" key={group.key}>
                    <label htmlFor={`breeder-relations-${group.key}`}>
                      {group.label} ({breederSelection[group.field].length} vybraných)
                    </label>
                    <input
                      id={`breeder-relations-${group.key}`}
                      type="search"
                      value={breederRelationSearch[group.key]}
                      onChange={event => setBreederRelationSearch(value => ({ ...value, [group.key]: event.target.value }))}
                      placeholder={`Vyhľadať ${group.label.toLocaleLowerCase("sk")}…`}
                    />
                    <div style={{ display: "grid", gap: 8, maxHeight: 260, overflowY: "auto", padding: "8px 0" }}>
                      {visible.map(option => (
                        <label key={option.id} style={{ display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                          <input type="checkbox"
                            checked={breederSelection[group.field].includes(option.id)}
                            onChange={() => toggleBreederLink(group.field, option.id)}
                          />
                          <span>{option.name}{option.city ? ` — ${option.city}` : ""}</span>
                        </label>
                      ))}
                      {!visible.length ? <small>{search ? "Nenašli sa žiadne výsledky." : "Napíš názov do vyhľadávania."}</small> : null}
                    </div>
                  </div>
                );
              })}
            </AdminEditorSection>
          ) : null}
          <AdminEditorSection id="directory-media-trust" className="admin-form-card">
            {profile && <AdminShareToFacebook title={name} imageUrl={imageUrl} publicPath={"/adresar/" + profile.category + "/" + profile.slug} />}
            <div className="admin-card-heading"><div><span>{profile && ["chovatelske-stanice", "treneri"].includes(category) ? "06" : "05"}</span><div><h2>Médiá a dôvera</h2><p>Obrázok, redakčné overenie a existujúce odporúčanie profilu.</p></div></div></div>
            <div className="admin-upload-row"><div className="admin-upload-preview admin-upload-preview--forest">{imageUrl ? <ImageDisplay roleHint="generic" context="thumbnail" config={thumbnailImageDisplay} src={imageUrl} alt="Náhľad profilovej fotografie" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div><div className="admin-upload-actions"><AdminSingleImageUpload label={imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"} onFile={uploadImage} busy={uploading} onRejected={setError}/>{imageUrl && <AdminActionButton variant="neutral" onClick={() => { removeMainImageRequestedRef.current = true; setImageUrl(""); setImageKey(""); setThumbnailImageDisplay(null); setDetailImageDisplay(null); setFormDirty(true); }}>Odstrániť fotku</AdminActionButton>}<small>Odporúčaný pomer 4 : 3, najviac 8 MB.</small></div></div>
            {imageUrl && !notionDraft && <button type="button" className="admin-upload-button" onClick={() => setImageEditorOpen(true)}>Upraviť zobrazenie</button>}
            {!notionDraft && category === "chovatelske-stanice" ? (
              <AdminPhotoGallery
                folder="directory"
                limit={DIRECTORY_BREEDER_GALLERY_LIMIT}
                value={galleryUrls}
                disabled={saving || uploading || galleryBusy}
                onBusyChange={setGalleryBusy}
                onChange={(urls) => { setGalleryUrls(urls); setFormDirty(true); }}
              />
            ) : null}
            {notionDraft && <div className="admin-field"><label htmlFor="directory-notion-logo">URL oficiálneho loga</label><input id="directory-notion-logo" type="url" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://…" /><small>Logo je samostatné od hlavnej fotografie. Nastavenie výrezu fotografie bude dostupné po synchronizácii profilu do Adresára.</small></div>}
            {!imageUrl ? (
              <QualityResolutionField
                field="image"
                value={qualityResolutions.image ?? ""}
                checkedAt={qualityCheckedAt.image}
                onChange={(value) => setQualityResolution("image", value)}
              />
            ) : null}
            <div className="admin-directory-flags">
              <label className="admin-event-cancelled"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /><span><strong>Overený profil</strong><small>Trust stav: redakcia preverila základné údaje. Nie je to publication state.</small></span></label>
              <label className="admin-event-cancelled"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /><span><strong>Odporúčaný profil</strong><small>Existujúci featured flag pre poradie. Neznamená platené ani sponzorované umiestnenie.</small></span></label>
            </div>
          </AdminEditorSection>
        </div>

        <aside className="admin-event-preview admin-directory-preview">
          <span className="admin-eyebrow">Živý súhrn</span><div className="admin-event-preview-visual">{imageUrl ? <ImageDisplay roleHint="generic" context="thumbnail" config={thumbnailImageDisplay} src={imageUrl} alt="" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div>
          <span className="eyebrow">{categoryInfo?.singular}{verified ? " · Overený" : ""}</span><h2>{name || "Názov profilu"}</h2><p>{excerpt || "Krátky popis profilu sa zobrazí tu."}</p>
          <dl><div><dt>Stav</dt><dd>{status === "published" ? "Publikované" : "Koncept"}</dd></div><div><dt>Lokalita</dt><dd>{city || "Bez známej lokality"}{district ? ` · okres ${district}` : ""}{region ? ` · ${region}` : ""}</dd></div><div><dt>Adresa</dt><dd>{addressEvaluation.formattedAddress ?? (publicAddress.trim() || addressStatusText)}</dd></div></dl>
        </aside>
      </div>
      <nav data-admin-editor-pager className={styles.sectionPager} aria-label="Prechod medzi sekciami služby">
        <AdminActionButton variant="secondary" disabled={activeDirectoryIndex <= 0}
          onClick={() => navigateDirectoryPager(editorSectionsForProfile[activeDirectoryIndex - 1]?.id ?? editorSectionsForProfile[0].id)}>Predchádzajúca</AdminActionButton>
        <span role="status">Sekcia {activeDirectoryIndex + 1} z {editorSectionsForProfile.length}</span>
        <AdminActionButton variant="secondary" disabled={activeDirectoryIndex >= editorSectionsForProfile.length - 1}
          onClick={() => navigateDirectoryPager(editorSectionsForProfile[activeDirectoryIndex + 1]?.id ?? editorSectionsForProfile[editorSectionsForProfile.length - 1].id)}>Ďalšia</AdminActionButton>
      </nav>
        </div>
      </div>

      {imageEditorOpen && imageUrl && <ImageDisplayEditor src={imageUrl} alt={name || "Profil"} title={name} excerpt={excerpt} entityLabel="profilu služby" thumbnailAspectRatio="1 / 1" thumbnailLayout="compact"
         thumbnail={thumbnailImageDisplay} detail={detailImageDisplay} onCancel={() => setImageEditorOpen(false)}
         onSave={(thumbnail, detail) => { setThumbnailImageDisplay(thumbnail); setDetailImageDisplay(detail); setFormDirty(true); setImageEditorOpen(false); }} />}
      <AdminDrawer
        open={advancedOpen}
        title="Pokročilé nastavenia"
        description="Slug a SEO sú sekundárne nastavenia profilu."
        onClose={() => setAdvancedOpen(false)}
        footer={<AdminActionButton variant="primary" onClick={() => setAdvancedOpen(false)}>Hotovo</AdminActionButton>}
      >
        <div className={styles.drawerFields}>
          <div className="admin-field"><label htmlFor="directory-slug">Adresa profilu</label><div className="admin-slug-input"><span>psipedia.sk/adresar/{category}/</span><input id="directory-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); setFormDirty(true); }} placeholder="nazov-profilu" required /></div></div>
          <AdminSeoFields value={seo} onChange={(next) => { setSeo(next); setFormDirty(true); }} canonicalPath={`/adresar/${category}/${slug}`} fallbackTitle={directorySeoFallback(name || "Názov profilu", city, category).title} fallbackDescription={directorySeoFallback(name || "Názov profilu", city, category).description} />
        </div>
      </AdminDrawer>

      </NotionDraftFields>
      </AdminEditorSectionVisibility.Provider>
      <AdminEditorFooter dirty={formDirty} pending={saving}>
      <div className="admin-editor-actions">
        <div>{notionDraft ? <span>Koncept Gemini · {reviewState ? geminiReviewLabels[reviewState] : "Notion"}</span> : <Link href="/admin/adresar" ref={directoryBackLinkRef} onClick={event => {
          // Preserve native behavior for modified clicks and background tabs.
          if (formDirty && !allowDirectoryExitRef.current && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            event.preventDefault();
            setConfirmDirectoryExit(true);
          }
        }}>← Späť na adresár</Link>}</div>
        {notionDraft && !notionDraft.psipediaId && !canonicalEditorUrl && (
          <div>
            {!reviewConfirm ? <AdminActionButton variant="secondary" disabled={saving} onClick={() => {
              setReviewConfirm(reviewState === "REJECTED" ? "restore" : "reject");
            }}>{reviewState === "REJECTED" ? "Obnoviť koncept" : "Odmietnuť koncept"}</AdminActionButton> : <>
              <p role="alert">{reviewConfirm === "reject" ? "Odmietnuť tento koncept? Gemini ho nebude znova navrhovať." : "Obnoviť koncept na úpravy? Nebude publikovaný."}</p>
              {reviewConfirm === "reject" && <label>Dôvod odmietnutia (voliteľný)<textarea maxLength={1500} value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} /></label>}
              <AdminActionButton variant="secondary" disabled={saving} onClick={() => void reviewNotion()}>{reviewConfirm === "reject" ? "Áno, odmietnuť" : "Áno, obnoviť"}</AdminActionButton>
              <AdminActionButton variant="neutral" disabled={saving} onClick={() => setReviewConfirm(null)}>Zrušiť</AdminActionButton>
            </>}
          </div>
        )}
        {notionDraft && <p role="status">{canonicalEditorUrl
          ? "Neverejný D1 profil bol overený. Ďalšie úpravy a publikovanie dokonči v kanonickom editore."
          : "Publikovať bude možné až po overenom importe v natívnom D1 editore."}</p>}
        {canonicalEditorUrl && <a href={canonicalEditorUrl}>Otvoriť overený D1 editor →</a>}
        <div>
          {status === "published" && !notionDraft && <AdminActionButton variant="secondary" disabled={saving || uploading || galleryBusy} onClick={() => void save("draft")}>Stiahnuť z adresára</AdminActionButton>}
          <AdminActionButton variant="neutral" type="submit" disabled={saving || uploading || galleryBusy || notionReadOnly}>{saving ? "Ukladám…" : status === "published" && !notionDraft ? "Uložiť bez zmeny publikovania" : "Uložiť koncept"}</AdminActionButton>
          {!notionDraft && <AdminActionButton variant="primary" disabled={saving || uploading || galleryBusy || Boolean(reviewConfirm)}
            onClick={() => void save("published")}>{saving ? "Ukladám…" : status === "published" ? "Uložiť zmeny" : "Publikovať profil"}</AdminActionButton>}
        </div>
      </div>
      </AdminEditorFooter>
      {!notionDraft && <Link href={createdProfileHref || "/admin/adresar"} ref={createdProfileLinkRef} hidden tabIndex={-1} aria-hidden="true">Otvoriť vytvorený profil</Link>}
      <EditorUnsavedChangesGuard
        active={formDirty}
        open={confirmDirectoryExit}
        onStay={() => setConfirmDirectoryExit(false)}
        onDiscard={() => {
          allowDirectoryExitRef.current = true;
          setConfirmDirectoryExit(false);
          setFormDirty(false);
          // Reuse the existing Next Link, keeping Gemini/Notion modal free of router context.
          directoryBackLinkRef.current?.click();
        }}
      />
    </form>
  );
}
