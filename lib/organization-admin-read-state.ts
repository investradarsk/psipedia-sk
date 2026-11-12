import type { OrganizationPublicationAdminItem } from "./help-organization-admin-store.ts";
import type { OrganizationLocationAdminRecord } from "./organization-location-admin-store.ts";

/** Imported older records can have NULL in fields now typed as strings.
 * Normalize only the read projection, never persist an invented value.
 */
export function organizationAdminReadText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Keep 404 distinct from D1 errors without ever treating a failed address
 * read as an empty list that could erase confirmed location data on Save.
 * All reads have already settled concurrently; no extra D1 calls are needed.
 */
export function resolveOrganizationEditorReads(
  organizationResult: PromiseSettledResult<OrganizationPublicationAdminItem | null>,
  locationsResult: PromiseSettledResult<OrganizationLocationAdminRecord[]>,
): { organization: OrganizationPublicationAdminItem; locations: OrganizationLocationAdminRecord[] } | null {
  if (organizationResult.status === "rejected") throw organizationResult.reason;
  const organization = organizationResult.value;
  if (!organization) return null;
  if (locationsResult.status === "rejected") throw locationsResult.reason;
  return { organization, locations: locationsResult.value };
}
