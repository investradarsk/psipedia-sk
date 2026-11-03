import { env } from "cloudflare:workers";
import {
  ownerDecisionPairKey,
  validateOwnerDecisionDraft,
  type OwnerDecisionDraft,
  type SavedOwnerDecision,
} from "@/lib/visual-library-owner-decision-queue";

/**
 * Server-only D1 queue. Existing migration 0152 already ships this table.
 * Its namespace cannot pass the separately allowlisted banner publish path.
 * No public page reads these records.
 */
const PREFIX = "owner-decision:";
const TABLE = "visual_library_banner_edits";

type DecisionRow = {
  banner_id: string;
  revision: number;
  draft_json: string;
  updated_at: string;
  updated_by: string;
};

function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Databáza nie je dostupná.");
  return db;
}

function storageError(error: unknown): never {
  if (error instanceof Error && /no such table:\s*visual_library_banner_edits/i.test(error.message)) {
    throw new Error("Úložisko rozhodnutí vyžaduje existujúcu migráciu D1 0152.");
  }
  throw error;
}

function stored(row: DecisionRow): SavedOwnerDecision {
  if (!row.banner_id.startsWith(PREFIX) || !Number.isSafeInteger(row.revision) || row.revision < 1) {
    throw new Error("Neplatný uložený záznam rozhodnutia.");
  }
  const draft = validateOwnerDecisionDraft(JSON.parse(row.draft_json));
  const key = ownerDecisionPairKey(draft.leftId, draft.rightId);
  if (key !== row.banner_id) throw new Error("Neplatná väzba uloženého rozhodnutia.");
  return {
    key,
    revision: row.revision,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    draft,
  };
}

export async function getOwnerDecision(leftId: string, rightId: string): Promise<SavedOwnerDecision | null> {
  const key = ownerDecisionPairKey(leftId, rightId);
  try {
    const row = await database().prepare(
      "SELECT banner_id,revision,draft_json,updated_at,updated_by FROM visual_library_banner_edits WHERE banner_id=? AND variant_index=0 AND published_json IS NULL LIMIT 1",
    ).bind(key).first<DecisionRow>();
    return row ? stored(row) : null;
  } catch (error) { return storageError(error); }
}

export async function listOwnerDecisions(input: {
  offset?: number;
  limit?: number;
} = {}): Promise<{ items: SavedOwnerDecision[]; nextOffset: number | null }> {
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 25;
  if (!Number.isSafeInteger(offset) || offset < 0 ||
    !Number.isSafeInteger(limit) || limit < 1 || limit > 50 || offset > 10000) {
    throw new Error("Neplatné stránkovanie rozhodnutí.");
  }
  try {
    const rows = await database().prepare(
      "SELECT banner_id,revision,draft_json,updated_at,updated_by FROM visual_library_banner_edits WHERE banner_id LIKE ? AND variant_index=0 AND published_json IS NULL ORDER BY updated_at DESC,banner_id ASC LIMIT ? OFFSET ?",
    ).bind(PREFIX + "%", limit + 1, offset).all<DecisionRow>();
    const all = rows.results ?? [];
    const more = all.length > limit;
    const items = all.slice(0, limit).map(stored);
    return { items, nextOffset: more ? offset + items.length : null };
  } catch (error) { return storageError(error); }
}

export async function saveOwnerDecision(input: {
  draft: unknown;
  revision: unknown;
  updatedBy: string;
}): Promise<SavedOwnerDecision> {
  const draft: OwnerDecisionDraft = validateOwnerDecisionDraft(input.draft);
  const key = ownerDecisionPairKey(draft.leftId, draft.rightId);
  const rev = input.revision;
  if (!Number.isSafeInteger(rev) || typeof rev !== "number" || rev < 0) {
    throw new Error("Neplatná verzia rozhodnutia.");
  }
  if (typeof input.updatedBy !== "string" || !input.updatedBy.trim()) {
    throw new Error("Chýba autentifikovaný editor.");
  }
  const now = new Date().toISOString();
  const db = database();
  try {
    if (rev === 0) {
      const result = await db.prepare(
        "INSERT INTO visual_library_banner_edits (banner_id,variant_index,draft_json,revision,updated_at,updated_by) VALUES (?,0,?,1,?,?) ON CONFLICT(banner_id,variant_index) DO NOTHING",
      ).bind(key, JSON.stringify(draft), now, input.updatedBy).run();
      if (!result.meta?.changes) throw new Error("KONFLIKT_VERZIE");
    } else {
      const result = await db.prepare(
        "UPDATE visual_library_banner_edits SET draft_json=?,revision=revision+1,updated_at=?,updated_by=? WHERE banner_id=? AND variant_index=0 AND revision=? AND published_json IS NULL",
      ).bind(JSON.stringify(draft), now, input.updatedBy, key, rev).run();
      if (!result.meta?.changes) throw new Error("KONFLIKT_VERZIE");
    }
    const record = await getOwnerDecision(draft.leftId, draft.rightId);
    if (!record) throw new Error("Uložené rozhodnutie sa nepodarilo znovu načítať.");
    return record;
  } catch (error) { return storageError(error); }
}
