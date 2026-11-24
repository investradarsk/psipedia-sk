import { directoryCategoryMembershipSql } from "@/lib/directory-multi-category";
import type { ProfileReviewReadDatabase } from "@/lib/profile-review-read";

export type ServiceReviewCatalogRow = {
  id: number;
  name: string;
  slug: string;
  category: string;
  city: string | null;
  district: string | null;
  resource_id: string | null;
  review_count: number;
  average_rating: number | null;
};

export const SERVICE_REVIEW_PAGE_SIZE = 24;
export type ServiceReviewSort = "rating" | "count" | "name";

export async function listServiceReviewCatalog(
  db: ProfileReviewReadDatabase,
  category: string,
  query: string,
  sort: ServiceReviewSort,
  page: number,
) {
  const term = query.trim().slice(0, 100).replace(/[!%_]/g, "!$&");
  const where = `p.status='published' AND p.archived_at IS NULL AND
    ${directoryCategoryMembershipSql("p")} AND
    (p.name LIKE ? ESCAPE '!' OR p.city LIKE ? ESCAPE '!' OR p.district LIKE ? ESCAPE '!')`;
  const pattern = `%${term}%`;
  const bindings = [category, category, pattern, pattern, pattern];
  const total = Number((await db.prepare(
    `SELECT COUNT(*) AS total FROM directory_profiles p WHERE ${where}`,
  ).bind(...bindings).first<{ total: number }>())?.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / SERVICE_REVIEW_PAGE_SIZE));
  const currentPage = Math.min(pages, Math.max(1, Number.isSafeInteger(page) ? page : 1));
  const order = sort === "name" ? "p.name COLLATE NOCASE, p.id"
    : sort === "count" ? "review_count DESC, average_rating DESC, p.name COLLATE NOCASE, p.id"
      : "average_rating DESC, review_count DESC, p.name COLLATE NOCASE, p.id";
  const result = await db.prepare(`
    SELECT p.id,p.name,p.slug,p.category,p.city,p.district,r.id AS resource_id,
      COUNT(v.id) AS review_count,AVG(v.overall_rating) AS average_rating
    FROM directory_profiles p
    LEFT JOIN partner_resources r ON r.directory_profile_id=p.id AND r.entity_type='DIRECTORY_PROFILE'
    LEFT JOIN profile_reviews v ON v.resource_id=r.id AND v.status='VISIBLE'
    WHERE ${where}
    GROUP BY p.id,r.id
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).bind(...bindings, SERVICE_REVIEW_PAGE_SIZE, (currentPage - 1) * SERVICE_REVIEW_PAGE_SIZE).all<ServiceReviewCatalogRow>();
  return { rows: result.results, total, pages, page: currentPage };
}
