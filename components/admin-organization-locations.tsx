"use client";

import { FormEvent, useState, useSyncExternalStore } from "react";
import type { OrganizationLocationAdminInput } from "@/lib/organization-location-admin";
import type { OrganizationPublicationAdminItem } from "@/lib/help-organization-admin-store";
import type { OrganizationLocationAdminRecord } from "@/lib/organization-location-admin-store";

type AddressDraft = Pick<
  OrganizationLocationAdminInput,
  "address" | "city" | "district" | "region" | "countryCode"
>;

function canonicalLocation(items: OrganizationLocationAdminRecord[]) {
  return [...items].sort((left, right) =>
    (left.role === "SITE" ? 0 : 1) - (right.role === "SITE" ? 0 : 1)
    || Number(right.isPrimary) - Number(left.isPrimary)
    || left.sortOrder - right.sortOrder
    || left.id - right.id,
  )[0] ?? null;
}

function draftFromLocation(
  organization: OrganizationPublicationAdminItem,
  location: OrganizationLocationAdminRecord | null,
): AddressDraft {
  return {
    address: location?.address || organization.address || "",
    city: location?.city || organization.city || "",
    district: location?.district || organization.district || "",
    region: location?.region || organization.region || "",
    countryCode: location?.countryCode || organization.countryCode || "SK",
  };
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
  const [location, setLocation] = useState<OrganizationLocationAdminRecord | null>(() => canonicalLocation(initialLocations));
  const [draft, setDraft] = useState<AddressDraft>(() => draftFromLocation(organization, canonicalLocation(initialLocations)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const archived = organization.status === "ARCHIVED" || Boolean(organization.archivedAt);
  const disabled = !hydrated || archived || busy;

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload: OrganizationLocationAdminInput = {
        // Internal storage detail only. Admin UX intentionally has no location-role model.
        role: location?.role ?? "SITE",
        label: location?.label ?? "",
        address: draft.address,
        city: draft.city,
        district: draft.district,
        region: draft.region,
        countryCode: draft.countryCode || "SK",
        isPrimary: true,
        sortOrder: 0,
      };
      const endpoint = location
        ? `/api/admin/organizations/${organization.id}/locations/${location.id}`
        : `/api/admin/organizations/${organization.id}/locations`;
      const response = await fetch(endpoint, {
        method: location ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      const body = await response.json() as { item?: OrganizationLocationAdminRecord; error?: string };
      if (!response.ok || !body.item) throw new Error(body.error || "Adresu sa nepodarilo uložiť.");
      setLocation(body.item);
      setDraft(draftFromLocation(organization, body.item));
      setMessage("Adresa bola uložená.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Adresu sa nepodarilo uložiť.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-event-editor" data-organization-address-admin data-single-address>
      <form className="admin-form-card" onSubmit={saveAddress}>
        <div className="admin-card-heading">
          <div>
            <span>01</span>
            <div>
              <h2>Adresa</h2>
              <p>Jedna canonical adresa organizácie.</p>
            </div>
          </div>
        </div>

        <div className="admin-field-grid">
          <div className="admin-field">
            <label htmlFor="organization-address">Adresa</label>
            <input
              id="organization-address"
              value={draft.address}
              disabled={disabled}
              onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="organization-city">Mesto</label>
            <input
              id="organization-city"
              value={draft.city}
              disabled={disabled}
              onChange={(event) => setDraft((current) => ({ ...current, city: event.target.value }))}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="organization-district">Okres</label>
            <input
              id="organization-district"
              value={draft.district}
              disabled={disabled}
              onChange={(event) => setDraft((current) => ({ ...current, district: event.target.value }))}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="organization-region">Kraj</label>
            <input
              id="organization-region"
              value={draft.region}
              disabled={disabled}
              onChange={(event) => setDraft((current) => ({ ...current, region: event.target.value }))}
            />
          </div>
          <div className="admin-field">
            <label htmlFor="organization-country">Krajina</label>
            <input
              id="organization-country"
              value={draft.countryCode}
              disabled={disabled}
              maxLength={2}
              onChange={(event) => setDraft((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))}
            />
          </div>
        </div>

        {archived ? <p className="admin-message admin-message--error">Archivovaná organizácia je iba na čítanie.</p> : null}
        {!archived ? (
          <div className="admin-editor-actions">
            <button type="submit" disabled={disabled}>{busy ? "Ukladám…" : "Uložiť adresu"}</button>
          </div>
        ) : null}
        {message ? <p className="admin-message" role="status">{message}</p> : null}
        {error ? <p className="admin-message admin-message--error" role="alert">{error}</p> : null}
      </form>
    </div>
  );
}
