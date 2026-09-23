import {
  assertReviewableResourceType,
  type CanonicalResourceType,
  type ReviewableCanonicalResourceType,
} from "./canonical-resource.ts";
import { reviewRatingConfig } from "./profile-review-domain.ts";

export const PUBLIC_PROFILE_REVIEW_PAGE_SIZE = 10;
export const PUBLIC_REVIEW_AUTHOR_FALLBACK = "Používateľ Psipedia.sk";

export type ProfileReviewReadStatement = {
  bind(...values: unknown[]): ProfileReviewReadStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
};

export type ProfileReviewReadDatabase = {
  prepare(sql: string): ProfileReviewReadStatement;
};

export type PublicProfileReviewTarget = {
  entityType: CanonicalResourceType;
  canonicalId: number;
  category?: string | null;
};

export type PublicReviewRatingDistribution = {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
};

export type PublicReviewDimensionAverage = {
  key: string;
  label: string;
  average: number;
};

export type PublicReviewDimensionValue = {
  key: string;
  label: string;
  value: number;
};

export type PublicReviewProviderReply = {
  body: string;
  publishedAt: string;
};

export type PublicProfileReview = {
  id: string;
  displayName: string;
  overallRating: number;
  body: string;
  serviceMonth: string | null;
  serviceTypeLabel: string | null;
  publishedAt: string;
  dimensions: PublicReviewDimensionValue[];
  providerReply: PublicReviewProviderReply | null;
  helpfulCount: number;
};

export type PublicProfileReviewSummary = {
  count: number;
  average: number | null;
  distribution: PublicReviewRatingDistribution;
  dimensions: PublicReviewDimensionAverage[];
};

export type PublicProfileReviewData = {
  resourceId: string;
  summary: PublicProfileReviewSummary;
  reviews: PublicProfileReview[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type ResourceRow = { id: string; entity_type: string };
type SummaryRow = {
  review_count: number;
  average_rating: number | null;
  rating_1: number;
  rating_2: number;
  rating_3: number;
  rating_4: number;
  rating_5: number;
};
type DimensionAverageRow = { dimension_key: string; average_rating: number };
type ReviewRow = {
  id: string;
  overall_rating: number;
  body: string;
  service_month: string | null;
  service_type_key: string | null;
  rating_schema_version: number;
  created_at: string;
  published_at: string | null;
  display_name: string | null;
  reply_body: string | null;
  reply_created_at: string | null;
  helpful_count: number;
};
type ReviewDimensionRow = { review_id: string; dimension_key: string; value: number };

function positiveId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Canonical review target ID must be a positive integer.");
  return value;
}

function resourceLookup(entityType: ReviewableCanonicalResourceType) {
  if (entityType === "DIRECTORY_PROFILE") {
    return "SELECT id, entity_type FROM partner_resources WHERE entity_type='DIRECTORY_PROFILE' AND directory_profile_id=? LIMIT 1";
  }
  return "SELECT id, entity_type FROM partner_resources WHERE entity_type='HELP_ORGANIZATION' AND help_organization_id=? LIMIT 1";
}

export async function resolvePublicReviewResource(
  database: ProfileReviewReadDatabase,
  target: PublicProfileReviewTarget,
) {
  const entityType = assertReviewableResourceType(target.entityType);
  const canonicalId = positiveId(target.canonicalId);
  const row = await database.prepare(resourceLookup(entityType)).bind(canonicalId).first<ResourceRow>();
  if (!row) throw new Error("Canonical review resource anchor is missing.");
  if (row.entity_type !== entityType) throw new Error("Canonical review resource type mismatch.");
  return { id: row.id, entityType };
}

export function normalizePublicReviewPage(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function roundPublicRating(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function safePublicReviewDisplayName(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 120) : PUBLIC_REVIEW_AUTHOR_FALLBACK;
}

export function safePublicServiceMonth(value: string | null | undefined) {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
}

export function publicReviewServiceTypeLabel(_value: string | null | undefined) {
  // REVIEWS-1B intentionally does not expose raw keys. Add labels here only when
  // a canonical service-type catalogue exists.
  return null;
}

function emptyDistribution(): PublicReviewRatingDistribution {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
}

async function loadSummary(database: ProfileReviewReadDatabase, resourceId: string) {
  const row = await database.prepare(`SELECT
      COUNT(*) AS review_count,
      AVG(overall_rating) AS average_rating,
      SUM(CASE WHEN overall_rating=1 THEN 1 ELSE 0 END) AS rating_1,
      SUM(CASE WHEN overall_rating=2 THEN 1 ELSE 0 END) AS rating_2,
      SUM(CASE WHEN overall_rating=3 THEN 1 ELSE 0 END) AS rating_3,
      SUM(CASE WHEN overall_rating=4 THEN 1 ELSE 0 END) AS rating_4,
      SUM(CASE WHEN overall_rating=5 THEN 1 ELSE 0 END) AS rating_5
    FROM profile_reviews
    WHERE resource_id=? AND status='VISIBLE'`).bind(resourceId).first<SummaryRow>();

  const count = Number(row?.review_count ?? 0);
  const distribution = emptyDistribution();
  distribution[1] = Number(row?.rating_1 ?? 0);
  distribution[2] = Number(row?.rating_2 ?? 0);
  distribution[3] = Number(row?.rating_3 ?? 0);
  distribution[4] = Number(row?.rating_4 ?? 0);
  distribution[5] = Number(row?.rating_5 ?? 0);

  return {
    count,
    average: count > 0 ? Number(row?.average_rating ?? 0) : null,
    distribution,
  };
}

async function loadDimensionAverages(
  database: ProfileReviewReadDatabase,
  resourceId: string,
  entityType: ReviewableCanonicalResourceType,
  category?: string | null,
) {
  const config = reviewRatingConfig({ entityType, category });
  const { results } = await database.prepare(`SELECT
      values_table.dimension_key,
      AVG(values_table.value) AS average_rating
    FROM profile_review_rating_values values_table
    INNER JOIN profile_reviews review ON review.id=values_table.review_id
    WHERE review.resource_id=?
      AND review.status='VISIBLE'
      AND review.rating_schema_version=?
    GROUP BY values_table.dimension_key`)
    .bind(resourceId, config.schemaVersion)
    .all<DimensionAverageRow>();

  const byKey = new Map(config.dimensions.map((dimension) => [dimension.key, dimension.label]));
  return results
    .filter((row) => byKey.has(row.dimension_key))
    .map((row) => ({
      key: row.dimension_key,
      label: byKey.get(row.dimension_key)!,
      average: Number(row.average_rating),
    }))
    .sort((left, right) => config.dimensions.findIndex((item) => item.key === left.key)
      - config.dimensions.findIndex((item) => item.key === right.key));
}

async function loadReviewRows(
  database: ProfileReviewReadDatabase,
  resourceId: string,
  page: number,
  pageSize: number,
) {
  const offset = (page - 1) * pageSize;
  const { results } = await database.prepare(`SELECT
      review.id,
      review.overall_rating,
      review.body,
      review.service_month,
      review.service_type_key,
      review.rating_schema_version,
      review.created_at,
      review.published_at,
      author.display_name,
      reply.body AS reply_body,
      reply.created_at AS reply_created_at,
      COALESCE(helpful.helpful_count, 0) AS helpful_count
    FROM profile_reviews review
    INNER JOIN review_authors author ON author.id=review.author_id
    LEFT JOIN profile_review_provider_replies reply
      ON reply.review_id=review.id AND reply.status='VISIBLE'
    LEFT JOIN (
      SELECT review_id, COUNT(*) AS helpful_count
      FROM profile_review_helpful_votes
      GROUP BY review_id
    ) helpful ON helpful.review_id=review.id
    WHERE review.resource_id=? AND review.status='VISIBLE'
    ORDER BY COALESCE(review.published_at, review.created_at) DESC, review.id DESC
    LIMIT ? OFFSET ?`)
    .bind(resourceId, pageSize, offset)
    .all<ReviewRow>();
  return results;
}

async function loadReviewDimensions(
  database: ProfileReviewReadDatabase,
  reviewRows: ReviewRow[],
  entityType: ReviewableCanonicalResourceType,
  category?: string | null,
) {
  if (!reviewRows.length) return new Map<string, PublicReviewDimensionValue[]>();
  const config = reviewRatingConfig({ entityType, category });
  const supportedReviews = reviewRows.filter((row) => Number(row.rating_schema_version) === config.schemaVersion);
  if (!supportedReviews.length) return new Map<string, PublicReviewDimensionValue[]>();

  const ids = supportedReviews.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(",");
  const { results } = await database.prepare(`SELECT review_id, dimension_key, value
    FROM profile_review_rating_values
    WHERE review_id IN (${placeholders})
    ORDER BY review_id ASC, dimension_key ASC`)
    .bind(...ids)
    .all<ReviewDimensionRow>();

  const labels = new Map(config.dimensions.map((dimension) => [dimension.key, dimension.label]));
  const order = new Map(config.dimensions.map((dimension, index) => [dimension.key, index]));
  const grouped = new Map<string, PublicReviewDimensionValue[]>();
  for (const row of results) {
    const label = labels.get(row.dimension_key);
    if (!label) continue;
    const current = grouped.get(row.review_id) ?? [];
    current.push({ key: row.dimension_key, label, value: Number(row.value) });
    grouped.set(row.review_id, current);
  }
  for (const values of grouped.values()) {
    values.sort((left, right) => (order.get(left.key) ?? 999) - (order.get(right.key) ?? 999));
  }
  return grouped;
}

export async function getPublicProfileReviewData(
  database: ProfileReviewReadDatabase,
  target: PublicProfileReviewTarget,
  options: { page?: unknown; pageSize?: number } = {},
): Promise<PublicProfileReviewData> {
  const resource = await resolvePublicReviewResource(database, target);
  const pageSize = Math.max(1, Math.min(50, Math.trunc(options.pageSize ?? PUBLIC_PROFILE_REVIEW_PAGE_SIZE)));
  const basePage = normalizePublicReviewPage(options.page);

  const [summaryBase, dimensions] = await Promise.all([
    loadSummary(database, resource.id),
    loadDimensionAverages(database, resource.id, resource.entityType, target.category),
  ]);

  const totalPages = summaryBase.count > 0 ? Math.ceil(summaryBase.count / pageSize) : 0;
  const page = totalPages > 0 ? Math.min(basePage, totalPages) : 1;
  const reviewRows = summaryBase.count > 0
    ? await loadReviewRows(database, resource.id, page, pageSize)
    : [];
  const reviewDimensions = await loadReviewDimensions(
    database,
    reviewRows,
    resource.entityType,
    target.category,
  );

  const reviews: PublicProfileReview[] = reviewRows.map((row) => ({
    id: row.id,
    displayName: safePublicReviewDisplayName(row.display_name),
    overallRating: Number(row.overall_rating),
    body: row.body,
    serviceMonth: safePublicServiceMonth(row.service_month),
    serviceTypeLabel: publicReviewServiceTypeLabel(row.service_type_key),
    publishedAt: row.published_at || row.created_at,
    dimensions: reviewDimensions.get(row.id) ?? [],
    providerReply: row.reply_body
      ? { body: row.reply_body, publishedAt: row.reply_created_at || row.published_at || row.created_at }
      : null,
    helpfulCount: Math.max(0, Number(row.helpful_count ?? 0)),
  }));

  return {
    resourceId: resource.id,
    summary: {
      count: summaryBase.count,
      average: summaryBase.average,
      distribution: summaryBase.distribution,
      dimensions,
    },
    reviews,
    pagination: {
      page,
      pageSize,
      total: summaryBase.count,
      totalPages,
    },
  };
}
