"use client";
import { AdminRecordLifecycleActions } from "@/components/admin-record-lifecycle-actions";
import { useProfileEditorSectionPager } from "@/components/admin-profile-editor-section-pager";
import { AdminEditorFooter } from "@/components/admin-editor-footer";
import { AdminSharedEditorNavigation } from "@/components/admin-shared-editor-navigation";
import { AdminEditorSectionVisibility } from "@/components/admin-editor-section-visibility";
import styles from "./admin-organization-editor.module.css";
import { AdminEditorToolFrame } from "@/components/admin-editor-tool-frame";
import { AdminProfileGoogleMaps } from "@/components/admin-profile-google-maps";
import {
  AdminOrganizationLocations,
  canonicalOrganizationLocation,
  organizationAddressDraftFromLocation,
  type OrganizationAddressDraft,
} from "@/components/admin-organization-locations";
import type { OrganizationLocationAdminRecord } from "@/lib/organization-location-admin-store";
import type { OrganizationLocationAdminInput } from "@/lib/organization-location-admin";
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
import { AdminActionButton, AdminEditorSection, AdminHelpText } from "@/components/admin-interaction-system";
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

export function AdminOrganizationEditor({
  organization,
  initialLocations = [],
  automationSuggestions = [],
}: {
  organization?: OrganizationPublicationAdminItem | null;
  initialLocations?: OrganizationLocationAdminRecord[];
  automationSuggestions?: CanonicalUpdateSuggestion[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<OrganizationAdminInput>(() => organization ? organizationAdminInputFromCandidate(organization) : blankInput());
  const [location, setLocation] = useState<OrganizationLocationAdminRecord | null>(() => canonicalOrganizationLocation(initialLocations));
  const [addressDraft, setAddressDraft] = useState<OrganizationAddressDraft>(() =>
    organizationAddressDraftFromLocation(organization, canonicalOrganizationLocation(initialLocations)));
  const addressSnapshot = JSON.stringify(addressDraft);
  const [savedAddressSnapshot, setSavedAddressSnapshot] = useState(addressSnapshot);
  // A new organization may be committed before its separate location write
  // succeeds. Keep its ID so retry uses PUT and never creates a duplicate.
  const createdOrganizationId = useRef<number | null>(null);
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
  const [activeOrganizationSection, setActiveOrganizationSection] = useState("organization-general");
  const archived = organization?.status === "ARCHIVED" || Boolean(organization?.archivedAt);
  const editingDisabled = !hydrated || archived || saving || uploading;
  const editorSnapshot = JSON.stringify(draft);
  const [savedSnapshot, setSavedSnapshot] = useState(editorSnapshot);
  const addressDirty = addressSnapshot !== savedAddressSnapshot;
  const dirty = editorSnapshot !== savedSnapshot || addressDirty;
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
    { id: "organization-location-panel", label: "Adresa a mapa" },
    { id: "organization-contacts", label: "Kontakty" },
    { id: "organization-media", label: "Obrázok a zdroj" },
  ], []);
  const activeOrganizationIndex = sections.findIndex((section) => section.id === activeOrganizationSection);
  const navigateOrganizationPager = useProfileEditorSectionPager(activeOrganizationSection, setActiveOrganizationSection);

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
    setSavedAddressSnapshot(addressSnapshot);
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
    // All five form panels stay mounted. With noValidate, hidden native
    // constraints can be inspected and their panel revealed before saving.
    const invalid = Array.from(event.currentTarget.elements).find((control): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
      (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)
      && control.willValidate && !control.checkValidity()
    );
    if (invalid) {
      const owner = invalid.closest("[data-admin-editor-section]") as HTMLElement | null;
      setActiveOrganizationSection(owner?.id ?? "organization-general");
      setMessage("");
      setError("Vyplň alebo oprav: " + (invalid.labels?.[0]?.textContent?.trim() || "Pole formulára") + ".");
      return;
    }
    mutationPending.current = true;
    const submittedSnapshot = JSON.stringify(draft);
    const submittedAddressSnapshot = JSON.stringify(addressDraft);
    const organizationChanged = submittedSnapshot !== savedSnapshot;
    const addressChanged = submittedAddressSnapshot !== savedAddressSnapshot;
    let savingAddress = false;
    let organizationSaved = false;
    setSaving(true); setError(""); setMessage("");
    try {
      let organizationId = organization?.id ?? createdOrganizationId.current;
      // Avoid touching an unchanged organization row just to save its address.
      // In particular, this preserves its updated_at and Notion mirror.
      if (!organizationId || organizationChanged) {
        const response = await fetch(organizationId ? "/api/admin/organizations/" + organizationId : "/api/admin/organizations", {
          method: organizationId ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(organizationId ? { payload: draft, expectedUpdatedAt } : draft),
        });
        const body = await response.json() as { item?: OrganizationPublicationAdminItem; error?: string };
        if (!response.ok || !body.item) throw new Error(body.error || "Organizáciu sa nepodarilo uložiť.");
        organizationId = body.item.id;
        if (!organization) createdOrganizationId.current = organizationId;
        setExpectedUpdatedAt(body.item.updatedAt);
        const persistedDraft = organizationAdminInputFromCandidate(body.item);
        setSavedSnapshot(JSON.stringify(persistedDraft));
        // Do not overwrite a newer automation change accepted during the request.
        setDraft((current) => JSON.stringify(current) === submittedSnapshot ? persistedDraft : current);
        organizationSaved = true;
      }

      if (addressChanged) {
        savingAddress = true;
        if (!organizationId) throw new Error("Pred uložením adresy musí existovať organizácia.");
        const payload: OrganizationLocationAdminInput = {
          role: location?.role ?? "SITE",
          label: location?.label ?? "",
          address: addressDraft.address,
          city: addressDraft.city,
          district: addressDraft.district,
          region: addressDraft.region,
          countryCode: addressDraft.countryCode || "SK",
          isPrimary: true,
          sortOrder: 0,
        };
        const endpoint = location
          ? `/api/admin/organizations/${organizationId}/locations/${location.id}`
          : `/api/admin/organizations/${organizationId}/locations`;
        const response = await fetch(endpoint, {
          method: location ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ payload }),
        });
        const body = await response.json() as { item?: OrganizationLocationAdminRecord; error?: string };
        if (!response.ok || !body.item) throw new Error(body.error || "Adresu sa nepodarilo uložiť.");
        setLocation(body.item);
        const savedAddress = organizationAddressDraftFromLocation(null, body.item);
        setSavedAddressSnapshot(JSON.stringify(savedAddress));
        setAddressDraft((current) => JSON.stringify(current) === submittedAddressSnapshot ? savedAddress : current);
      }

      if (!organization) {
        // Redirect only after both writes succeed. An address failure keeps
        // the unsaved address and the newly created ID for a safe retry.
        allowNavigationRef.current = true;
        router.replace(`/admin/organizacie/${organizationId}`);
        return;
      }
      setMessage(addressChanged ? "Údaje organizácie aj adresa sú uložené." : organizationSaved
        ? "Údaje organizácie sú uložené." : "Žiadne neuložené zmeny.");
      router.refresh();
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : "Organizáciu sa nepodarilo uložiť.";
      if (savingAddress) {
        setActiveOrganizationSection("organization-location-panel");
        setError(organizationSaved
          ? "Údaje organizácie sa uložili, ale adresa nie. Oprav adresu a klikni znovu na Uložiť organizáciu. " + detail
          : "Adresa sa neuložila. Ostatné údaje zostali nezmenené. " + detail);
      } else {
        if (/obráz|fotograf|image|source|zdroj/i.test(detail)) setActiveOrganizationSection("organization-media");
        else if (/kontaktn|e-mail|telefón|website|facebook|instagram|odkaz|web|url/i.test(detail)) setActiveOrganizationSection("organization-contacts");
        else if (/opis|popis|description|text|obsah/i.test(detail)) setActiveOrganizationSection("organization-content");
        else if (/názov|meno|slug|typ|identit|name/i.test(detail)) setActiveOrganizationSection("organization-general");
        setError(detail);
      }
    } finally { mutationPending.current = false; setSaving(false); }
  }

  return <form noValidate className={`admin-event-editor ${styles.editor}`} data-admin-form-system="v4" data-admin-organization-editor="true" onSubmit={save}>
    <EditorUnsavedChangesGuard active={dirty} open={confirmNavigation} onStay={stayInEditor} onDiscard={discardAndNavigate} />
    <AdminEditorSectionVisibility.Provider value={{ activeId: activeOrganizationSection, mode: "switch" }}>
      <div className={styles.layout} data-admin-organization-editor-workspace="true">
        <AdminSharedEditorNavigation sections={sections} activeId={activeOrganizationSection}
          onNavigate={setActiveOrganizationSection} layout="sidebar" mode="switch" ariaLabel="Sekcie editora organizácie" ready={hydrated} />
        <div className={styles.content}>
          <AdminFormFeedback message={message} error={error} pending={saving} className="admin-message" errorClassName="admin-message--error" />
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

      <AdminEditorSection id="organization-location-panel" className="admin-form-card">
        <div className="admin-card-heading"><div><span>03</span><div><h2>Adresa a mapa</h2><p>Jedna hlavná adresa organizácie. Zmeny ulož rovnakým tlačidlom ako ostatné údaje.</p></div></div></div>
        <AdminOrganizationLocations draft={addressDraft} disabled={editingDisabled}
          onChange={(changes) => setAddressDraft((current) => ({ ...current, ...changes }))} />
        {organization && location ? (
          dirty ? (
            <p className="admin-help" role="status">Pred zmenou Google miesta ulož rozpracované údaje organizácie a adresu. Predídeme strate neuložených zmien.</p>
          ) : (
            <div id="google-maps">
              <AdminProfileGoogleMaps
                targetType="ORGANIZATION_LOCATION"
                targetId={location.id}
              />
            </div>
          )
        ) : (
          <p className="admin-help">Google Maps bude dostupné po uložení organizácie a jej hlavnej lokality.</p>
        )}
      </AdminEditorSection>

      <AdminEditorSection id="organization-contacts" className="admin-form-card">
        <div className="admin-card-heading"><div><span>04</span><div><h2>Kontakty a odkazy</h2><p>Iba public organization fields; súkromné PII sem nepatrí.</p></div></div></div>
<AdminEditorToolFrame kind="contacts">
        <div className="admin-field-grid">
          <div className="admin-field"><label htmlFor="organization-email">Verejný e-mail</label><input id="organization-email" type="email" value={text(draft.publicEmail)} disabled={editingDisabled} onChange={(event) => patch({ publicEmail: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-phone">Verejný telefón</label><input id="organization-phone" type="tel" value={text(draft.publicPhone)} disabled={editingDisabled} onChange={(event) => patch({ publicPhone: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-web">Web</label><input id="organization-web" type="url" inputMode="url" value={text(draft.websiteUrl)} disabled={editingDisabled} onChange={(event) => patch({ websiteUrl: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-facebook">Facebook</label><input id="organization-facebook" type="url" inputMode="url" value={text(draft.facebookUrl)} disabled={editingDisabled} onChange={(event) => patch({ facebookUrl: event.target.value || null })} /></div>
          <div className="admin-field"><label htmlFor="organization-instagram">Instagram</label><input id="organization-instagram" type="url" inputMode="url" value={text(draft.instagramUrl)} disabled={editingDisabled} onChange={(event) => patch({ instagramUrl: event.target.value || null })} /></div>
        </div>
            </AdminEditorToolFrame>
      </AdminEditorSection>

      <AdminEditorSection id="organization-media" className="admin-form-card">
        <div className="admin-card-heading"><div><span>05</span><div><h2>Obrázok a zdroj</h2><p>Re-use existujúceho admin image upload backendu; nevzniká nový media systém.</p></div></div></div>
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
          <nav data-admin-editor-pager className={styles.pager} aria-label="Prechod medzi sekciami organizácie">
            <button type="button" disabled={activeOrganizationIndex <= 0}
              onClick={() => navigateOrganizationPager(sections[activeOrganizationIndex - 1]?.id ?? sections[0].id)}>Predchádzajúca</button>
            <span role="status">Sekcia {activeOrganizationIndex + 1} z {sections.length}</span>
            <button type="button" disabled={activeOrganizationIndex >= sections.length - 1}
              onClick={() => navigateOrganizationPager(sections[activeOrganizationIndex + 1]?.id ?? sections[sections.length - 1].id)}>Ďalšia</button>
          </nav>
        </div>
      </div>
    </AdminEditorSectionVisibility.Provider>

    {imageEditorOpen && draft.imageUrl && <ImageDisplayEditor src={draft.imageUrl} alt={draft.name || "Organizácia"} title={draft.name} excerpt={draft.shortDescription} entityLabel="organizácie" thumbnailAspectRatio="4 / 3"
       thumbnail={draft.thumbnailImageDisplay ?? null} detail={draft.detailImageDisplay ?? null} onCancel={() => setImageEditorOpen(false)}
       onSave={(thumbnail, detail) => { patch({ thumbnailImageDisplay: thumbnail, detailImageDisplay: detail }); setImageEditorOpen(false); }} />}
    <AdminEditorFooter dirty={dirty} pending={saving}>
      {organization && <AdminRecordLifecycleActions kind="organizations" recordId={organization.id} status={organization.status} disabled={editingDisabled || saving || uploading} returnHref="/admin/organizacie" />}
      <div className="admin-editor-actions">
      <div><Link href="/admin/organizacie">← Späť na organizácie</Link></div>
      <div><AdminActionButton variant="primary" type="submit" disabled={editingDisabled || saving || uploading}>{saving ? "Ukladám…" : organization ? "Uložiť organizáciu" : "Vytvoriť koncept"}</AdminActionButton></div>
    </div>
    </AdminEditorFooter>
  </form>;
}
