import type { GeoSourceLocation } from "@/lib/geo";
import type { GooglePlaceCandidate } from "@/lib/google-place-matching";
import { googlePlacesApiKey, searchGooglePlacesText } from "@/lib/google-places-provider";

function compact(parts: Array<string | null | undefined>) {
  return parts.map((value) => value?.trim() ?? "").filter(Boolean).join(" ");
}

export async function discoverGooglePlacesForGeoSource(
  source: GeoSourceLocation,
  apiKey?: string,
): Promise<GooglePlaceCandidate[]> {
  const key = apiKey ?? googlePlacesApiKey();
  if (!key) throw new Error("Google Places serverový kľúč nie je dostupný.");

  const queries = [
    compact([
      source.label,
      source.venue,
      source.address,
      source.street,
      source.houseNumber,
      source.postalCode,
      source.city,
      source.district,
      source.region,
      "Slovensko",
    ]),
    compact([source.label, source.venue, source.city, source.region, "Slovensko"]),
    compact([source.label, source.city, "Slovensko"]),
  ].filter((query, index, list) => query && list.indexOf(query) === index);

  const unique = new Map<string, GooglePlaceCandidate>();
  for (const query of queries) {
    const candidates = await searchGooglePlacesText({ query, apiKey: key });
    for (const candidate of candidates) unique.set(candidate.id, candidate);
    if (unique.size >= 5) break;
  }
  return [...unique.values()].slice(0, 5);
}
