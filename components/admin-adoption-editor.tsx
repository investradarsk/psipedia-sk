"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import {
  adoptionStatusLabels,
  canTransitionAdoptionStatus,
  slugifyAdoptionSlug,
  type AdoptionDog,
  type AdoptionStatus,
  type ManagedAdoptionInput,
} from "@/lib/adoption";
import type { AdoptionAdminBreedOption } from "@/lib/adoption-admin-write";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { AdminAdoptionEditorProfile } from "./admin-adoption-editor-profile";
import { AdminAdoptionEditorDetails } from "./admin-adoption-editor-details";

const publicStatuses = new Set<AdoptionStatus>(["ACTIVE", "RESERVED"]);
const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
const nullableNumber = (data: FormData, key: string) => { const value = text(data, key); return value ? Number(value) : null; };
const nullableBoolean = (data: FormData, key: string) => { const value = text(data, key); return value === "true" ? true : value === "false" ? false : null; };
const checked = (data: FormData, key: string) => data.get(key) === "on";

export function AdminAdoptionEditor({ item, breeds }: { item?: AdoptionDog; breeds: AdoptionAdminBreedOption[] }) {
  const [name, setName] = useState(item?.name ?? "");
  const [slug, setSlug] = useState(item?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(item));
  const [status, setStatus] = useState<AdoptionStatus>(item?.status ?? "DRAFT");
  const [persistedStatus, setPersistedStatus] = useState<AdoptionStatus>(item?.status ?? "DRAFT");
  const [mainImage, setMainImage] = useState(item?.mainImage ?? "");
  const [version, setVersion] = useState(item?.updatedAt ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const lifecycleOptions = useMemo(() => item
    ? (["DRAFT", "ACTIVE", "RESERVED", "ADOPTED", "ARCHIVED"] as AdoptionStatus[]).filter((next) => canTransitionAdoptionStatus(persistedStatus, next))
    : (["DRAFT", "ACTIVE", "RESERVED"] as AdoptionStatus[]), [item, persistedStatus]);
  const publishing = publicStatuses.has(status);

  function changeName(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugifyAdoptionSlug(value));
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const result = await uploadAdminImage(file, "help");
      setMainImage(result.imageUrl);
      setMessage(adminImageUploadMessage(result, "Ulož adopčný profil."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Obrázok sa nepodarilo nahrať.");
    } finally {
      setUploading(false); event.target.value = "";
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setMessage("");
    try {
      const data = new FormData(event.currentTarget);
      const payload: ManagedAdoptionInput = {
        name, slug, status,
        sex: text(data, "sex"), birthDate: text(data, "birthDate") || null,
        approximateAgeMonths: nullableNumber(data, "approximateAgeMonths"), size: text(data, "size"), weight: nullableNumber(data, "weight"),
        breedId: nullableNumber(data, "breedId"), breedName: text(data, "breedName"), breedMix: checked(data, "breedMix"), color: text(data, "color"),
        region: text(data, "region"), district: text(data, "district"), city: text(data, "city"),
        organizationId: item?.organizationId ?? null, organizationName: text(data, "organizationName"), organizationSlug: text(data, "organizationSlug") || null,
        mainImage: mainImage || null, gallery: text(data, "gallery"), shortDescription: text(data, "shortDescription"), description: text(data, "description"),
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
      setVersion(body.item.updatedAt); setStatus(body.item.status); setPersistedStatus(body.item.status);
      setMessage("Adopčný profil bol bezpečne uložený.");
      if (!item) window.location.assign(`/admin/adopcie/${body.item.id}?vytvorene=1`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Adopčný profil sa nepodarilo uložiť.");
    } finally { setSaving(false); }
  }

  return <form className="admin-event-editor" onSubmit={save}>
    <div className="admin-event-editor-grid"><div className="admin-event-fields">
      <section className="admin-form-card admin-form-card--intro">
        <div className="admin-card-heading"><div><span>01</span><div><h2>Základné údaje</h2><p>Meno, adresa profilu a lifecycle stav.</p></div></div></div>
        <div className="admin-field-grid">
          <div className="admin-field"><label htmlFor="adoption-name">Meno *</label><input id="adoption-name" value={name} onChange={(event: ChangeEvent<HTMLInputElement>) => changeName(event.target.value)} required/></div>
          <div className="admin-field"><label htmlFor="adoption-slug">Slug *</label><input id="adoption-slug" value={slug} onChange={(event: ChangeEvent<HTMLInputElement>) => { setSlugEdited(true); setSlug(slugifyAdoptionSlug(event.target.value)); }} required/></div>
          <div className="admin-field"><label htmlFor="adoption-status">Lifecycle stav *</label><select id="adoption-status" value={status} onChange={(event: ChangeEvent<HTMLSelectElement>) => setStatus(event.target.value as AdoptionStatus)}>{lifecycleOptions.map((value) => <option key={value} value={value}>{adoptionStatusLabels[value]}</option>)}</select></div>
        </div>
        {publishing && <p className="admin-help">Pri ACTIVE/RESERVED server vyžaduje všetky publikačné údaje a znovu ich validuje.</p>}
      </section>
      <AdminAdoptionEditorProfile item={item} breeds={breeds} publishing={publishing}/>
      <AdminAdoptionEditorDetails item={item} publishing={publishing} mainImage={mainImage} uploading={uploading} onMainImageChange={setMainImage} onUpload={uploadImage}/>
    </div><aside className="admin-event-preview"><span className="admin-eyebrow">Súhrn</span>{mainImage && <div className="admin-event-preview-visual"><img src={mainImage} alt=""/></div>}<span className="eyebrow">{adoptionStatusLabels[status]}</span><h2>{name || "Meno psa"}</h2><p>{publishing ? "Verejný stav – server vyžaduje kompletné publikačné údaje." : "Koncept môže zostať neúplný."}</p><Link href="/admin/adopcie">← Späť na adopcie</Link></aside></div>
    {message && <p className="admin-message">{message}</p>}{error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
    <div className="admin-editor-actions"><Link href="/admin/adopcie">Zrušiť</Link><button type="submit" disabled={saving || uploading}>{saving ? "Ukladám…" : item ? "Uložiť zmeny" : "Vytvoriť psa"}</button></div>
  </form>;
}
