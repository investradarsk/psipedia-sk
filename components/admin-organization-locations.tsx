"use client";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import { AdminGeoLocation } from "@/components/admin-geo-location";
import {
  ORGANIZATION_LOCATION_ROLES,
  type OrganizationLocationAdminInput,
  type OrganizationLocationRole,
} from "@/lib/organization-location-admin";
import type { OrganizationPublicationAdminItem } from "@/lib/help-organization-admin-store";
import type { OrganizationLocationAdminRecord } from "@/lib/organization-location-admin-store";

const roleLabels: Record<OrganizationLocationRole, string> = {
  UNSPECIFIED: "Neurčená",
  SITE: "Prevádzka",
  LEGAL_SEAT: "Sídlo",
  SERVICE_AREA: "Pôsobnosť",
};

type EditableDraft = OrganizationLocationAdminInput;

function emptyDraft(): EditableDraft {
  return {
    role: "UNSPECIFIED",
    label: "",
    address: "",
    city: "",
    district: "",
    region: "",
    countryCode: "SK",
    isPrimary: false,
    sortOrder: 0,
  };
}

function toDraft(item: OrganizationLocationAdminRecord): EditableDraft {
  return {
    role: item.role,
    label: item.label,
    address: item.address,
    city: item.city,
    district: item.district,
    region: item.region,
    countryCode: item.countryCode,
    isPrimary: item.isPrimary,
    sortOrder: item.sortOrder,
  };
}

function sortLocations(items: OrganizationLocationAdminRecord[]) {
  return [...items].sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
}

function LocationFields({ draft, disabled, onChange, prefix }: {
  draft: EditableDraft;
  disabled?: boolean;
  onChange: (next: EditableDraft) => void;
  prefix: string;
}) {
  return <div className="admin-field-grid">
    <div className="admin-field">
      <label htmlFor={`${prefix}-role`}>Typ lokality</label>
      <select id={`${prefix}-role`} value={draft.role} disabled={disabled} onChange={(event) => onChange({ ...draft, role: event.target.value as OrganizationLocationRole })}>
        {ORGANIZATION_LOCATION_ROLES.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
      </select>
    </div>
    <div className="admin-field"><label htmlFor={`${prefix}-label`}>Názov / štítok</label><input id={`${prefix}-label`} value={draft.label} disabled={disabled} onChange={(event) => onChange({ ...draft, label: event.target.value })}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-address`}>Adresa</label><input id={`${prefix}-address`} value={draft.address} disabled={disabled} onChange={(event) => onChange({ ...draft, address: event.target.value })}/><small>Canonical admin údaj. Verejný ORG-2B read contract ulicu nezobrazuje.</small></div>
    <div className="admin-field"><label htmlFor={`${prefix}-city`}>Mesto</label><input id={`${prefix}-city`} value={draft.city} disabled={disabled} onChange={(event) => onChange({ ...draft, city: event.target.value })}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-district`}>Okres</label><input id={`${prefix}-district`} value={draft.district} disabled={disabled} onChange={(event) => onChange({ ...draft, district: event.target.value })}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-region`}>Kraj</label><input id={`${prefix}-region`} value={draft.region} disabled={disabled} onChange={(event) => onChange({ ...draft, region: event.target.value })}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-country`}>Kód krajiny</label><input id={`${prefix}-country`} value={draft.countryCode} disabled={disabled} onChange={(event) => onChange({ ...draft, countryCode: event.target.value })}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-order`}>Poradie</label><input id={`${prefix}-order`} type="number" step="1" value={draft.sortOrder} disabled={disabled} onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })}/><small>Deterministické poradie: sort_order, potom ID.</small></div>
    <div className="admin-field"><label><input type="checkbox" checked={draft.isPrimary} disabled={disabled} onChange={(event) => onChange({ ...draft, isPrimary: event.target.checked })}/> Hlavná lokalita</label><small>Contract povoľuje najviac jednu hlavnú lokalitu; nulový primary stav je platný.</small></div>
  </div>;
}

export function AdminOrganizationLocations({ organization, initialLocations }: {
  organization: OrganizationPublicationAdminItem;
  initialLocations: OrganizationLocationAdminRecord[];
}) {
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  const [locations, setLocations] = useState(() => sortLocations(initialLocations));
  const [drafts, setDrafts] = useState<Record<number, EditableDraft>>(() => Object.fromEntries(initialLocations.map((item) => [item.id, toDraft(item)])));
  const [createDraft, setCreateDraft] = useState<EditableDraft>(() => emptyDraft());
  const [busyId, setBusyId] = useState<number | "create" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const parentArchived = organization.status === "ARCHIVED" || Boolean(organization.archivedAt);
  const editingDisabled = !hydrated || parentArchived;
  const primaryId = useMemo(() => locations.find((item) => item.isPrimary)?.id ?? null, [locations]);

  async function responseItem(response: Response) {
    const body = await response.json() as { item?: OrganizationLocationAdminRecord; error?: string };
    if (!response.ok || !body.item) throw new Error(body.error || "Zmenu lokality sa nepodarilo uložiť.");
    return body.item;
  }

  function mergeItem(item: OrganizationLocationAdminRecord) {
    setLocations((current) => sortLocations(current.some((candidate) => candidate.id === item.id)
      ? current.map((candidate) => candidate.id === item.id ? item : item.isPrimary ? { ...candidate, isPrimary: false } : candidate)
      : [...current.map((candidate) => item.isPrimary ? { ...candidate, isPrimary: false } : candidate), item]));
    setDrafts((current) => {
      const next = { ...current, [item.id]: toDraft(item) };
      if (item.isPrimary) {
        for (const candidate of locations) {
          if (candidate.id !== item.id && next[candidate.id]) next[candidate.id] = { ...next[candidate.id], isPrimary: false };
        }
      }
      return next;
    });
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editingDisabled) { if (parentArchived) setError("Archivovanej organizácii nemožno meniť lokality."); return; }
    setBusyId("create"); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/organizations/${organization.id}/locations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: createDraft }) });
      const item = await responseItem(response); mergeItem(item); setCreateDraft(emptyDraft()); setMessage("Lokalita bola pridaná.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Lokalitu sa nepodarilo pridať."); }
    finally { setBusyId(null); }
  }

  async function saveLocation(item: OrganizationLocationAdminRecord) {
    const draft = drafts[item.id]; if (!draft) return;
    setBusyId(item.id); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/organizations/${organization.id}/locations/${item.id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: draft }) });
      mergeItem(await responseItem(response)); setMessage("Lokalita bola uložená.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Lokalitu sa nepodarilo uložiť."); }
    finally { setBusyId(null); }
  }

  async function deleteLocation(item: OrganizationLocationAdminRecord) {
    const suffix = item.isPrimary ? " Je to aktuálna hlavná lokalita; contract automaticky nepovýši inú lokalitu." : "";
    if (!window.confirm(`Odstrániť lokalitu „${item.label || item.city || `#${item.id}`}“? Ide o hard delete canonical riadku.${suffix}`)) return;
    setBusyId(item.id); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/organizations/${organization.id}/locations/${item.id}`, { method: "DELETE" });
      const body = await response.json() as { deleted?: boolean; error?: string };
      if (!response.ok || !body.deleted) throw new Error(body.error || "Lokalitu sa nepodarilo odstrániť.");
      setLocations((current) => current.filter((candidate) => candidate.id !== item.id));
      setDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
      setMessage("Lokalita bola odstránená.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Lokalitu sa nepodarilo odstrániť."); }
    finally { setBusyId(null); }
  }

  return <div className="admin-event-editor" data-organization-locations-admin>
    <div className="admin-event-fields">
      <section className="admin-form-card admin-form-card--intro">
        <div className="admin-card-heading"><div><span>01</span><div><h2>Lokality</h2><p>Správa canonical <code>organization_locations</code> pre túto organizáciu.</p></div></div></div>
        <p className="admin-help">Canonical authority sú child rows. Legacy location polia sa tu nezapisujú. Pri nulovom počte child rows zostáva aktívny ORG-2A legacy fallback.</p>
        <p className="admin-help">Organizácia: <strong>{organization.name}</strong> · lokality {locations.length} · primary {primaryId ? `#${primaryId}` : "žiadna"}</p>
        {parentArchived && <p className="admin-message admin-message--error">Archivovaná organizácia je iba na čítanie.</p>}
      </section>
      <form className="admin-form-card" data-location-create onSubmit={createLocation}>
        <div className="admin-card-heading"><div><span>02</span><div><h2>Pridať lokalitu</h2><p>Nový riadok vznikne priamo v canonical location modeli.</p></div></div></div>
        <LocationFields draft={createDraft} disabled={editingDisabled || busyId !== null} onChange={setCreateDraft} prefix="location-new" />
        <div className="admin-editor-actions"><button type="submit" disabled={editingDisabled || busyId !== null}>{busyId === "create" ? "Pridávam…" : "Pridať lokalitu"}</button></div>
      </form>
      <section className="admin-form-card">
        <div className="admin-card-heading"><div><span>03</span><div><h2>Existujúce lokality</h2><p>Poradie je deterministické podľa sort_order a ID. Model nemá version ani archived_at, preto edit nie je OCC-versioned a odstránenie je hard delete.</p></div></div></div>
        {!locations.length && <p className="admin-help">Táto organizácia nemá canonical location rows.</p>}
        {locations.map((item) => {
          const draft = drafts[item.id] ?? toDraft(item); const disabled = editingDisabled || busyId === item.id;
          return <article className="admin-form-card" key={item.id} data-location-id={item.id}>
            <div className="admin-card-heading"><div><span>#{item.id}</span><div><h3>{item.label || roleLabels[item.role]}</h3><p>{item.city || "Bez mesta"} · poradie {item.sortOrder}{item.isPrimary ? " · Hlavná lokalita" : ""}</p></div></div></div>
            <LocationFields draft={draft} disabled={disabled} onChange={(next) => setDrafts((current) => ({ ...current, [item.id]: next }))} prefix={`location-${item.id}`} />
            {!parentArchived && <div className="admin-editor-actions"><button type="button" disabled={!hydrated || busyId !== null} onClick={() => saveLocation(item)}>{busyId === item.id ? "Pracujem…" : "Uložiť lokalitu"}</button><button type="button" disabled={!hydrated || busyId !== null} onClick={() => deleteLocation(item)}>Odstrániť lokalitu</button></div>}
            <AdminGeoLocation targetType="ORGANIZATION_LOCATION" targetId={item.id} sensitive={item.role !== "SITE"} />
          </article>;
        })}
      </section>
    </div>
    {message && <p className="admin-message" role="status">{message}</p>}
    {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
  </div>;
}
