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
import { getManagedDirectoryProfileById, updateManagedDirectoryProfileLocationFromGooglePlace } from "@/lib/directory-store";
import { getManagedEventById, updateManagedEventLocationFromGooglePlace } from "@/lib/event-store";
import { adaptAddressGeo, adaptDirectoryAddress } from "@/lib/admin-address-adapters";
import { previewGoogleAddressChange } from "@/lib/admin-google-address-preview";
import { updateOrganizationLocationFromGooglePlace } from "@/lib/organization-location-admin-write";

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
  // Discovery is remote: reject edits which landed while Google was searched.
  const latestSource = await getGeoSourceLocation(effectiveTargetType, effectiveTargetId);
  if (!latestSource || JSON.stringify(latestSource) !== JSON.stringify(source)) {
    throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  }

  const confirmationPolicy = googlePlaceConfirmationForSource(effectiveSource);
  if (!confirmationPolicy.available) throw new Error(confirmationPolicy.reason);

  let point = await getGeoPointForTarget(effectiveTargetType, effectiveTargetId);
  if (point?.manualOverride) {
    throw new Error("Poloha má manuálny GEO override. Google Place ho nesmie potichu prepísať.");
  }

  const originalGeoRevision = point?.updatedAt ?? null;
  const originalGeoFingerprint = point?.sourceFingerprint ?? null;
  const explicitPrivate = await hasExplicitPrivateGeoDecision(effectiveTargetType, effectiveTargetId);
  const publicLocation = input.publicLocation !== false;
  const allowPrivateOverride = input.allowPrivateOverride === true;
  if (publicLocation && explicitPrivate && !allowPrivateOverride) {
    throw new Error("Poloha bola explicitne nastavená ako neverejná. Zmenu na verejnú potvrď priamo v editore položky.");
  }

  let profile = null;
  let sourceMutated = false;
  try {
  if (effectiveTargetType === "DIRECTORY_PROFILE") {
    const before = await getManagedDirectoryProfileById(effectiveTargetId);
    if (!before) throw new Error("Profil sa nenašiel.");
    const preview = previewGoogleAddressChange({
      snapshot: adaptDirectoryAddress(before, adaptAddressGeo(point, explicitPrivate)),
      candidate: selected, intent: "ADMIN_RECONFIRM", expectedRevision: before.updatedAt,
    });
    if (!preview.readyForAuthorization) throw new Error("GOOGLE_ADDRESS_REVIEW_REQUIRED: " + preview.reviewReasons.join("; "));
    profile = await updateManagedDirectoryProfileLocationFromGooglePlace(effectiveTargetId, selected, input.actorRef, undefined, before.updatedAt);
    if (!profile) throw new Error("Profil sa nenašiel.");
    sourceMutated = true;
  }

  if (effectiveTargetType === "MANAGED_EVENT") {
    const before = await getManagedEventById(effectiveTargetId);
    if (!before) throw new Error("Podujatie sa nenašlo.");
    if ([before.city, before.region].some((value) => value?.trim().toLowerCase() === "online")) throw new Error("GOOGLE_ONLINE_EVENT_FORBIDDEN");
    await updateManagedEventLocationFromGooglePlace(effectiveTargetId, selected, input.actorRef, before.updatedAt);
    sourceMutated = true;
  }

  if (effectiveTargetType === "ORGANIZATION_LOCATION") {
    const organizationId = Number(effectiveSource.organizationId ?? 0);
    if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
      throw new Error("Organizácia pre Google Maps lokalitu sa nenašla.");
    }
    const location = await updateOrganizationLocationFromGooglePlace(
      organizationId,
      effectiveTargetId,
      selected,
      input.actorRef,
      undefined,
      {
        address: effectiveSource.address ?? "",
        city: effectiveSource.city ?? "",
        district: effectiveSource.district ?? "",
        region: effectiveSource.region ?? "",
        countryCode: effectiveSource.countryCode ?? "SK",
      },
    );
    if (!location) throw new Error("Adresu organizácie sa nepodarilo aktualizovať.");
    sourceMutated = true;
  }

  point = await getGeoPointForTarget(effectiveTargetType, effectiveTargetId);
  if (originalGeoRevision && point && point.updatedAt !== originalGeoRevision && point.sourceFingerprint === originalGeoFingerprint) {
    throw new Error("GOOGLE_CONFIRMATION_CONFLICT");
  }
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
    return { profile, point, googlePlaceId: selected.id, createdSiteId: null };
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
  if (!point || point.geocodeStatus !== "RESOLVED" || point.provider !== "google_places") {
    throw new Error("GOOGLE_CONFIRMATION_INCOMPLETE");
  }
  await resetGoogleMapsNotRequired({
    targetType: effectiveTargetType,
    targetId: effectiveTargetId,
    actorRef: input.actorRef,
  });

  return { profile, point, googlePlaceId: selected.id, createdSiteId: null };
  } catch (error) {
    const committedBeforeFailure = sourceMutated
      || (error instanceof Error && "sourceCommitted" in error && error.sourceCommitted === true);
    // Do not run unguarded reconciliation here: another admin may have changed
    // visibility, manual coordinates or the canonical address after our commit.
    // Explicit repair is safer than overwriting the winner of that race.
    if (committedBeforeFailure) {
      throw new Error("GOOGLE_CONFIRMATION_REPAIR_REQUIRED", { cause: error });
    }
    throw error;
  }
}
