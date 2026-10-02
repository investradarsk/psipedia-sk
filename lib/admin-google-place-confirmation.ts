import type { GeoTargetType } from "@/lib/geo";
import {
  applyGooglePlaceResolution,
  getGeoPointForTarget,
  getGeoSourceLocation,
  hasExplicitPrivateGeoDecision,
  initializeGeoPointForTarget,
  resetGoogleMapsNotRequired,
  setGeoVisibility,
} from "@/lib/geo-store";
import {
  discoverGoogleTargetPlaces,
  googlePlaceActionForSource,
  googlePlaceConfirmationForSource,
} from "@/lib/google-place-target-discovery";
import { updateManagedDirectoryProfileLocationFromGooglePlace } from "@/lib/directory-store";

export type AdminGooglePlaceConfirmationInput = {
  targetType: GeoTargetType;
  targetId: number;
  placeId: string;
  actorRef: string;
  publicLocation?: boolean;
  allowPrivateOverride?: boolean;
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

  const effectiveTargetType: GeoTargetType = input.targetType;
  const effectiveTargetId = input.targetId;
  const effectiveSource = source;

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
    profile = await updateManagedDirectoryProfileLocationFromGooglePlace(effectiveTargetId, selected, input.actorRef);
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

  return { profile, point, googlePlaceId: selected.id, createdSiteId: null };

}
