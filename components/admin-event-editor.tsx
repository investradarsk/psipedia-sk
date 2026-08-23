"use client";

import Link from "next/link";
import { ChangeEvent, useState } from "react";
import { eventTypes, slovakRegions, type DogEvent, type EventStatus, type EventType, type SlovakRegion } from "@/lib/events";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

export function AdminEventEditor({ event }: { event?: DogEvent }) {
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
  const [cancelled, setCancelled] = useState(event?.cancelled ?? false);
  const [status, setStatus] = useState<EventStatus>(event?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function changeTitle(value: string) {
    setTitle(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  async function uploadImage(uploadEvent: ChangeEvent<HTMLInputElement>) {
    const file = uploadEvent.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("folder", "events");
      const response = await fetch("/api/admin/uploads", { method: "POST", body: formData });
      const data = await response.json() as { imageUrl?: string; imageKey?: string; error?: string };
      if (!response.ok || !data.imageUrl || !data.imageKey) throw new Error(data.error || "Obrázok sa nepodarilo nahrať.");
      setImageUrl(data.imageUrl); setImageKey(data.imageKey); setMessage("Obrázok je nahratý. Ulož podujatie.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally { setUploading(false); uploadEvent.target.value = ""; }
  }

  async function save(nextStatus: EventStatus) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(event ? `/api/admin/events/${event.id}` : "/api/admin/events", {
        method: event ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, slug, excerpt, eventType, status: nextStatus, startDate, startTime, endDate: endDate || null, endTime: endTime || null, venue, city, region, address, organizer, description, practicalInfo, websiteUrl: websiteUrl || null, registrationUrl: registrationUrl || null, imageUrl: imageUrl || null, imageKey: imageKey || null, cancelled }),
      });
      const data = await response.json() as { event?: DogEvent; error?: string };
      if (!response.ok || !data.event) throw new Error(data.error || "Podujatie sa nepodarilo uložiť.");
      setStatus(data.event.status);
      setMessage(nextStatus === "published" ? "Podujatie je publikované v kalendári." : "Koncept je bezpečne uložený.");
      if (!event) window.location.assign(`/admin/podujatia/${data.event.id}?vytvorene=1`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Podujatie sa nepodarilo uložiť.");
    } finally { setSaving(false); }
  }

  return (
    <form className="admin-event-editor" onSubmit={(submitEvent) => { submitEvent.preventDefault(); void save("draft"); }}>
      <div className="admin-event-editor-grid">
        <div className="admin-event-fields">
          <section className="admin-form-card admin-form-card--intro">
            <div className="admin-field admin-field--title"><label htmlFor="event-title">Názov podujatia</label><input id="event-title" value={title} onChange={(input) => changeTitle(input.target.value)} placeholder="Napríklad: Klubová výstava retrieverov" required /></div>
            <div className="admin-field"><label htmlFor="event-excerpt">Krátky popis</label><textarea id="event-excerpt" rows={3} value={excerpt} onChange={(input) => setExcerpt(input.target.value)} placeholder="Čo sa bude diať a pre koho je podujatie určené?" required /><small>{excerpt.length} znakov · odporúčame 80–180</small></div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>01</span><div><h2>Termín a typ</h2><p>Základné zaradenie v kalendári.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="event-type">Typ podujatia</label><select id="event-type" value={eventType} onChange={(input) => setEventType(input.target.value as EventType)}>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
              <div className="admin-field"><label htmlFor="event-start-date">Dátum začiatku</label><input id="event-start-date" type="date" value={startDate} onInput={(input) => setStartDate(input.currentTarget.value)} required /></div>
              <div className="admin-field"><label htmlFor="event-start-time">Čas začiatku</label><input id="event-start-time" type="time" value={startTime} onInput={(input) => setStartTime(input.currentTarget.value)} /></div>
              <div className="admin-field"><label htmlFor="event-end-date">Dátum konca</label><input id="event-end-date" type="date" value={endDate} onInput={(input) => setEndDate(input.currentTarget.value)} /></div>
              <div className="admin-field"><label htmlFor="event-end-time">Čas konca</label><input id="event-end-time" type="time" value={endTime} onInput={(input) => setEndTime(input.currentTarget.value)} /></div>
            </div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>02</span><div><h2>Miesto a organizátor</h2><p>Údaje, podľa ktorých návštevník podujatie nájde.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="event-region">Kraj</label><select id="event-region" value={region} onChange={(input) => setRegion(input.target.value as SlovakRegion)}>{slovakRegions.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="admin-field"><label htmlFor="event-city">Mesto</label><input id="event-city" value={city} onChange={(input) => setCity(input.target.value)} placeholder="Nitra alebo Online" required /></div>
              <div className="admin-field"><label htmlFor="event-venue">Areál alebo budova</label><input id="event-venue" value={venue} onChange={(input) => setVenue(input.target.value)} placeholder="Agrokomplex" /></div>
              <div className="admin-field"><label htmlFor="event-address">Adresa</label><input id="event-address" value={address} onChange={(input) => setAddress(input.target.value)} placeholder="Výstavná 4" /></div>
              <div className="admin-field"><label htmlFor="event-organizer">Organizátor</label><input id="event-organizer" value={organizer} onChange={(input) => setOrganizer(input.target.value)} required /></div>
            </div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>03</span><div><h2>Popis a praktické informácie</h2><p>Vysvetli program, podmienky a čo si priniesť.</p></div></div></div>
            <div className="admin-field"><label htmlFor="event-description">Podrobný popis</label><textarea id="event-description" rows={9} value={description} onChange={(input) => setDescription(input.target.value)} placeholder={"Program a priebeh podujatia…\n\nNový odsek začni po prázdnom riadku."} required /></div>
            <div className="admin-field"><label htmlFor="event-practical">Praktické informácie</label><textarea id="event-practical" rows={5} value={practicalInfo} onChange={(input) => setPracticalInfo(input.target.value)} placeholder="Vstupné, parkovanie, podmienky účasti, doklady…" /></div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>04</span><div><h2>Odkazy, fotografia a adresa stránky</h2><p>Registrácia a titulná fotografia podujatia.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="event-web">Web organizátora</label><input id="event-web" type="url" value={websiteUrl} onChange={(input) => setWebsiteUrl(input.target.value)} placeholder="https://…" /></div>
              <div className="admin-field"><label htmlFor="event-registration">Registrácia</label><input id="event-registration" type="url" value={registrationUrl} onChange={(input) => setRegistrationUrl(input.target.value)} placeholder="https://…" /></div>
            </div>
            <div className="admin-field"><label htmlFor="event-slug">Adresa podujatia</label><div className="admin-slug-input"><span>psipedia.sk/podujatia/</span><input id="event-slug" value={slug} onChange={(input) => { setSlugEdited(true); setSlug(slugify(input.target.value)); }} placeholder="adresa-podujatia" required /></div></div>
            <div className="admin-upload-row">
              <div className="admin-upload-preview admin-upload-preview--coral">{imageUrl ? <img src={imageUrl} alt="Náhľad fotografie podujatia" /> : <span>📅</span>}</div>
              <div className="admin-upload-actions"><label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadImage} disabled={uploading} />{uploading ? "Nahrávam…" : imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"}</label>{imageUrl && <button type="button" onClick={() => { setImageUrl(""); setImageKey(""); }}>Odstrániť fotku</button>}<small>Odporúčaný pomer 16 : 9, najviac 8 MB.</small></div>
            </div>
            <label className="admin-event-cancelled"><input type="checkbox" checked={cancelled} onChange={(input) => setCancelled(input.target.checked)} /><span><strong>Podujatie je zrušené</strong><small>Na verejnej stránke sa zobrazí výrazné upozornenie.</small></span></label>
          </section>
        </div>

        <aside className="admin-event-preview">
          <span className="admin-eyebrow">Živý súhrn</span>
          <div className="admin-event-preview-visual">{imageUrl ? <img src={imageUrl} alt="" /> : <span>📅</span>}</div>
          <span className="eyebrow">{eventType}{cancelled ? " · Zrušené" : ""}</span>
          <h2>{title || "Názov podujatia"}</h2>
          <p>{excerpt || "Krátky popis podujatia sa zobrazí tu."}</p>
          <dl><div><dt>Termín</dt><dd>{startDate || "Dátum"}{startTime ? ` · ${startTime}` : ""}</dd></div><div><dt>Miesto</dt><dd>{city || "Mesto"} · {region}</dd></div><div><dt>Organizátor</dt><dd>{organizer || "Organizátor"}</dd></div></dl>
        </aside>
      </div>

      {(message || error) && <div className={`admin-editor-message ${error ? "is-error" : "is-success"}`} role="status">{error || message}</div>}
      <div className="admin-editor-actions">
        <div><Link href="/admin/podujatia">← Späť na podujatia</Link></div>
        <div>{status === "published" && <button className="admin-unpublish" type="button" disabled={saving || uploading} onClick={() => void save("draft")}>Stiahnuť z kalendára</button>}<button className="admin-save-draft" type="submit" disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť koncept"}</button><button className="admin-publish" type="button" disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : status === "published" ? "Uložiť zmeny" : "Publikovať podujatie"}</button></div>
      </div>
    </form>
  );
}
