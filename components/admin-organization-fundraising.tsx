"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  ORGANIZATION_FUNDRAISING_METHOD_TYPES,
  ORGANIZATION_FUNDRAISING_OWNERSHIPS,
  type OrganizationFundraisingMethodType,
  type OrganizationFundraisingOwnership,
} from "@/lib/organization-fundraising-contract";
import type { OrganizationPublicationAdminItem } from "@/lib/help-organization-admin-store";
import type { OrganizationFundraisingMethodRecord } from "@/lib/organization-fundraising-store";

const typeLabels: Record<OrganizationFundraisingMethodType, string> = {
  MATERIAL_DONATION: "Materiálna pomoc",
  DONATION_PAGE: "Darovacia stránka",
  BANK_TRANSFER: "Bankový prevod",
  TRANSPARENT_ACCOUNT: "Transparentný účet",
  EXTERNAL_FUNDRAISER: "Externá zbierka",
};
const ownershipLabels: Record<OrganizationFundraisingOwnership, string> = {
  ORGANIZATION_OWNED: "Vlastní organizácia",
  THIRD_PARTY_CAMPAIGN: "Kampaň tretej strany",
};
const verificationLabels = {
  UNVERIFIED: "Neoverené",
  VERIFIED: "Overené",
  STALE: "Zastarané overenie",
  REJECTED: "Zamietnuté",
} as const;

type EditableDraft = {
  type: OrganizationFundraisingMethodType;
  label: string;
  url: string;
  value: string;
  instructions: string;
  beneficiaryIdentity: string;
  ownership: OrganizationFundraisingOwnership;
  sortOrder: number;
  isActive: boolean;
};

function emptyDraft(): EditableDraft {
  return {
    type: "DONATION_PAGE",
    label: "",
    url: "",
    value: "",
    instructions: "",
    beneficiaryIdentity: "",
    ownership: "ORGANIZATION_OWNED",
    sortOrder: 0,
    isActive: false,
  };
}

function toDraft(item: OrganizationFundraisingMethodRecord): EditableDraft {
  return {
    type: item.type,
    label: item.label,
    url: item.url ?? "",
    value: item.value ?? "",
    instructions: item.instructions ?? "",
    beneficiaryIdentity: item.beneficiaryIdentity ?? "",
    ownership: item.ownership,
    sortOrder: item.sortOrder,
    isActive: item.isActive,
  };
}

function toPayload(draft: EditableDraft) {
  return {
    ...draft,
    url: draft.url.trim() || null,
    value: draft.value.trim() || null,
    instructions: draft.instructions.trim() || null,
    beneficiaryIdentity: draft.beneficiaryIdentity.trim() || null,
  };
}

function sortMethods(items: OrganizationFundraisingMethodRecord[]) {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

function MethodFields({ draft, disabled, onChange, prefix }: {
  draft: EditableDraft;
  disabled?: boolean;
  onChange: (next: EditableDraft) => void;
  prefix: string;
}) {
  const needsUrl = draft.type === "DONATION_PAGE" || draft.type === "TRANSPARENT_ACCOUNT" || draft.type === "EXTERNAL_FUNDRAISER";
  const needsValue = draft.type === "BANK_TRANSFER" || draft.type === "TRANSPARENT_ACCOUNT" || draft.type === "MATERIAL_DONATION";
  return <div className="admin-field-grid">
    <div className="admin-field"><label htmlFor={`${prefix}-type`}>Typ *</label><select id={`${prefix}-type`} value={draft.type} disabled={disabled} onChange={(event) => onChange({ ...draft, type: event.target.value as OrganizationFundraisingMethodType })}>{ORGANIZATION_FUNDRAISING_METHOD_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}</select></div>
    <div className="admin-field"><label htmlFor={`${prefix}-ownership`}>Vlastníctvo *</label><select id={`${prefix}-ownership`} value={draft.ownership} disabled={disabled} onChange={(event) => onChange({ ...draft, ownership: event.target.value as OrganizationFundraisingOwnership })}>{ORGANIZATION_FUNDRAISING_OWNERSHIPS.map((ownership) => <option key={ownership} value={ownership}>{ownershipLabels[ownership]}</option>)}</select></div>
    <div className="admin-field"><label htmlFor={`${prefix}-label`}>Názov v admin rozhraní</label><input id={`${prefix}-label`} value={draft.label} disabled={disabled} onChange={(event) => onChange({ ...draft, label: event.target.value })}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-order`}>Poradie</label><input id={`${prefix}-order`} type="number" step="1" value={draft.sortOrder} disabled={disabled} onChange={(event) => onChange({ ...draft, sortOrder: Number(event.target.value) })}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-url`}>URL {needsUrl ? "*" : ""}</label><input id={`${prefix}-url`} type="url" inputMode="url" placeholder="https://…" value={draft.url} disabled={disabled} required={needsUrl} onChange={(event) => onChange({ ...draft, url: event.target.value })}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-value`}>{draft.type === "BANK_TRANSFER" || draft.type === "TRANSPARENT_ACCOUNT" ? "IBAN" : "Hodnota / údaj"} {draft.type === "BANK_TRANSFER" ? "*" : ""}</label><input id={`${prefix}-value`} value={draft.value} disabled={disabled} required={draft.type === "BANK_TRANSFER"} onChange={(event) => onChange({ ...draft, value: event.target.value })}/>{needsValue && <small>IBAN sa normalizuje na serveri; materiálna pomoc môže použiť štruktúrovanú hodnotu.</small>}</div>
    <div className="admin-field"><label htmlFor={`${prefix}-beneficiary`}>Identita príjemcu</label><input id={`${prefix}-beneficiary`} value={draft.beneficiaryIdentity} disabled={disabled} onChange={(event) => onChange({ ...draft, beneficiaryIdentity: event.target.value })}/></div>
    <div className="admin-field"><label htmlFor={`${prefix}-instructions`}>Inštrukcie</label><textarea id={`${prefix}-instructions`} rows={3} value={draft.instructions} disabled={disabled} onChange={(event) => onChange({ ...draft, instructions: event.target.value })}/></div>
  </div>;
}

export function AdminOrganizationFundraising({ organization, initialMethods }: {
  organization: OrganizationPublicationAdminItem;
  initialMethods: OrganizationFundraisingMethodRecord[];
}) {
  const [methods, setMethods] = useState(() => sortMethods(initialMethods));
  const [drafts, setDrafts] = useState<Record<number, EditableDraft>>(() => Object.fromEntries(initialMethods.map((item) => [item.id, toDraft(item)])));
  const [createDraft, setCreateDraft] = useState<EditableDraft>(() => emptyDraft());
  const [busyId, setBusyId] = useState<number | "create" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const activeMethods = useMemo(() => methods.filter((item) => !item.archivedAt), [methods]);
  const parentArchived = organization.status === "ARCHIVED" || Boolean(organization.archivedAt);

  async function responseItem(response: Response) {
    const body = await response.json() as { item?: OrganizationFundraisingMethodRecord; error?: string };
    if (!response.ok || !body.item) throw new Error(body.error || "Fundraising zmenu sa nepodarilo uložiť.");
    return body.item;
  }

  function mergeItem(item: OrganizationFundraisingMethodRecord) {
    setMethods((current) => sortMethods(current.some((candidate) => candidate.id === item.id)
      ? current.map((candidate) => candidate.id === item.id ? item : candidate)
      : [...current, item]));
    setDrafts((current) => ({ ...current, [item.id]: toDraft(item) }));
  }

  async function createMethod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (parentArchived) { setError("Archivovanej organizácii nemožno meniť fundraising metódy."); return; }
    setBusyId("create"); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/organizations/${organization.id}/fundraising`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: toPayload({ ...createDraft, isActive: false }) }),
      });
      const item = await responseItem(response); mergeItem(item); setCreateDraft(emptyDraft());
      setMessage("Fundraising metóda bola vytvorená ako neaktívna a UNVERIFIED.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Fundraising metódu sa nepodarilo vytvoriť."); }
    finally { setBusyId(null); }
  }

  async function saveMethod(item: OrganizationFundraisingMethodRecord) {
    const draft = drafts[item.id]; if (!draft) return;
    setBusyId(item.id); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/organizations/${organization.id}/fundraising/${item.id}`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ payload: toPayload(draft), expectedVersion: item.version }),
      });
      mergeItem(await responseItem(response));
      setMessage("Fundraising metóda bola uložená. Verification stav sa nemení bez samostatného verification workflow; citlivá zmena ho môže resetovať na UNVERIFIED.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Fundraising metódu sa nepodarilo uložiť."); }
    finally { setBusyId(null); }
  }

  async function archiveMethod(item: OrganizationFundraisingMethodRecord) {
    if (!window.confirm(`Archivovať fundraising metódu „${item.label || typeLabels[item.type]}“? Metóda sa deaktivuje a nebude sa ďalej upravovať.`)) return;
    setBusyId(item.id); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/admin/organizations/${organization.id}/fundraising/${item.id}`, {
        method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: item.version }),
      });
      mergeItem(await responseItem(response)); setMessage("Fundraising metóda bola archivovaná a deaktivovaná.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Fundraising metódu sa nepodarilo archivovať."); }
    finally { setBusyId(null); }
  }

  return <div className="admin-event-editor">
    <div className="admin-event-fields">
      <section className="admin-form-card admin-form-card--intro">
        <div className="admin-card-heading"><div><span>01</span><div><h2>Fundraising</h2><p>Správa canonical fundraising metód tejto organizácie. Verification je iba na čítanie a ORG-7D zostáva samostatný workflow.</p></div></div></div>
        <p className="admin-help"><strong>Trust contract:</strong> uloženie nikdy automaticky neznamená VERIFIED. Nová metóda vzniká vždy neaktívna + UNVERIFIED; zmena typu, cieľa, vlastníctva alebo identity príjemcu resetuje existujúce overenie.</p>
        <p className="admin-help">Organizácia: <strong>{organization.name}</strong> · stav {organization.status} · aktívne/nearchivované metódy {activeMethods.length}</p>{parentArchived && <p className="admin-message admin-message--error">Archivovaná organizácia je v ORG-7C iba na čítanie.</p>}
      </section>

      <form className="admin-form-card" onSubmit={createMethod}>
        <div className="admin-card-heading"><div><span>02</span><div><h2>Pridať fundraising metódu</h2><p>Vytvorenie je fail-closed: aktívny stav ani verification sa nedajú nastaviť.</p></div></div></div>
        <MethodFields draft={createDraft} disabled={parentArchived} onChange={setCreateDraft} prefix="fundraising-new" />
        <div className="admin-editor-actions"><button type="submit" disabled={parentArchived || busyId !== null}>{busyId === "create" ? "Vytváram…" : "Pridať metódu"}</button></div>
      </form>

      <section className="admin-form-card">
        <div className="admin-card-heading"><div><span>03</span><div><h2>Existujúce metódy</h2><p>Poradie sa ukladá číslom. Archivovanie je soft-delete a automaticky deaktivuje metódu.</p></div></div></div>
        {!methods.length && <p className="admin-help">Táto organizácia zatiaľ nemá fundraising metódy.</p>}
        {methods.map((item) => {
          const draft = drafts[item.id] ?? toDraft(item);
          const archived = Boolean(item.archivedAt);
          return <article className="admin-form-card" key={item.id} data-fundraising-method-id={item.id}>
            <div className="admin-card-heading"><div><span>#{item.id}</span><div><h3>{item.label || typeLabels[item.type]}</h3><p>{typeLabels[item.type]} · {ownershipLabels[item.ownership]} · verzia {item.version}{archived ? " · ARCHIVED" : ""}</p></div></div></div>
            <MethodFields draft={draft} disabled={parentArchived || archived || busyId === item.id} onChange={(next) => setDrafts((current) => ({ ...current, [item.id]: next }))} prefix={`fundraising-${item.id}`} />
            <div className="admin-field">
              <label><input type="checkbox" checked={draft.isActive} disabled={parentArchived || archived || busyId === item.id} onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, isActive: event.target.checked } }))}/> Aktívna metóda</label>
              <small>Aktivácia sama osebe nezabezpečí verejnú oprávnenosť; bez VERIFIED zostáva public eligibility fail-closed.</small>
            </div>
            <div className="admin-field-grid">
              <div className="admin-field"><label>Verification stav</label><input value={verificationLabels[item.verificationStatus]} readOnly aria-readonly="true"/><small>Spravuje ORG-7D, nie bežné CRUD uloženie.</small></div>
              <div className="admin-field"><label>Verification source</label><input value={item.verificationSourceUrl ?? "—"} readOnly aria-readonly="true"/></div>
              <div className="admin-field"><label>Overené</label><input value={item.verifiedAt ?? "—"} readOnly aria-readonly="true"/></div>
              <div className="admin-field"><label>Overenie expiruje</label><input value={item.verificationExpiresAt ?? "—"} readOnly aria-readonly="true"/></div>
              <div className="admin-field"><label>Platné do</label><input value={item.validUntil ?? "—"} readOnly aria-readonly="true"/></div>
            </div>
            {!archived && !parentArchived && <div className="admin-editor-actions"><button type="button" disabled={busyId !== null} onClick={() => saveMethod(item)}>{busyId === item.id ? "Ukladám…" : "Uložiť metódu"}</button><button type="button" disabled={busyId !== null} onClick={() => archiveMethod(item)}>Archivovať</button></div>}
          </article>;
        })}
      </section>
    </div>
    {message && <p className="admin-message" role="status">{message}</p>}
    {error && <p className="admin-message admin-message--error" role="alert">{error}</p>}
    <div className="admin-editor-actions"><Link href="/admin/organizacie">← Späť na organizácie</Link></div>
  </div>;
}
