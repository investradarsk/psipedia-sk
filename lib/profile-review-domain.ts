import {
  isReviewableCanonicalResourceType,
  type ReviewableCanonicalResourceType,
} from "./canonical-resource.ts";

export const profileReviewStatuses = [
  "PENDING_REVIEW",
  "VISIBLE",
  "HIDDEN",
  "REJECTED",
  "AUTHOR_DELETED",
  "REMOVED",
] as const;
export type ProfileReviewStatus = (typeof profileReviewStatuses)[number];

const PROFILE_REVIEW_TRANSITIONS: Record<ProfileReviewStatus, readonly ProfileReviewStatus[]> = {
  PENDING_REVIEW: ["VISIBLE", "REJECTED", "AUTHOR_DELETED", "REMOVED"],
  VISIBLE: ["HIDDEN", "AUTHOR_DELETED", "REMOVED"],
  HIDDEN: ["VISIBLE", "REJECTED", "AUTHOR_DELETED", "REMOVED"],
  REJECTED: ["PENDING_REVIEW", "AUTHOR_DELETED"],
  AUTHOR_DELETED: ["PENDING_REVIEW"],
  REMOVED: ["PENDING_REVIEW"],
};


export const PROFILE_REVIEW_RATING_SCHEMA_VERSION = 1;
export const PROFILE_REVIEW_BODY_MIN = 20;
export const PROFILE_REVIEW_BODY_MAX = 5000;

export type ProfileReviewDimension = {
  key: string;
  label: string;
  required: boolean;
};

export type ProfileReviewRatingConfig = {
  schemaVersion: number;
  dimensions: readonly ProfileReviewDimension[];
};

const genericDimensions = [
  { key: "communication", label: "Komunikácia", required: false },
  { key: "service_quality", label: "Kvalita služby", required: false },
] as const;

export const profileReviewRatingConfigs = {
  "DIRECTORY_PROFILE:veterinari": {
    schemaVersion: 1,
    dimensions: [
      { key: "approach", label: "Prístup", required: false },
      { key: "communication", label: "Komunikácia", required: false },
      { key: "care_quality", label: "Kvalita starostlivosti", required: false },
    ],
  },
  "DIRECTORY_PROFILE:hotely-a-opatrovanie": {
    schemaVersion: 1,
    dimensions: [
      { key: "care", label: "Starostlivosť", required: false },
      { key: "communication", label: "Komunikácia", required: false },
      { key: "environment", label: "Prostredie", required: false },
    ],
  },
  "DIRECTORY_PROFILE:treneri": {
    schemaVersion: 1,
    dimensions: [
      { key: "approach", label: "Prístup", required: false },
      { key: "communication", label: "Komunikácia", required: false },
      { key: "training_quality", label: "Kvalita tréningu", required: false },
    ],
  },
  "DIRECTORY_PROFILE:psie-skoly": {
    schemaVersion: 1,
    dimensions: [
      { key: "approach", label: "Prístup", required: false },
      { key: "communication", label: "Komunikácia", required: false },
      { key: "training_quality", label: "Kvalita tréningu", required: false },
    ],
  },
  "HELP_ORGANIZATION": {
    schemaVersion: 1,
    dimensions: genericDimensions,
  },
  "DIRECTORY_PROFILE:*": {
    schemaVersion: 1,
    dimensions: genericDimensions,
  },
} as const satisfies Record<string, ProfileReviewRatingConfig>;

export function isProfileReviewStatus(value: unknown): value is ProfileReviewStatus {
  return typeof value === "string" && (profileReviewStatuses as readonly string[]).includes(value);
}

export function profileReviewCountsTowardAggregate(status: ProfileReviewStatus | string) {
  return status === "VISIBLE";
}

export function canTransitionProfileReview(from: ProfileReviewStatus, to: ProfileReviewStatus) {
  return PROFILE_REVIEW_TRANSITIONS[from].includes(to);
}

export function assertProfileReviewTransition(from: ProfileReviewStatus, to: ProfileReviewStatus) {
  if (!canTransitionProfileReview(from, to)) {
    throw new Error(`Invalid profile review transition: ${from} -> ${to}`);
  }
}

export function assertReviewableResourceType(value: unknown): ReviewableCanonicalResourceType {
  if (!isReviewableCanonicalResourceType(value)) throw new Error("Resource type is not reviewable.");
  return value;
}

export function normalizeOverallRating(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
    throw new Error("Overall rating must be an integer from 1 to 5.");
  }
  return Number(value);
}

export function normalizeProfileReviewBody(value: unknown) {
  if (typeof value !== "string") throw new Error("Review body is required.");
  const normalized = value.replace(/\r\n?/g, "\n").trim();
  if (normalized.length < PROFILE_REVIEW_BODY_MIN || normalized.length > PROFILE_REVIEW_BODY_MAX) {
    throw new Error(`Review body must contain ${PROFILE_REVIEW_BODY_MIN} to ${PROFILE_REVIEW_BODY_MAX} characters.`);
  }
  return normalized;
}

export function normalizeServiceMonth(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new Error("Service month must use YYYY-MM.");
  }
  return value;
}

export function reviewRatingConfig(input: {
  entityType: ReviewableCanonicalResourceType;
  category?: string | null;
}): ProfileReviewRatingConfig {
  if (input.entityType === "HELP_ORGANIZATION") return profileReviewRatingConfigs.HELP_ORGANIZATION;
  const exact = input.category
    ? profileReviewRatingConfigs[`DIRECTORY_PROFILE:${input.category}` as keyof typeof profileReviewRatingConfigs]
    : null;
  return exact ?? profileReviewRatingConfigs["DIRECTORY_PROFILE:*"];
}

export function normalizeReviewDimensionValues(
  config: ProfileReviewRatingConfig,
  values: readonly { key: unknown; value: unknown }[],
) {
  const allowed = new Set(config.dimensions.map((dimension) => dimension.key));
  const seen = new Set<string>();
  const normalized = values.map((item) => {
    if (typeof item.key !== "string" || !allowed.has(item.key)) throw new Error("Unsupported review rating dimension.");
    if (seen.has(item.key)) throw new Error("Duplicate review rating dimension.");
    seen.add(item.key);
    return { key: item.key, value: normalizeOverallRating(item.value) };
  });
  for (const required of config.dimensions.filter((dimension) => dimension.required)) {
    if (!seen.has(required.key)) throw new Error(`Missing required review rating dimension: ${required.key}`);
  }
  return normalized;
}
