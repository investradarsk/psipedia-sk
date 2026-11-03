import { env } from "cloudflare:workers";
import {
  validateVisualComponentProposal, isVisualComponentProposalId, type VisualComponentProposal,
  type VisualComponentProposalId,
} from "@/lib/visual-library-component-proposals";

/** Reuse the already deployed D1 revisioned draft table (0152).
 * A separate 'component-proposal:' namespace can never pass the banner
 * public-publish allowlist, and these rows always have null published_json.
 * This module is SERVER ONLY: do not import it in client React previews.
 */
const PREFIX = "component-proposal:";
type ProposalRow = { draft_json: string; revision: number };

export type StoredComponentProposal = {
  id: VisualComponentProposalId;
  revision: number;
  draft: VisualComponentProposal;
};

function database(): D1Database {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Databáza nie je dostupná.");
  return db;
}

function key(id: VisualComponentProposalId): string {
  return PREFIX + id;
}

function parseRevision(value: unknown, min: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
    throw new Error("Neplatná verzia vizuálneho návrhu.");
  }
  return value;
}

function unavailable(error: unknown): never {
  if (error instanceof Error && /no such table:\s*visual_library_banner_edits/i.test(error.message)) {
    throw new Error("Úložisko vizuálnych návrhov vyžaduje už schválenú migráciu D1 0152.");
  }
  throw error;
}

export async function getVisualComponentProposal(rawId: unknown): Promise<StoredComponentProposal | null> {
  const { id } = validateVisualComponentProposalId(rawId);
  try {
    const row = await database().prepare(
      "SELECT draft_json,revision FROM visual_library_banner_edits WHERE banner_id=? AND variant_index=0 LIMIT 1",
    ).bind(key(id)).first<ProposalRow>();
    if (!row) return null;
    const { draft } = validateVisualComponentProposal(id, JSON.parse(row.draft_json));
    return { id, revision: row.revision, draft };
  } catch (error) { return unavailable(error); }
}

function validateVisualComponentProposalId(id: unknown): { id: VisualComponentProposalId } {
  // Validate the ID using the same allowlisted proposal contract as writes.
  if (!isVisualComponentProposalId(id)) throw new Error("Neznáma alebo neupraviteľná vizuálna ukážka.");
  return { id };
}


export async function saveVisualComponentProposal(input: {
  id: unknown;
  revision: unknown;
  draft: unknown;
  updatedBy: string;
}): Promise<StoredComponentProposal> {
  const { id, draft } = validateVisualComponentProposal(input.id, input.draft);
  const revision = parseRevision(input.revision, 0);
  if (typeof input.updatedBy !== "string" || !input.updatedBy.trim()) {
    throw new Error("Chýba autentifikovaný editor.");
  }
  const db = database();
  const now = new Date().toISOString();
  try {
    if (revision === 0) {
      const result = await db.prepare(
        "INSERT INTO visual_library_banner_edits (banner_id,variant_index,draft_json,revision,updated_at,updated_by) VALUES (?,0,?,1,?,?) ON CONFLICT(banner_id,variant_index) DO NOTHING",
      ).bind(key(id), JSON.stringify(draft), now, input.updatedBy).run();
      if (!result.meta?.changes) throw new Error("KONFLIKT_VERZIE");
    } else {
      const result = await db.prepare(
        "UPDATE visual_library_banner_edits SET draft_json=?,revision=revision+1,updated_at=?,updated_by=? WHERE banner_id=? AND variant_index=0 AND revision=? AND published_json IS NULL",
      ).bind(JSON.stringify(draft), now, input.updatedBy, key(id), revision).run();
      if (!result.meta?.changes) throw new Error("KONFLIKT_VERZIE");
    }
    const record = await getVisualComponentProposal(id);
    if (!record) throw new Error("Serverový návrh sa nepodarilo znovu načítať.");
    return record;
  } catch (error) { return unavailable(error); }
}
