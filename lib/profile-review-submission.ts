import { env } from "cloudflare:workers";
import { enqueueAdminNotificationEvent } from "@/lib/admin-notifications";
import { normalizePlainText, safeAuditJson } from "@/lib/submission-security";
import {
  PROFILE_REVIEW_BODY_MAX,
  PROFILE_REVIEW_BODY_MIN,
  normalizeOverallRating,
  normalizeProfileReviewBody,
  normalizeReviewDimensionValues,
  normalizeServiceMonth,
  reviewRatingConfig,
  type ProfileReviewStatus,
} from "@/lib/profile-review-domain";
import {
  getReviewAuthorById,
  getReviewAuthorDatabase,
  resolveReviewAuthorSessionToken,
  revokeReviewAuthorSessionToken,
} from "@/lib/review-author-auth-store";
import {
  reviewAuthorSessionTokenFromCookieHeader,
  type ReviewAuthorIdentity,
} from "@/lib/review-author-auth";

export const PROFILE_REVIEW_SUBMISSION_STATUS = "PENDING_REVIEW" as const;

export type ProfileReviewSubmissionTarget = {
  resourceId: string;
  entityType: "DIRECTORY_PROFILE" | "HELP_ORGANIZATION";
  canonicalId: number;
  name: string;
  category: string | null;
  profileHref: string;
};

export type ExistingProfileReview = {
  id: string;
  status: ProfileReviewStatus;
  createdAt: string;
};

export class ProfileReviewSubmissionError extends Error {
  readonly status: number;
  readonly code: string;
  readonly field: string | null;

  constructor(message: string, status = 400, code = "INVALID_SUBMISSION", field: string | null = null) {
    super(message);
    this.name = "ProfileReviewSubmissionError";
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

type ResourceRow = {
  resource_id: string;
  entity_type: string;
  directory_id: number | null;
  directory_name: string | null;
  directory_slug: string | null;
  directory_category: string | null;
  directory_status: string | null;
  directory_archived_at: string | null;
  organization_id: number | null;
  organization_name: string | null;
  organization_slug: string | null;
  organization_status: string | null;
  organization_published_at: string | null;
  organization_archived_at: string | null;
};

type ExistingReviewRow = {
  id: string;
  status: ProfileReviewStatus;
  created_at: string;
};

type RuntimeBindings = { DB?: D1Database };

export function getProfileReviewSubmissionDatabase(database?: D1Database) {
  return getReviewAuthorDatabase(database ?? (env as unknown as RuntimeBindings).DB);
}

function cleanResourceId(value: unknown) {
  if (typeof value !== "string") throw new ProfileReviewSubmissionError("Profil pre recenziu nie je platný.", 400, "INVALID_RESOURCE");
  const clean = value.trim();
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(clean)) {
    throw new ProfileReviewSubmissionError("Profil pre recenziu nie je platný.", 400, "INVALID_RESOURCE");
  }
  return clean;
}

export async function resolveProfileReviewSubmissionTarget(
  resourceIdValue: unknown,
  database?: D1Database,
): Promise<ProfileReviewSubmissionTarget> {
  const resourceId = cleanResourceId(resourceIdValue);
  const db = getProfileReviewSubmissionDatabase(database);
  const row = await db.prepare(`
    SELECT
      r.id AS resource_id,
      r.entity_type,
      d.id AS directory_id,
      d.name AS directory_name,
      d.slug AS directory_slug,
      d.category AS directory_category,
      d.status AS directory_status,
      d.archived_at AS directory_archived_at,
      o.id AS organization_id,
      o.name AS organization_name,
      o.slug AS organization_slug,
      o.status AS organization_status,
      o.published_at AS organization_published_at,
      o.archived_at AS organization_archived_at
    FROM partner_resources r
    LEFT JOIN directory_profiles d ON d.id=r.directory_profile_id
    LEFT JOIN help_organizations o ON o.id=r.help_organization_id
    WHERE r.id=?1
    LIMIT 1
  `).bind(resourceId).first<ResourceRow>();

  if (!row) throw new ProfileReviewSubmissionError("Profil sa nenašiel.", 404, "RESOURCE_NOT_FOUND");

  if (row.entity_type === "MANAGED_EVENT") {
    throw new ProfileReviewSubmissionError("Tento typ profilu zatiaľ nepodporuje recenzie.", 400, "UNSUPPORTED_RESOURCE");
  }

  if (row.entity_type === "DIRECTORY_PROFILE") {
    if (
      !row.directory_id
      || !row.directory_name
      || !row.directory_slug
      || !row.directory_category
      || row.directory_status !== "published"
      || row.directory_archived_at
    ) {
      throw new ProfileReviewSubmissionError("Profil sa nenašiel alebo už nie je verejný.", 404, "RESOURCE_NOT_PUBLIC");
    }
    return {
      resourceId: row.resource_id,
      entityType: "DIRECTORY_PROFILE",
      canonicalId: row.directory_id,
      name: row.directory_name,
      category: row.directory_category,
      profileHref: `/adresar/${row.directory_category}/${row.directory_slug}`,
    };
  }

  if (row.entity_type === "HELP_ORGANIZATION") {
    if (
      !row.organization_id
      || !row.organization_name
      || !row.organization_slug
      || row.organization_status !== "PUBLISHED"
      || !row.organization_published_at
      || row.organization_archived_at
    ) {
      throw new ProfileReviewSubmissionError("Profil sa nenašiel alebo už nie je verejný.", 404, "RESOURCE_NOT_PUBLIC");
    }
    return {
      resourceId: row.resource_id,
      entityType: "HELP_ORGANIZATION",
      canonicalId: row.organization_id,
      name: row.organization_name,
      category: null,
      profileHref: `/organizacie/${row.organization_slug}`,
    };
  }

  throw new ProfileReviewSubmissionError("Tento typ profilu zatiaľ nepodporuje recenzie.", 400, "UNSUPPORTED_RESOURCE");
}

export async function requireProfileReviewSubmissionReviewer(input: {
  cookieHeader?: string | null;
  database?: D1Database;
  now?: Date;
}): Promise<ReviewAuthorIdentity> {
  const db = getProfileReviewSubmissionDatabase(input.database);
  const token = reviewAuthorSessionTokenFromCookieHeader(input.cookieHeader);
  if (!token) {
    throw new ProfileReviewSubmissionError("Pred odoslaním recenzie si overte e-mail.", 401, "REVIEWER_UNAUTHORIZED");
  }

  const now = input.now ?? new Date();
  const session = await resolveReviewAuthorSessionToken(token, now, db);
  if (!session) {
    throw new ProfileReviewSubmissionError("Vaše overenie vypršalo. Overte si e-mail znova.", 401, "REVIEWER_SESSION_EXPIRED");
  }

  const author = await getReviewAuthorById(session.subjectId, db);
  if (!author) {
    await revokeReviewAuthorSessionToken(token, now, db);
    throw new ProfileReviewSubmissionError("Vaše overenie už nie je platné.", 401, "REVIEWER_UNAUTHORIZED");
  }
  if (author.status === "SUSPENDED") {
    await revokeReviewAuthorSessionToken(token, now, db);
    throw new ProfileReviewSubmissionError("Tento reviewer účet momentálne nemôže odosielať recenzie.", 403, "REVIEWER_SUSPENDED");
  }
  if (author.status === "DEACTIVATED") {
    await revokeReviewAuthorSessionToken(token, now, db);
    throw new ProfileReviewSubmissionError("Tento reviewer účet už nie je aktívny.", 403, "REVIEWER_DEACTIVATED");
  }
  if (author.status !== "ACTIVE" || !author.emailVerifiedAt) {
    await revokeReviewAuthorSessionToken(token, now, db);
    throw new ProfileReviewSubmissionError("Pred odoslaním recenzie si overte e-mail.", 401, "REVIEWER_UNAUTHORIZED");
  }

  return {
    authorId: author.id,
    status: "ACTIVE",
    emailVerifiedAt: author.emailVerifiedAt,
    displayName: author.displayName,
  };
}

export async function findExistingProfileReview(
  resourceId: string,
  authorId: string,
  database?: D1Database,
): Promise<ExistingProfileReview | null> {
  const db = getProfileReviewSubmissionDatabase(database);
  const row = await db.prepare(
    "SELECT id,status,created_at FROM profile_reviews WHERE resource_id=?1 AND author_id=?2 LIMIT 1",
  ).bind(resourceId, authorId).first<ExistingReviewRow>();
  return row ? { id: row.id, status: row.status, createdAt: row.created_at } : null;
}

export function existingProfileReviewMessage(status: ProfileReviewStatus) {
  switch (status) {
    case "PENDING_REVIEW":
      return "Tento profil ste už ohodnotili. Vaša recenzia čaká na kontrolu.";
    case "VISIBLE":
      return "Tento profil ste už ohodnotili. Vaša recenzia je už zverejnená.";
    case "HIDDEN":
      return "Tento profil ste už ohodnotili. Recenzia momentálne nie je verejne zobrazená.";
    case "REJECTED":
      return "Tento profil ste už ohodnotili. Zamietnutú recenziu zatiaľ nemožno nahradiť novou.";
    case "AUTHOR_DELETED":
      return "Tento profil ste už ohodnotili. Opätovné vytvorenie recenzie zatiaľ nie je dostupné.";
    case "REMOVED":
      return "Tento profil ste už ohodnotili. Odstránenú recenziu zatiaľ nemožno nahradiť novou.";
  }
}

function normalizeSchemaVersion(value: unknown, expected: number) {
  if (!Number.isInteger(value) || Number(value) !== expected) {
    throw new ProfileReviewSubmissionError("Formulár hodnotenia sa zmenil. Obnovte stránku a skúste to znova.", 409, "SCHEMA_VERSION_MISMATCH");
  }
  return expected;
}

function safeReviewBody(value: unknown) {
  let canonical: string;
  try {
    canonical = normalizeProfileReviewBody(value);
  } catch {
    throw new ProfileReviewSubmissionError(
      `Text recenzie musí mať ${PROFILE_REVIEW_BODY_MIN} až ${PROFILE_REVIEW_BODY_MAX} znakov.`,
      422,
      "INVALID_BODY",
      "body",
    );
  }
  try {
    return normalizePlainText(canonical, {
      min: PROFILE_REVIEW_BODY_MIN,
      max: PROFILE_REVIEW_BODY_MAX,
      field: "body",
    });
  } catch {
    throw new ProfileReviewSubmissionError(
      "Text recenzie musí byť obyčajný text bez HTML alebo spustiteľného obsahu.",
      422,
      "UNSAFE_BODY",
      "body",
    );
  }
}

function safeOverallRating(value: unknown) {
  try {
    return normalizeOverallRating(value);
  } catch {
    throw new ProfileReviewSubmissionError("Vyberte celkové hodnotenie od 1 do 5.", 422, "INVALID_RATING", "overallRating");
  }
}

function safeServiceMonth(value: unknown) {
  try {
    return normalizeServiceMonth(value);
  } catch {
    throw new ProfileReviewSubmissionError("Mesiac služby nie je platný.", 422, "INVALID_SERVICE_MONTH", "serviceMonth");
  }
}

function safeDimensions(config: ReturnType<typeof reviewRatingConfig>, value: unknown) {
  if (!Array.isArray(value) || value.length > config.dimensions.length) {
    throw new ProfileReviewSubmissionError("Doplnkové hodnotenia nie sú platné.", 422, "INVALID_DIMENSIONS", "dimensions");
  }
  try {
    return normalizeReviewDimensionValues(config, value as { key: unknown; value: unknown }[]);
  } catch {
    throw new ProfileReviewSubmissionError("Doplnkové hodnotenia nie sú platné.", 422, "INVALID_DIMENSIONS", "dimensions");
  }
}

export function evaluateProfileReviewRiskFlags(body: string) {
  const flags: string[] = [];
  const urlCount = (body.match(/https?:\/\//gi) ?? []).length;
  if (urlCount >= 3) flags.push("EXCESSIVE_URLS");
  if (/(.)\1{11,}/u.test(body)) flags.push("REPEATED_CHARACTERS");
  return flags;
}

export function normalizeProfileReviewSubmission(input: {
  target: ProfileReviewSubmissionTarget;
  overallRating: unknown;
  body: unknown;
  serviceMonth: unknown;
  ratingSchemaVersion: unknown;
  dimensions: unknown;
}) {
  const config = reviewRatingConfig({ entityType: input.target.entityType, category: input.target.category });
  return {
    overallRating: safeOverallRating(input.overallRating),
    body: safeReviewBody(input.body),
    serviceMonth: safeServiceMonth(input.serviceMonth),
    serviceTypeKey: null,
    ratingSchemaVersion: normalizeSchemaVersion(input.ratingSchemaVersion, config.schemaVersion),
    dimensions: safeDimensions(config, input.dimensions),
    riskFlags: [] as string[],
    config,
  };
}

function requestId(request: Request) {
  const value = request.headers.get("cf-ray")?.trim() || request.headers.get("x-request-id")?.trim() || "";
  return /^[A-Za-z0-9._:-]{1,120}$/.test(value) ? value : null;
}

function isUniqueConflict(error: unknown) {
  return error instanceof Error && /UNIQUE constraint failed: profile_reviews\.resource_id, profile_reviews\.author_id|profile_reviews_resource_author_unique/i.test(error.message);
}

export async function createPendingProfileReview(input: {
  request: Request;
  reviewer: ReviewAuthorIdentity;
  target: ProfileReviewSubmissionTarget;
  normalized: ReturnType<typeof normalizeProfileReviewSubmission>;
  database?: D1Database;
  now?: Date;
}) {
  const db = getProfileReviewSubmissionDatabase(input.database);
  const existing = await findExistingProfileReview(input.target.resourceId, input.reviewer.authorId, db);
  if (existing) {
    throw new ProfileReviewSubmissionError(existingProfileReviewMessage(existing.status), 409, "ALREADY_REVIEWED");
  }

  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const reviewId = crypto.randomUUID();
  const riskFlags = evaluateProfileReviewRiskFlags(input.normalized.body);
  const reviewStatement = db.prepare(`
    INSERT INTO profile_reviews (
      id,resource_id,author_id,overall_rating,body,service_month,service_type_key,
      rating_schema_version,status,risk_flags_json,created_at,updated_at,published_at,deleted_at
    ) VALUES (?1,?2,?3,?4,?5,?6,NULL,?7,'PENDING_REVIEW',?8,?9,?9,NULL,NULL)
  `).bind(
    reviewId,
    input.target.resourceId,
    input.reviewer.authorId,
    input.normalized.overallRating,
    input.normalized.body,
    input.normalized.serviceMonth,
    input.normalized.ratingSchemaVersion,
    JSON.stringify(riskFlags),
    nowIso,
  );

  const dimensionStatements = input.normalized.dimensions.map((dimension) =>
    db.prepare(`
      INSERT INTO profile_review_rating_values (
        id,review_id,dimension_key,value,created_at,updated_at
      ) VALUES (?1,?2,?3,?4,?5,?5)
    `).bind(crypto.randomUUID(), reviewId, dimension.key, dimension.value, nowIso)
  );

  const changedFields = [
    "overall_rating",
    "body",
    ...(input.normalized.serviceMonth ? ["service_month"] : []),
    ...(input.normalized.dimensions.length ? ["rating_dimensions"] : []),
  ];
  const moderationEvent = db.prepare(`
    INSERT INTO moderation_events (
      id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,
      from_status,to_status,reason_code,changed_fields_json,request_id,created_at
    ) VALUES (?1,NULL,'PROFILE_REVIEW',?2,'SUBMITTED','REVIEW_AUTHOR',?3,NULL,'PENDING_REVIEW',NULL,?4,?5,?6)
  `).bind(
    crypto.randomUUID(),
    reviewId,
    input.reviewer.authorId,
    safeAuditJson(changedFields),
    requestId(input.request),
    nowIso,
  );

  try {
    await db.batch([reviewStatement, ...dimensionStatements, moderationEvent]);
  } catch (error) {
    if (isUniqueConflict(error)) {
      const duplicate = await findExistingProfileReview(input.target.resourceId, input.reviewer.authorId, db);
      throw new ProfileReviewSubmissionError(
        duplicate ? existingProfileReviewMessage(duplicate.status) : "Tento profil ste už ohodnotili.",
        409,
        "ALREADY_REVIEWED",
      );
    }
    throw error;
  }

  try {
    await enqueueAdminNotificationEvent(db, {
      eventType: "profile_review_submitted",
      sourceType: "PROFILE_REVIEW_MODERATION",
      resourceType: "profile_review",
      resourceRef: reviewId,
      actorType: "REVIEW_AUTHOR",
      actorRef: input.reviewer.authorId,
      targetUrl: `/admin/recenzie-profilov/${reviewId}`,
      title: "Nová recenzia čaká na kontrolu",
      body: `Recenzia profilu ${input.target.name} čaká na moderáciu.`,
      tag: `profile-review-${reviewId}`,
      dedupeKey: `profile-review/${reviewId}`,
    }, now);
  } catch (error) {
    console.error(JSON.stringify({
      event: "profile_review_admin_push_enqueue",
      reviewId,
      result: "failed",
      error: error instanceof Error ? error.message : "unknown",
    }));
  }

  return {
    reviewId,
    status: PROFILE_REVIEW_SUBMISSION_STATUS,
    riskFlags,
    profileHref: input.target.profileHref,
  };
}
