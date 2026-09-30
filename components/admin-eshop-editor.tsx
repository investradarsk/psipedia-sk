"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import type { ManagedEshop } from "@/lib/eshop-ratings";
import styles from "./admin-eshop-editor.module.css";

function tagsFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AdminEshopEditor({ shop }: { shop: ManagedEshop }) {
  const [name, setName] = useState(shop.name);
  const [slug, setSlug] = useState(shop.slug);
  const [websiteUrl, setWebsiteUrl] = useState(shop.websiteUrl);
  const [description, setDescription] = useState(shop.description);
  const [sourceUrl, setSourceUrl] = useState(shop.sourceUrl);
  const [logoUrl, setLogoUrl] = useState(shop.logoUrl ?? "");
  const [logoKey, setLogoKey] = useState(shop.logoKey ?? "");
  const [focusTags, setFocusTags] = useState(shop.focusTags.join("\n"));
  const [status, setStatus] = useState<ManagedEshop["status"]>(shop.status);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function uploadLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage("");
    setError("");
    try {
      const data = await uploadAdminImage(file, "eshops");
      setLogoUrl(data.imageUrl);
      setLogoKey(data.imageKey);
      setMessage(adminImageUploadMessage(data, "Ulož profil."));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Logo sa nepodarilo nahrať.");
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/admin/eshops/${shop.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          websiteUrl,
          description,
          sourceUrl,
          logoUrl: logoUrl || null,
          logoKey: logoKey || null,
          focusTags: tagsFromText(focusTags),
          status,
        }),
      });
      const data = await response.json() as { shop?: ManagedEshop; error?: string };
      if (!response.ok || !data.shop) throw new Error(data.error || "E-shop sa nepodarilo uložiť.");
      setLogoUrl(data.shop.logoUrl ?? "");
      setLogoKey(data.shop.logoKey ?? "");
      setFocusTags(data.shop.focusTags.join("\n"));
      setStatus(data.shop.status);
      setMessage("Profil e-shopu je uložený.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "E-shop sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.editor} onSubmit={save}>
      <section className={styles.card}>
        <div className={styles.heading}>
          <span>01</span>
          <div><h2>Základ profilu</h2><p>Názov, verejný web a popis e-shopu.</p></div>
        </div>
        <div className={styles.grid}>
          <label><span>Názov</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label><span>Adresa profilu</span><input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} required /></label>
          <label className={styles.wide}><span>Web e-shopu</span><input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} required /></label>
          <label className={styles.wide}><span>Popis</span><textarea rows={6} value={description} onChange={(event) => setDescription(event.target.value)} required /></label>
          <label className={styles.wide}><span>Zdroj profilu</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} required /></label>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.heading}>
          <span>02</span>
          <div><h2>Zameranie sortimentu</h2><p>Nie je to ďalšia kategória. Sú to jednoduché štítky, podľa ktorých návštevník hneď pochopí, na čo sa e-shop zameriava.</p></div>
        </div>
        <label className={styles.tagField}>
          <span>Zameranie</span>
          <textarea
            rows={7}
            value={focusTags}
            onChange={(event) => setFocusTags(event.target.value)}
            placeholder={"Granule\nVýživa\nMaškrty"}
          />
          <small>Jedna položka na riadok. Najviac 12 položiek, napr. Granule, BARF, Hračky, Výcvik, Kompletný sortiment.</small>
        </label>
        <div className={styles.tagPreview}>
          {tagsFromText(focusTags).slice(0, 12).map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.heading}>
          <span>03</span>
          <div><h2>Logo</h2><p>Nahraj logo do Psipedia úložiska alebo použi verejnú URL.</p></div>
        </div>
        <div className={styles.logoRow}>
          <div className={styles.logoPreview}>{logoUrl ? <img src={logoUrl} alt={`Logo ${name}`} /> : <span>LOGO</span>}</div>
          <div className={styles.logoActions}>
            <label className={styles.uploadButton}>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadLogo} disabled={uploading} />
              {uploading ? "Nahrávam…" : logoUrl ? "Nahrať iné logo" : "Nahrať logo"}
            </label>
            <label><span>URL loga</span><input value={logoUrl} onChange={(event) => { setLogoUrl(event.target.value); setLogoKey(""); }} placeholder="https://… alebo /media/…" /></label>
            {logoUrl ? <button type="button" className={styles.remove} onClick={() => { setLogoUrl(""); setLogoKey(""); }}>Odstrániť logo</button> : null}
          </div>
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.heading}>
          <span>04</span>
          <div><h2>Publikácia</h2><p>Určuje, či je profil viditeľný návštevníkom.</p></div>
        </div>
        <label className={styles.statusField}>
          <span>Stav</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as ManagedEshop["status"])}>
            <option value="published">Publikovaný</option>
            <option value="draft">Koncept</option>
            <option value="archived">Archivovaný</option>
          </select>
        </label>
      </section>

      {(message || error) ? <p className={error ? styles.error : styles.success} role={error ? "alert" : "status"}>{error || message}</p> : null}

      <div className={styles.actions}>
        <Link href="/admin/recenzie/eshopy">← Späť na e-shopy</Link>
        <div>
          {status === "published" ? <Link href={`/recenzie/eshopy/${slug}`} target="_blank">Pozrieť profil ↗</Link> : null}
          <button type="submit" disabled={saving || uploading}>{saving ? "Ukladám…" : "Uložiť zmeny"}</button>
        </div>
      </div>
    </form>
  );
}
