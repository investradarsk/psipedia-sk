import type { GeoSourceLocation } from "@/lib/geo";
import {
  googlePlaceNameScore,
  type GooglePlaceCandidate,
} from "@/lib/google-place-matching";
import { googlePlacesApiKey, searchGooglePlacesText } from "@/lib/google-places-provider";

function clean(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk-SK")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compact(value: string | null | undefined) {
  return clean(value).replace(/\s+/g, "");
}

function localityVariants(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return [];
  const full = clean(raw);
  const hierarchy = raw
    .split(/\s+[–—-]\s+/)
    .map((part) => clean(part))
    .filter(Boolean);
  return [...new Set([full, ...hierarchy])];
}

function textContainsAny(value: string, variants: string[]) {
  const haystack = clean(value);
  return variants.some((variant) => variant && haystack.includes(variant));
}

function candidateText(candidate: GooglePlaceCandidate) {
  return [
    candidate.formattedAddress,
    candidate.address?.street,
    candidate.address?.houseNumber,
    candidate.address?.postalCode,
    candidate.address?.locality,
    candidate.address?.sublocality,
    candidate.address?.district,
    candidate.address?.region,
  ].filter(Boolean).join(" ");
}

export function googleDirectoryDiscoveryScore(source: GeoSourceLocation, candidate: GooglePlaceCandidate) {
  const formatted = candidateText(candidate);
  const hints = [
    source.street,
    source.houseNumber,
    source.postalCode,
    source.city,
    source.district,
    source.region,
  ].map((value) => clean(value)).filter(Boolean);
  const hintHits = hints.filter((hint) => clean(formatted).includes(hint)).length;
  const hintScore = hints.length ? hintHits / hints.length : 0;
  return (googlePlaceNameScore(source.label, candidate.displayName) * 0.75) + (hintScore * 0.25);
}

export async function discoverGoogleDirectoryPlaces(source: GeoSourceLocation, apiKey?: string) {
  const key = apiKey ?? googlePlacesApiKey();
  if (!key) throw new Error("Google Places serverový kľúč nie je dostupný.");
  const queries = [
    [source.label, source.address, source.street, source.houseNumber, source.postalCode, source.city, source.district, source.region, "Slovensko"],
    [source.label, source.address, source.city, source.region, "Slovensko"],
    [source.label, source.city, source.region, "Slovensko"],
    [source.label, "Slovensko"],
  ].map((parts) => parts.map((value) => value?.trim() ?? "").filter(Boolean).join(" "))
    .filter((query, index, list) => query && list.indexOf(query) === index);

  const unique = new Map<string, GooglePlaceCandidate>();
  for (const query of queries) {
    const candidates = await searchGooglePlacesText({ query, apiKey: key });
    for (const candidate of candidates) unique.set(candidate.id, candidate);
    if (unique.size >= 5) break;
  }
  return [...unique.values()]
    .sort((left, right) => googleDirectoryDiscoveryScore(source, right) - googleDirectoryDiscoveryScore(source, left))
    .slice(0, 5);
}

export type GoogleDirectoryAutoMatch = {
  decision: "MATCH" | "REVIEW" | "NO_MATCH";
  reason: string;
  candidate: GooglePlaceCandidate | null;
  nameScore: number;
  locationAgreements: string[];
  conflicts: string[];
};

export function evaluateGoogleDirectoryAutoMatch(
  source: GeoSourceLocation,
  candidates: GooglePlaceCandidate[],
): GoogleDirectoryAutoMatch {
  if (!candidates.length) {
    return {
      decision: "NO_MATCH",
      reason: "Google Maps nenašiel kandidáta.",
      candidate: null,
      nameScore: 0,
      locationAgreements: [],
      conflicts: [],
    };
  }

  const ranked = [...candidates]
    .map((candidate) => ({
      candidate,
      score: googleDirectoryDiscoveryScore(source, candidate),
      nameScore: googlePlaceNameScore(source.label, candidate.displayName),
    }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const candidate = best.candidate;
  const candidateAddress = candidate.address;
  const candidateAllText = candidateText(candidate);
  const agreements: string[] = [];
  const conflicts: string[] = [];

  const sourcePostal = compact(source.postalCode);
  const candidatePostal = compact(candidateAddress?.postalCode);
  if (sourcePostal && candidatePostal) {
    if (sourcePostal === candidatePostal) agreements.push("PSČ");
    else conflicts.push("PSČ");
  } else if (sourcePostal && compact(candidate.formattedAddress).includes(sourcePostal)) {
    agreements.push("PSČ");
  }

  const sourceHouse = clean(source.houseNumber);
  const candidateHouse = clean(candidateAddress?.houseNumber);
  if (sourceHouse && candidateHouse) {
    const sourceParts = sourceHouse.split("/").filter(Boolean);
    const candidateParts = candidateHouse.split("/").filter(Boolean);
    if (sourceHouse === candidateHouse || sourceParts.some((part) => candidateParts.includes(part))) agreements.push("číslo domu");
    else conflicts.push("číslo domu");
  }

  const sourceStreet = clean(source.street);
  const candidateStreet = clean(candidateAddress?.street);
  if (sourceStreet && candidateStreet) {
    if (sourceStreet === candidateStreet || sourceStreet.includes(candidateStreet) || candidateStreet.includes(sourceStreet)) agreements.push("ulica");
    else conflicts.push("ulica");
  } else if (sourceStreet && clean(candidate.formattedAddress).includes(sourceStreet)) {
    agreements.push("ulica");
  }

  const cityVariants = localityVariants(source.city);
  if (cityVariants.length) {
    const candidateLocalities = [
      candidateAddress?.locality,
      candidateAddress?.sublocality,
      candidateAddress?.district,
      candidate.formattedAddress,
    ].filter(Boolean).join(" ");
    if (textContainsAny(candidateLocalities, cityVariants)) agreements.push("mesto/lokalita");
    else if (candidateAddress?.locality || candidateAddress?.sublocality) conflicts.push("mesto/lokalita");
  }

  const sourceRegion = clean(source.region);
  if (sourceRegion) {
    const candidateRegion = clean(candidateAddress?.region);
    if (candidateRegion) {
      if (candidateRegion === sourceRegion) agreements.push("kraj");
      else conflicts.push("kraj");
    } else if (clean(candidateAllText).includes(sourceRegion)) {
      agreements.push("kraj");
    }
  }

  const hasLocationHint = Boolean(
    source.street?.trim()
    || source.houseNumber?.trim()
    || source.postalCode?.trim()
    || source.city?.trim()
    || source.region?.trim()
  );

  if (best.nameScore < 0.9) {
    return {
      decision: "NO_MATCH",
      reason: "Najlepší Google výsledok nemá dostatočne silnú zhodu názvu.",
      candidate,
      nameScore: best.nameScore,
      locationAgreements: agreements,
      conflicts,
    };
  }

  if (!hasLocationHint) {
    return {
      decision: "REVIEW",
      reason: "Profil nemá lokalizačný údaj, podľa ktorého by sa dal Google výsledok bezpečne potvrdiť automaticky.",
      candidate,
      nameScore: best.nameScore,
      locationAgreements: agreements,
      conflicts,
    };
  }

  if (conflicts.length) {
    return {
      decision: "REVIEW",
      reason: `Google výsledok je názvom silný, ale odporuje uloženým údajom: ${conflicts.join(", ")}.`,
      candidate,
      nameScore: best.nameScore,
      locationAgreements: agreements,
      conflicts,
    };
  }

  if (!agreements.length) {
    return {
      decision: "REVIEW",
      reason: "Názov sedí, ale chýba nezávislá zhoda s uloženou lokalitou alebo adresou.",
      candidate,
      nameScore: best.nameScore,
      locationAgreements: agreements,
      conflicts,
    };
  }

  const second = ranked[1];
  if (second && second.nameScore >= 0.9 && best.score - second.score < 0.08) {
    return {
      decision: "REVIEW",
      reason: "Google vrátil viac veľmi podobných kandidátov; vyžaduje sa ručný výber.",
      candidate,
      nameScore: best.nameScore,
      locationAgreements: agreements,
      conflicts,
    };
  }

  return {
    decision: "MATCH",
    reason: `Silná zhoda názvu a lokality: ${agreements.join(", ")}.`,
    candidate,
    nameScore: best.nameScore,
    locationAgreements: agreements,
    conflicts,
  };
}
