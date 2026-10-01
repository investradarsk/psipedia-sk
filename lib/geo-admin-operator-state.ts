import type { DirectoryServiceAddressEvaluation } from "@/lib/directory-service-address";
import type { GeoTargetType } from "@/lib/geo";

export type GeoAdminOperatorState =
  | "ON_MAP"
  | "PENDING"
  | "NEEDS_REVIEW"
  | "MISSING_ADDRESS"
  | "INCOMPLETE_ADDRESS"
  | "INVALID_ADDRESS"
  | "FAILED"
  | "NOT_PUBLIC";

export const geoAdminOperatorStateLabels: Record<GeoAdminOperatorState, string> = {
  ON_MAP: "Na mape",
  PENDING: "Čaká na spracovanie",
  NEEDS_REVIEW: "Treba skontrolovať",
  MISSING_ADDRESS: "Chýba adresa",
  INCOMPLETE_ADDRESS: "Neúplná adresa",
  INVALID_ADDRESS: "Neplatná adresa",
  FAILED: "Spracovanie zlyhalo",
  NOT_PUBLIC: "Nezobrazuje sa verejne",
};

export function geoAdminOperatorState(input: {
  targetType?: GeoTargetType;
  addressState: DirectoryServiceAddressEvaluation["state"];
  addressReason: string;
  geocodeStatus: string | null;
  publicVisibility: string | null;
  publicPrecision: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceFingerprint: string | null;
  resolvedSourceFingerprint: string | null;
  manualOverride: boolean;
}): { state: GeoAdminOperatorState; reason: string } {
  const directoryContract = !input.targetType || input.targetType === "DIRECTORY_PROFILE";
  if (directoryContract) {
    if (input.addressState === "MISSING") {
      return { state: "MISSING_ADDRESS", reason: "Profil nemá kompletnú canonical adresu prevádzky." };
    }
    if (input.addressState === "INCOMPLETE") {
      return { state: "INCOMPLETE_ADDRESS", reason: "Canonical adresa nie je kompletná." };
    }
    if (input.addressState === "NEEDS_REVIEW") {
      const invalidReasons = new Set(["LOCALITY_INVALID", "POSTAL_CODE_INVALID", "STREET_NOT_ALLOWED", "ONLINE_SENTINEL_CONFLICT"]);
      if (invalidReasons.has(input.addressReason)) {
        return { state: "INVALID_ADDRESS", reason: "Canonical adresa obsahuje neplatnú alebo konfliktnú hodnotu." };
      }
      return {
        state: "NEEDS_REVIEW",
        reason: input.addressReason === "LEGACY_UNCONFIRMED"
          ? "Historická adresa nie je potvrdená ako miesto prevádzky."
          : "Canonical adresa vyžaduje manuálnu kontrolu.",
      };
    }
  } else if (input.addressState === "MISSING") {
    return { state: "MISSING_ADDRESS", reason: "Lokalita nemá použiteľné miesto, adresu ani mesto." };
  }

  if (input.geocodeStatus === "FAILED") {
    return { state: "FAILED", reason: "Posledné geo spracovanie zlyhalo." };
  }
  if (input.manualOverride) {
    return { state: "NEEDS_REVIEW", reason: "Lokalita používa manuálny geo override." };
  }
  if (input.geocodeStatus === "NEEDS_REVIEW" || input.geocodeStatus === "STALE") {
    return {
      state: "NEEDS_REVIEW",
      reason: input.geocodeStatus === "STALE"
        ? "Zdrojová lokalita sa zmenila a geo bod treba znovu overiť."
        : "Výsledok geocodingu vyžaduje kontrolu.",
    };
  }
  if (input.geocodeStatus === "SKIPPED" || input.publicVisibility === "HIDDEN") {
    return { state: "NOT_PUBLIC", reason: "Lokalita sa podľa aktuálneho geo stavu verejne nezobrazuje." };
  }
  if (!input.geocodeStatus || input.geocodeStatus === "PENDING") {
    return { state: "PENDING", reason: "Lokalita je pripravená, ale ešte čaká na geo spracovanie." };
  }
  if (input.geocodeStatus === "RESOLVED") {
    const currentPoint = input.publicVisibility !== null
      && input.publicVisibility !== "HIDDEN"
      && input.publicPrecision !== null
      && input.latitude !== null
      && input.longitude !== null
      && Boolean(input.sourceFingerprint)
      && input.sourceFingerprint === input.resolvedSourceFingerprint;
    if (input.targetType && input.targetType !== "DIRECTORY_PROFILE") {
      if (currentPoint) return { state: "ON_MAP", reason: "Lokalita má aktuálny verejný geo bod." };
      return { state: "NEEDS_REVIEW", reason: "Uložený geo bod nezodpovedá aktuálnemu zdroju alebo verejnej klasifikácii." };
    }
    const exact = currentPoint
      && input.publicVisibility === "EXACT_PUBLIC"
      && input.publicPrecision === "EXACT";
    if (exact) return { state: "ON_MAP", reason: "Profil má aktuálny presný verejný geo bod." };
    return { state: "NEEDS_REVIEW", reason: "Uložený geo bod nespĺňa aktuálny exact-only DIRECTORY_PROFILE contract." };
  }
  return { state: "NEEDS_REVIEW", reason: "Geo stav nie je možné bezpečne zaradiť bez kontroly." };
}
