import { env } from "cloudflare:workers";
import type { EshopRatingField, EshopRatingInput } from "@/lib/eshop-rating-domain";

export type PublicEshop = {
  id: number;
  slug: string;
  name: string;
  websiteUrl: string;
  description: string;
  sourceUrl: string;
  logoUrl: string | null;
  focusTags: string[];
  ratingCount: number;
  averages: EshopRatingInput | null;
};

export type ManagedEshop = PublicEshop & {
  logoKey: string | null;
  status: "draft" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
};

export type ManagedEshopUpdateInput = {
  name: string;
  slug: string;
  websiteUrl: string;
  description: string;
  sourceUrl: string;
  logoUrl?: string | null;
  logoKey?: string | null;
  focusTags?: string[];
  status: "draft" | "published" | "archived";
};

type RuntimeBindings = { DB?: D1Database };
type EshopRow = {
  id: number; slug: string; name: string; website_url: string; description: string; source_url: string;
  logo_url: string | null; logo_key: string | null; focus_tags_json: string;
  status: string; created_at: string; updated_at: string; published_at: string | null; rating_count: number;
  delivery_average: number | null; communication_average: number | null; assortment_average: number | null;
  price_average: number | null; overall_average: number | null;
};
type ExistingRatingRow = { delivery_rating: number; communication_rating: number; assortment_rating: number; price_rating: number; overall_rating: number };

export class EshopRatingError extends Error {
  readonly status: number; readonly code: string; readonly field: EshopRatingField | null;
  constructor(message: string, status = 400, code = "INVALID_ESHOP_RATING", field: EshopRatingField | null = null) {
    super(message); this.name = "EshopRatingError"; this.status = status; this.code = code; this.field = field;
  }
}

export function getEshopDatabase(database?: D1Database) {
  const db = database ?? (env as unknown as RuntimeBindings).DB;
  if (!db?.prepare) throw new EshopRatingError("Databáza e-shopov nie je dostupná.", 503, "DATABASE_UNAVAILABLE");
  return db;
}

function oneToFive(value: unknown, field: EshopRatingField) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
    throw new EshopRatingError("Hodnotenie musí byť celé číslo od 1 do 5.", 400, "INVALID_RATING", field);
  }
  return Number(value);
}

export function normalizeEshopRating(input: Record<string, unknown>): EshopRatingInput {
  return {
    delivery: oneToFive(input.delivery, "delivery"), communication: oneToFive(input.communication, "communication"),
    assortment: oneToFive(input.assortment, "assortment"), price: oneToFive(input.price, "price"), overall: oneToFive(input.overall, "overall"),
  };
}

function safeSlug(value: unknown) {
  if (typeof value !== "string" || !/^[a-z0-9-]{1,100}$/.test(value)) throw new EshopRatingError("E-shop nie je platný.", 400, "INVALID_ESHOP");
  return value;
}

function round(value: number | null) {
  return value === null || !Number.isFinite(Number(value)) ? null : Math.round((Number(value) + Number.EPSILON) * 10) / 10;
}

function parseFocusTags(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

function normalizedText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string") throw new EshopRatingError(`${label} nie je platný.`, 400, "INVALID_ESHOP_PROFILE");
  const clean = value.trim();
  if (!clean || clean.length > maxLength) throw new EshopRatingError(`${label} nie je platný.`, 400, "INVALID_ESHOP_PROFILE");
  return clean;
}

function normalizedOptionalUrl(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") return null;
  const clean = normalizedText(value, label, 800);
  if (clean.startsWith("/media/")) return clean;
  try {
    const url = new URL(clean);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocol");
    return url.toString();
  } catch {
    throw new EshopRatingError(`${label} musí byť platná URL.`, 400, "INVALID_ESHOP_PROFILE");
  }
}

function normalizedUrl(value: unknown, label: string) {
  const clean = normalizedOptionalUrl(value, label);
  if (!clean) throw new EshopRatingError(`${label} je povinná.`, 400, "INVALID_ESHOP_PROFILE");
  return clean;
}

export function normalizeEshopFocusTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const tag = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
    if (!tag || tag.length > 40) continue;
    const key = tag.toLocaleLowerCase("sk-SK");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tag);
    if (result.length >= 12) break;
  }
  return result;
}

function mapAverages(row: EshopRow): EshopRatingInput | null {
  if (Number(row.rating_count ?? 0) <= 0) return null;
  return {
    delivery: round(row.delivery_average) ?? 0, communication: round(row.communication_average) ?? 0,
    assortment: round(row.assortment_average) ?? 0, price: round(row.price_average) ?? 0, overall: round(row.overall_average) ?? 0,
  };
}

function mapPublic(row: EshopRow): PublicEshop {
  return {
    id: Number(row.id), slug: row.slug, name: row.name, websiteUrl: row.website_url, description: row.description, sourceUrl: row.source_url,
    logoUrl: row.logo_url || null, focusTags: parseFocusTags(row.focus_tags_json),
    ratingCount: Math.max(0, Number(row.rating_count ?? 0)), averages: mapAverages(row),
  };
}

const PUBLIC_SELECT = `
  SELECT shop.id,shop.slug,shop.name,shop.website_url,shop.description,shop.source_url,shop.logo_url,shop.logo_key,shop.focus_tags_json,shop.status,
    shop.created_at,shop.updated_at,shop.published_at,COUNT(rating.id) AS rating_count,
    AVG(rating.delivery_rating) AS delivery_average,AVG(rating.communication_rating) AS communication_average,
    AVG(rating.assortment_rating) AS assortment_average,AVG(rating.price_rating) AS price_average,
    AVG(rating.overall_rating) AS overall_average
  FROM managed_eshops shop
  LEFT JOIN eshop_ratings rating ON rating.eshop_id=shop.id
`;

export async function listPublishedEshops(database?: D1Database): Promise<PublicEshop[]> {
  const db = getEshopDatabase(database);
  const { results } = await db.prepare(PUBLIC_SELECT + `
    WHERE shop.status='published' AND shop.published_at IS NOT NULL
    GROUP BY shop.id
    ORDER BY CASE WHEN COUNT(rating.id)>0 THEN 0 ELSE 1 END, AVG(rating.overall_rating) DESC, shop.name COLLATE NOCASE ASC
  `).all<EshopRow>();
  return results.map(mapPublic);
}

export async function getPublishedEshopBySlug(slugValue: unknown, database?: D1Database): Promise<PublicEshop | null> {
  const slug = safeSlug(slugValue); const db = getEshopDatabase(database);
  const row = await db.prepare(PUBLIC_SELECT + `
    WHERE shop.slug=?1 AND shop.status='published' AND shop.published_at IS NOT NULL
    GROUP BY shop.id LIMIT 1
  `).bind(slug).first<EshopRow>();
  return row ? mapPublic(row) : null;
}

export async function getEshopRatingForAuthor(eshopId: number, authorId: string, database?: D1Database): Promise<EshopRatingInput | null> {
  const db = getEshopDatabase(database);
  const row = await db.prepare(`SELECT delivery_rating,communication_rating,assortment_rating,price_rating,overall_rating
    FROM eshop_ratings WHERE eshop_id=?1 AND author_id=?2 LIMIT 1`).bind(eshopId, authorId).first<ExistingRatingRow>();
  return row ? {
    delivery: Number(row.delivery_rating), communication: Number(row.communication_rating), assortment: Number(row.assortment_rating),
    price: Number(row.price_rating), overall: Number(row.overall_rating),
  } : null;
}

export async function upsertVerifiedEshopRating(input: {
  eshopId: number; authorId: string; ratings: EshopRatingInput; database?: D1Database; now?: Date;
}) {
  const db = getEshopDatabase(input.database);
  const shop = await db.prepare("SELECT id FROM managed_eshops WHERE id=?1 AND status='published' AND published_at IS NOT NULL LIMIT 1")
    .bind(input.eshopId).first<{ id: number }>();
  if (!shop) throw new EshopRatingError("E-shop sa nenašiel alebo nie je verejný.", 404, "ESHOP_NOT_FOUND");
  const now = (input.now ?? new Date()).toISOString(); const id = crypto.randomUUID();
  const row = await db.prepare(`
    INSERT INTO eshop_ratings (id,eshop_id,author_id,delivery_rating,communication_rating,assortment_rating,price_rating,overall_rating,created_at,updated_at)
    VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?9)
    ON CONFLICT(eshop_id,author_id) DO UPDATE SET
      delivery_rating=excluded.delivery_rating,communication_rating=excluded.communication_rating,
      assortment_rating=excluded.assortment_rating,price_rating=excluded.price_rating,overall_rating=excluded.overall_rating,
      updated_at=excluded.updated_at
    RETURNING id,created_at,updated_at
  `).bind(id,input.eshopId,input.authorId,input.ratings.delivery,input.ratings.communication,input.ratings.assortment,input.ratings.price,input.ratings.overall,now)
    .first<{ id: string; created_at: string; updated_at: string }>();
  if (!row) throw new EshopRatingError("Hodnotenie sa nepodarilo uložiť.", 503, "SAVE_FAILED");
  return { id: row.id, created: row.created_at === row.updated_at, updatedAt: row.updated_at };
}

export async function listManagedEshops(database?: D1Database): Promise<ManagedEshop[]> {
  const db = getEshopDatabase(database);
  const { results } = await db.prepare(PUBLIC_SELECT + " GROUP BY shop.id ORDER BY shop.name COLLATE NOCASE ASC").all<EshopRow>();
  return results.map((row) => ({
    ...mapPublic(row), logoKey: row.logo_key || null, status: row.status === "published" || row.status === "archived" ? row.status : "draft",
    createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at,
  }));
}

export async function countManagedEshops(database?: D1Database) {
  const db = getEshopDatabase(database);
  const row = await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published FROM managed_eshops")
    .first<{ total: number; published: number }>();
  return { total: Math.max(0, Number(row?.total ?? 0)), published: Math.max(0, Number(row?.published ?? 0)) };
}


export async function getManagedEshopById(id: number, database?: D1Database): Promise<ManagedEshop | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const db = getEshopDatabase(database);
  const row = await db.prepare(PUBLIC_SELECT + " WHERE shop.id=?1 GROUP BY shop.id LIMIT 1").bind(id).first<EshopRow>();
  if (!row) return null;
  return {
    ...mapPublic(row),
    logoKey: row.logo_key || null,
    status: row.status === "published" || row.status === "archived" ? row.status : "draft",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export async function updateManagedEshop(
  id: number,
  input: ManagedEshopUpdateInput,
  actor: string,
  database?: D1Database,
): Promise<ManagedEshop | null> {
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const db = getEshopDatabase(database);
  const current = await getManagedEshopById(id, db);
  if (!current) return null;

  const name = normalizedText(input.name, "Názov", 160);
  const slug = safeSlug(input.slug);
  const websiteUrl = normalizedUrl(input.websiteUrl, "Web e-shopu");
  const description = normalizedText(input.description, "Popis", 3000);
  const sourceUrl = normalizedUrl(input.sourceUrl, "Zdroj");
  const logoUrl = normalizedOptionalUrl(input.logoUrl, "Logo");
  const logoKey = typeof input.logoKey === "string" && input.logoKey.trim() ? input.logoKey.trim().slice(0, 500) : null;
  const focusTags = normalizeEshopFocusTags(input.focusTags);
  const status = input.status === "published" || input.status === "archived" ? input.status : "draft";
  const now = new Date().toISOString();
  const publishedAt = status === "published" ? (current.publishedAt ?? now) : current.publishedAt;

  try {
    await db.prepare(`
      UPDATE managed_eshops
      SET name=?2,slug=?3,website_url=?4,description=?5,source_url=?6,
          logo_url=?7,logo_key=?8,focus_tags_json=?9,status=?10,updated_at=?11,
          published_at=?12,updated_by=?13
      WHERE id=?1
    `).bind(
      id,name,slug,websiteUrl,description,sourceUrl,
      logoUrl,logoKey,JSON.stringify(focusTags),status,now,publishedAt,actor,
    ).run();
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw new EshopRatingError("E-shop s rovnakou adresou profilu už existuje.", 409, "ESHOP_SLUG_CONFLICT");
    }
    throw error;
  }
  return getManagedEshopById(id, db);
}


export async function createManagedEshop(
  input: ManagedEshopUpdateInput,
  actor: string,
  database?: D1Database,
): Promise<ManagedEshop> {
  const db = getEshopDatabase(database);
  const name = normalizedText(input.name, "Názov", 160);
  const slug = safeSlug(input.slug);
  const websiteUrl = normalizedUrl(input.websiteUrl, "Web e-shopu");
  const description = normalizedText(input.description, "Popis", 3000);
  const sourceUrl = normalizedUrl(input.sourceUrl, "Zdroj");
  const logoUrl = normalizedOptionalUrl(input.logoUrl, "Logo");
  const logoKey = typeof input.logoKey === "string" && input.logoKey.trim() ? input.logoKey.trim().slice(0, 500) : null;
  const focusTags = normalizeEshopFocusTags(input.focusTags);
  const status = input.status === "published" || input.status === "archived" ? input.status : "draft";
  const now = new Date().toISOString();
  const publishedAt = status === "published" ? now : null;

  try {
    const row = await db.prepare(`
      INSERT INTO managed_eshops (
        slug,name,website_url,description,source_url,logo_url,logo_key,focus_tags_json,
        status,created_at,updated_at,published_at,created_by,updated_by
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10,?11,?12,?12)
      RETURNING id
    `).bind(
      slug,name,websiteUrl,description,sourceUrl,logoUrl,logoKey,JSON.stringify(focusTags),
      status,now,publishedAt,actor,
    ).first<{ id: number }>();
    if (!row?.id) throw new EshopRatingError("E-shop sa nepodarilo vytvoriť.", 503, "CREATE_FAILED");
    const created = await getManagedEshopById(Number(row.id), db);
    if (!created) throw new EshopRatingError("E-shop sa po vytvorení nepodarilo načítať.", 503, "CREATE_FAILED");
    return created;
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      throw new EshopRatingError("E-shop s rovnakou adresou profilu už existuje.", 409, "ESHOP_SLUG_CONFLICT");
    }
    throw error;
  }
}
