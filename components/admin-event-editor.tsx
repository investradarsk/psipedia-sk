"use client";
import { AdminRecordLifecycleActions } from "@/components/admin-record-lifecycle-actions";
import { useProfileEditorSectionPager } from "@/components/admin-profile-editor-section-pager";
import { AdminEditorToolFrame } from "@/components/admin-editor-tool-frame";
import {AdminSingleImageUpload} from "@/components/admin-single-image-upload";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import { AdminNotionProfileImportButton } from "@/components/admin-notion-profile-import-button";
import { AdminShareToFacebook } from "@/components/admin-share-to-facebook";
import {adminSelectedImage} from "@/lib/admin-selected-image";

import { useRouter } from "next/navigation";
import { AdminActionButton } from "@/components/admin-interaction-system";
import { EditorWorkspace, EditorSection, EditorStatus, EditorActionBar, EditorUnsavedChangesGuard, type EditorWorkspaceSection } from "@/components/admin-editor-workspace";
import { AdminEventMarkdownEditor } from "@/components/admin-event-markdown-editor";
import { AdminLexicalTextField } from "@/components/admin-lexical-text-field";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { eventTypes, slovakRegions, type DogEvent, type EventStatus, type EventType, type SlovakRegion } from "@/lib/events";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { AdminSeoFields } from "@/components/admin-seo-fields";
import { AdminProfileGoogleMaps } from "@/components/admin-profile-google-maps";
import { AdminGeoLocation } from "@/components/admin-geo-location";
import { AdminAutomationUpdateSuggestions } from "@/components/admin-automation-update-suggestions";
import type { CanonicalUpdateSuggestion } from "@/lib/data-automation-update-review";
import { eventSeoFallback } from "@/lib/content-seo";
import { eventChangedAdminFields } from "@/lib/notion-event-field-contract";
import styles from "./admin-event-editor.module.css";
import type { SmartImageMode } from "@/lib/smart-image";
import { ImageDisplay } from "@/components/image-display";
import { ImageDisplayEditor } from "@/components/image-display-editor";
import { DEFAULT_DETAIL, DEFAULT_THUMBNAIL } from "@/lib/image-display";
import { legacyArticleThumbnail, type ImageDisplayConfig } from "@/lib/image-display";

const EVENT_SECTIONS: EditorWorkspaceSection[] = [
  { id: "event-basics", label: "Základné údaje" },
  { id: "event-schedule", label: "Termín a typ" },
  { id: "event-location", label: "Miesto podujatia" },
  { id: "event-contacts", label: "Organizátor a kontakty" },
  { id: "event-details", label: "Program a informácie" },
  { id: "event-media", label: "Fotografia a URL" },
  { id: "event-notes", label: "Interné poznámky" },
  { id: "event-seo", label: "SEO" },
];

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

export function AdminEventEditor({ event, initialInternalNotes = "", automationSuggestions = [] }: { event?: DogEvent; initialInternalNotes?: string; automationSuggestions?: CanonicalUpdateSuggestion[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(event?.title ?? "");
  const [slug, setSlug] = useState(event?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(event));
  const [excerpt, setExcerpt] = useState(event?.excerpt ?? "");
  const [eventType, setEventType] = useState<EventType>(event?.eventType ?? "Výstava");
  const [startDate, setStartDate] = useState(event?.startDate ?? "");
  const [startTime, setStartTime] = useState(event?.startTime ?? "");
  const [endDate, setEndDate] = useState(event?.endDate ?? "");
  const [endTime, setEndTime] = useState(event?.endTime ?? "");
  const [venue, setVenue] = useState(event?.venue ?? "");
  const [city, setCity] = useState(event?.city ?? "");
  const [region, setRegion] = useState<SlovakRegion>(event?.region ?? "Nitriansky kraj");
  const [address, setAddress] = useState(event?.address ?? "");
  const [organizer, setOrganizer] = useState(event?.organizer ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [practicalInfo, setPracticalInfo] = useState(event?.practicalInfo ?? "");
  const [contactPhone, setContactPhone] = useState(event?.contactPhone ?? "");
  const [contactEmail, setContactEmail] = useState(event?.contactEmail ?? "");
  const [admissionFee, setAdmissionFee] = useState(event?.admissionFee ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(event?.websiteUrl ?? "");
  const [registrationUrl, setRegistrationUrl] = useState(event?.registrationUrl ?? "");
  const [imageUrl, setImageUrl] = useState(event?.imageUrl ?? "");
  const [imageAlt, setImageAlt] = useState(event?.imageAlt ?? "");
  const [internalNotes, setInternalNotes] = useState(initialInternalNotes);
  const [imageKey, setImageKey] = useState(event?.imageKey ?? "");
  const [imageDisplay] = useState<SmartImageMode>(event?.imageDisplay ?? "auto");
  const [thumbnailImageDisplay, setThumbnailImageDisplay] = useState<ImageDisplayConfig | null>(event?.thumbnailImageDisplay ?? null);
  const [detailImageDisplay, setDetailImageDisplay] = useState<ImageDisplayConfig | null>(event?.detailImageDisplay ?? null);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [cancelled, setCancelled] = useState(event?.cancelled ?? false);
  const [status, setStatus] = useState<EventStatus>(event?.status ?? "draft");
  const [seo, setSeo] = useState(event?.seo ?? {});
  const [saving, setSaving] = useState(false);
  const savePendingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [activeEventSection, setActiveEventSection] = useState(EVENT_SECTIONS[0].id);
  const activeEventSectionIndex = EVENT_SECTIONS.findIndex((section) => section.id === activeEventSection);
  const navigateWithPager = useProfileEditorSectionPager(activeEventSection, setActiveEventSection);

  // Track the canonical form payload, not DOM input events: markdown toolbar,
  // SEO drawer, image display settings and automation patches all change React state.
  const editorSnapshot = JSON.stringify({
    title, slug, excerpt, eventType, startDate, startTime, endDate, endTime,
    venue, city, region, address, organizer, description, practicalInfo, contactPhone, contactEmail, admissionFee,
    websiteUrl, registrationUrl, imageUrl, imageAlt, internalNotes, imageKey, imageDisplay,
    thumbnailImageDisplay, detailImageDisplay, cancelled, seo,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(editorSnapshot);
  const dirty = editorSnapshot !== savedSnapshot;
  const [confirmNavigation, setConfirmNavigation] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const allowNavigationRef = useRef(false);
  const requestNavigation = useCallback((navigate: () => void) => {
    pendingNavigationRef.current = navigate;
    setConfirmNavigation(true);
  }, []);

  // Scope navigation protection to this editor; the shared EditorWorkspace
  // already guards its close button and native beforeunload.
  useEffect(() => {
    if (!dirty) return;
    const onDocumentClick = (click: MouseEvent) => {
      if (allowNavigationRef.current || click.defaultPrevented || click.button !== 0 ||
          click.metaKey || click.ctrlKey || click.shiftKey || click.altKey) return;
      const target = click.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin ||
          (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      click.preventDefault();
      click.stopPropagation();
      requestNavigation(() => router.push(destination.pathname + destination.search + destination.hash));
    };
    document.addEventListener("click", onDocumentClick, true);

    // The Navigation API catches history traversal and programmatic soft
    // navigation that cannot be handled by a DOM link click.
    const navigationApi = (window as Window & {
      navigation?: EventTarget & { traverseTo?: (key: string) => Promise<unknown> };
    }).navigation;
    const onNativeNavigate = (event: Event) => {
      if (allowNavigationRef.current || !event.cancelable) return;
      const navigationEvent = event as Event & {
        destination?: { url: string; key?: string };
        navigationType?: string;
        hashChange?: boolean;
      };
      if (navigationEvent.hashChange || !navigationEvent.destination?.url) return;
      const destination = new URL(navigationEvent.destination.url);
      if (destination.origin !== window.location.origin ||
          (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      event.preventDefault();
      const key = navigationEvent.destination.key;
      if (navigationEvent.navigationType === "traverse") {
        requestNavigation(() => {
          if (key && navigationApi?.traverseTo) void navigationApi.traverseTo(key);
          else window.history.back();
        });
      } else {
        requestNavigation(() => router.push(destination.pathname + destination.search + destination.hash));
      }
    };
    navigationApi?.addEventListener("navigate", onNativeNavigate);
    return () => {
      document.removeEventListener("click", onDocumentClick, true);
      navigationApi?.removeEventListener("navigate", onNativeNavigate);
    };
  }, [dirty, requestNavigation, router]);

  const stayInEditor = () => {
    pendingNavigationRef.current = null;
    setConfirmNavigation(false);
  };
  const discardAndNavigate = () => {
    const navigate = pendingNavigationRef.current;
    pendingNavigationRef.current = null;
    allowNavigationRef.current = true;
    setConfirmNavigation(false);
    setSavedSnapshot(editorSnapshot);
    navigate?.();
  };

  function changeTitle(value: string) {
    setTitle(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  async function uploadImage(uploadEvent: File | ChangeEvent<HTMLInputElement>) {
    const file = adminSelectedImage(uploadEvent);
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "events");
      setImageUrl(data.imageUrl); setImageKey(data.imageKey); setThumbnailImageDisplay(null); setDetailImageDisplay(null); setMessage(adminImageUploadMessage(data, "Ulož podujatie."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally { setUploading(false); }
  }

  function applyAutomationUpdate(values: Record<string, unknown>) {
    for (const [field, value] of Object.entries(values)) {
      const text = value === null || value === undefined ? "" : String(value);
      if (field === "title") setTitle(text);
      else if (field === "excerpt") setExcerpt(text);
      else if (field === "eventType") setEventType(text as EventType);
      else if (field === "startDate") setStartDate(text);
      else if (field === "startTime") setStartTime(text);
      else if (field === "endDate") setEndDate(text);
      else if (field === "endTime") setEndTime(text);
      else if (field === "venue") setVenue(text);
      else if (field === "city") setCity(text);
      else if (field === "region") setRegion(text as SlovakRegion);
      else if (field === "address") setAddress(text);
      else if (field === "organizer") setOrganizer(text);
      else if (field === "description") setDescription(text);
      else if (field === "practicalInfo") setPracticalInfo(text);
      else if (field === "contactPhone") setContactPhone(text);
      else if (field === "contactEmail") setContactEmail(text);
      else if (field === "admissionFee") setAdmissionFee(text);
      else if (field === "websiteUrl") setWebsiteUrl(text);
      else if (field === "registrationUrl") setRegistrationUrl(text);
    }
  }

  async function save(nextStatus: EventStatus) {
    if (savePendingRef.current || uploading) return;
    // An incomplete editorial field never blocks publication; only identity
    // and non-empty malformed values require correction.
    if (!(status === "published" && nextStatus === "draft")) {
      const requiredFields = [
        { value: title, section: "event-basics", label: "Názov podujatia" },
        { value: slug, section: "event-media", label: "Adresa podujatia" },
      ];
      const missing = requiredFields.find((field) => !field.value.trim());
      if (missing) {
        setActiveEventSection(missing.section);
        setMessage("");
        setError(`Vyplň povinné pole: ${missing.label}.`);
        return;
      }
      // Optional links are sanitized independently by the server.
      // Even a malformed URL must not block edits to other fields.
    }
    // Missing/invalid optional contacts are warnings, never form blockers.
    savePendingRef.current = true;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(event ? `/api/admin/events/${event.id}` : "/api/admin/events", {
        method: event ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, slug, excerpt, eventType, status: nextStatus, startDate, startTime, endDate: endDate || null, endTime: endTime || null, venue, city, region, address, organizer, description, practicalInfo, contactPhone: contactPhone || null, contactEmail: contactEmail || null, admissionFee, websiteUrl: websiteUrl || null, registrationUrl: registrationUrl || null, imageUrl: imageUrl || null, imageAlt, internalNotes, imageKey: imageKey || null, imageDisplay: imageDisplay, thumbnailImageDisplay, detailImageDisplay, cancelled, seo,
          eventEditorialChangedFields: event ? eventChangedAdminFields(
            JSON.parse(savedSnapshot) as Record<string,unknown>,
            JSON.parse(editorSnapshot) as Record<string,unknown>,
          ) : undefined }),
      });
      const data = await response.json() as { event?: DogEvent; error?: string; fieldWarnings?: string[] };
      if (!response.ok || !data.event) throw new Error(data.error || "Podujatie sa nepodarilo uložiť.");
      setStatus(data.event.status);
      setSavedSnapshot(editorSnapshot);
      setMessage((data.event.status === "published"
        ? (status === "published" ? "Zmeny publikovaného podujatia sú uložené." : "Podujatie je publikované v kalendári.")
        : (status === "published" ? "Podujatie bolo stiahnuté z kalendára." : "Koncept je bezpečne uložený.")) +
        (data.fieldWarnings?.length ? " Upozornenia: " + data.fieldWarnings.join("; ") : ""));
      if (!event) {
        allowNavigationRef.current = true;
        router.replace(`/admin/podujatia/${data.event.id}?vytvorene=1`);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Podujatie sa nepodarilo uložiť.");
    } finally { savePendingRef.current = false; setSaving(false); }
  }

  const liveSummary = (
    <div className={styles.liveSummary} data-event-live-summary>
      <div className="admin-event-preview-visual">{imageUrl ? <ImageDisplay roleHint="generic" context="thumbnail" src={imageUrl} config={thumbnailImageDisplay} legacyMode={imageDisplay} alt="" /> : <span>📅</span>}</div>
      <span className="eyebrow">{eventType}{cancelled ? " · Zrušené" : ""}</span>
      <h2>{title || "Názov podujatia"}</h2>
      <p>{excerpt || "Krátky popis podujatia sa zobrazí tu."}</p>
      <dl className={styles.previewFacts}><div><dt>Termín</dt><dd>{startDate || "Dátum"}{startTime ? ` · ${startTime}` : ""}</dd></div><div><dt>Miesto</dt><dd>{city || "Mesto"} · {region}</dd></div><div><dt>Organizátor</dt><dd>{organizer || "Organizátor"}</dd></div></dl>
    </div>
  );

  return (
    <div className={styles.eventPilot} data-event-editor-v3>
      <EditorWorkspace
        mode="page"
        title={event ? `Upraviť: ${event.title}` : "Nové podujatie"}
        description="Uprav termín, miesto, organizátora, program a zverejnenie v samostatných sekciách."
        status={<EditorStatus label={cancelled ? "Zrušené podujatie" : status === "published" ? "Publikované" : "Koncept"} tone={cancelled ? "warning" : status === "published" ? "success" : "neutral"} />}
        sections={EVENT_SECTIONS}
        sectionMode="switch"
        activeSectionId={activeEventSection}
        onSectionChange={setActiveEventSection}
        preview={liveSummary}
        previewFocusable
        previewTitle="Živý súhrn podujatia"
        dirty={dirty}
        onClose={() => router.push("/admin/podujatia")}
        closeLabel="Späť na podujatia"
        actions={
          <EditorActionBar
            message={dirty ? "Neuložené zmeny" : undefined}
            destructive={event ? <AdminRecordLifecycleActions kind="events" recordId={event.id} status={status} disabled={saving || uploading} returnHref="/admin/podujatia" onUnpublished={(next) => setStatus(next as EventStatus)} /> : undefined}
            secondary={<>
              {event && <AdminNotionProfileImportButton scope="events" profileId={event.id}
                dirty={dirty} disabled={saving || uploading} />}
              {status === "draft" && <AdminActionButton type="submit" form="event-editor-v3-form" variant="secondary" disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť koncept"}</AdminActionButton>}
            </>}
            primary={status === "published"
              ? <AdminActionButton type="submit" form="event-editor-v3-form" variant="primary" className={styles.publishButton} disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť zmeny"}</AdminActionButton>
              : <AdminActionButton type="button" variant="primary" className={styles.publishButton} disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : "Publikovať podujatie"}</AdminActionButton>}
          />
        }
      >
        <form id="event-editor-v3-form" noValidate className={`admin-event-editor ${styles.eventForm}`} onSubmit={(submitEvent) => { submitEvent.preventDefault(); if (!saving && !uploading) void save(status); }}>
          <AdminFormFeedback message={message} error={error} pending={saving} />
          <AdminAutomationUpdateSuggestions initialSuggestions={automationSuggestions} source={event ? { entityType: "EVENT", canonicalEntityId: event.id } : undefined} onAccepted={applyAutomationUpdate} />
          <EditorSection id="event-basics" className="admin-form-card admin-form-card--intro">
            <div className="admin-card-heading"><div><span>01</span><div><h2>Základné údaje</h2><p>Názov a stručné predstavenie pre kalendár podujatí.</p></div></div></div>
            <div className="admin-field admin-field--title"><label htmlFor="event-title">Názov podujatia</label><input id="event-title" value={title} onChange={(input) => changeTitle(input.target.value)} placeholder="Napríklad: Klubová výstava retrieverov" required /></div>
            <div className="admin-field"><label htmlFor="event-excerpt">Krátky popis</label><AdminLexicalTextField id="event-excerpt" rows={3} value={excerpt} onChange={setExcerpt} placeholder="Čo sa bude diať a pre koho je podujatie určené?" ariaLabel="Krátky popis" /><small>{excerpt.length} znakov · odporúčame 80–180</small></div>
          </EditorSection>

          <EditorSection id="event-schedule" className="admin-form-card">
            <div className="admin-card-heading"><div><span>02</span><div><h2>Termín a typ</h2><p>Začiatok a koniec udalosti aj jej zaradenie v kalendári.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="event-type">Typ podujatia</label><select id="event-type" value={eventType} onChange={(input) => setEventType(input.target.value as EventType)}>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
              <div className="admin-field"><label htmlFor="event-start-date">Dátum začiatku</label><input id="event-start-date" type="date" value={startDate} onInput={(input) => setStartDate(input.currentTarget.value)} /></div>
              <div className="admin-field"><label htmlFor="event-start-time">Čas začiatku</label><input id="event-start-time" type="time" value={startTime} onInput={(input) => setStartTime(input.currentTarget.value)} /></div>
              <div className="admin-field"><label htmlFor="event-end-date">Dátum konca</label><input id="event-end-date" type="date" value={endDate} onInput={(input) => setEndDate(input.currentTarget.value)} /></div>
              <div className="admin-field"><label htmlFor="event-end-time">Čas konca</label><input id="event-end-time" type="time" value={endTime} onInput={(input) => setEndTime(input.currentTarget.value)} /></div>
            </div>
            <label className="admin-event-cancelled"><input type="checkbox" checked={cancelled} onChange={(input) => setCancelled(input.target.checked)} /><span><strong>Podujatie je zrušené</strong><small>Na verejnej stránke sa zobrazí výrazné upozornenie.</small></span></label>
          </EditorSection>

          <EditorSection id="event-location" className="admin-form-card">
            <div className="admin-card-heading"><div><span>03</span><div><h2>Miesto podujatia</h2><p>Údaje na navigáciu a presné nájdenie miesta konania.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="event-region">Kraj</label><select id="event-region" value={region} onChange={(input) => setRegion(input.target.value as SlovakRegion)}>{slovakRegions.filter((item) => item !== "Online").map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="admin-field"><label htmlFor="event-city">Mesto</label><input id="event-city" value={city} onChange={(input) => setCity(input.target.value)} placeholder="Nitra" /></div>
              <div className="admin-field"><label htmlFor="event-venue">Areál alebo budova</label><input id="event-venue" value={venue} onChange={(input) => setVenue(input.target.value)} placeholder="Agrokomplex" /></div>
              <div className="admin-field"><label htmlFor="event-address">Adresa</label><input id="event-address" value={address} onChange={(input) => setAddress(input.target.value)} placeholder="Výstavná 4" /></div>
            </div>
            {event ? (
              <div id="event-google-maps">
                <AdminProfileGoogleMaps targetType="MANAGED_EVENT" targetId={event.id} />
                <AdminGeoLocation targetType="MANAGED_EVENT" targetId={event.id} showGoogleWorkflow={false} />
              </div>
            ) : (
              <p className="admin-help">Google Maps bude dostupné po prvom uložení podujatia.</p>
            )}
          </EditorSection>

          <EditorSection id="event-contacts" className="admin-form-card">
            <div className="admin-card-heading"><div><span>04</span><div><h2>Organizátor a kontakty</h2><p>Kontaktné údaje a odkazy na registráciu dostupné návštevníkom.</p></div></div></div>
            <AdminEditorToolFrame kind="contacts">
              <div className="admin-field-grid">
                <div className="admin-field"><label htmlFor="event-organizer">Organizátor</label><input id="event-organizer" value={organizer} onChange={(input) => setOrganizer(input.target.value)} /></div>
                <div className="admin-field"><label htmlFor="event-contact-phone">Verejný telefón organizátora</label><input id="event-contact-phone" type="tel" value={contactPhone} onChange={(input) => setContactPhone(input.target.value)} placeholder="+421 900 000 000" maxLength={80} /></div>
                <div className="admin-field"><label htmlFor="event-contact-email">Verejný e-mail organizátora</label><input id="event-contact-email" type="email" value={contactEmail} onChange={(input) => setContactEmail(input.target.value)} placeholder="kontakt@organizator.sk" maxLength={254} /></div>
                <div className="admin-field"><label htmlFor="event-web">Web organizátora</label><input id="event-web" type="url" value={websiteUrl} onChange={(input) => setWebsiteUrl(input.target.value)} placeholder="https://…" /></div>
                <div className="admin-field"><label htmlFor="event-registration">Registrácia</label><input id="event-registration" type="url" value={registrationUrl} onChange={(input) => setRegistrationUrl(input.target.value)} placeholder="https://…" /></div>
              </div>
            </AdminEditorToolFrame>
          </EditorSection>

          <EditorSection id="event-details" className="admin-form-card">
            <div className="admin-card-heading"><div><span>05</span><div><h2>Program a informácie</h2><p>Do podrobného popisu zapíš program, harmonogram a jednotlivé body podujatia. Praktické informácie sú určené aj na podmienky účasti.</p></div></div></div>
            <AdminEventMarkdownEditor id="event-description" label="Podrobný popis" value={description} onChange={setDescription} />
            <AdminEventMarkdownEditor id="event-practical" label="Praktické informácie" value={practicalInfo} onChange={setPracticalInfo} />
            <div className="admin-field"><label htmlFor="event-admission-fee">Vstupné</label><input id="event-admission-fee" value={admissionFee} onChange={(input) => setAdmissionFee(input.target.value)} placeholder="Zdarma / 5 € / podľa kategórie" maxLength={160} /><small>Uveď cenu alebo „Zdarma“. Podmienky doplň do praktických informácií.</small></div>
          </EditorSection>

          <EditorSection id="event-media" className="admin-form-card">
            <div className="admin-card-heading"><div><span>06</span><div><h2>Fotografia a URL</h2><p>Titulný obrázok a verejná adresa stránky podujatia.</p></div></div></div>

            <div className="admin-field"><label htmlFor="event-slug">Adresa podujatia</label><div className="admin-slug-input"><span>psipedia.sk/podujatia/</span><input id="event-slug" value={slug} onChange={(input) => { setSlugEdited(true); setSlug(slugify(input.target.value)); }} placeholder="adresa-podujatia" required /></div></div>
            <div className="admin-upload-row">
              <div className="admin-upload-preview admin-upload-preview--coral">{imageUrl ? <ImageDisplay roleHint="generic" context="thumbnail" src={imageUrl} config={thumbnailImageDisplay} legacyMode={imageDisplay} alt="Náhľad obrázka podujatia" /> : <span>📅</span>}</div>
              <div className="admin-upload-actions"><AdminSingleImageUpload label={imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"} onFile={uploadImage} busy={uploading} onRejected={setError}/>{imageUrl && <button type="button" onClick={() => { setImageUrl(""); setImageKey(""); setThumbnailImageDisplay(null); setDetailImageDisplay(null); }}>Odstrániť fotku</button>}<small>Odporúčaný pomer 16 : 9, najviac 8 MB.</small></div>
            </div>
            <div className="admin-field"><label htmlFor="event-image-alt">Alt text obrázka</label>
              <textarea id="event-image-alt" value={imageAlt} rows={2} maxLength={500}
                onChange={(e) => setImageAlt(e.target.value)}
                placeholder="Stručne opíš, čo je na fotografii" />
              <small>Verejný opis obrázka pre prístupnosť. Nie je to interná poznámka.</small>
            </div>
            {imageUrl && <button type="button" className="admin-upload-button" onClick={() => setImageEditorOpen(true)}>Upraviť zobrazenie</button>}
            {event && <AdminShareToFacebook title={title} imageUrl={imageUrl} publicPath={"/podujatia/" + event.slug} />}
             
          </EditorSection>
          <EditorSection id="event-notes" className="admin-form-card">
            <div className="admin-card-heading"><div><span>07</span><div><h2>Interné poznámky</h2>
              <p>Len pre administrátora. Nikdy sa nezobrazujú na verejnom webe ani v jeho API.</p>
            </div></div></div>
            <div className="admin-field"><label htmlFor="event-internal-notes">Poznámky</label>
              <textarea id="event-internal-notes" value={internalNotes} rows={7} maxLength={20000}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Súkromné poznámky k organizácii podujatia…" />
            </div>
          </EditorSection>
          <EditorSection id="event-seo" className={styles.seoSection}>
            <AdminSeoFields value={seo} onChange={setSeo} canonicalPath={`/podujatia/${slug}`} fallbackTitle={eventSeoFallback(title||"Názov podujatia",eventType,city).title} fallbackDescription={eventSeoFallback(title||"Názov podujatia",eventType,city).description}/>
          </EditorSection>
          <nav data-admin-editor-pager className={styles.sectionPager} aria-label="Prechod medzi sekciami podujatia">
            <AdminActionButton variant="secondary" type="button" disabled={activeEventSectionIndex <= 0}
              onClick={() => navigateWithPager(EVENT_SECTIONS[activeEventSectionIndex - 1]?.id ?? EVENT_SECTIONS[0].id)}>Predchádzajúca</AdminActionButton>
            <span role="status">Sekcia {activeEventSectionIndex + 1} z {EVENT_SECTIONS.length}</span>
            <AdminActionButton variant="secondary" type="button" disabled={activeEventSectionIndex >= EVENT_SECTIONS.length - 1}
              onClick={() => navigateWithPager(EVENT_SECTIONS[activeEventSectionIndex + 1]?.id ?? EVENT_SECTIONS[EVENT_SECTIONS.length - 1].id)}>Ďalšia</AdminActionButton>
          </nav>
        </form>

      {imageEditorOpen && imageUrl && <ImageDisplayEditor src={imageUrl} alt={title || "Podujatie"} title={title} excerpt={excerpt}
        entityLabel="podujatia" thumbnailAspectRatio="8 / 5" thumbnail={thumbnailImageDisplay ?? legacyArticleThumbnail(imageDisplay)}
        detail={detailImageDisplay ?? (imageDisplay === "auto" ? null : {mode: imageDisplay === "contain" ? "blur" : "crop", x:50, y:50, zoom:1})} onCancel={() => setImageEditorOpen(false)}
        onSave={(thumbnail, detail) => {
          // Explicit automatic values suppress any legacy cover/contain fallback after Reset.
          setThumbnailImageDisplay(thumbnail ?? (imageDisplay === "auto" ? null : DEFAULT_THUMBNAIL));
          setDetailImageDisplay(detail ?? (imageDisplay === "auto" ? null : DEFAULT_DETAIL));
          setImageEditorOpen(false);
        }} />}
      </EditorWorkspace>
      <EditorUnsavedChangesGuard
        active={dirty}
        allowNativeExitRef={allowNavigationRef}
        open={confirmNavigation}
        onStay={stayInEditor}
        onDiscard={discardAndNavigate}
      />
</div>
  );
}
