"use client";

import { useRouter } from "next/navigation";
import { AdminActionButton } from "@/components/admin-interaction-system";
import { EditorWorkspace, EditorSection, EditorStatus, EditorActionBar, type EditorWorkspaceSection } from "@/components/admin-editor-workspace";
import { AdminEventMarkdownEditor } from "@/components/admin-event-markdown-editor";
import { ChangeEvent, useState } from "react";
import { eventTypes, slovakRegions, type DogEvent, type EventStatus, type EventType, type SlovakRegion } from "@/lib/events";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { AdminSeoFields } from "@/components/admin-seo-fields";
import { AdminProfileGoogleMaps } from "@/components/admin-profile-google-maps";
import { AdminGeoLocation } from "@/components/admin-geo-location";
import { AdminAutomationUpdateSuggestions } from "@/components/admin-automation-update-suggestions";
import type { CanonicalUpdateSuggestion } from "@/lib/data-automation-update-review";
import { eventSeoFallback } from "@/lib/content-seo";
import styles from "./admin-event-editor.module.css";
import type { SmartImageMode } from "@/lib/smart-image";
import { ImageDisplay } from "@/components/image-display";
import { ImageDisplayEditor } from "@/components/image-display-editor";
import { DEFAULT_DETAIL, DEFAULT_THUMBNAIL } from "@/lib/image-display";
import { legacyArticleThumbnail, type ImageDisplayConfig } from "@/lib/image-display";

const EVENT_SECTIONS: EditorWorkspaceSection[] = [
  { id: "event-basics", label: "Základné údaje" },
  { id: "event-schedule", label: "Termín a typ" },
  { id: "event-location", label: "Miesto a organizátor" },
  { id: "event-details", label: "Popis a informácie" },
  { id: "event-media", label: "Odkazy a fotografia" },
  { id: "event-seo", label: "SEO" },
];

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

export function AdminEventEditor({ event, automationSuggestions = [] }: { event?: DogEvent; automationSuggestions?: CanonicalUpdateSuggestion[] }) {
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
  const [websiteUrl, setWebsiteUrl] = useState(event?.websiteUrl ?? "");
  const [registrationUrl, setRegistrationUrl] = useState(event?.registrationUrl ?? "");
  const [imageUrl, setImageUrl] = useState(event?.imageUrl ?? "");
  const [imageKey, setImageKey] = useState(event?.imageKey ?? "");
  const [imageDisplay] = useState<SmartImageMode>(event?.imageDisplay ?? "auto");
  const [thumbnailImageDisplay, setThumbnailImageDisplay] = useState<ImageDisplayConfig | null>(event?.thumbnailImageDisplay ?? null);
  const [detailImageDisplay, setDetailImageDisplay] = useState<ImageDisplayConfig | null>(event?.detailImageDisplay ?? null);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [cancelled, setCancelled] = useState(event?.cancelled ?? false);
  const [status, setStatus] = useState<EventStatus>(event?.status ?? "draft");
  const [seo, setSeo] = useState(event?.seo ?? {});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // Track the canonical form payload, not DOM input events: markdown toolbar,
  // SEO drawer, image display settings and automation patches all change React state.
  const editorSnapshot = JSON.stringify({
    title, slug, excerpt, eventType, startDate, startTime, endDate, endTime,
    venue, city, region, address, organizer, description, practicalInfo,
    websiteUrl, registrationUrl, imageUrl, imageKey, imageDisplay,
    thumbnailImageDisplay, detailImageDisplay, cancelled, seo,
  });
  const [savedSnapshot, setSavedSnapshot] = useState(editorSnapshot);
  const dirty = editorSnapshot !== savedSnapshot;

  function changeTitle(value: string) {
    setTitle(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  async function uploadImage(uploadEvent: ChangeEvent<HTMLInputElement>) {
    const file = uploadEvent.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "events");
      setImageUrl(data.imageUrl); setImageKey(data.imageKey); setThumbnailImageDisplay(null); setDetailImageDisplay(null); setMessage(adminImageUploadMessage(data, "Ulož podujatie."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally { setUploading(false); uploadEvent.target.value = ""; }
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
      else if (field === "websiteUrl") setWebsiteUrl(text);
      else if (field === "registrationUrl") setRegistrationUrl(text);
    }
  }

  async function save(nextStatus: EventStatus) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(event ? `/api/admin/events/${event.id}` : "/api/admin/events", {
        method: event ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, slug, excerpt, eventType, status: nextStatus, startDate, startTime, endDate: endDate || null, endTime: endTime || null, venue, city, region, address, organizer, description, practicalInfo, websiteUrl: websiteUrl || null, registrationUrl: registrationUrl || null, imageUrl: imageUrl || null, imageKey: imageKey || null, imageDisplay: imageDisplay, thumbnailImageDisplay, detailImageDisplay, cancelled, seo }),
      });
      const data = await response.json() as { event?: DogEvent; error?: string };
      if (!response.ok || !data.event) throw new Error(data.error || "Podujatie sa nepodarilo uložiť.");
      setStatus(data.event.status);
      setSavedSnapshot(editorSnapshot);
      setMessage(nextStatus === "published" ? "Podujatie je publikované v kalendári." : "Koncept je bezpečne uložený.");
      if (!event) router.replace(`/admin/podujatia/${data.event.id}?vytvorene=1`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Podujatie sa nepodarilo uložiť.");
    } finally { setSaving(false); }
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
        description="Zachovaný editor podujatia a jeho živý súhrn."
        status={<EditorStatus label={cancelled ? "Zrušené podujatie" : status === "published" ? "Publikované" : "Koncept"} tone={cancelled ? "warning" : status === "published" ? "success" : "neutral"} />}
        sections={EVENT_SECTIONS}
        preview={liveSummary}
        previewTitle="Živý súhrn podujatia"
        dirty={dirty}
        onClose={() => router.push("/admin/podujatia")}
        closeLabel="Späť na podujatia"
        actions={
          <EditorActionBar
            message={error ? <span className={styles.errorText} role="alert">{error}</span> : message || (dirty ? "Neuložené zmeny" : undefined)}
            destructive={status === "published" ? <AdminActionButton type="button" variant="secondary" disabled={saving || uploading} onClick={() => void save("draft")}>Stiahnuť z kalendára</AdminActionButton> : undefined}
            secondary={<AdminActionButton type="submit" form="event-editor-v3-form" variant="secondary" disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť koncept"}</AdminActionButton>}
            primary={<AdminActionButton type="button" variant="primary" className={styles.publishButton} disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : status === "published" ? "Uložiť zmeny" : "Publikovať podujatie"}</AdminActionButton>}
          />
        }
      >
        <form id="event-editor-v3-form" noValidate className={`admin-event-editor ${styles.eventForm}`} onSubmit={(submitEvent) => { submitEvent.preventDefault(); void save("draft"); }}>
          <AdminAutomationUpdateSuggestions initialSuggestions={automationSuggestions} onAccepted={applyAutomationUpdate} />
          <AdminAutomationUpdateSuggestions initialSuggestions={automationSuggestions} onAccepted={applyAutomationUpdate} />
          <EditorSection id="event-basics" className="admin-form-card admin-form-card--intro">
            <div className="admin-field admin-field--title"><label htmlFor="event-title">Názov podujatia</label><input id="event-title" value={title} onChange={(input) => changeTitle(input.target.value)} placeholder="Napríklad: Klubová výstava retrieverov" required /></div>
            <div className="admin-field"><label htmlFor="event-excerpt">Krátky popis</label><textarea id="event-excerpt" rows={3} value={excerpt} onChange={(input) => setExcerpt(input.target.value)} placeholder="Čo sa bude diať a pre koho je podujatie určené?" required /><small>{excerpt.length} znakov · odporúčame 80–180</small></div>
          </EditorSection>

          <EditorSection id="event-schedule" className="admin-form-card">
            <div className="admin-card-heading"><div><span>01</span><div><h2>Termín a typ</h2><p>Základné zaradenie v kalendári.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="event-type">Typ podujatia</label><select id="event-type" value={eventType} onChange={(input) => setEventType(input.target.value as EventType)}>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
              <div className="admin-field"><label htmlFor="event-start-date">Dátum začiatku</label><input id="event-start-date" type="date" value={startDate} onInput={(input) => setStartDate(input.currentTarget.value)} required /></div>
              <div className="admin-field"><label htmlFor="event-start-time">Čas začiatku</label><input id="event-start-time" type="time" value={startTime} onInput={(input) => setStartTime(input.currentTarget.value)} /></div>
              <div className="admin-field"><label htmlFor="event-end-date">Dátum konca</label><input id="event-end-date" type="date" value={endDate} onInput={(input) => setEndDate(input.currentTarget.value)} /></div>
              <div className="admin-field"><label htmlFor="event-end-time">Čas konca</label><input id="event-end-time" type="time" value={endTime} onInput={(input) => setEndTime(input.currentTarget.value)} /></div>
            </div>
          </EditorSection>

          <EditorSection id="event-location" className="admin-form-card">
            <div className="admin-card-heading"><div><span>02</span><div><h2>Miesto a organizátor</h2><p>Údaje, podľa ktorých návštevník podujatie nájde.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="event-region">Kraj</label><select id="event-region" value={region} onChange={(input) => setRegion(input.target.value as SlovakRegion)}>{slovakRegions.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="admin-field"><label htmlFor="event-city">Mesto</label><input id="event-city" value={city} onChange={(input) => setCity(input.target.value)} placeholder="Nitra alebo Online" required /></div>
              <div className="admin-field"><label htmlFor="event-venue">Areál alebo budova</label><input id="event-venue" value={venue} onChange={(input) => setVenue(input.target.value)} placeholder="Agrokomplex" /></div>
              <div className="admin-field"><label htmlFor="event-address">Adresa</label><input id="event-address" value={address} onChange={(input) => setAddress(input.target.value)} placeholder="Výstavná 4" /></div>
              <div className="admin-field"><label htmlFor="event-organizer">Organizátor</label><input id="event-organizer" value={organizer} onChange={(input) => setOrganizer(input.target.value)} required /></div>
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

          <EditorSection id="event-details" className="admin-form-card">
            <div className="admin-card-heading"><div><span>03</span><div><h2>Popis a praktické informácie</h2><p>Vysvetli program, podmienky a čo si priniesť.</p></div></div></div>
            <AdminEventMarkdownEditor id="event-description" label="Podrobný popis" value={description} onChange={setDescription} required />
            <AdminEventMarkdownEditor id="event-practical" label="Praktické informácie" value={practicalInfo} onChange={setPracticalInfo} />
          </EditorSection>

          <EditorSection id="event-media" className="admin-form-card">
            <div className="admin-card-heading"><div><span>04</span><div><h2>Odkazy, fotografia a adresa stránky</h2><p>Registrácia a titulná fotografia podujatia.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="event-web">Web organizátora</label><input id="event-web" type="url" value={websiteUrl} onChange={(input) => setWebsiteUrl(input.target.value)} placeholder="https://…" /></div>
              <div className="admin-field"><label htmlFor="event-registration">Registrácia</label><input id="event-registration" type="url" value={registrationUrl} onChange={(input) => setRegistrationUrl(input.target.value)} placeholder="https://…" /></div>
            </div>
            <div className="admin-field"><label htmlFor="event-slug">Adresa podujatia</label><div className="admin-slug-input"><span>psipedia.sk/podujatia/</span><input id="event-slug" value={slug} onChange={(input) => { setSlugEdited(true); setSlug(slugify(input.target.value)); }} placeholder="adresa-podujatia" required /></div></div>
            <div className="admin-upload-row">
              <div className="admin-upload-preview admin-upload-preview--coral">{imageUrl ? <ImageDisplay roleHint="generic" context="thumbnail" src={imageUrl} config={thumbnailImageDisplay} legacyMode={imageDisplay} alt="Náhľad obrázka podujatia" /> : <span>📅</span>}</div>
              <div className="admin-upload-actions"><label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadImage} disabled={uploading} />{uploading ? "Nahrávam…" : imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"}</label>{imageUrl && <button type="button" onClick={() => { setImageUrl(""); setImageKey(""); setThumbnailImageDisplay(null); setDetailImageDisplay(null); }}>Odstrániť fotku</button>}<small>Odporúčaný pomer 16 : 9, najviac 8 MB.</small></div>
            </div>
            {imageUrl && <button type="button" className="admin-upload-button" onClick={() => setImageEditorOpen(true)}>Upraviť zobrazenie</button>}
             <label className="admin-event-cancelled"><input type="checkbox" checked={cancelled} onChange={(input) => setCancelled(input.target.checked)} /><span><strong>Podujatie je zrušené</strong><small>Na verejnej stránke sa zobrazí výrazné upozornenie.</small></span></label>
          </EditorSection>
          <EditorSection id="event-seo" className={styles.seoSection}>
            <AdminSeoFields value={seo} onChange={setSeo} canonicalPath={`/podujatia/${slug}`} fallbackTitle={eventSeoFallback(title||"Názov podujatia",eventType,city).title} fallbackDescription={eventSeoFallback(title||"Názov podujatia",eventType,city).description}/>
          </EditorSection>
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
    </div>
  );
}
