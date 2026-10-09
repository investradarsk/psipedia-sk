import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";

/**
 * Read-only projection of the canonical D1 geo_points row into Notion.
 * Only an explicitly public resolved point can expose coordinates; a stored
 * Google place ID is current only for the matching source fingerprint.
 * Notion must never use these fields as inputs for D1 location mutation.
 */
export const notionGeoMirrorFields = [
  "Google Place ID",
  "Google miesto aktuálne",
  "Google Maps cieľ",
  "Google Maps netreba",
  "Latitude",
  "Longitude",
  "GEO stav",
  "GEO provider",
  "Presnosť lokality",
] as const;

export type NotionGeoSourceRow = Record<string, unknown>;

function string(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function coordinate(value: unknown, limit: number) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

export function notionGeoMirrorProperties(
  row: NotionGeoSourceRow,
  options: { forceNotRequired?: boolean } = {},
): Record<(typeof notionGeoMirrorFields)[number], ReconciliationValue> {
  const action = string(row.google_maps_action);
  const notRequired = options.forceNotRequired === true || action === "GOOGLE_MAPS_NOT_REQUIRED";
  const status = string(row.geo_status);
  const visibility = string(row.geo_public_visibility);
  const latitude = coordinate(row.geo_latitude, 90);
  const longitude = coordinate(row.geo_longitude, 180);
  const publicPoint = !notRequired
    && status === "RESOLVED"
    && (visibility === "EXACT_PUBLIC" || visibility === "APPROXIMATE_PUBLIC")
    && latitude !== null
    && longitude !== null;
  const placeId = string(row.geo_google_place_id);
  const fingerprint = string(row.geo_source_fingerprint);
  const googleCurrent = publicPoint
    && visibility === "EXACT_PUBLIC"
    && Boolean(placeId && fingerprint)
    && fingerprint === string(row.geo_google_place_source_fingerprint);

  return {
    "Google Place ID": googleCurrent ? placeId : "",
    "Google miesto aktuálne": googleCurrent,
    "Google Maps cieľ": googleCurrent ? "PLACE" : publicPoint ? "COORDINATES" : "",
    "Google Maps netreba": notRequired,
    "Latitude": publicPoint ? latitude : null,
    "Longitude": publicPoint ? longitude : null,
    "GEO stav": notRequired ? "NOT_REQUIRED" : status,
    "GEO provider": publicPoint ? string(row.geo_provider) : "",
    "Presnosť lokality": publicPoint ? string(row.geo_public_precision) : "",
  };
}

/** Only fields in this explicit allowlist can be refreshed independently
 * of the bidirectional editorial snapshot baseline. */
export function notionGeoMirrorChanges(
  desired: Record<string, ReconciliationValue>,
  current: Record<string, ReconciliationValue>,
  agenda: "events" | "organizations",
) {
  const fields: string[] = [...notionGeoMirrorFields];
  if (agenda === "organizations") fields.push("Adresa");
  return Object.fromEntries(fields.filter((field) => (
    Object.hasOwn(desired, field)
    && String(desired[field] ?? "").trim() !== String(current[field] ?? "").trim()
  )).map((field) => [field, desired[field]]));
}
