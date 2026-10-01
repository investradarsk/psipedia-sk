export const GOOGLE_PLACE_MATCH_DISTANCE_METERS = 250;
export const GOOGLE_PLACE_REVIEW_DISTANCE_METERS = 1_500;

export type GooglePlaceCandidate = {
  id: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
};

export type GooglePlaceMatchTarget = {
  targetId: number;
  name: string;
  city: string;
  postalCode: string;
  canonicalAddress: string;
  latitude: number;
  longitude: number;
};

export type GooglePlaceDecision = "MATCH" | "REVIEW" | "NO_MATCH";

export type GooglePlaceCandidateDiagnostic = GooglePlaceCandidate & {
  distanceMeters: number;
  nameScore: number;
  cityMatch: boolean;
  postalCodeMatch: boolean;
  addressMatch: boolean;
  score: number;
};

export type GooglePlaceMatchResult = {
  decision: GooglePlaceDecision;
  reason: string;
  candidate: GooglePlaceCandidateDiagnostic | null;
  candidates: GooglePlaceCandidateDiagnostic[];
};

export type GoogleNumberlessPlaceMatchTarget = {
  targetId: number;
  name: string;
  city: string;
  postalCode: string;
  street: string;
  canonicalAddress: string;
};

export type GoogleNumberlessPlaceCandidateDiagnostic = GooglePlaceCandidate & {
  nameScore: number;
  cityMatch: boolean;
  postalCodeMatch: boolean;
  addressMatch: boolean;
  streetMatch: boolean;
  geographicConsistency: boolean;
  score: number;
};

export type GoogleNumberlessPlaceMatchResult = {
  decision: GooglePlaceDecision;
  reason: string;
  candidate: GoogleNumberlessPlaceCandidateDiagnostic | null;
  candidates: GoogleNumberlessPlaceCandidateDiagnostic[];
};

function clean(value: string | null | undefined) {
  return (value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk-SK")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function compact(value: string | null | undefined) {
  return clean(value).replace(/\s+/g, "");
}

function tokens(value: string) {
  return new Set(clean(value).split(" ").filter((token) => token.length > 1));
}

function normalizeGooglePlaceName(value: string) {
  return clean(value)
    // Slovak/English veterinary naming often moves the service descriptor
    // before/after the brand or joins it directly to the brand name.
    .replace(/veterin[a-z]*/g, " vet ")
    .replace(/\b(?:ambulancia|ambulancie|klinika|clinic)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localityVariants(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return [];
  const full = clean(raw);
  const municipality = clean(raw.split(/[–—-]/, 1)[0] ?? "");
  return [...new Set([full, municipality].filter(Boolean))];
}

function localityMatches(formattedAddress: string, locality: string | null | undefined) {
  const formatted = clean(formattedAddress);
  return localityVariants(locality).some((variant) => formatted.includes(variant));
}

export function googlePlaceNameScore(left: string, right: string) {
  const a = normalizeGooglePlaceName(left);
  const b = normalizeGooglePlaceName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.92;
  const at = tokens(a);
  const bt = tokens(b);
  const intersection = [...at].filter((token) => bt.has(token)).length;
  const union = new Set([...at, ...bt]).size;
  return union ? intersection / union : 0;
}

export function googlePlaceDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const rad = (value: number) => value * Math.PI / 180;
  const earth = 6_371_000;
  const dLat = rad(latitudeB - latitudeA);
  const dLon = rad(longitudeB - longitudeA);
  const lat1 = rad(latitudeA);
  const lat2 = rad(latitudeB);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function diagnostics(target: GooglePlaceMatchTarget, candidate: GooglePlaceCandidate): GooglePlaceCandidateDiagnostic {
  const formatted = clean(candidate.formattedAddress);
  const postal = compact(target.postalCode);
  const canonicalParts = clean(target.canonicalAddress).split(" ").filter((part) => part.length > 2);
  const addressHits = canonicalParts.length
    ? canonicalParts.filter((part) => formatted.includes(part)).length / canonicalParts.length
    : 0;
  const distanceMeters = googlePlaceDistanceMeters(target.latitude, target.longitude, candidate.latitude, candidate.longitude);
  const nameScore = googlePlaceNameScore(target.name, candidate.displayName);
  const cityMatch = localityMatches(candidate.formattedAddress, target.city);
  const postalCodeMatch = Boolean(postal) && compact(candidate.formattedAddress).includes(postal);
  const addressMatch = addressHits >= 0.55;
  const distanceScore = distanceMeters <= 75 ? 1 : distanceMeters <= 250 ? 0.9 : distanceMeters <= 750 ? 0.55 : distanceMeters <= 1_500 ? 0.25 : 0;
  const score = (nameScore * 0.45) + (cityMatch ? 0.15 : 0) + (postalCodeMatch ? 0.12 : 0)
    + (addressMatch ? 0.13 : 0) + (distanceScore * 0.15);
  return { ...candidate, distanceMeters, nameScore, cityMatch, postalCodeMatch, addressMatch, score };
}



function numberlessDiagnostics(
  target: GoogleNumberlessPlaceMatchTarget,
  candidate: GooglePlaceCandidate,
): GoogleNumberlessPlaceCandidateDiagnostic {
  const formatted = clean(candidate.formattedAddress);
  const postal = compact(target.postalCode);
  const street = clean(target.street);
  const canonicalParts = clean(target.canonicalAddress).split(" ").filter((part) => part.length > 2);
  const addressHits = canonicalParts.length
    ? canonicalParts.filter((part) => formatted.includes(part)).length / canonicalParts.length
    : 0;
  const nameScore = googlePlaceNameScore(target.name, candidate.displayName);
  const cityMatch = localityMatches(candidate.formattedAddress, target.city);
  const postalCodeMatch = Boolean(postal) && compact(candidate.formattedAddress).includes(postal);
  const streetMatch = Boolean(street) && formatted.includes(street);
  const geographicConsistency = Number.isFinite(candidate.latitude)
    && Number.isFinite(candidate.longitude)
    && candidate.latitude >= 47.7
    && candidate.latitude <= 49.7
    && candidate.longitude >= 16.8
    && candidate.longitude <= 22.6;
  const addressMatch = addressHits >= 0.65;
  const score = (nameScore * 0.55)
    + (cityMatch ? 0.15 : 0)
    + (postalCodeMatch ? 0.15 : 0)
    + (addressMatch ? 0.10 : 0)
    + (streetMatch ? 0.05 : 0);
  return { ...candidate, nameScore, cityMatch, postalCodeMatch, addressMatch, streetMatch, geographicConsistency, score };
}

export function evaluateNumberlessGooglePlaceCandidates(
  target: GoogleNumberlessPlaceMatchTarget,
  candidates: GooglePlaceCandidate[],
): GoogleNumberlessPlaceMatchResult {
  if (!candidates.length) {
    return { decision: "NO_MATCH", reason: "Google nevrátil žiadne konkrétne miesto.", candidate: null, candidates: [] };
  }
  const ranked = candidates.map((candidate) => numberlessDiagnostics(target, candidate)).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  const ambiguous = Boolean(second && second.score >= 0.72 && (best.score - second.score) < 0.08);

  if (
    best.nameScore >= 0.78
    && best.cityMatch
    && best.postalCodeMatch
    && best.addressMatch
    && best.streetMatch
    && best.geographicConsistency
    && !ambiguous
  ) {
    return {
      decision: "MATCH",
      reason: "Silná zhoda názvu, ulice/lokality, PSČ a mesta bez konkurenčného kandidáta.",
      candidate: best,
      candidates: ranked,
    };
  }

  if (best.nameScore < 0.55 || !best.cityMatch || !best.postalCodeMatch || !best.streetMatch || !best.geographicConsistency) {
    return {
      decision: "NO_MATCH",
      reason: "Google kandidát nepotvrdzuje názov, canonical lokalitu alebo geografickú konzistenciu konkrétneho miesta.",
      candidate: best,
      candidates: ranked,
    };
  }

  return {
    decision: "REVIEW",
    reason: ambiguous
      ? "Viac Google kandidátov má podobne silnú zhodu."
      : "Google kandidát nie je dosť jednoznačný pre presný verejný marker.",
    candidate: best,
    candidates: ranked,
  };
}

export function evaluateGooglePlaceCandidates(
  target: GooglePlaceMatchTarget,
  candidates: GooglePlaceCandidate[],
): GooglePlaceMatchResult {
  if (!candidates.length) return { decision: "NO_MATCH", reason: "Google nevrátil žiadneho kandidáta.", candidate: null, candidates: [] };
  const ranked = candidates.map((candidate) => diagnostics(target, candidate)).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  const second = ranked[1];
  const ambiguous = Boolean(second && second.score >= 0.68 && (best.score - second.score) < 0.08);

  if (
    best.nameScore >= 0.78
    && best.cityMatch
    && best.postalCodeMatch
    && best.addressMatch
    && best.distanceMeters <= GOOGLE_PLACE_MATCH_DISTANCE_METERS
    && !ambiguous
  ) {
    return { decision: "MATCH", reason: "Silná zhoda názvu, canonical adresy, PSČ, mesta a blízky exact GEO bod bez konkurenčného kandidáta.", candidate: best, candidates: ranked };
  }

  if (best.distanceMeters > GOOGLE_PLACE_REVIEW_DISTANCE_METERS && !best.cityMatch) {
    return { decision: "NO_MATCH", reason: "Najlepší kandidát je geograficky vzdialený a nesedí mesto.", candidate: best, candidates: ranked };
  }

  return {
    decision: "REVIEW",
    reason: ambiguous
      ? "Viac kandidátov má podobne silnú zhodu."
      : "Kandidát nespĺňa konzervatívny auto-match threshold.",
    candidate: best,
    candidates: ranked,
  };
}
