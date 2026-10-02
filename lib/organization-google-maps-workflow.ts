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
import {
  createOrganizationLocationFromAdmin,
  isOrganizationLocationMutationConflict,
} from "@/lib/organization-location-admin-write";
import {
  discoverGoogleTargetPlaces,
  googlePlaceActionForSource,
} from "@/lib/google-place-target-discovery";
import { confirmAdminGooglePlace } from "@/lib/admin-google-place-confirmation";

export const ORGANIZATION_GOOGLE_MAPS_RESOURCE_TYPE = "HELP_ORGANIZATION";

function orderedLocations(items: OrganizationLocationAdminRecord[]) {
  return [...items].sort((left, right) =>
    (left.role === "SITE" ? 0 : 1) - (right.role === "SITE" ? 0 : 1)
    || Number(right.isPrimary) - Number(left.isPrimary)
    || left.sortOrder - right.sortOrder
    || left.id - right.id,
  );
}

export function canonicalOrganizationLocation(items: OrganizationLocationAdminRecord[]) {
  return orderedLocations(items)[0] ?? null;
}

export function preferredOrganizationSite(items: OrganizationLocationAdminRecord[]) {
  return orderedLocations(items.filter((item) => item.role === "SITE"))[0] ?? null;
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

  const canonicalLocation = canonicalOrganizationLocation(locations);
  const source: GeoSourceLocation = {
    targetType: "ORGANIZATION_LOCATION",
    targetId: canonicalLocation?.id ?? organization.id,
    organizationId: organization.id,
    organizationName: organization.name,
    label: canonicalLocation?.label || organization.name,
    category: organization.type,
    locationRole: canonicalLocation?.role ?? "UNSPECIFIED",
    address: canonicalLocation?.address || organization.address || "",
    city: canonicalLocation?.city || organization.city || "",
    district: canonicalLocation?.district || organization.district || "",
    region: canonicalLocation?.region || organization.region || "",
    countryCode: canonicalLocation?.countryCode || organization.countryCode || "SK",
    published: organization.status === "PUBLISHED" && !organization.archivedAt,
  };

  const point = canonicalLocation
    ? await getGeoPointForTarget("ORGANIZATION_LOCATION", canonicalLocation.id)
    : null;
  const explicitPrivate = canonicalLocation
    ? await hasExplicitPrivateGeoDecision("ORGANIZATION_LOCATION", canonicalLocation.id)
    : false;

  return {
    organization,
    locations,
    canonicalLocation,
    source,
    point,
    explicitPrivate,
    workflowDecision: await getOrganizationGoogleMapsWorkflowDecision(organization.id),
    googlePlaceAction: googlePlaceActionForSource(source),
  };
}

export async function discoverOrganizationProfileGooglePlaces(organizationId: number) {
  const state = await loadOrganizationGoogleMapsProfile(organizationId);
  if (!state) throw new Error("Organizácia sa nenašla.");
  const policy = googlePlaceActionForSource(state.source);
  if (!policy.available) throw new Error(policy.reason);
  return {
    candidates: await discoverGoogleTargetPlaces(state.source),
    representedLocation: state.canonicalLocation,
    locationCount: state.locations.length,
  };
}

export async function confirmOrganizationProfileGooglePlace(input: {
  organizationId: number;
  placeId: string;
  actorRef: string;
}) {
  const placeId = input.placeId.trim();
  if (!placeId) throw new Error("Vyber konkrétne miesto z Google Maps.");

  let state = await loadOrganizationGoogleMapsProfile(input.organizationId);
  if (!state) throw new Error("Organizácia sa nenašla.");
  const candidates = await discoverGoogleTargetPlaces(state.source);
  const selected = candidates.find((candidate) => candidate.id === placeId);
  if (!selected) {
    throw new Error("Vybraný Google Place sa už vo výsledkoch nenachádza. Vyhľadaj ho znova.");
  }

  state = await loadOrganizationGoogleMapsProfile(input.organizationId);
  if (!state) throw new Error("Organizácia sa nenašla.");

  let location = state.canonicalLocation;
  let createdLocationId: number | null = null;
  if (!location) {
    try {
      const created = await createOrganizationLocationFromAdmin(input.organizationId, {
        role: "SITE",
        label: "",
        address: selected.formattedAddress,
        city: selected.address?.locality || selected.address?.sublocality || state.organization.city || "",
        district: selected.address?.district || state.organization.district || "",
        region: selected.address?.region || state.organization.region || "",
        countryCode: selected.address?.countryCode || state.organization.countryCode || "SK",
        isPrimary: true,
        sortOrder: 0,
      });
      if (!created) throw new Error("Adresu organizácie sa nepodarilo vytvoriť.");
      location = created;
      createdLocationId = created.id;
    } catch (error) {
      if (!isOrganizationLocationMutationConflict(error)) throw error;
      state = await loadOrganizationGoogleMapsProfile(input.organizationId);
      location = state?.canonicalLocation ?? null;
      if (!location) throw error;
    }
  }

  const result = await confirmAdminGooglePlace({
    targetType: "ORGANIZATION_LOCATION",
    targetId: location.id,
    placeId,
    actorRef: input.actorRef,
    publicLocation: true,
    allowPrivateOverride: false,
  });

  await resetOrganizationGoogleMapsNotRequired(input.organizationId, input.actorRef);
  await resetGoogleMapsNotRequired({
    targetType: "ORGANIZATION_LOCATION",
    targetId: location.id,
    actorRef: input.actorRef,
  });

  return {
    ...result,
    createdLocationId,
    representedLocationId: location.id,
  };
}
