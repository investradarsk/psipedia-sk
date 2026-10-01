import { env } from "cloudflare:workers";
import {
  applyGooglePlaceResolution,
  getGeoPointForTarget,
  getGeoSourceLocation,
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
        d.id, d.name, d.category, d.status, d.archived_at, d.online,
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
    if (flag(row, "online")) {
      return { targetId, name, result: "SKIPPED", reason: "Online-only profil nepotrebuje presný Google Maps bod.", candidate: null };
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
