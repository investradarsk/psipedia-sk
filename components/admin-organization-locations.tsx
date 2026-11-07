"use client";

import type { OrganizationLocationAdminInput } from "@/lib/organization-location-admin";
import type { OrganizationPublicationAdminItem } from "@/lib/help-organization-admin-store";
import type { OrganizationLocationAdminRecord } from "@/lib/organization-location-admin-store";

export type OrganizationAddressDraft = Pick<
  OrganizationLocationAdminInput,
  "address" | "city" | "district" | "region" | "countryCode"
>;

/** Keep the historical SITE/primary ordering. Never choose another address at random. */
export function canonicalOrganizationLocation(items: OrganizationLocationAdminRecord[]) {
  return [...items].sort((left, right) =>
    (left.role === "SITE" ? 0 : 1) - (right.role === "SITE" ? 0 : 1)
    || Number(right.isPrimary) - Number(left.isPrimary)
    || left.sortOrder - right.sortOrder
    || left.id - right.id,
  )[0] ?? null;
}

export function organizationAddressDraftFromLocation(
  organization: OrganizationPublicationAdminItem | null | undefined,
  location: OrganizationLocationAdminRecord | null,
): OrganizationAddressDraft {
  return {
    address: location?.address || organization?.address || "",
    city: location?.city || organization?.city || "",
    district: location?.district || organization?.district || "",
    region: location?.region || organization?.region || "",
    countryCode: location?.countryCode || organization?.countryCode || "SK",
  };
}

/**
 * Address inputs are part of the *same* organization form and save action.
 * This deliberately has no nested form element, extra submit or independent API call.
 * The canonical address/location API is invoked by AdminOrganizationEditor.
 */
export function AdminOrganizationLocations({
  draft,
  onChange,
  disabled,
}: {
  draft: OrganizationAddressDraft;
  onChange: (changes: Partial<OrganizationAddressDraft>) => void;
  disabled: boolean;
}) {
  return (
    <div data-organization-address-admin data-single-address>
      <div className="admin-field-grid">
        <div className="admin-field">
          <label htmlFor="organization-address">Adresa</label>
          <input id="organization-address" value={draft.address} disabled={disabled}
            onChange={(event) => onChange({ address: event.target.value })} />
        </div>
        <div className="admin-field">
          <label htmlFor="organization-city">Mesto</label>
          <input id="organization-city" value={draft.city} disabled={disabled}
            onChange={(event) => onChange({ city: event.target.value })} />
        </div>
        <div className="admin-field">
          <label htmlFor="organization-district">Okres</label>
          <input id="organization-district" value={draft.district} disabled={disabled}
            onChange={(event) => onChange({ district: event.target.value })} />
        </div>
        <div className="admin-field">
          <label htmlFor="organization-region">Kraj</label>
          <input id="organization-region" value={draft.region} disabled={disabled}
            onChange={(event) => onChange({ region: event.target.value })} />
        </div>
        <div className="admin-field">
          <label htmlFor="organization-country">Kód krajiny</label>
          <input id="organization-country" value={draft.countryCode} disabled={disabled} maxLength={2}
            onChange={(event) => onChange({ countryCode: event.target.value.toUpperCase() })} />
        </div>
      </div>
      <p className="admin-help">Miesto a adresu upravuj iba podľa overených údajov. Google Place ID sa nemení, pokiaľ nezmeníš adresu alebo nepotvrdíš iné miesto.</p>
    </div>
  );
}
