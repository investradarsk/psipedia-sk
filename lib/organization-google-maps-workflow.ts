import {
  GOOGLE_MAPS_NOT_REQUIRED_ACTION,
  GOOGLE_MAPS_REQUIRED_AGAIN_ACTION,
  getGeoPointForTarget,
  hasExplicitPrivateGeoDecision,
  resetGoogleMapsNotRequired,
} from "@/lib/geo-store";
import type { GeoSourceLocation } from "@/lib/geo";
import { getOrganizationPublicationAdminById } from "@/lib/help-organization-admin-store";
import {
  listOrganizationLocationsAdmin,
  requireOrganizationLocationD1,
  type OrganizationLocationAdminRecord,
} from "@/lib/organization-location-admin-store";
import { createOrganizationLocationFromAdmin } from "@/lib/organization-location-admin-write";
import {
  discoverGoogleTargetPlaces,
  googlePlaceActionForSource,
} from "@/lib/google-place-target-discovery";
import { confirmAdminGooglePlace } from "@/lib/admin-google-place-confirmation";

export const ORGANIZATION_GOOGLE_MAPS_RESOURCE_TYPE = "HELP_ORGANIZATION";

function orderedLocations(items: OrganizationLocationAdminRecord[]) {
  return [...items].sort((left, right) =>
    Number(right.isPrimary) - Number(left.isPrimary)
    || left.sortOrder - right.sortOrder
    || left.id - right.id,
  );
}

export function preferredOrganizationSite(items: OrganizationLocationAdminRecord[]) {
  return orderedLocations(items.filter((item) => item.role === "SITE"))[0] ?? null;
}

function organizationHintLocation(items: OrganizationLocationAdminRecord[]) {
  return preferredOrganizationSite(items) ?? orderedLocations(items)[0] ?? null;
}

async function latestOrganizationWorkflowAction(organizationId: number) {
  const db = requireOrganizationLocationD1();
  const row = await db.prepare(`
    SELECT action
    FROM moderation_events
    WHERE resource_type = ?
      AND subject_id = ?
      AND action IN ('GOOGLE_MAPS_NOT_REQUIRED', 'GOOGLE_MAPS_REQUIRED_AGAIN')
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `).bind(ORGANIZATION_GOOGLE_MAPS_RESOURCE_TYPE, String(organizationId)).first<{ action: string }>();
  return row?.action ?? null;
}

export async function getOrganizationGoogleMapsWorkflowDecision(organizationId: number) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) return "UNRESOLVED" as const;
  return (await latestOrganizationWorkflowAction(organizationId)) === GOOGLE_MAPS_NOT_REQUIRED_ACTION
    ? "NOT_REQUIRED" as const
    : "UNRESOLVED" as const;
}

async function writeOrganizationWorkflowAction(input: {
  organizationId: number;
  action: typeof GOOGLE_MAPS_NOT_REQUIRED_ACTION | typeof GOOGLE_MAPS_REQUIRED_AGAIN_ACTION;
  actorRef: string;
  reasonCode: string;
}) {
  const db = requireOrganizationLocationD1();
  await db.prepare(`
    INSERT INTO moderation_events (
      id, submission_id, resource_type, subject_id, action, actor_type, actor_ref,
      from_status, to_status, reason_code, changed_fields_json, request_id, created_at
    ) VALUES (?, NULL, ?, ?, ?, 'ADMIN', ?, NULL, NULL, ?, ?, NULL, ?)
  `).bind(
    globalThis.crypto.randomUUID(),
    ORGANIZATION_GOOGLE_MAPS_RESOURCE_TYPE,
    String(input.organizationId),
    input.action,
    input.actorRef,
    input.reasonCode,
    JSON.stringify(["google_maps_workflow"]),
    new Date().toISOString(),
  ).run();
}

export async function setOrganizationGoogleMapsNotRequired(organizationId: number, actorRef: string) {
  const organization = await getOrganizationPublicationAdminById(organizationId);
  if (!organization) throw new Error("Organizácia sa nenašla.");
  if (await getOrganizationGoogleMapsWorkflowDecision(organizationId) === "NOT_REQUIRED") return;
  await writeOrganizationWorkflowAction({
    organizationId,
    action: GOOGLE_MAPS_NOT_REQUIRED_ACTION,
    actorRef,
    reasonCode: "ADMIN_MAP_REVIEW_COMPLETED_WITHOUT_GOOGLE_PLACE",
  });
}

export async function resetOrganizationGoogleMapsNotRequired(organizationId: number, actorRef: string) {
  const organization = await getOrganizationPublicationAdminById(organizationId);
  if (!organization) throw new Error("Organizácia sa nenašla.");
  if (await getOrganizationGoogleMapsWorkflowDecision(organizationId) !== "NOT_REQUIRED") return;
  await writeOrganizationWorkflowAction({
    organizationId,
    action: GOOGLE_MAPS_REQUIRED_AGAIN_ACTION,
    actorRef,
    reasonCode: "ADMIN_MAP_REVIEW_REOPENED",
  });
}

export async function loadOrganizationGoogleMapsProfile(organizationId: number) {
  const [organization, locations] = await Promise.all([
    getOrganizationPublicationAdminById(organizationId),
    listOrganizationLocationsAdmin(organizationId),
  ]);
  if (!organization) return null;

  const preferredSite = preferredOrganizationSite(locations);
  const hint = preferredSite ?? organizationHintLocation(locations);
  const source: GeoSourceLocation = {
    targetType: "ORGANIZATION_LOCATION",
    // Without a SITE this synthetic ID is discovery-only. No GEO write uses it.
    targetId: preferredSite?.id ?? hint?.id ?? organization.id,
    organizationId: organization.id,
    organizationName: organization.name,
    label: hint?.label || organization.name,
    category: organization.type,
    locationRole: preferredSite?.role ?? hint?.role ?? "UNSPECIFIED",
    address: hint?.address ?? "",
    city: hint?.city || organization.city || "",
    district: hint?.district || organization.district || "",
    region: hint?.region || organization.region || "",
    countryCode: hint?.countryCode || organization.countryCode || "SK",
    published: organization.status === "PUBLISHED" && !organization.archivedAt,
  };

  const point = preferredSite
    ? await getGeoPointForTarget("ORGANIZATION_LOCATION", preferredSite.id)
    : null;
  const explicitPrivate = preferredSite
    ? await hasExplicitPrivateGeoDecision("ORGANIZATION_LOCATION", preferredSite.id)
    : false;

  return {
    organization,
    locations,
    preferredSite,
    source,
    point,
    explicitPrivate,
    workflowDecision: await getOrganizationGoogleMapsWorkflowDecision(organization.id),
    googlePlaceAction: googlePlaceActionForSource(source),
    siteCount: locations.filter((item) => item.role === "SITE").length,
  };
}

export async function discoverOrganizationProfileGooglePlaces(organizationId: number) {
  const state = await loadOrganizationGoogleMapsProfile(organizationId);
  if (!state) throw new Error("Organizácia sa nenašla.");
  const policy = googlePlaceActionForSource(state.source);
  if (!policy.available) throw new Error(policy.reason);
  return {
    candidates: await discoverGoogleTargetPlaces(state.source),
    requiresSiteConfirmation: !state.preferredSite,
    representedSite: state.preferredSite,
    siteCount: state.siteCount,
  };
}

export async function confirmOrganizationProfileGooglePlace(input: {
  organizationId: number;
  placeId: string;
  actorRef: string;
  confirmOrganizationSite?: boolean;
}) {
  const placeId = input.placeId.trim();
  if (!placeId) throw new Error("Vyber konkrétne miesto z Google Maps.");

  // First server re-discovery uses organization-level hints, including the
  // no-location case. The client never supplies coordinates or address data.
  let state = await loadOrganizationGoogleMapsProfile(input.organizationId);
  if (!state) throw new Error("Organizácia sa nenašla.");
  const candidates = await discoverGoogleTargetPlaces(state.source);
  const selected = candidates.find((candidate) => candidate.id === placeId);
  if (!selected) {
    throw new Error("Vybraný Google Place sa už vo výsledkoch nenachádza. Vyhľadaj ho znova.");
  }

  // Re-read before creation. A SITE added by another action wins and prevents
  // duplicate rows on repeated/concurrent confirmation.
  state = await loadOrganizationGoogleMapsProfile(input.organizationId);
  if (!state) throw new Error("Organizácia sa nenašla.");

  let site = state.preferredSite;
  let createdSiteId: number | null = null;
  if (!site) {
    if (input.confirmOrganizationSite !== true) {
      throw new Error("Použitie Google kandidáta ako verejne navštevovaného SITE musí admin explicitne potvrdiť.");
    }
    const created = await createOrganizationLocationFromAdmin(input.organizationId, {
      role: "SITE",
      label: selected.displayName || state.organization.name,
      address: selected.formattedAddress,
      city: selected.address?.locality || selected.address?.sublocality || state.organization.city || "",
      district: selected.address?.district || state.organization.district || "",
      region: selected.address?.region || state.organization.region || "",
      countryCode: selected.address?.countryCode || state.organization.countryCode || "SK",
      isPrimary: state.locations.length === 0,
      sortOrder: 0,
    });
    if (!created) throw new Error("Verejne navštevované SITE sa nepodarilo vytvoriť.");
    site = created;
    createdSiteId = created.id;
  }

  const result = await confirmAdminGooglePlace({
    targetType: "ORGANIZATION_LOCATION",
    targetId: site.id,
    placeId,
    actorRef: input.actorRef,
    publicLocation: true,
    allowPrivateOverride: false,
  });

  // A confirmed concrete SITE re-opens any organization-level NOT_REQUIRED
  // decision. Target-level NOT_REQUIRED is also cleared by shared confirmation.
  await resetOrganizationGoogleMapsNotRequired(input.organizationId, input.actorRef);
  await resetGoogleMapsNotRequired({
    targetType: "ORGANIZATION_LOCATION",
    targetId: site.id,
    actorRef: input.actorRef,
  });

  return {
    ...result,
    createdSiteId: createdSiteId ?? result.createdSiteId,
    representedSiteId: site.id,
  };
}
