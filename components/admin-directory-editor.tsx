"use client";

import Link from "next/link";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  AdminActionButton,
  AdminDrawer,
  AdminEditorSection,
  AdminHelpText,
  AdminStickyEditorNavigation,
} from "@/components/admin-interaction-system";
import { AdminSeoFields } from "@/components/admin-seo-fields";
import { directoryCategories, getDirectoryCategory, type DirectoryCategorySlug, type DirectoryProfileStatus, type ManagedDirectoryProfile } from "@/lib/directory";
import { SlovakiaLocationSelector } from "@/components/slovakia-location-selector";
import { evaluateDirectoryServiceAddress, type DirectoryAddressFormat } from "@/lib/directory-service-address";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { directorySeoFallback } from "@/lib/content-seo";
import { readDirectoryPublicContacts } from "@/lib/directory-profile-metadata";
import styles from "./admin-directory-editor.module.css";

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

export function AdminDirectoryEditor({ profile }: { profile?: ManagedDirectoryProfile }) {
  const [name, setName] = useState(profile?.name ?? "");
  const [slug, setSlug] = useState(profile?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(profile));
  const [category, setCategory] = useState<DirectoryCategorySlug>(profile?.category ?? "treneri");
  const [excerpt, setExcerpt] = useState(profile?.excerpt ?? "");
  const [description, setDescription] = useState(profile?.description ?? "");
  const [services, setServices] = useState(profile?.services.join("\n") ?? "");
  const [qualifications, setQualifications] = useState(profile?.qualifications.join("\n") ?? "");
  const [city, setCity] = useState(profile?.city === "Online" ? "" : profile?.city ?? "");
  const [district, setDistrict] = useState(profile?.district === "Online" ? "" : profile?.district ?? "");
  const [region, setRegion] = useState(profile?.region === "Online" ? "" : profile?.region ?? "");
  const [postalCode, setPostalCode] = useState(profile?.postalCode ?? "");
  const [street, setStreet] = useState(profile?.street ?? "");
  const [houseNumber, setHouseNumber] = useState(profile?.houseNumber ?? "");
  const [addressFormat, setAddressFormat] = useState<DirectoryAddressFormat | "">(profile?.addressFormat ?? "");
  const [serviceAddressTouched, setServiceAddressTouched] = useState(!profile);
  const [online, setOnline] = useState(profile?.online ?? false);
  const [priceNote, setPriceNote] = useState(profile?.priceNote ?? "");
  const contacts = readDirectoryPublicContacts(profile?.importData, profile?.websiteUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(contacts.website);
  const [publicPhone, setPublicPhone] = useState(contacts.phone);
  const [publicEmail, setPublicEmail] = useState(contacts.email);
  const [facebookUrl, setFacebookUrl] = useState(contacts.facebook);
  const [instagramUrl, setInstagramUrl] = useState(contacts.instagram);
  const [internalEmail, setInternalEmail] = useState(profile?.internalEmail ?? "");
  const [imageUrl, setImageUrl] = useState(profile?.imageUrl ?? "");
  const [imageKey, setImageKey] = useState(profile?.imageKey ?? "");
  const [verified, setVerified] = useState(profile?.verified ?? false);
  const [featured, setFeatured] = useState(profile?.featured ?? false);
  const [status, setStatus] = useState<DirectoryProfileStatus>(profile?.status ?? "draft");
  const [seo, setSeo] = useState(profile?.seo ?? {});
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (formRef.current) formRef.current.dataset.hydrated = "true";
  }, []);

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
      setImageUrl(data.imageUrl);
      setImageKey(data.imageKey);
      setMessage(adminImageUploadMessage(data, "Ulož profil."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function save(nextStatus: DirectoryProfileStatus) {
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(profile ? `/api/admin/directory/${profile.id}` : "/api/admin/directory", {
        method: profile ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name, slug, category, status: nextStatus, excerpt, description,
          services: listFromText(services), qualifications: listFromText(qualifications),
          city, district, region, postalCode, street, houseNumber, addressFormat,
          confirmServiceAddress: !profile || serviceAddressTouched,
          online, priceNote,
          websiteUrl: websiteUrl || null,
          publicPhone, publicEmail, facebookUrl, instagramUrl,
          internalEmail: internalEmail || null,
          imageUrl: imageUrl || null, imageKey: imageKey || null,
          verified, featured, seo,
        }),
      });
      const data = await response.json() as { profile?: ManagedDirectoryProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "Profil sa nepodarilo uložiť.");
      setStatus(data.profile.status);
      setMessage(nextStatus === "published" ? "Profil je publikovaný v adresári." : "Koncept je bezpečne uložený.");
      if (!profile) window.location.assign(`/admin/adresar/${data.profile.id}?vytvorene=1`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Profil sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  async function restoreArchivedProfile() {
    if (!profile || profile.status !== "archived") return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/directory/${profile.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const data = await response.json() as { profile?: ManagedDirectoryProfile; error?: string };
      if (!response.ok || !data.profile) throw new Error(data.error || "Profil sa nepodarilo obnoviť.");
      window.location.reload();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : "Profil sa nepodarilo obnoviť.");
      setSaving(false);
    }
  }

  if (profile?.status === "archived") {
    return (
      <section className="admin-form-card">
        <h2>Archivovaný profil</h2>
        <p>Profil nie je verejný a jeho canonical resource zostáva zachovaný pre historické a trust dáta.</p>
        {error && <p className="admin-flash admin-flash--error" role="alert">{error}</p>}
        <AdminActionButton variant="primary" disabled={saving} onClick={() => void restoreArchivedProfile()}>
          {saving ? "Obnovujem…" : "Obnoviť do konceptu"}
        </AdminActionButton>
      </section>
    );
  }

  const addressEvaluation = evaluateDirectoryServiceAddress({
    region,
    district,
    city,
    postalCode,
    street,
    houseNumber,
    addressFormat,
    serviceAddressConfirmation: (!profile || serviceAddressTouched || profile?.serviceAddressConfirmation === "CONFIRMED_SERVICE_LOCATION")
      ? "CONFIRMED_SERVICE_LOCATION"
      : "LEGACY_UNCONFIRMED",
    online,
  });

  const categoryInfo = getDirectoryCategory(category);
  return (
    <form ref={formRef} data-hydrated="false" className={`admin-event-editor admin-directory-editor ${styles.editor}`} onSubmit={(event) => { event.preventDefault(); void save("draft"); }}>
      <div className={styles.editorTopline}>
        <AdminStickyEditorNavigation sections={editorSections} ariaLabel="Sekcie profilu adresára" />
        <AdminActionButton variant="secondary" onClick={() => setAdvancedOpen(true)}>Pokročilé a SEO</AdminActionButton>
      </div>

      <div className="admin-event-editor-grid">
        <div className="admin-event-fields">
          <AdminEditorSection id="directory-main" className="admin-form-card admin-form-card--intro">
            <div className="admin-card-heading"><div><span>01</span><div><h2>Hlavné údaje</h2><p>Názov, zaradenie a krátke verejné predstavenie.</p></div></div></div>
            <div className="admin-field admin-field--title"><label htmlFor="directory-name">Názov profilu</label><input id="directory-name" value={name} onChange={(event) => changeName(event.target.value)} placeholder="Napríklad: Psia škola Pod Zoborom" required /></div>
            <div className="admin-field"><label htmlFor="directory-category">Kategória</label><select id="directory-category" value={category} onChange={(event) => setCategory(event.target.value as DirectoryCategorySlug)}>{directoryCategories.map((item) => <option value={item.slug} key={item.slug}>{item.label}</option>)}</select></div>
            <div className="admin-field"><label htmlFor="directory-excerpt">Krátky popis</label><textarea id="directory-excerpt" rows={3} value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Čím je profil zaujímavý a komu pomáha?" required /><small>{excerpt.length} znakov · odporúčame 80–180</small></div>
          </AdminEditorSection>

          <AdminEditorSection id="directory-location" className="admin-form-card">
            <div className="admin-card-heading"><div><span>02</span><div><h2>Adresa prevádzky / miesta služby</h2><p>Jedna canonical verejná adresa pre profil, filtre, vyhľadávanie, mapu a geocoding.</p></div></div></div>
            {profile?.serviceAddressConfirmation === "LEGACY_UNCONFIRMED" && profile.address ? (
              <p className="admin-message admin-message--error">
                Historická adresa „{profile.address}“ zostáva iba migračný/auditný údaj. Nie je potvrdená ako adresa prevádzky a exact geo contract ju nepoužíva.
              </p>
            ) : null}
            <SlovakiaLocationSelector
              value={{ region, district, city }}
              required={!online}
              idPrefix="directory-service-location"
              onChange={(location) => {
                setRegion(location.region);
                setDistrict(location.district);
                setCity(location.city);
                setServiceAddressTouched(true);
              }}
            />
            <div className="admin-field-grid">
              <div className="admin-field">
                <label htmlFor="directory-address-format">Typ adresy</label>
                <select id="directory-address-format" value={addressFormat} onChange={(event) => {
                  const next = event.target.value as DirectoryAddressFormat | "";
                  setAddressFormat(next);
                  if (next === "MUNICIPALITY_NUMBER") setStreet("");
                  setServiceAddressTouched(true);
                }}>
                  <option value="">Vyberte typ adresy</option>
                  <option value="STREET">Ulica + číslo</option>
                  <option value="MUNICIPALITY_NUMBER">Obec + číslo (bez ulice)</option>
                </select>
              </div>
              {addressFormat !== "MUNICIPALITY_NUMBER" ? (
                <div className="admin-field">
                  <label htmlFor="directory-street">Ulica</label>
                  <input id="directory-street" value={street} onChange={(event) => { setStreet(event.target.value); setServiceAddressTouched(true); }} placeholder="Hviezdoslavova" />
                  <small>Dočasne ručné pole. Authoritative street autocomplete bude doplnený v ADDRESS-DATA-1.</small>
                </div>
              ) : null}
              <div className="admin-field">
                <label htmlFor="directory-house-number">Číslo domu</label>
                <input id="directory-house-number" value={houseNumber} onChange={(event) => { setHouseNumber(event.target.value); setServiceAddressTouched(true); }} placeholder="88 alebo 123" />
              </div>
              <div className="admin-field">
                <label htmlFor="directory-postal-code">PSČ</label>
                <input id="directory-postal-code" inputMode="numeric" value={postalCode} onChange={(event) => { setPostalCode(event.target.value); setServiceAddressTouched(true); }} placeholder="953 01" />
                <small>Dočasne ručné pole. Automatické PSČ/address-point dáta budú doplnené v ADDRESS-DATA-1.</small>
              </div>
            </div>
            <label className="admin-event-cancelled"><input type="checkbox" checked={online} onChange={(event) => setOnline(event.target.checked)} /><span><strong>Služby aj online</strong><small>Ak má profil aj fyzickú prevádzku, vyplň adresu vyššie. Online-only profil môže zostať bez fyzickej adresy a nebude mapovým kandidátom.</small></span></label>
          </AdminEditorSection>

          <AdminEditorSection id="directory-content" className="admin-form-card">
            <div className="admin-card-heading"><div><span>03</span><div><h2>Obsah profilu</h2><p>Čo ponúka, skúsenosti a praktické informácie.</p></div></div></div>
            <div className="admin-field"><label htmlFor="directory-description">Podrobný popis</label><textarea id="directory-description" rows={9} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={"Predstav profil, spôsob práce a pre koho sú služby vhodné.\n\nNový odsek začni po prázdnom riadku."} required /></div>
            <AdminHelpText term="Formát">Adresár dnes ukladá popis ako plain text. Editor preto zachováva aktuálny dátový contract; rich-text patrí do samostatnej migrácie.</AdminHelpText>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="directory-services">Služby a zameranie</label><textarea id="directory-services" rows={7} value={services} onChange={(event) => setServices(event.target.value)} placeholder={"Individuálny tréning\nSkupinové kurzy\nPráca so šteniatkami"} /><small>Jedna položka na riadok.</small></div>
              <div className="admin-field"><label htmlFor="directory-qualifications">Skúsenosti a kvalifikácie</label><textarea id="directory-qualifications" rows={7} value={qualifications} onChange={(event) => setQualifications(event.target.value)} placeholder={"Certifikácia alebo členstvo\nRoky praxe\nŠpecializované vzdelanie"} /><small>Jedna položka na riadok.</small></div>
            </div>
            <div className="admin-field"><label htmlFor="directory-price">Orientačná cena <small>nepovinné</small></label><input id="directory-price" value={priceNote} onChange={(event) => setPriceNote(event.target.value)} placeholder="Napríklad: od 25 € za lekciu" /></div>
          </AdminEditorSection>

          <AdminEditorSection id="directory-contacts" className="admin-form-card">
            <div className="admin-card-heading"><div><span>04</span><div><h2>Kontakty a odkazy</h2><p>Verejné kontakty sú oddelené od interného e-mailu Psipedie.</p></div></div></div>
            <div className="admin-field-grid">
              <div className="admin-field"><label htmlFor="directory-phone">Verejný telefón <small>nepovinné</small></label><input id="directory-phone" type="tel" value={publicPhone} onChange={(event) => setPublicPhone(event.target.value)} placeholder="+421 900 000 000" /></div>
              <div className="admin-field"><label htmlFor="directory-public-email">Verejný e-mail <small>nepovinné</small></label><input id="directory-public-email" type="email" value={publicEmail} onChange={(event) => setPublicEmail(event.target.value)} placeholder="kontakt@profil.sk" /></div>
              <div className="admin-field"><label htmlFor="directory-website">Verejný web <small>nepovinné</small></label><input id="directory-website" type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://…" /></div>
              <div className="admin-field"><label htmlFor="directory-facebook">Facebook <small>nepovinné</small></label><input id="directory-facebook" type="url" value={facebookUrl} onChange={(event) => setFacebookUrl(event.target.value)} placeholder="https://facebook.com/…" /></div>
              <div className="admin-field"><label htmlFor="directory-instagram">Instagram <small>nepovinné</small></label><input id="directory-instagram" type="url" value={instagramUrl} onChange={(event) => setInstagramUrl(event.target.value)} placeholder="https://instagram.com/…" /></div>
              <div className="admin-field"><label htmlFor="directory-email">Interný e-mail <small>neverejný</small></label><input id="directory-email" type="email" value={internalEmail} onChange={(event) => setInternalEmail(event.target.value)} placeholder="kontakt@profil.sk" /></div>
            </div>
            <AdminHelpText term="Súkromie">Interný e-mail slúži administrácii a nezmiešava sa s verejným kontaktným contractom.</AdminHelpText>
          </AdminEditorSection>

          <AdminEditorSection id="directory-media-trust" className="admin-form-card">
            <div className="admin-card-heading"><div><span>05</span><div><h2>Médiá a dôvera</h2><p>Obrázok, redakčné overenie a existujúce odporúčanie profilu.</p></div></div></div>
            <div className="admin-upload-row"><div className="admin-upload-preview admin-upload-preview--forest">{imageUrl ? <img src={imageUrl} alt="Náhľad profilovej fotografie" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div><div className="admin-upload-actions"><label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadImage} disabled={uploading} />{uploading ? "Nahrávam…" : imageUrl ? "Vybrať inú fotku" : "Nahrať fotku"}</label>{imageUrl && <AdminActionButton variant="neutral" onClick={() => { setImageUrl(""); setImageKey(""); }}>Odstrániť fotku</AdminActionButton>}<small>Odporúčaný pomer 4 : 3, najviac 8 MB.</small></div></div>
            <div className="admin-directory-flags">
              <label className="admin-event-cancelled"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /><span><strong>Overený profil</strong><small>Trust stav: redakcia preverila základné údaje. Nie je to publication state.</small></span></label>
              <label className="admin-event-cancelled"><input type="checkbox" checked={featured} onChange={(event) => setFeatured(event.target.checked)} /><span><strong>Odporúčaný profil</strong><small>Existujúci featured flag pre poradie. Neznamená platené ani sponzorované umiestnenie.</small></span></label>
            </div>
          </AdminEditorSection>
        </div>

        <aside className="admin-event-preview admin-directory-preview">
          <span className="admin-eyebrow">Živý súhrn</span><div className="admin-event-preview-visual">{imageUrl ? <img src={imageUrl} alt="" /> : <span>{categoryInfo?.icon ?? "🐾"}</span>}</div>
          <span className="eyebrow">{categoryInfo?.singular}{verified ? " · Overený" : ""}</span><h2>{name || "Názov profilu"}</h2><p>{excerpt || "Krátky popis profilu sa zobrazí tu."}</p>
          <dl><div><dt>Stav</dt><dd>{status === "published" ? "Publikované" : "Koncept"}</dd></div><div><dt>Lokalita</dt><dd>{city || "Bez fyzickej lokality"}{district ? ` · okres ${district}` : ""}{region ? ` · ${region}` : ""}</dd></div><div><dt>Adresa</dt><dd>{addressEvaluation.formattedAddress ?? (addressEvaluation.state === "COMPLETE" ? "Kompletná" : addressEvaluation.state)}</dd></div><div><dt>Dostupnosť</dt><dd>{online ? (city ? "Osobne aj online" : "Online") : "Osobne"}</dd></div></dl>
        </aside>
      </div>

      <AdminDrawer
        open={advancedOpen}
        title="Pokročilé nastavenia"
        description="Slug a SEO sú sekundárne nastavenia profilu."
        onClose={() => setAdvancedOpen(false)}
        footer={<AdminActionButton variant="primary" onClick={() => setAdvancedOpen(false)}>Hotovo</AdminActionButton>}
      >
        <div className={styles.drawerFields}>
          <div className="admin-field"><label htmlFor="directory-slug">Adresa profilu</label><div className="admin-slug-input"><span>psipedia.sk/adresar/{category}/</span><input id="directory-slug" value={slug} onChange={(event) => { setSlugEdited(true); setSlug(slugify(event.target.value)); }} placeholder="nazov-profilu" required /></div></div>
          <AdminSeoFields value={seo} onChange={setSeo} canonicalPath={`/adresar/${category}/${slug}`} fallbackTitle={directorySeoFallback(name || "Názov profilu", city, category).title} fallbackDescription={directorySeoFallback(name || "Názov profilu", city, category).description} />
        </div>
      </AdminDrawer>

      {(message || error) && <div className={`admin-editor-message ${error ? "is-error" : "is-success"}`} role={error ? "alert" : "status"}>{error || message}</div>}
      <div className="admin-editor-actions"><div><Link href="/admin/adresar">← Späť na adresár</Link></div><div>{status === "published" && <AdminActionButton variant="secondary" disabled={saving || uploading} onClick={() => void save("draft")}>Stiahnuť z adresára</AdminActionButton>}<AdminActionButton variant="neutral" type="submit" disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť koncept"}</AdminActionButton><AdminActionButton variant="primary" disabled={saving || uploading} onClick={() => void save("published")}>{saving ? "Ukladám…" : status === "published" ? "Uložiť zmeny" : "Publikovať profil"}</AdminActionButton></div></div>
    </form>
  );
}
