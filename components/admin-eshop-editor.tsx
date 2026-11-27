"use client";

import { AdminEditorSectionPager } from "@/components/admin-editor-section-pager";
import { useProfileEditorSectionPager } from "@/components/admin-profile-editor-section-pager";

import Link from "next/link";
import { ChangeEvent, FormEvent, useState } from "react";
import { AdminSingleImageUpload } from "@/components/admin-single-image-upload";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import { adminSelectedImage } from "@/lib/admin-selected-image";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import type { ManagedEshop } from "@/lib/eshop-ratings";
import { AdminActionButton } from "@/components/admin-interaction-system";
import { AdminLexicalAppendButton } from "@/components/admin-lexical-append-button";
import { AdminLexicalTextField } from "@/components/admin-lexical-text-field";
import { appendLexicalPlainText } from "@/lib/editorial-lexical-append";
import { EditorActionBar, EditorSection, EditorStatus, EditorWorkspace } from "@/components/admin-editor-workspace";
import styles from "./admin-eshop-editor.module.css";

const ESHOP_SECTIONS = [
  { id: "eshop-basics", label: "Základné údaje" },
  { id: "eshop-tags", label: "Sortiment" },
  { id: "eshop-images", label: "Obrázky" },
  { id: "eshop-publication", label: "Publikovanie" },
];

function tagsFromText(value: string) {
  return value
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function AdminEshopEditor({ shop }: { shop: ManagedEshop }) {
  const [activeSection, setActiveSection] = useState(ESHOP_SECTIONS[0].id);
  const navigatePager = useProfileEditorSectionPager(activeSection, setActiveSection);
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
  const [persistedRevision,setPersistedRevision]=useState(shop.updatedAt);
  const [savedSignature, setSavedSignature] = useState(() => JSON.stringify({
    name: shop.name, slug: shop.slug, websiteUrl: shop.websiteUrl,
    description: shop.description, sourceUrl: shop.sourceUrl,
    logoUrl: shop.logoUrl ?? "", logoKey: shop.logoKey ?? "",
    focusTags: shop.focusTags.join("\n"), status: shop.status,
  }));
  const currentSignature = JSON.stringify({
    name, slug, websiteUrl, description, sourceUrl, logoUrl, logoKey, focusTags, status,
  });
  const dirty = currentSignature !== savedSignature;

  async function uploadLogo(event: File | ChangeEvent<HTMLInputElement>) {
    const file = adminSelectedImage(event);
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
          expectedUpdatedAt:persistedRevision,
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
      setPersistedRevision(data.shop.updatedAt);
      setName(data.shop.name);
      setSlug(data.shop.slug);
      setWebsiteUrl(data.shop.websiteUrl);
      setDescription(data.shop.description);
      setSourceUrl(data.shop.sourceUrl);
      setLogoUrl(data.shop.logoUrl ?? "");
      setLogoKey(data.shop.logoKey ?? "");
      setFocusTags(data.shop.focusTags.join("\n"));
      setStatus(data.shop.status);
      setSavedSignature(JSON.stringify({
        name: data.shop.name, slug: data.shop.slug,
        websiteUrl: data.shop.websiteUrl, description: data.shop.description,
        sourceUrl: data.shop.sourceUrl, logoUrl: data.shop.logoUrl ?? "",
        logoKey: data.shop.logoKey ?? "", focusTags: data.shop.focusTags.join("\n"),
        status: data.shop.status,
      }));
      setMessage("Profil e-shopu je uložený.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "E-shop sa nepodarilo uložiť.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={styles.editor} noValidate onSubmit={save}>
      <EditorWorkspace
        mode="page"
        title={"E-shop — " + (name || "Úprava profilu")}
        description="Uprav údaje, sortiment, obrázok a publikovanie na jednom mieste."
        status={<><EditorStatus label={status === "published" ? "Publikovaný" : status === "archived" ? "Archivovaný" : "Koncept"} tone={status === "published" ? "success" : status === "archived" ? "danger" : "warning"}/>{dirty && <EditorStatus label="Neuložené zmeny" tone="warning" />}</>}
        sections={ESHOP_SECTIONS}
        sectionMode="switch"
        activeSectionId={activeSection}
        onSectionChange={setActiveSection}
        dirty={dirty}
        onClose={() => window.location.assign("/admin/recenzie/eshopy")}
        previewTitle="Živý náhľad e-shopu"
        preview={<div className={styles.previewCard}>
          <div className={styles.previewLogo}>{logoUrl ? <img src={logoUrl} alt="" /> : <span>Bez loga</span>}</div>
          <strong>{name || "Názov e-shopu"}</strong>
          <p>{description || "Popis profilu sa zobrazí po vyplnení."}</p>
          <small>{websiteUrl || "Web ešte nie je vyplnený"}</small>
        </div>}
        actions={<EditorActionBar
          secondary={<div className={styles.actionLinks}>
            <Link href="/admin/recenzie/eshopy">← Späť na e-shopy</Link>
            {shop.status === "published" && <Link href={"/recenzie/eshopy/" + shop.slug} target="_blank" rel="noopener noreferrer">Pozrieť publikovaný profil ↗</Link>}
          </div>}
          primary={<AdminActionButton type="submit" variant="primary" disabled={saving || uploading || !dirty}>{saving ? "Ukladám…" : "Uložiť zmeny"}</AdminActionButton>}
        />}
      >
      <fieldset className={styles.fields} disabled={saving}>
      <EditorSection id="eshop-basics" className={styles.card}>
        <div className={styles.heading}>
          <span>01</span>
          <div><h2>Základ profilu</h2><p>Názov, verejný web a popis e-shopu.</p></div>
        </div>
        <div className={styles.grid}>
          <label><span>Názov</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label>
          <label><span>Adresa profilu</span><input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, "-"))} required /></label>
          <label className={styles.wide}><span>Web e-shopu</span><input type="url" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} /></label>
          <div className={styles.wide}><label><span>Popis</span><AdminLexicalTextField rows={6} value={description} onChange={setDescription} ariaLabel="Popis e-shopu" /></label><AdminLexicalAppendButton disabled={saving || uploading} onAppend={text => setDescription(current => appendLexicalPlainText(current,text))}/></div>
          <label className={styles.wide}><span>Zdroj profilu</span><input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} /></label>
        </div>
      </EditorSection>

      <EditorSection id="eshop-tags" className={styles.card}>
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
      </EditorSection>

      <EditorSection id="eshop-images" className={styles.card}>
        <div className={styles.heading}>
          <span>03</span>
          <div><h2>Logo</h2><p>Nahraj logo do Psipedia úložiska alebo použi verejnú URL.</p></div>
        </div>
        <div className={styles.logoRow}>
          <div className={styles.logoPreview}>{logoUrl ? <img src={logoUrl} alt={`Logo ${name}`} /> : <span>LOGO</span>}</div>
          <div className={styles.logoActions}>
            <AdminSingleImageUpload label={logoUrl ? "Nahrať iné logo" : "Nahrať logo"}
              onFile={uploadLogo} busy={uploading} disabled={saving} onRejected={setError}/>
            <label><span>URL loga</span><input value={logoUrl} onChange={(event) => { setLogoUrl(event.target.value); setLogoKey(""); }} placeholder="https://… alebo /media/…" /></label>
            {logoUrl ? <button type="button" className={styles.remove} onClick={() => { setLogoUrl(""); setLogoKey(""); }}>Odstrániť logo</button> : null}
          </div>
        </div>
      </EditorSection>

      <EditorSection id="eshop-publication" className={styles.card}>
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
      </EditorSection>

      <AdminEditorSectionPager sections={ESHOP_SECTIONS} index={ESHOP_SECTIONS.findIndex(section => section.id === activeSection)}
        onNavigate={navigatePager} ariaLabel="Prechod medzi sekciami e-shopu" />
      </fieldset>
      <AdminFormFeedback message={message} error={error} pending={saving} errorClassName={styles.error} successClassName={styles.success} />
      </EditorWorkspace>
    </form>
  );
}
