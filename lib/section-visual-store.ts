import { env } from "cloudflare:workers";
import {
  findSectionVisualDefinition,
  normalizeSectionVisualCrop,
  resolveSectionVisual,
  type ResolvedSectionVisual,
  type SectionVisualCrop,
  type SectionVisualDefinition,
  type StoredSectionVisual,
} from "@/lib/section-visual-contract";

type RuntimeBindings = { DB?: D1Database };
type SectionVisualRow = {
  visual_key: string;
  section_slug: string | null;
  subsection_slug: string | null;
  image_url: string;
  image_key: string | null;
  alt_text: string;
  desktop_x: number;
  desktop_y: number;
  desktop_zoom: number;
  mobile_x: number;
  mobile_y: number;
  mobile_zoom: number;
  updated_at: string;
  updated_by: string;
};

function database() {
  const db = (env as unknown as RuntimeBindings).DB;
  return db && typeof db.prepare === "function" ? db : null;
}

function fromRow(row: SectionVisualRow): StoredSectionVisual {
  return {
    visualKey: row.visual_key,
    sectionSlug: row.section_slug,
    subsectionSlug: row.subsection_slug,
    imageUrl: row.image_url,
    imageKey: row.image_key,
    altText: row.alt_text,
    desktopCrop: normalizeSectionVisualCrop({ x: Number(row.desktop_x), y: Number(row.desktop_y), zoom: Number(row.desktop_zoom) }),
    mobileCrop: normalizeSectionVisualCrop({ x: Number(row.mobile_x), y: Number(row.mobile_y), zoom: Number(row.mobile_zoom) }),
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  };
}

function isMissingVisualTable(error: unknown) {
  return error instanceof Error && /no such table:\s*section_visuals/i.test(error.message);
}

export async function listStoredSectionVisuals(): Promise<StoredSectionVisual[]> {
  const db = database();
  if (!db) return [];
  try {
    const result = await db.prepare(`
      SELECT visual_key,section_slug,subsection_slug,image_url,image_key,alt_text,
             desktop_x,desktop_y,desktop_zoom,mobile_x,mobile_y,mobile_zoom,updated_at,updated_by
      FROM section_visuals
      ORDER BY visual_key
    `).all<SectionVisualRow>();
    return result.results.map(fromRow);
  } catch (error) {
    if (isMissingVisualTable(error)) return [];
    throw error;
  }
}

export async function getStoredSectionVisual(visualKey: string): Promise<StoredSectionVisual | null> {
  const db = database();
  if (!db) return null;
  try {
    const row = await db.prepare(`
      SELECT visual_key,section_slug,subsection_slug,image_url,image_key,alt_text,
             desktop_x,desktop_y,desktop_zoom,mobile_x,mobile_y,mobile_zoom,updated_at,updated_by
      FROM section_visuals
      WHERE visual_key=?
      LIMIT 1
    `).bind(visualKey).first<SectionVisualRow>();
    return row ? fromRow(row) : null;
  } catch (error) {
    if (isMissingVisualTable(error)) return null;
    throw error;
  }
}

export async function getResolvedSectionVisual(visualKey: string): Promise<ResolvedSectionVisual | null> {
  const definition = findSectionVisualDefinition(visualKey);
  if (!definition) return null;
  return resolveSectionVisual(definition, await getStoredSectionVisual(visualKey));
}

export async function getSectionHeroVisual(visualKey: string): Promise<ResolvedSectionVisual> {
  const resolved = await getResolvedSectionVisual(visualKey);
  if (resolved) return resolved;
  return {
    visualKey,
    sectionSlug: null,
    subsectionSlug: null,
    imageUrl: "/images/hero-labrador.webp",
    imageKey: null,
    altText: "Pes – vizuál Psipedia",
    desktopCrop: { x: 0.5, y: 0.5, zoom: 1 },
    mobileCrop: { x: 0.5, y: 0.5, zoom: 1 },
    source: "default",
  };
}

export function resolveSectionVisualList(
  definitions: SectionVisualDefinition[],
  stored: StoredSectionVisual[],
) {
  const byKey = new Map(stored.map((visual) => [visual.visualKey, visual]));
  return definitions.map((definition) => ({
    definition,
    visual: resolveSectionVisual(definition, byKey.get(definition.visualKey)),
  }));
}

function validateMediaPath(imageUrl: string, imageKey: string | null) {
  if (imageUrl.startsWith("/images/") && !imageKey) return;
  if (!imageUrl.startsWith("/media/section-visuals/")) {
    throw new Error("Vizuál musí používať stabilný Psipedia asset alebo obrázok nahratý cez správcu vizuálov.");
  }
  if (imageKey && !imageKey.startsWith("section-visuals/")) {
    throw new Error("Kľúč obrázka nepatrí do priečinka vizuálov sekcií.");
  }
}

export async function saveStoredSectionVisual(input: {
  definition: SectionVisualDefinition;
  imageUrl: string;
  imageKey: string | null;
  altText: string;
  desktopCrop: Partial<SectionVisualCrop>;
  mobileCrop: Partial<SectionVisualCrop>;
  updatedBy: string;
}): Promise<StoredSectionVisual> {
  const db = database();
  if (!db) throw new Error("Databáza nie je dostupná.");

  const imageUrl = input.imageUrl.trim();
  const imageKey = input.imageKey?.trim() || null;
  const altText = input.altText.trim();
  validateMediaPath(imageUrl, imageKey);
  if (!altText) throw new Error("Doplň ALT text obrázka.");
  if (altText.length > 300) throw new Error("ALT text môže mať najviac 300 znakov.");

  const desktop = normalizeSectionVisualCrop(input.desktopCrop, input.definition.defaultDesktopCrop);
  const mobile = normalizeSectionVisualCrop(input.mobileCrop, input.definition.defaultMobileCrop);
  const updatedAt = new Date().toISOString();

  try {
    await db.prepare(`
      INSERT INTO section_visuals (
        visual_key,section_slug,subsection_slug,image_url,image_key,alt_text,
        desktop_x,desktop_y,desktop_zoom,mobile_x,mobile_y,mobile_zoom,updated_at,updated_by
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(visual_key) DO UPDATE SET
        section_slug=excluded.section_slug,
        subsection_slug=excluded.subsection_slug,
        image_url=excluded.image_url,
        image_key=excluded.image_key,
        alt_text=excluded.alt_text,
        desktop_x=excluded.desktop_x,
        desktop_y=excluded.desktop_y,
        desktop_zoom=excluded.desktop_zoom,
        mobile_x=excluded.mobile_x,
        mobile_y=excluded.mobile_y,
        mobile_zoom=excluded.mobile_zoom,
        updated_at=excluded.updated_at,
        updated_by=excluded.updated_by
    `).bind(
      input.definition.visualKey,
      input.definition.sectionSlug,
      input.definition.subsectionSlug,
      imageUrl,
      imageKey,
      altText,
      desktop.x,
      desktop.y,
      desktop.zoom,
      mobile.x,
      mobile.y,
      mobile.zoom,
      updatedAt,
      input.updatedBy,
    ).run();
  } catch (error) {
    if (isMissingVisualTable(error)) {
      throw new Error("Úložisko vizuálov ešte nie je pripravené. Najprv aplikuj D1 migráciu 0106.");
    }
    throw error;
  }

  return {
    visualKey: input.definition.visualKey,
    sectionSlug: input.definition.sectionSlug,
    subsectionSlug: input.definition.subsectionSlug,
    imageUrl,
    imageKey,
    altText,
    desktopCrop: desktop,
    mobileCrop: mobile,
    updatedAt,
    updatedBy: input.updatedBy,
  };
}

export async function deleteStoredSectionVisual(visualKey: string) {
  const db = database();
  if (!db) return;
  try {
    await db.prepare("DELETE FROM section_visuals WHERE visual_key=?").bind(visualKey).run();
  } catch (error) {
    if (isMissingVisualTable(error)) return;
    throw error;
  }
}
