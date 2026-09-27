import { env } from "cloudflare:workers";

export type CanonicalDraftEntityType =
  | "EVENT"
  | "ORGANIZATION"
  | "HELP_ITEM"
  | "ADOPTION"
  | "FOSTER"
  | "LOST_FOUND"
  | "DIRECTORY";

export type CanonicalDraftFlagType = "POSSIBLE_DUPLICATE";

export type CanonicalDraftPossibleDuplicateDetails = {
  candidateIds: number[];
  sourceUrl: string | null;
};

export type CanonicalDraftFlag = {
  id: number;
  entityType: CanonicalDraftEntityType;
  canonicalEntityId: number;
  flagType: CanonicalDraftFlagType;
  details: CanonicalDraftPossibleDuplicateDetails;
  createdAt: string;
};

export type CanonicalDraftFlagDatabase = Pick<D1Database, "prepare">;
type RuntimeBindings = { DB?: D1Database };

function database(input?: CanonicalDraftFlagDatabase) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Canonical draft flags nemajú pripojenú databázu.");
}

function parseDetails(value: unknown): CanonicalDraftPossibleDuplicateDetails {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const object = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const candidateIds = Array.isArray(object.candidateIds)
      ? object.candidateIds
          .map((item) => Number(item))
          .filter((item) => Number.isSafeInteger(item) && item > 0)
      : [];
    return {
      candidateIds: [...new Set(candidateIds)],
      sourceUrl: typeof object.sourceUrl === "string" && object.sourceUrl.trim()
        ? object.sourceUrl.trim()
        : null,
    };
  } catch {
    return { candidateIds: [], sourceUrl: null };
  }
}

export async function getCanonicalDraftFlag(
  entityType: CanonicalDraftEntityType,
  canonicalEntityId: number,
  flagType: CanonicalDraftFlagType,
  databaseInput?: CanonicalDraftFlagDatabase,
): Promise<CanonicalDraftFlag | null> {
  const db = database(databaseInput);
  const row = await db.prepare(`SELECT id,entity_type,canonical_entity_id,flag_type,details_json,created_at
    FROM canonical_draft_flags
    WHERE entity_type=? AND canonical_entity_id=? AND flag_type=?
    LIMIT 1`).bind(entityType, canonicalEntityId, flagType).first<{
      id: number;
      entity_type: CanonicalDraftEntityType;
      canonical_entity_id: number;
      flag_type: CanonicalDraftFlagType;
      details_json: string;
      created_at: string;
    }>();
  if (!row) return null;
  return {
    id: Number(row.id),
    entityType: row.entity_type,
    canonicalEntityId: Number(row.canonical_entity_id),
    flagType: row.flag_type,
    details: parseDetails(row.details_json),
    createdAt: String(row.created_at),
  };
}

export async function upsertCanonicalPossibleDuplicateFlag(
  input: {
    entityType: CanonicalDraftEntityType;
    canonicalEntityId: number;
    candidateIds: number[];
    sourceUrl?: string | null;
    createdAt: string;
  },
  databaseInput?: CanonicalDraftFlagDatabase,
) {
  const db = database(databaseInput);
  const details: CanonicalDraftPossibleDuplicateDetails = {
    candidateIds: [...new Set(input.candidateIds.filter((id) => Number.isSafeInteger(id) && id > 0 && id !== input.canonicalEntityId))],
    sourceUrl: input.sourceUrl?.trim() || null,
  };
  await db.prepare(`INSERT INTO canonical_draft_flags
    (entity_type,canonical_entity_id,flag_type,details_json,created_at)
    VALUES (?,?,'POSSIBLE_DUPLICATE',?,?)
    ON CONFLICT(entity_type,canonical_entity_id,flag_type)
    DO UPDATE SET details_json=excluded.details_json`).bind(
      input.entityType,
      input.canonicalEntityId,
      JSON.stringify(details),
      input.createdAt,
    ).run();
  return getCanonicalDraftFlag(input.entityType, input.canonicalEntityId, "POSSIBLE_DUPLICATE", db);
}

export type CanonicalDraftDuplicateWarning = {
  reason: string;
  sourceUrl: string | null;
  candidates: Array<{ id: number; href: null }>;
};

export async function getCanonicalDraftDuplicateWarning(
  entityType: CanonicalDraftEntityType,
  canonicalEntityId: number,
  databaseInput?: CanonicalDraftFlagDatabase,
): Promise<CanonicalDraftDuplicateWarning | null> {
  const flag = await getCanonicalDraftFlag(entityType, canonicalEntityId, "POSSIBLE_DUPLICATE", databaseInput);
  if (!flag) return null;
  return {
    reason: "Koncept je označený na kontrolu možnej duplicity.",
    sourceUrl: flag.details.sourceUrl,
    candidates: flag.details.candidateIds.map((id) => ({ id, href: null })),
  };
}
