import type { GeoTargetType } from "@/lib/geo";
import {
  applyGooglePlaceResolution,
  getGeoPointForTarget,
  getGeoSourceLocation,
  hasExplicitPrivateGeoDecision,
  initializeGeoPointForTarget,
  resetGoogleMapsNotRequired,
  setGeoVisibility,
  setGoogleMapsNotRequired,
} from "@/lib/geo-store";
import {
  discoverGoogleTargetPlaces,
  googlePlaceActionForSource,
  googlePlaceConfirmationForSource,
} from "@/lib/google-place-target-discovery";
import { updateManagedDirectoryProfileFromGooglePlace } from "@/lib/directory-store";
import { createOrganizationLocationFromAdmin } from "@/lib/organization-location-admin-write";

export type AdminGooglePlaceConfirmationInput = {
  targetType: GeoTargetType;
  targetId: number;
  placeId: string;
  actorRef: string;
  publicLocation?: boolean;
  allowPrivateOverride?: boolean;
  confirmOrganizationSite?: boolean;
};

export async function confirmAdminGooglePlace(input: AdminGooglePlaceConfirmationInput) {
  const placeId = input.placeId.trim();
  if (!placeId) throw new Error("Vyber konkrétne miesto z Google Maps.");

  const source = await getGeoSourceLocation(input.targetType, input.targetId);
  if (!source) throw new Error("Canonical target sa nenašiel.");

  const discoveryPolicy = googlePlaceActionForSource(source);
  if (!discoveryPolicy.available) throw new Error(discoveryPolicy.reason);

  // Server je authority: confirmation nikdy neverí candidate detailom z klienta.
  // Discovery sa zopakuje a Place ID sa prijme iba ak je stále medzi kandidátmi.
  const candidates = await discoverGoogleTargetPlaces(source);
  const selected = candidates.find((candidate) => candidate.id === placeId);
  if (!selected) {
    throw new Error("Vybraný Google Place sa už vo výsledkoch nenachádza. Vyhľadaj ho znova.");
  }

  let effectiveTargetType: GeoTargetType = input.targetType;
  let effectiveTargetId = input.targetId;
  let effectiveSource = source;
  let createdSiteId: number | null = null;

  if (source.targetType === "ORGANIZATION_LOCATION" && source.locationRole !== "SITE") {
    if (input.confirmOrganizationSite !== true) {
      throw new Error("Použitie Google kandidáta ako verejne navštevovaného SITE musí admin explicitne potvrdiť.");
    }
    if (!source.organizationId) {
      throw new Error("Organizáciu pre novú SITE lokalitu sa nepodarilo určiť.");
    }

    const created = await createOrganizationLocationFromAdmin(source.organizationId, {
      role: "SITE",
      label: selected.displayName || source.organizationName || source.label,
      address: selected.formattedAddress,
      city: selected.address?.locality || selected.address?.sublocality || source.city || "",
      district: selected.address?.district || source.district || "",
      region: selected.address?.region || source.region || "",
      countryCode: selected.address?.countryCode || source.countryCode || "SK",
      isPrimary: false,
      sortOrder: 0,
    });
    if (!created) throw new Error("Verejne navštevované SITE sa nepodarilo vytvoriť.");

    createdSiteId = created.id;
    effectiveTargetType = "ORGANIZATION_LOCATION";
    effectiveTargetId = created.id;
    const createdSource = await getGeoSourceLocation(effectiveTargetType, effectiveTargetId);
    if (!createdSource) throw new Error("Nové SITE sa po vytvorení nepodarilo načítať.");
    effectiveSource = createdSource;
  }

  const confirmationPolicy = googlePlaceConfirmationForSource(effectiveSource);
  if (!confirmationPolicy.available) throw new Error(confirmationPolicy.reason);

  let point = await getGeoPointForTarget(effectiveTargetType, effectiveTargetId);
  if (point?.manualOverride) {
    throw new Error("Poloha má manuálny GEO override. Google Place ho nesmie potichu prepísať.");
  }

  const explicitPrivate = await hasExplicitPrivateGeoDecision(effectiveTargetType, effectiveTargetId);
  const publicLocation = input.publicLocation !== false;
  const allowPrivateOverride = input.allowPrivateOverride === true;
  if (publicLocation && explicitPrivate && !allowPrivateOverride) {
    throw new Error("Poloha bola explicitne nastavená ako neverejná. Zmenu na verejnú potvrď priamo v editore položky.");
  }

  let profile = null;
  if (effectiveTargetType === "DIRECTORY_PROFILE") {
    profile = await updateManagedDirectoryProfileFromGooglePlace(effectiveTargetId, selected, input.actorRef);
    if (!profile) throw new Error("Profil sa nenašiel.");
  }

  point = await getGeoPointForTarget(effectiveTargetType, effectiveTargetId);
  if (!point) {
    point = (await initializeGeoPointForTarget(effectiveTargetType, effectiveTargetId, input.actorRef)).point;
  }
  if (point.manualOverride) {
    throw new Error("Poloha má manuálny GEO override. Google Place ho nesmie prepísať.");
  }

  if (!publicLocation) {
    point = await setGeoVisibility({
      targetType: effectiveTargetType,
      targetId: effectiveTargetId,
      visibility: "HIDDEN",
      precision: null,
      actorRef: input.actorRef,
      reason: "GOOGLE_PLACE_CONFIRMED_PRIVATE",
    });
    return { profile, point, googlePlaceId: selected.id, createdSiteId };
  }

  if (point.publicVisibility !== "EXACT_PUBLIC" || point.publicPrecision !== "EXACT") {
    point = await setGeoVisibility({
      targetType: effectiveTargetType,
      targetId: effectiveTargetId,
      visibility: "EXACT_PUBLIC",
      precision: "EXACT",
      actorRef: input.actorRef,
      reason: explicitPrivate ? "GOOGLE_PLACE_EXPLICIT_PRIVATE_OVERRIDE" : "GOOGLE_PLACE_CONFIRMED",
    });
  }

  point = await applyGooglePlaceResolution({
    targetType: effectiveTargetType,
    targetId: effectiveTargetId,
    place: {
      id: selected.id,
      latitude: selected.latitude,
      longitude: selected.longitude,
    },
  });
  await resetGoogleMapsNotRequired({
    targetType: effectiveTargetType,
    targetId: effectiveTargetId,
    actorRef: input.actorRef,
  });

  // Legacy/non-SITE target remains unchanged. Its own Google workflow is closed
  // so Admin → Mapy does not keep offering the same non-SITE row after SITE creation.
  if (createdSiteId !== null) {
    await setGoogleMapsNotRequired({
      targetType: input.targetType,
      targetId: input.targetId,
      actorRef: input.actorRef,
      reason: "ADMIN_SITE_CREATED_FROM_GOOGLE_PLACE",
    });
  }

  return { profile, point, googlePlaceId: selected.id, createdSiteId };
}
