import { env } from "cloudflare:workers";
import { evaluateDirectoryServiceAddress } from "@/lib/directory-service-address";
import { geoSensitiveDirectoryCategory, sha256Hex } from "@/lib/geo";
import {
  evaluateGooglePlaceCandidates,
  type GooglePlaceMatchResult,
  type GooglePlaceMatchTarget,
} from "@/lib/google-place-matching";
import {
  googlePlacesApiKey,
  searchGooglePlacesText,
  validGooglePlaceId,
} from "@/lib/google-places-provider";

type Bindings = { DB?: D1Database };
type Db = Pick<D1Database, "prepare" | "batch">;
type Row = Record<string, unknown>;

export const GOOGLE_PLACE_CANARY_DEFAULT = 3;
export const GOOGLE_PLACE_CANARY_MAX = 5;
export const GOOGLE_PLACE_CANARY_CONFIRMATION = "GOOGLE-PLACE-CANARY";

export type GooglePlaceCanaryTarget = {
  targetId: number;
  name: string;
  category: string;
  city: string;
  district: string;
  region: string;
  postalCode: string;
  street: string;
  houseNumber: string;
  addressFormat: "STREET" | "MUNICIPALITY_NUMBER";
  canonicalAddress: string;
  latitude: number;
  longitude: number;
  sourceFingerprint: string;
  resolvedSourceFingerprint: string;
  currentGooglePlaceId: string | null;
  currentGooglePlaceSourceFingerprint: string | null;
};

export type GooglePlaceCanaryPreviewItem = GooglePlaceCanaryTarget & {
  query: string;
  decision: GooglePlaceMatchResult["decision"];
  reason: string;
  candidate: GooglePlaceMatchResult["candidate"];
  candidateCount: number;
  previewFingerprint: string | null;
};

export type GooglePlaceCanaryApplyInput = {
  targetId: number;
  sourceFingerprint: string;
  googlePlaceId: string;
  previewFingerprint: string;
};

function db(database?: Db) {
  const bound = (env as unknown as Bindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Google Place canary databáza nie je pripojená.");
  return resolved;
}

function text(row: Row, key: string) {
  return String(row[key] ?? "").trim();
}

function nullable(row: Row, key: string) {
  const value = row[key];
  return value === null || value === undefined || value === "" ? null : String(value);
}

function num(row: Row, key: string) {
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}

function normalizeLimit(value: number | undefined) {
  return Math.max(1, Math.min(GOOGLE_PLACE_CANARY_MAX, Math.trunc(value || GOOGLE_PLACE_CANARY_DEFAULT)));
}

function validateTargetIds(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > GOOGLE_PLACE_CANARY_MAX) {
    throw new Error(`Google Place canary povoľuje 1 až ${GOOGLE_PLACE_CANARY_MAX} target ID.`);
  }
  const ids = value.map(Number);
  if (ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error("Google Place target ID musia byť unique kladné celé čísla.");
  }
  return ids;
}

export function validateGooglePlaceCanaryTargetIds(value: unknown) {
  return validateTargetIds(value) ?? [];
}

function makeQuery(target: Pick<GooglePlaceCanaryTarget, "name" | "street" | "houseNumber" | "postalCode" | "city">) {
  return [target.name, target.street, target.houseNumber, target.postalCode, target.city, "Slovensko"]
    .map((value) => value.trim()).filter(Boolean).join(" ");
}

async function previewFingerprint(target: GooglePlaceCanaryTarget, placeId: string, result: GooglePlaceMatchResult) {
  const candidate = result.candidate;
  if (!candidate) return null;
  return sha256Hex(JSON.stringify({
    version: "google-place-preview:v1",
    targetId: target.targetId,
    sourceFingerprint: target.sourceFingerprint,
    canonicalAddress: target.canonicalAddress,
    latitude: target.latitude,
    longitude: target.longitude,
    placeId,
    candidate: {
      displayName: candidate.displayName,
      formattedAddress: candidate.formattedAddress,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
    },
    decision: result.decision,
  }));
}

function mapEligibleRow(row: Row): GooglePlaceCanaryTarget | null {
  const addressFormat = row.address_format === "STREET" || row.address_format === "MUNICIPALITY_NUMBER"
    ? row.address_format
    : "";
  const evaluation = evaluateDirectoryServiceAddress({
    region: text(row, "region"),
    district: text(row, "district"),
    city: text(row, "city"),
    postalCode: text(row, "postal_code"),
    street: text(row, "street"),
    houseNumber: text(row, "house_number"),
    addressFormat: addressFormat as "STREET" | "MUNICIPALITY_NUMBER",
    serviceAddressConfirmation: row.service_address_confirmation === "CONFIRMED_SERVICE_LOCATION"
      ? "CONFIRMED_SERVICE_LOCATION"
      : "LEGACY_UNCONFIRMED",
    online: Boolean(row.online),
  });
  const latitude = num(row, "latitude");
  const longitude = num(row, "longitude");
  const sourceFingerprint = text(row, "source_fingerprint");
  const resolvedSourceFingerprint = text(row, "resolved_source_fingerprint");
  const category = text(row, "category");

  if (
    evaluation.state !== "COMPLETE"
    || row.status !== "published"
    || row.archived_at !== null
    || Boolean(row.online)
    || geoSensitiveDirectoryCategory(category)
    || text(row, "geocode_status") !== "RESOLVED"
    || text(row, "public_visibility") !== "EXACT_PUBLIC"
    || text(row, "public_precision") !== "EXACT"
    || latitude === null
    || longitude === null
    || !sourceFingerprint
    || sourceFingerprint !== resolvedSourceFingerprint
  ) return null;

  return {
    targetId: Number(row.id),
    name: text(row, "name"),
    category,
    city: text(row, "city"),
    district: text(row, "district"),
    region: text(row, "region"),
    postalCode: evaluation.normalizedPostalCode,
    street: text(row, "street"),
    houseNumber: text(row, "house_number"),
    addressFormat,
    canonicalAddress: evaluation.formattedAddress!,
    latitude,
    longitude,
    sourceFingerprint,
    resolvedSourceFingerprint,
    currentGooglePlaceId: nullable(row, "google_place_id"),
    currentGooglePlaceSourceFingerprint: nullable(row, "google_place_source_fingerprint"),
  };
}

async function loadCandidateRows(input: { targetIds?: number[] | null; limit?: number; includeCurrentGoogle?: boolean }, database?: Db) {
  const databaseHandle = db(database);
  const ids = input.targetIds ?? null;
  const whereIds = ids?.length ? ` AND d.id IN (${ids.map(() => "?").join(",")})` : "";
  const order = ids?.length
    ? "ORDER BY d.id ASC"
    : "ORDER BY CASE WHEN lower(d.category) LIKE '%veter%' THEN 0 ELSE 1 END, d.name COLLATE NOCASE ASC, d.id ASC";
  const googleEligibility = input.includeCurrentGoogle
    ? ""
    : "AND (g.google_place_id IS NULL OR g.google_place_source_fingerprint IS NULL OR g.google_place_source_fingerprint <> g.source_fingerprint)";
  const statement = databaseHandle.prepare(`
    SELECT
      d.id, d.name, d.category, d.status, d.archived_at, d.city, d.district, d.region,
      d.postal_code, d.street, d.house_number, d.address_format, d.service_address_confirmation, d.online,
      g.latitude, g.longitude, g.geocode_status, g.public_visibility, g.public_precision,
      g.source_fingerprint, g.resolved_source_fingerprint,
      g.google_place_id, g.google_place_source_fingerprint
    FROM directory_profiles d
    JOIN geo_points g ON g.directory_profile_id = d.id AND g.target_type = 'DIRECTORY_PROFILE'
    WHERE d.status = 'published'
      AND d.archived_at IS NULL
      AND d.online = 0
      AND d.service_address_confirmation = 'CONFIRMED_SERVICE_LOCATION'
      AND g.geocode_status = 'RESOLVED'
      AND g.public_visibility = 'EXACT_PUBLIC'
      AND g.public_precision = 'EXACT'
      AND g.latitude IS NOT NULL
      AND g.longitude IS NOT NULL
      AND g.source_fingerprint = g.resolved_source_fingerprint
      ${googleEligibility}
      ${whereIds}
    ${order}
    LIMIT 50
  `);
  const result = ids?.length ? await statement.bind(...ids).all<Row>() : await statement.all<Row>();
  const mapped = result.results.map(mapEligibleRow).filter((item): item is GooglePlaceCanaryTarget => item !== null);
  if (ids?.length) {
    const found = new Set(mapped.map((item) => item.targetId));
    const missing = ids.filter((id) => !found.has(id));
    if (missing.length) throw new Error(`Targety nie sú eligible pre Google Place canary: ${missing.join(", ")}.`);
    const byId = new Map(mapped.map((item) => [item.targetId, item]));
    return ids.map((id) => byId.get(id)!);
  }
  return mapped.slice(0, normalizeLimit(input.limit));
}

async function previewOne(target: GooglePlaceCanaryTarget, apiKey?: string) {
  const query = makeQuery(target);
  const candidates = await searchGooglePlacesText({ query, apiKey });
  const matchTarget: GooglePlaceMatchTarget = {
    targetId: target.targetId,
    name: target.name,
    city: target.city,
    postalCode: target.postalCode,
    canonicalAddress: target.canonicalAddress,
    latitude: target.latitude,
    longitude: target.longitude,
  };
  const result = evaluateGooglePlaceCandidates(matchTarget, candidates);
  const placeId = result.candidate?.id ?? "";
  return {
    ...target,
    query,
    decision: result.decision,
    reason: result.reason,
    candidate: result.candidate,
    candidateCount: result.candidates.length,
    previewFingerprint: placeId ? await previewFingerprint(target, placeId, result) : null,
  } satisfies GooglePlaceCanaryPreviewItem;
}


export type GooglePlaceAutoAssignResult = {
  targetId: number;
  result: "UPDATED" | "NO_OP" | "REVIEW" | "NO_MATCH" | "INELIGIBLE" | "DISABLED" | "ERROR";
  googlePlaceId: string | null;
  reason: string;
};

export async function autoAssignGooglePlaceForDirectoryProfile(input: {
  targetId: number;
  apiKey?: string;
  database?: Db;
}): Promise<GooglePlaceAutoAssignResult> {
  const targetId = Number(input.targetId);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    return { targetId, result: "INELIGIBLE", googlePlaceId: null, reason: "Neplatné directory profile ID." };
  }

  try {
    const databaseHandle = db(input.database);
    let target: GooglePlaceCanaryTarget;
    try {
      [target] = await loadCandidateRows({
        targetIds: [targetId],
        includeCurrentGoogle: true,
      }, databaseHandle);
    } catch (error) {
      return {
        targetId,
        result: "INELIGIBLE",
        googlePlaceId: null,
        reason: error instanceof Error ? error.message : "Profil nie je eligible pre Google Place auto-match.",
      };
    }

    if (
      target.currentGooglePlaceId
      && target.currentGooglePlaceSourceFingerprint === target.sourceFingerprint
    ) {
      return {
        targetId,
        result: "NO_OP",
        googlePlaceId: target.currentGooglePlaceId,
        reason: "Profil už má aktuálne Google Place ID pre súčasný source fingerprint.",
      };
    }

    const key = input.apiKey ?? googlePlacesApiKey();
    if (!key) {
      return {
        targetId,
        result: "DISABLED",
        googlePlaceId: null,
        reason: "GOOGLE_PLACES_API_KEY nie je nakonfigurovaný.",
      };
    }

    const item = await previewOne(target, key);
    if (item.decision !== "MATCH" || !item.candidate) {
      return {
        targetId,
        result: item.decision,
        googlePlaceId: item.candidate?.id ?? null,
        reason: item.reason,
      };
    }

    const matchedAt = new Date().toISOString();
    const write = await databaseHandle.prepare(`
      UPDATE geo_points
      SET google_place_id = ?, google_place_source_fingerprint = ?, google_place_matched_at = ?
      WHERE target_type = 'DIRECTORY_PROFILE'
        AND directory_profile_id = ?
        AND source_fingerprint = ?
        AND resolved_source_fingerprint = source_fingerprint
        AND geocode_status = 'RESOLVED'
        AND public_visibility = 'EXACT_PUBLIC'
        AND public_precision = 'EXACT'
        AND (
          google_place_id IS NULL
          OR google_place_source_fingerprint IS NULL
          OR google_place_source_fingerprint <> source_fingerprint
        )
    `).bind(
      item.candidate.id,
      target.sourceFingerprint,
      matchedAt,
      target.targetId,
      target.sourceFingerprint,
    ).run();

    const changes = Number(write.meta?.changes ?? 0);
    return {
      targetId,
      result: changes > 0 ? "UPDATED" : "NO_OP",
      googlePlaceId: item.candidate.id,
      reason: changes > 0
        ? item.reason
        : "Google Place identity sa medzitým aktualizovala alebo sa zmenil GEO source fingerprint.",
    };
  } catch (error) {
    return {
      targetId,
      result: "ERROR",
      googlePlaceId: null,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function previewGooglePlaceCanary(input: {
  targetIds?: unknown;
  limit?: number;
  apiKey?: string;
  database?: Db;
}) {
  const targetIds = validateTargetIds(input.targetIds);
  const targets = await loadCandidateRows({ targetIds, limit: input.limit }, input.database);
  const key = input.apiKey ?? googlePlacesApiKey();
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY nie je nakonfigurovaný.");
  const items: GooglePlaceCanaryPreviewItem[] = [];
  for (const target of targets.slice(0, GOOGLE_PLACE_CANARY_MAX)) {
    items.push(await previewOne(target, key));
  }
  return { requested: targetIds?.length ?? normalizeLimit(input.limit), matchedTargets: items.length, items };
}

export async function applyGooglePlaceCanary(input: {
  selections: unknown;
  confirmation: unknown;
  apiKey?: string;
  database?: Db;
}) {
  if (input.confirmation !== GOOGLE_PLACE_CANARY_CONFIRMATION) {
    throw new Error(`Chýba explicitné ${GOOGLE_PLACE_CANARY_CONFIRMATION} potvrdenie.`);
  }
  if (!Array.isArray(input.selections) || input.selections.length < 1 || input.selections.length > GOOGLE_PLACE_CANARY_MAX) {
    throw new Error("Apply vyžaduje 1 až 5 explicitne vybraných MATCH položiek.");
  }
  const selections = input.selections.map((raw) => {
    const item = raw as Partial<GooglePlaceCanaryApplyInput>;
    if (!Number.isSafeInteger(item.targetId) || Number(item.targetId) <= 0
      || typeof item.sourceFingerprint !== "string" || !item.sourceFingerprint
      || !validGooglePlaceId(item.googlePlaceId)
      || typeof item.previewFingerprint !== "string" || !item.previewFingerprint) {
      throw new Error("Neplatný Google Place apply payload.");
    }
    return item as GooglePlaceCanaryApplyInput;
  });
  if (new Set(selections.map((item) => item.targetId)).size !== selections.length) {
    throw new Error("Apply targety musia byť unique.");
  }

  const databaseHandle = db(input.database);
  const targets = await loadCandidateRows({
    targetIds: selections.map((item) => item.targetId),
    includeCurrentGoogle: true,
  }, databaseHandle);
  const key = input.apiKey ?? googlePlacesApiKey();
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY nie je nakonfigurovaný.");

  const prepared: Array<{ target: GooglePlaceCanaryTarget; item: GooglePlaceCanaryPreviewItem; noOp: boolean }> = [];
  for (const selection of selections) {
    const target = targets.find((item) => item.targetId === selection.targetId)!;
    if (target.sourceFingerprint !== selection.sourceFingerprint) {
      throw new Error(`Target #${selection.targetId}: source fingerprint sa od preview zmenil.`);
    }
    const item = await previewOne(target, key);
    if (item.decision !== "MATCH" || !item.candidate || item.candidate.id !== selection.googlePlaceId) {
      throw new Error(`Target #${selection.targetId}: Google kandidát už nie je rovnaký bezpečný MATCH.`);
    }
    if (item.previewFingerprint !== selection.previewFingerprint) {
      throw new Error(`Target #${selection.targetId}: preview je stale (canonical/GEO/Google candidate sa zmenil).`);
    }
    prepared.push({
      target,
      item,
      noOp: target.currentGooglePlaceId === item.candidate.id
        && target.currentGooglePlaceSourceFingerprint === target.sourceFingerprint,
    });
  }

  const writes = prepared.filter((entry) => !entry.noOp);
  if (writes.length) {
    const matchedAt = new Date().toISOString();
    await databaseHandle.batch(writes.map(({ target, item }) =>
      databaseHandle.prepare(`
        UPDATE geo_points
        SET google_place_id = ?, google_place_source_fingerprint = ?, google_place_matched_at = ?
        WHERE target_type = 'DIRECTORY_PROFILE'
          AND directory_profile_id = ?
          AND source_fingerprint = ?
          AND resolved_source_fingerprint = source_fingerprint
          AND geocode_status = 'RESOLVED'
          AND public_visibility = 'EXACT_PUBLIC'
          AND public_precision = 'EXACT'
      `).bind(item.candidate!.id, target.sourceFingerprint, matchedAt, target.targetId, target.sourceFingerprint),
    ));
  }

  return {
    requested: selections.length,
    written: writes.length,
    noOp: prepared.length - writes.length,
    items: prepared.map(({ target, item, noOp }) => ({
      targetId: target.targetId,
      googlePlaceId: item.candidate!.id,
      result: noOp ? "NO_OP" : "UPDATED",
    })),
  };
}
