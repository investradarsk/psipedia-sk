"use client";

import Link from "next/link";
import { ChangeEvent, useState } from "react";
import { directoryCategories, getDirectoryCategory, type DirectoryCategorySlug, type DirectoryProfileStatus, type ManagedDirectoryProfile } from "@/lib/directory";
import { slovakRegions, type SlovakRegion } from "@/lib/events";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

function listFromText(value: string) {
  return value.split(/\n+/).map((item) => item.trim()).filter(Boolean);
}

export function AdminDirectoryEditor({ profile }: { profile?: ManagedDirectoryProfile }) {
  const [name, setName] = useState(profile?.name ?? "");
  const [slug, setSlug] = useState(profile?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(profile));
  const [category, setCategory] = useState<DirectoryCategorySlug>(profile?.category ?? "treneri");
  const [excerpt, setExcerpt] = useState(profile?.excerpt ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [services, setServices] = useState(profile?.services.join("\n") ?? "");
  const [qualifications, setQualifications] = useState(profile?.qualifications.join("\n") ?? "");
  const [city, setCity] = useState(profile?.city ?? "");
  const [region, setRegion] = useState<SlovakRegion>(profile?.region ?? "Nitriansky kraj");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [online, setOnline] = useState(profile?.online ?? false);
  const [priceNote, setPriceNote] = useState(profile?.priceNote ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(profile?.websiteUrl ?? "");
  const [internalEmail, setInternalEmail] = useState(profile?.internalEmail ?? "");
  const [imageUrl, setImageUrl] = useState(profile?.imageUrl ?? "");
  const [imageKey, setImageKey] = useState(profile?.imageKey ?? "");
  const [verified, setVerified] = useState(profile?.verified ?? false);
  const [featured, setFeatured] = useState(profile?.featured ?? false);
  const [status, setStatus] = useState<DirectoryProfileStatus>(profile?.status ?? "draft");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function changeName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "directory");
      setImageUrl(data.imageUrl); setImageKey(data.imageKey); setMessage(adminImageUploadMessage(data, "Ulož profil."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally { setUploading(false); event.target.value = ""; }
  }

  async function save(nextStatus: DirectoryProfileStatus) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(profile ? `/api/admin/directory/${profile.id}` : "/api/admin/directory", {
        method: profile ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, slug, category, status: nextStatus, excerpt, description, services: listFromText(services), qualifications: listFromText(qualifications), city, region, address, online, priceNote, websiteUrl: websiteUrl || null, internalEmail: internalEmail || null, imageUrl: imageUrl || null, imageKey: imageKey || null, verified, featured }),
      });
      const data = await response.json() as { profile?: ManagedDirectoryProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "Profil sa nepodarilo uložiť.");
      setStatus(data.profile.status);
      setMessage(nextStatus === "published" ? "Profil je publikovaný v adresári." : "Koncept je bezpečne uložený.");
      if (!profile) window.location.assign(`/admin/adresar/${data.profile.id}?vytvorene=1`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profil sa nepodarilo uložiť.");
    } finally { setSaving(false); }
  }

  const categoryInfo = getDirectoryCategory(category);
  return (
    <form className="admin-event-editor admin-directory-editor" onSubmit={(event) => { event.preventDefault(); void save("draft"); }}>
      <div className="admin-event-editor-grid">
        <div className="admin-event-fields">
          <section className="admin-form-card admin-form-card--intro">
            <div className="admin-field admin-field--title"><label htmlFor="directory-name">Názov profilu</label><input id="directory-name" value={name} onChange={(event) => changeName(event.target.value)} placeholder="Napríklad: Psia škola Pod Zoborom" required /></div>
            <div className="admin-field"><label htmlFor="directory-excerpt">Krátky popis</label><textarea id="directory-excerpt" rows={3} value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Čím je profil zaujímavý a komu pomáha?" required /><small>{excerpt.length} znakov · odporúčame 80–180</small></div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>01</span><div><h2>Zaradenie a lokalita</h2><p>Kategória, kraj a dostupnosť služby.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="directory-category">Kategória</label><select id="directory-category" value={category} onChange={(event) => setCategory(event.target.value as DirectoryCategorySlug)}>{directoryCategories.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}</select></div>
              <div className="admin-field"><label htmlFor="directory-region">Kraj</label><select id="directory-region" value={region} onChange={(event) => setRegion(event.target.value as SlovakRegion)}>{slovakRegions.map((item) => <option key={item}>{item}</option>)}</select></div>
              <div className="admin-field"><label htmlFor="directory-city">Mesto</label><input id="directory-city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Nitra alebo Online" required /></div>
              <div className="admin-field"><label htmlFor="directory-address">Adresa <small>nepovinné</small></label><input id="directory-address" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Ulica a číslo" /></div>
            </div>
            <label className="admin-event-cancelled"><input type="checkbox" checked={online} onChange={(event) => setOnline(event.target.checked)} /><span><strong>Služby aj online</strong><small>Profil sa dá vyhľadať filtrom „Dostupné online“.</small></span></label>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>02</span><div><h2>Obsah profilu</h2><p>Čo ponúka, skúsenosti a praktické informácie.</p></div></div></div>
            <div className="admin-field"><label htmlFor="directory-description">Podrobný popis</label><textarea id="directory-description" rows={8} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={"Predstav profil, spôsob práce a pre koho sú služby vhodné.\n\nNový odsek začni po prázdnom riadku."} required /></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="directory-services">Služby a zameranie</label><textarea id="directory-services" rows={7} value={services} onChange={(event) => setServices(event.target.value)} placeholder={"Individuálny tréning\nSkupinové kurzy\nPráca so šteniatkami"} /><small>Jedna položka na riadok.</small></div>
              <div className="admin-field"><label htmlFor="directory-qualifications">Skúsenosti a kvalifikácie</label><textarea id="directory-qualifications" rows={7} value={qualifications} onChange={(event) => setQualifications(event.target.value)} placeholder={"Certifikácia alebo členstvo\nRoky praxe\nŠpecializované vzdelanie"} /><small>Jedna položka na riadok.</small></div>
            </div>
            <div className="admin-field"><label htmlFor="directory-price">Orientačná cena <small>nepovinné</small></label><input id="directory-price" value={priceNote} onChange={(event) => setPriceNote(event.target.value)} placeholder="Napríklad: od 25 € za lekciu" /></div>
          </section>

          <section className="admin-form-card">
            <div className="admin-card-heading"><div><span>03</span><div><h2>Kontakt, fotografia a adresa</h2><p>Interný kontakt sa na verejnom profile nezobrazí.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="directory-email">Interný e-mail <small>neverejný</small></label><input id="directory-email" type="email" value={internalEmail} onChange={(event) => setInternalEmail(event.target.value)} placeholder="kontakt@profil.sk" /></div>
              <div className="admin-field"><label htmlFor="directory-website">Verejný web <small>nepovinné</small></label><input id="directory-website" type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://…" /></div>
            </div>
            <div className="admin-field"><label htmlFor="directory-slug">Adresa profilu</label><div className="admin-slug-input"><span>psipedia.sk/adresar/{category}/</span><input id="directory-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} placeholder="nazov-profilu" required /></div></div>
            <div className="admin-upload-row"><div className="admin-upload-preview admin-upload-preview--forest">{imageUrl ? <img src={imageUrl} alt="Náhľad profilovej fotografie" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div><div className="admin-upload-actions"><label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadImage} disabled={uploading} />{uploading ? "Nahrávam…" : imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"}</label>{imageUrl && <button type="button" onClick={() => { setImageUrl(""); setImageKey(""); }}>Odstrániť fotku</button>}<small>Odporúčaný pomer 4 : 3, najviac 8 MB.</small></div></div>
            <div className="admin-directory-flags"><label className="admin-event-cancelled"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /><span><strong>Overený profil</strong><small>Redakcia preverila základné údaje.</small></span></label><label className="admin-event-cancelled"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /><span><strong>Odporúčaný profil</strong><small>Zobrazí sa medzi prvými.</small></span></label></div>
          </section>
        </div>

        <aside className="admin-event-preview admin-directory-preview">
          <span className="admin-eyebrow">Živý súhrn</span><div className="admin-event-preview-visual">{imageUrl ? <img src={imageUrl} alt="" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div>
          <span className="eyebrow">{categoryInfo?.singular}{verified ? " · Overený" : ""}</span><h2>{name || "Názov profilu"}</h2><p>{excerpt || "Krátky popis profilu sa zobrazí tu."}</p>
          <dl><div><dt>Lokalita</dt><dd>{city || "Mesto"} · {region}</dd></div><div><dt>Dostupnosť</dt><dd>{online ? "Osobne aj online" : "Osobne"}</dd></div><div><dt>Kontakt</dt><dd>Cez Psipediu</dd></div></dl>
        </aside>
      </div>
      {(message || error) && <div className={`admin-editor-message ${error ? "is-error" : "is-success"}`} role="status">{error || message}</div>}
      <div className="admin-editor-actions"><div><Link href="/admin/adresar">← Späť na adresár</Link></div><div>{status === "published" && <button className="admin-unpublish" type="button" disabled={saving || uploading} onClick={() => void save("draft")}>Stiahnuť z adresára</button>}<button className="admin-save-draft" type="submit" disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť koncept"}</button><button className="admin-publish" type="button" disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : status === "published" ? "Uložiť zmeny" : "Publikovať profil"}</button></div></div>
    </form>
  );
}
