import type { GeoSourceLocation } from "@/lib/geo";
import type { GooglePlaceCandidate } from "@/lib/google-place-matching";
import { discoverGoogleDirectoryPlaces } from "@/lib/google-place-directory-discovery";
import { googlePlacesApiKey, searchGooglePlacesText } from "@/lib/google-places-provider";

export type GooglePlaceActionAvailability = {
  available: boolean;
  reason: string;
};

function parts(...values: Array<string | null | undefined>) {
  return values.map((value) => value?.trim() ?? "").filter(Boolean);
}

export function googlePlaceActionForSource(source: GeoSourceLocation): GooglePlaceActionAvailability {
  if (source.targetType === "DIRECTORY_PROFILE") {
    if (!source.label.trim()) {
      return { available: false, reason: "Najprv doplň názov profilu." };
    }
    return { available: true, reason: "" };
  }

  if (source.targetType === "ORGANIZATION_LOCATION") {
    const organizationName = (source.organizationName || source.label).trim();
    if (!organizationName) {
      return { available: false, reason: "Najprv doplň názov organizácie." };
    }
    return { available: true, reason: "" };
  }

  if (source.online) {
    return { available: false, reason: "Online podujatie nemá fyzický Google Maps bod." };
  }
  if (!source.label.trim()) {
    return { available: false, reason: "Najprv doplň názov podujatia." };
  }
  return { available: true, reason: "" };
}

export function googlePlaceConfirmationForSource(source: GeoSourceLocation): GooglePlaceActionAvailability {
  if (source.targetType === "DIRECTORY_PROFILE") {
    return googlePlaceActionForSource(source);
  }

  if (source.targetType === "ORGANIZATION_LOCATION") {
    return googlePlaceActionForSource(source);
  }

  if (source.online) {
    return { available: false, reason: "Online podujatie nemá fyzický Google Maps bod." };
  }
  return googlePlaceActionForSource(source);
}

function targetQueries(source: GeoSourceLocation) {
  if (source.targetType === "ORGANIZATION_LOCATION") {
    const organizationName = source.organizationName || source.label;
    return [
      parts(organizationName, source.label, source.address, source.city, source.district, source.region, "Slovensko"),
      parts(organizationName, source.city, source.region, "Slovensko"),
      parts(organizationName, "Slovensko"),
    ];
  }

  return [
    parts(source.label, source.venue, source.address, source.city, source.region, "Slovensko"),
    parts(source.venue, source.city, source.region, "Slovensko"),
    parts(source.label, source.city, source.region, "Slovensko"),
    parts(source.label, "Slovensko"),
  ];
}

export async function discoverGoogleTargetPlaces(source: GeoSourceLocation, apiKey?: string): Promise<GooglePlaceCandidate[]> {
  const policy = googlePlaceActionForSource(source);
  if (!policy.available) throw new Error(policy.reason);

  if (source.targetType === "DIRECTORY_PROFILE") {
    return discoverGoogleDirectoryPlaces(source, apiKey);
  }

  const key = apiKey ?? googlePlacesApiKey();
  if (!key) throw new Error("Google Places serverový kľúč nie je dostupný.");

  const queries = targetQueries(source)
    .map((query) => query.join(" "))
    .filter((query, index, list) => query && list.indexOf(query) === index);

  const unique = new Map<string, GooglePlaceCandidate>();
  for (const query of queries) {
    const candidates = await searchGooglePlacesText({ query, apiKey: key });
    for (const candidate of candidates) unique.set(candidate.id, candidate);
    if (unique.size >= 5) break;
  }
  return [...unique.values()].slice(0, 5);
}
