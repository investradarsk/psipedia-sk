import type { AutomationSearchResult } from "./data-automation-discovery.ts";
import {
  verifyExternalDirectoryAddressEvidenceBestEffort,
  type VerifiedDirectoryAddress,
} from "./directory-address-provider.ts";
import { GeoapifyGeocoder } from "./geoapify-geocoder.ts";
import type { GeocoderProvider } from "./geo-provider.ts";
import { normalizeSlovakPostalCode } from "./directory-service-address.ts";

export type DirectoryAddressSearch = (query: string) => Promise<AutomationSearchResult[]>;

export type DirectoryExactAddressEnrichment = {
  proposed: Record<string, unknown>;
  verified: VerifiedDirectoryAddress | null;
  usedAddressSearch: boolean;
};

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function uniqueEvidence(values: string[], limit = 4) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = text(value).replace(/[.;]+$/, "").trim();
    if (clean.length < 5 || clean.length > 320) continue;
    const key = clean.toLocaleLowerCase("sk-SK");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= limit) break;
  }
  return output;
}

function labelledAddressEvidence(value: string) {
  const clean = text(value);
  const matches: string[] = [];
  for (const match of clean.matchAll(/(?:^|[.;|])\s*(?:adresa|sídlo|sidlo|prevádzka|prevadzka|nájdete nás|najdete nas)\s*:?\s*([^.;|]{5,220})/giu)) {
    if (match[1]) matches.push(match[1]);
  }
  return matches;
}

function postalAddressEvidence(value: string) {
  const clean = text(value);
  const matches: string[] = [];
  const pattern = /([\p{L}][\p{L}0-9 .'-]{1,100}?\s+\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?\s*,\s*\d{3}\s?\d{2}\s+[\p{L}][\p{L} .'-]{1,80})/gu;
  for (const match of clean.matchAll(pattern)) {
    if (match[1]) matches.push(match[1]);
    if (matches.length >= 4) break;
  }
  return matches;
}

function partialStreetAddressEvidence(value: string) {
  const clean = text(value);
  const matches: string[] = [];
  const pattern = /([\p{L}][\p{L} .'-]{1,80}?\s+\d+[A-Za-z]?(?:\/\d+[A-Za-z]?)?(?:\s*,\s*[\p{L}][\p{L} .'-]{1,80})?)/gu;
  for (const match of clean.matchAll(pattern)) {
    if (match[1]) matches.push(match[1]);
    if (matches.length >= 4) break;
  }
  return matches;
}

function proposalEvidence(proposed: Record<string, unknown>, extraEvidenceText?: string | null) {
  const address = text(proposed.address);
  const street = text(proposed.street);
  const houseNumber = text(proposed.houseNumber ?? proposed.house_number);
  const postalCode = normalizeSlovakPostalCode(text(proposed.postalCode ?? proposed.postal_code));
  const city = text(proposed.city);
  const structured = street && houseNumber
    ? [street + " " + houseNumber, [postalCode, city].filter(Boolean).join(" ")].filter(Boolean).join(", ")
    : "";
  const description = text(proposed.description);
  const extra = text(extraEvidenceText);
  return uniqueEvidence([
    structured,
    address,
    ...labelledAddressEvidence(description),
    ...postalAddressEvidence(description),
    ...partialStreetAddressEvidence(description),
    ...labelledAddressEvidence(extra),
    ...postalAddressEvidence(extra),
    ...partialStreetAddressEvidence(extra),
  ]);
}

function expectedFields(proposed: Record<string, unknown>) {
  return {
    expectedStreet: text(proposed.street) || undefined,
    expectedHouseNumber: text(proposed.houseNumber ?? proposed.house_number) || undefined,
    expectedPostalCode: text(proposed.postalCode ?? proposed.postal_code) || undefined,
    expectedCity: text(proposed.city) || undefined,
  };
}

function addressLine(verified: VerifiedDirectoryAddress) {
  const firstLine = verified.addressFormat === "STREET"
    ? [verified.street, verified.houseNumber].filter(Boolean).join(" ")
    : [verified.city, verified.houseNumber].filter(Boolean).join(" ");
  return [firstLine, [verified.postalCode, verified.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
}

function applyVerifiedAddress(
  proposed: Record<string, unknown>,
  verified: VerifiedDirectoryAddress,
) {
  return {
    ...proposed,
    region: verified.region,
    district: verified.district,
    city: verified.city,
    address: addressLine(verified),
    postalCode: verified.postalCode,
    street: verified.street,
    houseNumber: verified.houseNumber,
    addressFormat: verified.addressFormat,
    serviceAddressConfirmation: "CONFIRMED_SERVICE_LOCATION",
  };
}

async function verifyEvidence(input: {
  candidates: string[];
  proposed: Record<string, unknown>;
  provider: GeocoderProvider;
  maxAttempts: number;
}) {
  const expected = expectedFields(input.proposed);
  for (const evidence of input.candidates.slice(0, input.maxAttempts)) {
    const result = await verifyExternalDirectoryAddressEvidenceBestEffort({
      evidence,
      ...expected,
      provider: input.provider,
    });
    if (result.status === "VERIFIED_EXACT" && result.verified) return result.verified;
  }
  return null;
}

function addressSearchQuery(input: {
  name: string;
  sourceUrl: string;
  evidence: string[];
}) {
  let host = "";
  try {
    host = new URL(input.sourceUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const partial = input.evidence[0] ?? "";
  return [input.name, partial, host, "adresa", "Slovensko"]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function searchResultEvidence(results: AutomationSearchResult[]) {
  const values: string[] = [];
  for (const result of results.slice(0, 5)) {
    const snippet = text(result.snippet);
    const title = text(result.title);
    values.push(
      ...labelledAddressEvidence(snippet),
      ...postalAddressEvidence(snippet),
      ...partialStreetAddressEvidence(snippet),
      ...labelledAddressEvidence(title),
      ...postalAddressEvidence(title),
      ...partialStreetAddressEvidence(title),
    );
  }
  return uniqueEvidence(values, 4);
}

export async function enrichDirectoryProposalWithExactAddress(input: {
  proposed: Record<string, unknown>;
  name: string;
  sourceUrl: string;
  extraEvidenceText?: string | null;
  addressSearch?: DirectoryAddressSearch;
  geocoder?: GeocoderProvider;
}): Promise<DirectoryExactAddressEnrichment> {
  const provider = input.geocoder ?? new GeoapifyGeocoder();
  if (!provider.isConfigured()) {
    return { proposed: input.proposed, verified: null, usedAddressSearch: false };
  }

  const evidence = proposalEvidence(input.proposed, input.extraEvidenceText);
  const direct = await verifyEvidence({
    candidates: evidence,
    proposed: input.proposed,
    provider,
    maxAttempts: 2,
  });
  if (direct) {
    return {
      proposed: applyVerifiedAddress(input.proposed, direct),
      verified: direct,
      usedAddressSearch: false,
    };
  }

  if (!input.addressSearch) {
    return { proposed: input.proposed, verified: null, usedAddressSearch: false };
  }

  const query = addressSearchQuery({
    name: input.name,
    sourceUrl: input.sourceUrl,
    evidence,
  });
  if (!query) return { proposed: input.proposed, verified: null, usedAddressSearch: false };

  let results: AutomationSearchResult[];
  try {
    results = await input.addressSearch(query);
  } catch {
    return { proposed: input.proposed, verified: null, usedAddressSearch: true };
  }
  const searchedEvidence = searchResultEvidence(results);
  const searched = await verifyEvidence({
    candidates: searchedEvidence,
    proposed: input.proposed,
    provider,
    maxAttempts: 2,
  });
  if (!searched) {
    return { proposed: input.proposed, verified: null, usedAddressSearch: true };
  }
  return {
    proposed: applyVerifiedAddress(input.proposed, searched),
    verified: searched,
    usedAddressSearch: true,
  };
}
