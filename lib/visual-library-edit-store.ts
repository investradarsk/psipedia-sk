import { env } from "cloudflare:workers";
import { defaultBannerDraft, validateBannerDraft, type BannerDraft } from "@/lib/visual-library-drafts";
import { visualLibraryBanners } from "@/lib/visual-library-banners";

export type StoredVisualDraft = {
  id: string;
  variantIndex: number;
  draft: BannerDraft;
  revision: number;
  publishedRevision: number | null;
  published: BannerDraft | null;
};
type EditRow = {
  banner_id: string;
  variant_index: number;
  draft_json: string;
  revision: number;
  published_json: string | null;
  published_revision: number | null;
};
const ALLOWED_PUBLICATIONS: Record<string, { url: string; variant: number }> = {
  "homepage:profil": { url: "https://psipedia.sk/", variant: 0 },
  "plemena:kluby": { url: "https://psipedia.sk/plemena", variant: 0 },
};

export const allowedVisualPublishTargets = ALLOWED_PUBLICATIONS;

function database() {
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db || typeof db.prepare !== "function") throw new Error("Databáza nie je dostupná.");
  return db;
}
export function validatedBannerKey(id: unknown, variantIndex: unknown) {
  const banner = typeof id === "string" ? visualLibraryBanners.find((x) => x.id === id) : null;
  if (!banner || typeof variantIndex !== "number" || !Number.isInteger(variantIndex) ||
    variantIndex < 0 || variantIndex >= (banner.variants?.length ?? 1)) {
    throw new Error("Neznámy banner alebo textový variant.");
  }
  return { banner, variantIndex };
}
export function validatePublication(
  id: string, variantIndex: number, draft: BannerDraft, acknowledgedUrl: unknown,
): { url: string } {
  const target = ALLOWED_PUBLICATIONS[id];
  if (!target || target.variant !== variantIndex) {
    throw new Error("Tento banner zatiaľ nepodporuje bezpečné publikovanie. Návrh však môžeš uložiť.");
  }
  if (draft.scope !== "one") {
    throw new Error("Publikovanie spoločnej šablóny nie je povolené bez kontroly všetkých jej použití.");
  }
  if (acknowledgedUrl !== target.url) {
    throw new Error("Pred publikovaním potvrď presnú URL stránky, ktorú meníš.");
  }
  const { banner } = validatedBannerKey(id, variantIndex);
  const original = defaultBannerDraft(banner, variantIndex);
  if (banner.photoTone && draft.background !== "original") {
    throw new Error("Fotografický banner nesmie meniť pozadie pri publikovaní.");
  }
  if (draft.eyebrow !== original.eyebrow || draft.title !== original.title ||
    draft.description !== original.description || draft.ctaLabel !== original.ctaLabel) {
    throw new Error("Textové zmeny ešte nie je možné publikovať bez zmeny mobilu. Ulož ich ako návrh.");
  }
  return target;
}
function fromRow(row: EditRow): StoredVisualDraft {
  const { banner, variantIndex } = validatedBannerKey(row.banner_id, row.variant_index);
  const original = defaultBannerDraft(banner, variantIndex);
  const draft = validateBannerDraft(JSON.parse(row.draft_json), original);
  if (!draft) throw new Error("Uložený návrh má neplatné údaje.");
  const published = row.published_json ? validateBannerDraft(JSON.parse(row.published_json), original) : null;
  return {
    id: row.banner_id, variantIndex, draft, revision: row.revision,
    published: published ?? null, publishedRevision: row.published_revision ?? null,
  };
}
function serviceUnavailable(error: unknown): never {
  if (error instanceof Error && /no such table:\s*visual_library_banner_edits/i.test(error.message)) {
    throw new Error("Úložisko vizuálnych návrhov ešte nie je pripravené. Vyžaduje schválenú migráciu D1 0151.");
  }
  throw error;
}

export async function getVisualDraft(id: string, variantIndex: number): Promise<StoredVisualDraft | null> {
  validatedBannerKey(id, variantIndex);
  try {
    const row = await database().prepare(`
      SELECT banner_id,variant_index,draft_json,revision,published_json,published_revision
      FROM visual_library_banner_edits WHERE banner_id=? AND variant_index=? LIMIT 1
    `).bind(id, variantIndex).first<EditRow>();
    return row ? fromRow(row) : null;
  } catch (error) { return serviceUnavailable(error); }
}

export async function saveVisualDraft(input: {
  id: string; variantIndex: number; draft: unknown; revision: number;
  updatedBy: string;
}): Promise<StoredVisualDraft> {
  const { banner } = validatedBannerKey(input.id, input.variantIndex);
  if (!Number.isInteger(input.revision) || input.revision < 0) throw new Error("Neplatná verzia návrhu.");
  const original = defaultBannerDraft(banner, input.variantIndex);
  const parsed = validateBannerDraft(input.draft, original);
  if (!parsed) throw new Error("Návrh obsahuje neplatný alebo prázdny text.");
  const now = new Date().toISOString();
  const db = database();
  try {
    if (input.revision === 0) {
      const result = await db.prepare(`
        INSERT INTO visual_library_banner_edits(
          banner_id,variant_index,draft_json,revision,updated_at,updated_by
        ) VALUES (?,?,?,1,?,?) ON CONFLICT(banner_id,variant_index) DO NOTHING
      `).bind(input.id, input.variantIndex, JSON.stringify(parsed), now, input.updatedBy).run();
      if (!result.meta?.changes) throw new Error("KONFLIKT_VERZIE");
    } else {
      const result = await db.prepare(`
        UPDATE visual_library_banner_edits
        SET draft_json=?,revision=revision+1,updated_at=?,updated_by=?
        WHERE banner_id=? AND variant_index=? AND revision=?
      `).bind(JSON.stringify(parsed), now, input.updatedBy,
        input.id, input.variantIndex, input.revision).run();
      if (!result.meta?.changes) throw new Error("KONFLIKT_VERZIE");
    }
    const row = await getVisualDraft(input.id, input.variantIndex);
    if (!row) throw new Error("Návrh sa nepodarilo načítať.");
    return row;
  } catch (error) { return serviceUnavailable(error); }
}

export async function publishVisualDraft(input: {
  id: string; variantIndex: number; revision: number;
  confirmedUrl: unknown; publishedBy: string; action: "publish" | "revert";
}): Promise<StoredVisualDraft> {
  validatedBannerKey(input.id, input.variantIndex);
  if (!Number.isInteger(input.revision) || input.revision <= 0) throw new Error("Neplatná verzia návrhu.");
  // Only allow dedicated single-location published desktop releases.
  const target = ALLOWED_PUBLICATIONS[input.id];
  if (!target || input.variantIndex !== target.variant || input.confirmedUrl !== target.url) {
    throw new Error("Nepovolený cieľ publikovania alebo neoverená URL.");
  }
  const current = await getVisualDraft(input.id, input.variantIndex);
  if (!current) throw new Error("Najprv musíš uložiť návrh.");
  if (current.revision !== input.revision) throw new Error("KONFLIKT_VERZIE");
  if (input.action === "publish") validatePublication(input.id, input.variantIndex, current.draft, input.confirmedUrl);

  const db = database();
  const now = new Date().toISOString();
  try {
    const result = await db.prepare(`
      UPDATE visual_library_banner_edits
      SET published_json=?, published_revision=?, published_at=?, published_by=?
      WHERE banner_id=? AND variant_index=? AND revision=? AND published_revision IS ?
    `).bind(
      input.action === "publish" ? JSON.stringify(current.draft) : null,
      input.action === "publish" ? current.revision : null,
      input.action === "publish" ? now : null,
      input.action === "publish" ? input.publishedBy : null,
      input.id, input.variantIndex, input.revision, current.publishedRevision,
    ).run();
    if (!result.meta?.changes) throw new Error("KONFLIKT_VERZIE");
    const updated = await getVisualDraft(input.id, input.variantIndex);
    if (!updated) throw new Error("Stav publikovania sa nepodarilo načítať.");
    return updated;
  } catch (error) { return serviceUnavailable(error); }
}

/** Public side: allowlisted IDs only; a failure returns original static style. */
export async function getPublishedDesktopBannerColors(id: string): Promise<Pick<BannerDraft, "background" | "button"> | null> {
  if (!ALLOWED_PUBLICATIONS[id]) return null;
  try {
    const stored = await getVisualDraft(id, ALLOWED_PUBLICATIONS[id].variant);
    if (!stored?.published) return null;
    validatePublication(id, ALLOWED_PUBLICATIONS[id].variant, stored.published, ALLOWED_PUBLICATIONS[id].url);
    return { background: stored.published.background, button: stored.published.button };
  } catch (error) {
    console.error("visual_library_public_colors_unavailable", id, error);
    return null;
  }
}
