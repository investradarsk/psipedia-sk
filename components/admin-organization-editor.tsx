"use client";
import {AdminSingleImageUpload} from "@/components/admin-single-image-upload";
import { AdminLexicalTextField } from "@/components/admin-lexical-text-field";
import {adminSelectedImage} from "@/lib/admin-selected-image";

import Link from "next/link";
import { AdminLexicalAppendButton } from "@/components/admin-lexical-append-button";
import { appendLexicalPlainText } from "@/lib/editorial-lexical-append";
import { EditorUnsavedChangesGuard } from "@/components/admin-editor-workspace";
import { AdminFormFeedback } from "@/components/admin-form-feedback";
import { useRouter } from "next/navigation";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AdminActionButton, AdminEditorSection, AdminHelpText, AdminStickyEditorNavigation } from "@/components/admin-interaction-system";
import { adminImageUploadMessage, uploadAdminImage } from "@/lib/admin-image-upload";
import { ImageDisplay } from "@/components/image-display";
import { ImageDisplayEditor } from "@/components/image-display-editor";
import { organizationAdminInputFromCandidate, type OrganizationAdminInput } from "@/lib/help-organization-admin-input";
import type { OrganizationPublicationAdminItem } from "@/lib/help-organization-admin-store";
import { organizationPublicationTypes } from "@/lib/help-organization-publication";
import { AdminAutomationUpdateSuggestions } from "@/components/admin-automation-update-suggestions";
import type { CanonicalUpdateSuggestion } from "@/lib/data-automation-update-review";

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
    thumbnailImageDisplay: null,
    detailImageDisplay: null,
    sourceUrl: null,
  };
}

function text(value: string | null) {
  return value ?? "";
}

export function AdminOrganizationEditor({ organization, automationSuggestions = [] }: { organization?: OrganizationPublicationAdminItem | null; automationSuggestions?: CanonicalUpdateSuggestion[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<OrganizationAdminInput>(() => organization ? organizationAdminInputFromCandidate(organization) : blankInput());
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState(organization?.updatedAt ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageEditorOpen, setImageEditorOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const archived = organization?.status === "ARCHIVED" || Boolean(organization?.archivedAt);
  const editingDisabled = !hydrated || archived || saving || uploading;
  const editorSnapshot = JSON.stringify(draft);
  const [savedSnapshot, setSavedSnapshot] = useState(editorSnapshot);
  const dirty = editorSnapshot !== savedSnapshot;
  const [confirmNavigation, setConfirmNavigation] = useState(false);
  const pendingNavigationRef = useRef<(() => void) | null>(null);
  const allowNavigationRef = useRef(false);
  const mutationPending = useRef(false);
  const requestNavigation = useCallback((navigate: () => void) => {
    pendingNavigationRef.current = navigate;
    setConfirmNavigation(true);
  }, []);

  const sections = useMemo(() => [
    { id: "organization-general", label: "Základné" },
    { id: "organization-content", label: "Verejný obsah" },
    { id: "organization-contacts", label: "Kontakty" },
    { id: "organization-media", label: "Obrázok a zdroj" },
  ], []);

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

  function patch(values: Partial<OrganizationAdminInput>) {
    setDraft((current) => ({ ...current, ...values }));
  }

  async function uploadImage(event: File | ChangeEvent<HTMLInputElement>) {
    const file = adminSelectedImage(event);
    if (!file) return;
    setUploading(true); setError(""); setMessage("");
    try {
      const data = await uploadAdminImage(file, "help");
      patch({ imageUrl: data.imageUrl, imageKey: data.imageKey, thumbnailImageDisplay: null, detailImageDisplay: null });
      setMessage(adminImageUploadMessage(data, organization ? "Ulož zmeny organizácie." : "Vytvor organizáciu."));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Obrázok sa nepodarilo nahrať.");
    } finally { setUploading(false); }
  }

  function applyAutomationUpdate(values: Record<string, unknown>, updatedAt: string) {
    setDraft((current) => ({ ...current, ...values } as OrganizationAdminInput));
    setExpectedUpdatedAt(updatedAt);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (archived || mutationPending.current || uploading) return;
    mutationPending.current = true;
    const submittedSnapshot = JSON.stringify(draft);
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
        allowNavigationRef.current = true;
        setSavedSnapshot(submittedSnapshot);
        router.replace(`/admin/organizacie/${body.item.id}`);
        return;
      }
      setExpectedUpdatedAt(body.item.updatedAt);
      const persistedDraft = organizationAdminInputFromCandidate(body.item);
      setSavedSnapshot(JSON.stringify(persistedDraft));
      // Do not replace an automation patch accepted while this request was in flight.
      setDraft((current) => JSON.stringify(current) === submittedSnapshot ? persistedDraft : current);
      setMessage("Canonical údaje organizácie boli uložené.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Organizáciu sa nepodarilo uložiť.");
    } finally { mutationPending.current = false; setSaving(false); }
  }

  return <form className="admin-event-editor" onSubmit={save}>
    <EditorUnsavedChangesGuard active={dirty} open={confirmNavigation} onStay={stayInEditor} onDiscard={discardAndNavigate} />
    {dirty && <p className="admin-message" role="status">Neuložené zmeny</p>}
    <AdminStickyEditorNavigation sections={sections} ariaLabel="Sekcie editora organizácie" />
    <div className="admin-event-fields">
      <AdminAutomationUpdateSuggestions initialSuggestions={automationSuggestions} onAccepted={applyAutomationUpdate} />
      {archived && <p className="admin-message admin-message--error">Archivovaná organizácia je iba na čítanie. Obnov ju zo zoznamu organizácií do konceptu, ak ju potrebuješ upraviť.</p>}

      <AdminEditorSection id="organization-general" className="admin-form-card">
        <div className="admin-card-heading"><div><span>01</span><div><h2>Základné údaje</h2><p>Canonical identita organizácie. Lifecycle stav sa mení samostatne, nie týmto formulárom.</p></div></div></div>
        <div className="admin-field-grid">
          <div className="admin-field"><label htmlFor="organization-name">Názov *</label><input id="organization-name" value={draft.name} required disabled={editingDisabled} onChange={(event) => patch({ name: event.target.value })} /></div>
          <div className="admin-field"><label htmlFor="organization-legal-name">Právny názov</label><input id="organization-legal-name" value={draft.legalName} disabled={editingDisabled} onChange={(event) => patch({ legalName: event.target.value })} /></div>
          <div className="admin-field"><label htmlFor="organization-slug">Slug *</label><input id="organization-slug" value={draft.slug} required disabled={editingDisabled} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" onChange={(event) => patch({ slug: event.target.value.toLowerCase() })} /><small>Iba malé písmená bez diakritiky, čísla a pomlčky.</small></div>
          <div className="admin-field"><label htmlFor="organization-registration">Registračné číslo</label><input id="organization-registration" value={text(draft.registrationNumber)} disabled={editingDisabled} onChange={(event) => patch({ registrationNumber: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-type">Typ *</label><select id="organization-type" value={draft.type} disabled={editingDisabled} onChange={(event) => patch({ type: event.target.value })}>{organizationPublicationTypes.map((type) => <option key={type} value={type}>{typeLabels[type] ?? type}</option>)}</select></div>
          {organization && <div className="admin-field"><label htmlFor="organization-status">Publication stav</label><input id="organization-status" value={organization.status} readOnly aria-readonly="true" /><small>Verification a publication sú oddelené semantics.</small></div>}
        </div>
      </AdminEditorSection>

      <AdminEditorSection id="organization-content" className="admin-form-card">
        <div className="admin-card-heading"><div><span>02</span><div><h2>Verejný obsah</h2><p>Spoločný Lexical editor; popisy zostávajú v existujúcom dátovom formáte.</p></div></div></div>
        <div className="admin-field"><label htmlFor="organization-short-description">Krátky popis</label><AdminLexicalTextField id="organization-short-description" rows={3} value={draft.shortDescription} disabled={editingDisabled} onChange={(next) => patch({ shortDescription: next })} ariaLabel="Krátky popis" /></div>
        <div className="admin-field"><label htmlFor="organization-description">Verejný popis</label><AdminLexicalTextField id="organization-description" rows={10} value={draft.description} disabled={editingDisabled} onChange={(next) => patch({ description: next })} ariaLabel="Verejný popis" /><AdminLexicalAppendButton disabled={editingDisabled} onAppend={text=>patch({description:appendLexicalPlainText(draft.description,text)})}/></div>
        <AdminHelpText term="Storage contract">Lexical rešpektuje pôvodné textové polia a obojsmernú synchronizáciu.</AdminHelpText>
      </AdminEditorSection>

      <AdminEditorSection id="organization-contacts" className="admin-form-card">
        <div className="admin-card-heading"><div><span>03</span><div><h2>Kontakty a odkazy</h2><p>Iba public organization fields; súkromné PII sem nepatrí.</p></div></div></div>
        <div className="admin-field-grid">
          <div className="admin-field"><label htmlFor="organization-email">Verejný e-mail</label><input id="organization-email" type="email" value={text(draft.publicEmail)} disabled={editingDisabled} onChange={(event) => patch({ publicEmail: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-phone">Verejný telefón</label><input id="organization-phone" value={text(draft.publicPhone)} disabled={editingDisabled} onChange={(event) => patch({ publicPhone: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-web">Web</label><input id="organization-web" type="url" inputMode="url" value={text(draft.websiteUrl)} disabled={editingDisabled} onChange={(event) => patch({ websiteUrl: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-facebook">Facebook</label><input id="organization-facebook" type="url" inputMode="url" value={text(draft.facebookUrl)} disabled={editingDisabled} onChange={(event) => patch({ facebookUrl: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-instagram">Instagram</label><input id="organization-instagram" type="url" inputMode="url" value={text(draft.instagramUrl)} disabled={editingDisabled} onChange={(event) => patch({ instagramUrl: event.target.value || null })} /></div>
        </div>
      </AdminEditorSection>

      <AdminEditorSection id="organization-media" className="admin-form-card">
        <div className="admin-card-heading"><div><span>04</span><div><h2>Obrázok a zdroj</h2><p>Re-use existujúceho admin image upload backendu; nevzniká nový media systém.</p></div></div></div>
        <div className="admin-upload-row">
          <div className="admin-upload-preview admin-upload-preview--forest">{draft.imageUrl ? <ImageDisplay roleHint="generic" context="thumbnail" config={draft.thumbnailImageDisplay} src={draft.imageUrl} alt="Náhľad obrázka organizácie" /> : <span aria-hidden="true">🐾</span>}</div>
          <div className="admin-upload-actions">
            <AdminSingleImageUpload label={draft.imageUrl ? "Vybrať iný obrázok" : "Nahrať obrázok"} onFile={uploadImage} disabled={editingDisabled} busy={uploading} onRejected={setError}/>
            {draft.imageUrl && <AdminActionButton variant="neutral" disabled={editingDisabled || uploading} onClick={() => patch({ imageUrl: null, imageKey: null, thumbnailImageDisplay: null, detailImageDisplay: null })}>Odstrániť obrázok</AdminActionButton>}
            <small>JPG, PNG, WebP alebo AVIF, najviac 8 MB.</small>
            {draft.imageUrl && <button type="button" className="admin-upload-button" disabled={editingDisabled} onClick={() => setImageEditorOpen(true)}>Upraviť zobrazenie</button>}
          </div>
        </div>
        <div className="admin-field"><label htmlFor="organization-source">Zdroj / referencia</label><input id="organization-source" type="url" inputMode="url" value={text(draft.sourceUrl)} disabled={editingDisabled} onChange={(event) => patch({ sourceUrl: event.target.value || null })} /></div>
      </AdminEditorSection>
    </div>

    {imageEditorOpen && draft.imageUrl && <ImageDisplayEditor src={draft.imageUrl} alt={draft.name || "Organizácia"} title={draft.name} excerpt={draft.shortDescription} entityLabel="organizácie" thumbnailAspectRatio="4 / 3"
       thumbnail={draft.thumbnailImageDisplay ?? null} detail={draft.detailImageDisplay ?? null} onCancel={() => setImageEditorOpen(false)}
       onSave={(thumbnail, detail) => { patch({ thumbnailImageDisplay: thumbnail, detailImageDisplay: detail }); setImageEditorOpen(false); }} />}
    <AdminFormFeedback message={message} error={error} pending={saving} className="admin-message" errorClassName="admin-message--error" />
    <div className="admin-editor-actions">
      <div><Link href="/admin/organizacie">← Späť na organizácie</Link></div>
      <div><AdminActionButton variant="primary" type="submit" disabled={editingDisabled || saving || uploading}>{saving ? "Ukladám…" : organization ? "Uložiť organizáciu" : "Vytvoriť koncept"}</AdminActionButton></div>
    </div>
  </form>;
}
