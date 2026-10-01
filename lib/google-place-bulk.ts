import { env } from "cloudflare:workers";
import {
  applyGooglePlaceResolution,
  getGeoPointForTarget,
  getGeoSourceLocation,
  getGoogleMapsWorkflowDecision,
  hasExplicitPrivateGeoDecision,
} from "@/lib/geo-store";
import {
  discoverGoogleDirectoryPlaces,
  evaluateGoogleDirectoryAutoMatch,
} from "@/lib/google-place-directory-discovery";
import { updateManagedDirectoryProfileFromGooglePlace } from "@/lib/directory-store";

type Bindings = { DB?: D1Database };
type Row = Record<string, unknown>;

export const GOOGLE_PLACE_BULK_MAX = 100;

export type GooglePlaceBulkSelectionFilters = {
  category?: string;
  operator?: string;
  google?: string;
  query?: string;
};

export type GooglePlaceBulkSelection = {
  targetIds: number[];
  nextCursor: string | null;
  hasMore: boolean;
  filterFingerprint: string;
};

type GooglePlaceBulkCursor = {
  filterFingerprint: string;
  lastName: string;
  lastId: number;
};

const BULK_OPERATORS = new Set([
  "ALL", "ERRORS", "ON_MAP", "PENDING", "NEEDS_REVIEW", "MISSING_ADDRESS",
  "INCOMPLETE_ADDRESS", "INVALID_ADDRESS", "FAILED", "NOT_PUBLIC",
]);
const BULK_GOOGLE = new Set(["ALL", "PLACE", "COORDINATES", "NOT_REQUIRED", "UNRESOLVED"]);

function cleanFilterText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeGooglePlaceBulkFilters(value: unknown): Required<GooglePlaceBulkSelectionFilters> {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const operatorRaw = cleanFilterText(record.operator, 30).toUpperCase();
  const googleRaw = cleanFilterText(record.google, 30).toUpperCase();
  return {
    category: cleanFilterText(record.category, 100),
    operator: BULK_OPERATORS.has(operatorRaw) ? operatorRaw : "ALL",
    google: BULK_GOOGLE.has(googleRaw) ? googleRaw : "ALL",
    query: cleanFilterText(record.query, 160),
  };
}

export function googlePlaceBulkFilterFingerprint(filters: Required<GooglePlaceBulkSelectionFilters>) {
  return JSON.stringify({
    category: filters.category,
    operator: filters.operator,
    google: filters.google,
    query: filters.query,
  });
}

function parseBulkCursor(value: unknown, expectedFingerprint: string): GooglePlaceBulkCursor | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || value.length > 1000) throw new Error("Neplatný Google bulk cursor.");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("Neplatný Google bulk cursor."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Neplatný Google bulk cursor.");
  const record = parsed as Record<string, unknown>;
  const lastId = Number(record.lastId);
  if (
    record.filterFingerprint !== expectedFingerprint
    || typeof record.lastName !== "string"
    || !Number.isSafeInteger(lastId)
    || lastId <= 0
  ) {
    throw new Error("Google bulk cursor nepatrí k aktuálnemu filtru. Začni dávku od začiatku.");
  }
  return {
    filterFingerprint: expectedFingerprint,
    lastName: record.lastName,
    lastId,
  };
}

function bulkCount(value: unknown) {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1 || count > GOOGLE_PLACE_BULK_MAX) {
    throw new Error(`Google bulk povoľuje 1 až ${GOOGLE_PLACE_BULK_MAX} profilov.`);
  }
  return count;
}

const DIRECTORY_BULK_BASE_CTE = `
WITH
explicit_private AS (
  SELECT DISTINCT subject_id
  FROM moderation_events
  WHERE resource_type = 'GEO_POINT'
    AND action = 'GEO_VISIBILITY_CHANGED'
    AND actor_type = 'ADMIN'
    AND to_status = 'SKIPPED'
),
map_review_ranked AS (
  SELECT
    subject_id,
    action,
    ROW_NUMBER() OVER (
      PARTITION BY subject_id
      ORDER BY created_at DESC, id DESC
    ) AS row_number
  FROM moderation_events
  WHERE resource_type = 'GEO_POINT'
    AND action IN ('GOOGLE_MAPS_NOT_REQUIRED', 'GOOGLE_MAPS_REQUIRED_AGAIN')
),
map_review AS (
  SELECT subject_id, action
  FROM map_review_ranked
  WHERE row_number = 1
),
raw AS (
  SELECT
    d.id,
    d.name,
    d.category,
    COALESCE(d.address, '') AS address,
    COALESCE(d.city, '') AS city,
    COALESCE(d.district, '') AS district,
    COALESCE(d.region, '') AS region,
    COALESCE(d.postal_code, '') AS postal_code,
    COALESCE(d.street, '') AS street,
    COALESCE(d.house_number, '') AS house_number,
    COALESCE(d.address_format, '') AS address_format,
    COALESCE(d.service_address_confirmation, '') AS service_address_confirmation,
    g.id AS geo_point_id,
    g.geocode_status,
    g.public_visibility,
    g.public_precision,
    g.source_fingerprint,
    g.resolved_source_fingerprint,
    g.google_place_id,
    g.google_place_source_fingerprint,
    g.latitude,
    g.longitude,
    g.manual_override,
    CASE WHEN ep.subject_id IS NULL THEN 0 ELSE 1 END AS explicit_private,
    mr.action AS map_review_action
  FROM directory_profiles d
  LEFT JOIN geo_points g
    ON g.directory_profile_id = d.id
    AND g.target_type = 'DIRECTORY_PROFILE'
  LEFT JOIN explicit_private ep ON ep.subject_id = CAST(g.id AS TEXT)
  LEFT JOIN map_review mr ON mr.subject_id = CAST(g.id AS TEXT)
  WHERE d.status = 'published' AND d.archived_at IS NULL
),
base AS (
  SELECT
    raw.*,
    CASE
      WHEN map_review_action = 'GOOGLE_MAPS_NOT_REQUIRED' THEN 'NOT_REQUIRED'
      WHEN trim(COALESCE(google_place_id, '')) <> ''
        AND trim(COALESCE(google_place_source_fingerprint, '')) <> ''
        AND google_place_source_fingerprint = source_fingerprint
        THEN 'PLACE'
      WHEN latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND COALESCE(public_visibility, '') <> 'HIDDEN'
        AND trim(COALESCE(source_fingerprint, '')) <> ''
        AND resolved_source_fingerprint = source_fingerprint
        THEN 'COORDINATES'
      ELSE 'UNRESOLVED'
    END AS google_state,
    CASE
      WHEN trim(address) <> '' AND NOT (
        trim(region) <> ''
        AND trim(district) <> ''
        AND trim(city) <> ''
        AND service_address_confirmation = 'CONFIRMED_SERVICE_LOCATION'
        AND length(replace(trim(postal_code), ' ', '')) = 5
        AND replace(trim(postal_code), ' ', '') GLOB '[0-9][0-9][0-9][0-9][0-9]'
        AND (
          (address_format = 'STREET' AND trim(street) <> '')
          OR (
            address_format = 'MUNICIPALITY_NUMBER'
            AND trim(house_number) <> ''
            AND trim(street) = ''
          )
        )
      ) THEN 'NEEDS_REVIEW'
      WHEN trim(region) = '' AND trim(district) = '' AND trim(city) = ''
        AND trim(postal_code) = '' AND trim(street) = '' AND trim(house_number) = ''
        AND trim(address_format) = ''
        THEN 'MISSING_ADDRESS'
      WHEN trim(region) = '' OR trim(district) = '' OR trim(city) = ''
        THEN 'INCOMPLETE_ADDRESS'
      WHEN service_address_confirmation <> 'CONFIRMED_SERVICE_LOCATION'
        THEN 'NEEDS_REVIEW'
      WHEN trim(postal_code) = '' OR trim(address_format) = ''
        THEN 'INCOMPLETE_ADDRESS'
      WHEN length(replace(trim(postal_code), ' ', '')) <> 5
        OR replace(trim(postal_code), ' ', '') NOT GLOB '[0-9][0-9][0-9][0-9][0-9]'
        OR (address_format = 'MUNICIPALITY_NUMBER' AND trim(street) <> '')
        THEN 'INVALID_ADDRESS'
      WHEN address_format = 'STREET' AND trim(street) = ''
        THEN 'INCOMPLETE_ADDRESS'
      WHEN address_format = 'MUNICIPALITY_NUMBER' AND trim(house_number) = ''
        THEN 'INCOMPLETE_ADDRESS'
      WHEN geocode_status = 'FAILED' THEN 'FAILED'
      WHEN COALESCE(manual_override, 0) = 1 THEN 'NEEDS_REVIEW'
      WHEN public_visibility = 'HIDDEN' OR geocode_status = 'SKIPPED' THEN 'NOT_PUBLIC'
      WHEN geocode_status IN ('NEEDS_REVIEW', 'STALE') THEN 'NEEDS_REVIEW'
      WHEN geocode_status IS NULL OR geocode_status = 'PENDING' THEN 'PENDING'
      WHEN geocode_status = 'RESOLVED'
        AND public_visibility = 'EXACT_PUBLIC'
        AND public_precision = 'EXACT'
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND trim(COALESCE(source_fingerprint, '')) <> ''
        AND resolved_source_fingerprint = source_fingerprint
        THEN 'ON_MAP'
      ELSE 'NEEDS_REVIEW'
    END AS operator_state,
    trim(
      COALESCE(name, '') || ' ' ||
      COALESCE(category, '') || ' ' ||
      COALESCE(city, '') || ' ' ||
      COALESCE(district, '') || ' ' ||
      COALESCE(region, '') || ' ' ||
      COALESCE(address, '')
    ) AS search_text
  FROM raw
)
`;

export async function selectGooglePlaceBulkTargets(input: {
  count: unknown;
  filters?: unknown;
  cursor?: unknown;
}): Promise<GooglePlaceBulkSelection> {
  const database = requireDb();
  const count = bulkCount(input.count);
  const filters = normalizeGooglePlaceBulkFilters(input.filters);
  const filterFingerprint = googlePlaceBulkFilterFingerprint(filters);
  const cursor = parseBulkCursor(input.cursor, filterFingerprint);

  if (filters.google === "PLACE" || filters.google === "NOT_REQUIRED") {
    return { targetIds: [], nextCursor: cursor ? JSON.stringify(cursor) : null, hasMore: false, filterFingerprint };
  }

  const clauses = [
    "google_state <> 'PLACE'",
    "google_state <> 'NOT_REQUIRED'",
    "COALESCE(manual_override, 0) = 0",
    "NOT (COALESCE(explicit_private, 0) = 1 AND public_visibility = 'HIDDEN')",
  ];
  const bindings: Array<string | number> = [];
  if (filters.category) {
    clauses.push("category = ?");
    bindings.push(filters.category);
  }
  if (filters.operator === "ERRORS") {
    clauses.push("operator_state IN ('INCOMPLETE_ADDRESS', 'INVALID_ADDRESS', 'FAILED')");
  } else if (filters.operator !== "ALL") {
    clauses.push("operator_state = ?");
    bindings.push(filters.operator);
  }
  if (filters.google !== "ALL") {
    clauses.push("google_state = ?");
    bindings.push(filters.google);
  }
  if (filters.query) {
    clauses.push("search_text LIKE ? COLLATE NOCASE");
    bindings.push(`%${filters.query}%`);
  }
  if (cursor) {
    clauses.push("(name COLLATE NOCASE > ? OR (name COLLATE NOCASE = ? AND id > ?))");
    bindings.push(cursor.lastName, cursor.lastName, cursor.lastId);
  }

  const rows = await database.prepare(`
    ${DIRECTORY_BULK_BASE_CTE}
    SELECT id, name
    FROM base
    WHERE ${clauses.join(" AND ")}
    ORDER BY name COLLATE NOCASE ASC, id ASC
    LIMIT ?
  `).bind(...bindings, count + 1).all<Row>();

  const candidates = rows.results ?? [];
  const selected = candidates.slice(0, count);
  const hasMore = candidates.length > count;
  const last = selected[selected.length - 1];
  const nextCursor = last
    ? JSON.stringify({
        filterFingerprint,
        lastName: text(last, "name"),
        lastId: Number(last.id),
      } satisfies GooglePlaceBulkCursor)
    : cursor
      ? JSON.stringify(cursor)
      : null;

  return {
    targetIds: selected.map((row) => Number(row.id)),
    nextCursor,
    hasMore,
    filterFingerprint,
  };
}

export type GooglePlaceBulkResult = {
  targetId: number;
  name: string;
  result: "UPDATED" | "REVIEW" | "NO_MATCH" | "SKIPPED" | "ERROR";
  reason: string;
  candidate: {
    id: string;
    displayName: string;
    formattedAddress: string;
  } | null;
};

function requireDb() {
  const database = (env as unknown as Bindings).DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Google bulk databáza nie je pripojená.");
  }
  return database;
}

function text(row: Row | null, key: string) {
  return String(row?.[key] ?? "").trim();
}

function flag(row: Row | null, key: string) {
  return Boolean(row?.[key]);
}

export function validateGooglePlaceBulkTargetIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > GOOGLE_PLACE_BULK_MAX) {
    throw new Error(`Google bulk povoľuje 1 až ${GOOGLE_PLACE_BULK_MAX} profilov.`);
  }
  const ids = value.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error("Google bulk ID musia byť kladné celé čísla.");
  }
  if (new Set(ids).size !== ids.length) throw new Error("Google bulk ID musia byť unique.");
  return ids;
}

export async function processGooglePlaceBulkTarget(input: {
  targetId: number;
  actorRef: string;
}): Promise<GooglePlaceBulkResult> {
  const targetId = Number(input.targetId);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    return { targetId, name: "", result: "ERROR", reason: "Neplatné profile ID.", candidate: null };
  }

  try {
    const database = requireDb();
    const row = await database.prepare(`
      SELECT
        d.id, d.name, d.category, d.status, d.archived_at,
        g.google_place_id, g.google_place_source_fingerprint, g.source_fingerprint,
        g.manual_override, g.public_visibility
      FROM directory_profiles d
      LEFT JOIN geo_points g
        ON g.directory_profile_id = d.id
        AND g.target_type = 'DIRECTORY_PROFILE'
      WHERE d.id = ?
      LIMIT 1
    `).bind(targetId).first<Row>();

    if (!row) {
      return { targetId, name: "", result: "SKIPPED", reason: "Profil neexistuje.", candidate: null };
    }

    const name = text(row, "name");
    if (text(row, "status") !== "published" || row.archived_at !== null) {
      return { targetId, name, result: "SKIPPED", reason: "Bulk spracúva iba publikované nearchivované profily.", candidate: null };
    }
    if (flag(row, "manual_override")) {
      return { targetId, name, result: "REVIEW", reason: "Profil má ručný GEO override; bulk ho nesmie prepísať.", candidate: null };
    }
    if (
      text(row, "public_visibility") === "HIDDEN"
      && await hasExplicitPrivateGeoDecision("DIRECTORY_PROFILE", targetId, database)
    ) {
      return { targetId, name, result: "REVIEW", reason: "Profil má explicitne neverejnú polohu; bulk súkromie nemení.", candidate: null };
    }

    if (await getGoogleMapsWorkflowDecision("DIRECTORY_PROFILE", targetId, database) === "NOT_REQUIRED") {
      return { targetId, name, result: "SKIPPED", reason: "Admin označil Google Maps ako nepotrebné.", candidate: null };
    }

    const googlePlaceId = text(row, "google_place_id");
    const googleFingerprint = text(row, "google_place_source_fingerprint");
    const sourceFingerprint = text(row, "source_fingerprint");
    if (googlePlaceId && googleFingerprint && sourceFingerprint && googleFingerprint === sourceFingerprint) {
      return { targetId, name, result: "SKIPPED", reason: "Profil už má aktuálny Google Place.", candidate: null };
    }

    const source = await getGeoSourceLocation("DIRECTORY_PROFILE", targetId, database);
    if (!source) {
      return { targetId, name, result: "SKIPPED", reason: "Canonical profil sa nenašiel.", candidate: null };
    }

    const candidates = await discoverGoogleDirectoryPlaces(source);
    const match = evaluateGoogleDirectoryAutoMatch(source, candidates);
    const candidate = match.candidate ? {
      id: match.candidate.id,
      displayName: match.candidate.displayName,
      formattedAddress: match.candidate.formattedAddress,
    } : null;

    if (match.decision !== "MATCH" || !match.candidate) {
      return {
        targetId,
        name,
        result: match.decision,
        reason: match.reason,
        candidate,
      };
    }

    const pointBeforeWrite = await getGeoPointForTarget("DIRECTORY_PROFILE", targetId, database);
    if (pointBeforeWrite?.manualOverride) {
      return { targetId, name, result: "REVIEW", reason: "GEO sa počas spracovania zmenilo na manual override.", candidate };
    }
    if (
      pointBeforeWrite?.publicVisibility === "HIDDEN"
      && await hasExplicitPrivateGeoDecision("DIRECTORY_PROFILE", targetId, database)
    ) {
      return { targetId, name, result: "REVIEW", reason: "Poloha bola počas spracovania explicitne nastavená ako neverejná.", candidate };
    }

    const profile = await updateManagedDirectoryProfileFromGooglePlace(
      targetId,
      match.candidate,
      input.actorRef,
      database,
    );
    if (!profile) {
      return { targetId, name, result: "ERROR", reason: "Profil sa pri zápise nenašiel.", candidate };
    }

    const point = await getGeoPointForTarget("DIRECTORY_PROFILE", targetId, database);
    if (!point || point.manualOverride) {
      return { targetId, name, result: "REVIEW", reason: "Google adresu sa podarilo uložiť, ale GEO bod nie je bezpečne automatizovateľný.", candidate };
    }
    if (point.publicVisibility !== "EXACT_PUBLIC" || point.publicPrecision !== "EXACT") {
      return {
        targetId,
        name,
        result: "REVIEW",
        reason: "Google adresu sa podarilo uložiť, ale exact verejná klasifikácia vyžaduje kontrolu.",
        candidate,
      };
    }

    await applyGooglePlaceResolution({
      targetType: "DIRECTORY_PROFILE",
      targetId,
      place: {
        id: match.candidate.id,
        latitude: match.candidate.latitude,
        longitude: match.candidate.longitude,
      },
    }, database);

    return {
      targetId,
      name,
      result: "UPDATED",
      reason: match.reason,
      candidate,
    };
  } catch (error) {
    return {
      targetId,
      name: "",
      result: "ERROR",
      reason: error instanceof Error ? error.message : String(error),
      candidate: null,
    };
  }
}
