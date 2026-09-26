import type { ManagedDirectoryProfileInput } from "@/lib/directory-store";
import type { VerifiedDirectoryAddress } from "@/lib/directory-address-provider";
import {
  applyGeocoderResolution,
  getGeoPointForTarget,
  initializeGeoPointForTarget,
  isGeoProviderResultIdSchemaAvailable,
  setGeoVisibility,
  syncGeoPointAfterSourceChange,
} from "@/lib/geo-store";

export async function requireDirectoryAddressProviderSchema() {
  if (!await isGeoProviderResultIdSchemaAvailable()) {
    throw new Error("Address provider schema ešte nie je aktivovaná. Najprv aplikuj migration 0077.");
  }
}

export function withVerifiedDirectoryAddress(
  payload: ManagedDirectoryProfileInput,
  verified: VerifiedDirectoryAddress,
): ManagedDirectoryProfileInput {
  return {
    ...payload,
    region: verified.region,
    district: verified.district,
    city: verified.city,
    postalCode: verified.postalCode,
    street: verified.street,
    houseNumber: verified.houseNumber,
    addressFormat: verified.addressFormat,
    confirmServiceAddress: true,
  };
}

export async function applyVerifiedDirectoryAddressGeo(input: {
  profileId: number;
  verified: VerifiedDirectoryAddress;
  actorRef: string;
}) {
  let point = await getGeoPointForTarget("DIRECTORY_PROFILE", input.profileId);
  if (!point) {
    point = (await initializeGeoPointForTarget(
      "DIRECTORY_PROFILE",
      input.profileId,
      input.actorRef,
    )).point;
  } else {
    point = await syncGeoPointAfterSourceChange("DIRECTORY_PROFILE", input.profileId) ?? point;
  }

  if (point.manualOverride) return point;

  if (point.publicVisibility !== "EXACT_PUBLIC" || point.publicPrecision !== "EXACT") {
    point = await setGeoVisibility({
      targetType: "DIRECTORY_PROFILE",
      targetId: input.profileId,
      visibility: "EXACT_PUBLIC",
      precision: "EXACT",
      actorRef: input.actorRef,
      reason: "PROVIDER_VERIFIED_ADDRESS",
    });
  }

  return applyGeocoderResolution({
    targetType: "DIRECTORY_PROFILE",
    targetId: input.profileId,
    result: input.verified.providerResult,
    method: "GEOCODER",
  });
}

export function directoryPhysicalAddressChanged(
  before: {
    region: string;
    district: string;
    city: string;
    postalCode: string;
    street: string;
    houseNumber: string;
    addressFormat: string;
  },
  payload: ManagedDirectoryProfileInput,
) {
  const fields: Array<keyof typeof before> = [
    "region", "district", "city", "postalCode", "street", "houseNumber", "addressFormat",
  ];
  return fields.some((field) => payload[field] !== undefined && String(payload[field] ?? "").trim() !== String(before[field] ?? "").trim());
}

export function preserveDirectoryPhysicalAddress(
  before: {
    region: string;
    district: string;
    city: string;
    postalCode: string;
    street: string;
    houseNumber: string;
    addressFormat: string;
  },
  payload: ManagedDirectoryProfileInput,
): ManagedDirectoryProfileInput {
  return {
    ...payload,
    region: before.region,
    district: before.district,
    city: before.city,
    postalCode: before.postalCode,
    street: before.street,
    houseNumber: before.houseNumber,
    addressFormat: before.addressFormat,
    confirmServiceAddress: false,
  };
}
