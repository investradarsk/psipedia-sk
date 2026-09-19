"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { AdminActionButton, AdminEditorSection, AdminHelpText, AdminStickyEditorNavigation } from "@/components/admin-interaction-system";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { organizationAdminInputFromCandidate, type OrganizationAdminInput } from "@/lib/help-organization-admin-input";
import type { OrganizationPublicationAdminItem } from "@/lib/help-organization-admin-store";
import { organizationPublicationTypes } from "@/lib/help-organization-publication";

const typeLabels: Record<string, string> = {
  SHELTER: "Útulok",
  CIVIC_ASSOCIATION: "Občianske združenie",
  RESCUE_ORGANIZATION: "Záchranná organizácia",
  MUNICIPAL_ORGANIZATION: "Mestská/obecná organizácia",
  NONPROFIT: "Nezisková organizácia",
  OTHER: "Iné",
};

function blankInput(): OrganizationAdminInput {
  return {
    name: "",
    slug: "",
    legalName: "",
    registrationNumber: null,
    type: "OTHER",
    shortDescription: "",
    description: "",
    publicEmail: null,
    publicPhone: null,
    websiteUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    imageUrl: null,
    imageKey: null,
    sourceUrl: null,
  };
}

function text(value: string | null) {
  return value ?? "";
}

export function AdminOrganizationEditor({ organization }: { organization?: OrganizationPublicationAdminItem | null }) {
  const router = useRouter();
  const [draft, setDraft] = useState<OrganizationAdminInput>(() => organization ? organizationAdminInputFromCandidate(organization) : blankInput());
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(organization?.updatedAt ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const archived = organization?.status === "ARCHIVED" || Boolean(organization?.archivedAt);
  const sections = useMemo(() => [
    { id: "organization-general", label: "Základné" },
    { id: "organization-content", label: "Verejný obsah" },
    { id: "organization-contacts", label: "Kontakty" },
    { id: "organization-media", label: "Obrázok a zdroj" },
  ], []);

  function patch(values: Partial<OrganizationAdminInput>) {
    setDraft((current) => ({ ...current, ...values }));
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "help");
      patch({ imageUrl: data.imageUrl, imageKey: data.imageKey });
      setMessage(adminImageUploadMessage(data, organization ? "Ulož zmeny organizácie." : "Vytvor organizáciu."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Obrázok sa nepodarilo nahrať.");
    } finally { setUploading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (archived) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch(organization ? "/api/admin/organizations/" + organization.id : "/api/admin/organizations", {
        method: organization ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(organization ? { payload: draft, expectedUpdatedAt } : draft),
      });
      const body = await response.json() as { item?: OrganizationPublicationAdminItem; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Organizáciu sa nepodarilo uložiť.");
      if (!organization) {
        router.replace(`/admin/organizacie/${body.item.id}`);
        return;
      }
      setExpectedUpdatedAt(body.item.updatedAt);
      setDraft(organizationAdminInputFromCandidate(body.item));
      setMessage("Canonical údaje organizácie boli uložené.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Organizáciu sa nepodarilo uložiť.");
    } finally { setSaving(false); }
  }

  return <form className="admin-event-editor" onSubmit={save}>
    <AdminStickyEditorNavigation sections={sections} ariaLabel="Sekcie editora organizácie" />
    <div className="admin-event-fields">
      {archived && <p className="admin-message admin-message--error">Archivovaná organizácia je iba na čítanie. Obnov ju zo zoznamu organizácií do konceptu, ak ju potrebuješ upraviť.</p>}

      <AdminEditorSection id="organization-general" className="admin-form-card">
        <div className="admin-card-heading"><div><span>01</span><div><h2>Základné údaje</h2><p>Canonical identita organizácie. Lifecycle stav sa mení samostatne, nie týmto formulárom.</p></div></div></div>
        <div className="admin-field-grid">
          <div className="admin-field"><label htmlFor="organization-name">Názov *</label><input id="organization-name" value={draft.name} required disabled={archived} onChange={(event) => patch({ name: event.target.value })} /></div>
          <div className="admin-field"><label htmlFor="organization-legal-name">Právny názov</label><input id="organization-legal-name" value={draft.legalName} disabled={archived} onChange={(event) => patch({ legalName: event.target.value })} /></div>
          <div className="admin-field"><label htmlFor="organization-slug">Slug *</label><input id="organization-slug" value={draft.slug} required disabled={archived} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={(event) => patch({ slug: event.target.value.toLowerCase() })} /><small>Iba malé písmená bez diakritiky, čísla a pomlčky.</small></div>
          <div className="admin-field"><label htmlFor="organization-registration">Registračné číslo</label><input id="organization-registration" value={text(draft.registrationNumber)} disabled={archived} onChange={(event) => patch({ registrationNumber: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-type">Typ *</label><select id="organization-type" value={draft.type} disabled={archived} onChange={(event) => patch({ type: event.target.value })}>{organizationPublicationTypes.map((type) => <option key={type} value={type}>{typeLabels[type] ?? type}</option>)}</select></div>
          {organization && <div className="admin-field"><label htmlFor="organization-status">Publication stav</label><input id="organization-status" value={organization.status} readOnly aria-readonly="true" /><small>Verification a publication sú oddelené semantics.</small></div>}
        </div>
      </AdminEditorSection>

      <AdminEditorSection id="organization-content" className="admin-form-card">
        <div className="admin-card-heading"><div><span>02</span><div><h2>Verejný obsah</h2><p>Aktuálny organization contract ukladá popis ako plain text, preto sa tu zámerne nepoužíva druhý rich-text editor.</p></div></div></div>
        <div className="admin-field"><label htmlFor="organization-short-description">Krátky popis</label><textarea id="organization-short-description" rows={3} value={draft.shortDescription} disabled={archived} onChange={(event) => patch({ shortDescription: event.target.value })} /></div>
        <div className="admin-field"><label htmlFor="organization-description">Verejný popis</label><textarea id="organization-description" rows={10} value={draft.description} disabled={archived} onChange={(event) => patch({ description: event.target.value })} /></div>
        <AdminHelpText term="Storage contract">Plain text zostáva zachovaný. Rich-text AST je samostatný follow-up, nie schema zmena v tomto workstreame.</AdminHelpText>
      </AdminEditorSection>

      <AdminEditorSection id="organization-contacts" className="admin-form-card">
        <div className="admin-card-heading"><div><span>03</span><div><h2>Kontakty a odkazy</h2><p>Iba public organization fields; súkromné PII sem nepatrí.</p></div></div></div>
        <div className="admin-field-grid">
          <div className="admin-field"><label htmlFor="organization-email">Verejný e-mail</label><input id="organization-email" type="email" value={text(draft.publicEmail)} disabled={archived} onChange={(event) => patch({ publicEmail: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-phone">Verejný telefón</label><input id="organization-phone" value={text(draft.publicPhone)} disabled={archived} onChange={(event) => patch({ publicPhone: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-web">Web</label><input id="organization-web" type="url" inputMode="url" value={text(draft.websiteUrl)} disabled={archived} onChange={(event) => patch({ websiteUrl: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-facebook">Facebook</label><input id="organization-facebook" type="url" inputMode="url" value={text(draft.facebookUrl)} disabled={archived} onChange={(event) => patch({ facebookUrl: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-instagram">Instagram</label><input id="organization-instagram" type="url" inputMode="url" value={text(draft.instagramUrl)} disabled={archived} onChange={(event) => patch({ instagramUrl: event.target.value || null })} /></div>
        </div>
      </AdminEditorSection>

      <AdminEditorSection id="organization-media" className="admin-form-card">
        <div className="admin-card-heading"><div><span>04</span><div><h2>Obrázok a zdroj</h2><p>Re-use existujúceho admin image upload backendu; nevzniká nový media systém.</p></div></div></div>
        <div className="admin-upload-row">
          <div className="admin-upload-preview admin-upload-preview--forest">{draft.imageUrl ? <img src={draft.imageUrl} alt="Náhľad obrázka organizácie" /> : <span aria-hidden="true">🐾</span>}</div>
          <div className="admin-upload-actions">
            <label className="admin-upload-button"><input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={uploadImage} disabled={archived || uploading} />{uploading ? "Nahrávam…" : draft.imageUrl ? "Vybrať iný obrázok" : "Nahrať obrázok"}</label>
            {draft.imageUrl && <AdminActionButton variant="neutral" disabled={archived || uploading} onClick={() => patch({ imageUrl: null, imageKey: null })}>Odstrániť obrázok</AdminActionButton>}
            <small>JPG, PNG, WebP alebo AVIF, najviac 8 MB.</small>
          </div>
        </div>
        <div className="admin-field"><label htmlFor="organization-source">Zdroj / referencia</label><input id="organization-source" type="url" inputMode="url" value={text(draft.sourceUrl)} disabled={archived} onChange={(event) => patch({ sourceUrl: event.target.value || null })} /></div>
      </AdminEditorSection>
    </div>

    {message && <p className="admin-message" role="status">{message}</p>}
    {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
    <div className="admin-editor-actions">
      <div><Link href="/admin/organizacie">← Späť na organizácie</Link></div>
      <div><AdminActionButton variant="primary" type="submit" disabled={archived || saving || uploading}>{saving ? "Ukladám…" : organization ? "Uložiť organizáciu" : "Vytvoriť koncept"}</AdminActionButton></div>
    </div>
  </form>;
}
