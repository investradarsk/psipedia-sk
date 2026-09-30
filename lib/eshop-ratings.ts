import { env } from "cloudflare:workers";
import type { EshopRatingField, EshopRatingInput } from "@/lib/eshop-rating-domain";

export type PublicEshop = {
  id: number; slug: string; name: string; websiteUrl: string; description: string; sourceUrl: string;
  ratingCount: number; averages: EshopRatingInput | null;
};

export type ManagedEshop = PublicEshop & {
  status: "draft" | "published" | "archived"; createdAt: string; updatedAt: string; publishedAt: string | null;
};

type RuntimeBindings = { DB?: D1Database };
type EshopRow = {
  id: number; slug: string; name: string; website_url: string; description: string; source_url: string;
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
    ratingCount: Math.max(0, Number(row.rating_count ?? 0)), averages: mapAverages(row),
  };
}

const PUBLIC_SELECT = `
  SELECT shop.id,shop.slug,shop.name,shop.website_url,shop.description,shop.source_url,shop.status,
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
    ...mapPublic(row), status: row.status === "published" || row.status === "archived" ? row.status : "draft",
    createdAt: row.created_at, updatedAt: row.updated_at, publishedAt: row.published_at,
  }));
}

export async function countManagedEshops(database?: D1Database) {
  const db = getEshopDatabase(database);
  const row = await db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published FROM managed_eshops")
    .first<{ total: number; published: number }>();
  return { total: Math.max(0, Number(row?.total ?? 0)), published: Math.max(0, Number(row?.published ?? 0)) };
}
