export type DirectoryImportData = Record<string, string | number | null>;

export const DIRECTORY_QUALITY_RECHECK_DAYS = 365;

export const directoryQualityFields = ["phone", "email", "website", "image", "address"] as const;
export type DirectoryQualityField = (typeof directoryQualityFields)[number];

export const directoryQualityResolutionStatuses = [
  "DOES_NOT_EXIST",
  "NOT_PUBLIC",
  "NOT_APPLICABLE",
  "NOT_FOUND",
] as const;
export type DirectoryQualityResolutionStatus = (typeof directoryQualityResolutionStatuses)[number];

export type DirectoryQualityResolution = {
  status: DirectoryQualityResolutionStatus;
  checkedAt: string;
};

export type DirectoryQualityMetadata = Partial<Record<DirectoryQualityField, DirectoryQualityResolution>>;
export type DirectoryQualityResolutionInput = Partial<Record<DirectoryQualityField, DirectoryQualityResolutionStatus | "">>;

const qualityKeyPrefix = "_psipedia_quality_";
const profileReviewKeyPrefix = "_psipedia_profile_review_";
const profileReviewedAtKey = `${profileReviewKeyPrefix}reviewed_at`;
const profileReviewedByKey = `${profileReviewKeyPrefix}reviewed_by`;

export type DirectoryProfileReviewMetadata = {
  reviewed: boolean;
  reviewedAt: string;
  reviewedBy: string;
};

export function readDirectoryProfileReviewMetadata(
  data: DirectoryImportData | null | undefined,
): DirectoryProfileReviewMetadata {
  const reviewedAtValue = data?.[profileReviewedAtKey];
  const reviewedByValue = data?.[profileReviewedByKey];
  const reviewedAt = typeof reviewedAtValue === "string" ? reviewedAtValue.trim() : "";
  const reviewedBy = typeof reviewedByValue === "string" ? reviewedByValue.trim() : "";
  return {
    reviewed: Boolean(reviewedAt),
    reviewedAt,
    reviewedBy,
  };
}

export function mergeDirectoryProfileReviewMetadata(
  current: DirectoryImportData | null | undefined,
  reviewed: boolean,
  reviewedBy: string,
  nowIso = new Date().toISOString(),
) {
  const next: DirectoryImportData = { ...(current ?? {}) };
  if (reviewed) {
    next[profileReviewedAtKey] = nowIso;
    next[profileReviewedByKey] = reviewedBy.trim();
  } else {
    delete next[profileReviewedAtKey];
    delete next[profileReviewedByKey];
  }
  return next;
}

export function directoryQualityStatusSourceKey(field: DirectoryQualityField) {
  return `${qualityKeyPrefix}${field}_status`;
}

export function directoryQualityCheckedAtSourceKey(field: DirectoryQualityField) {
  return `${qualityKeyPrefix}${field}_checked_at`;
}

export function isDirectoryInternalMetadataKey(key: string) {
  return key.startsWith(qualityKeyPrefix) || key.startsWith(profileReviewKeyPrefix);
}

function isResolutionStatus(value: unknown): value is DirectoryQualityResolutionStatus {
  return typeof value === "string" && (directoryQualityResolutionStatuses as readonly string[]).includes(value);
}

export function readDirectoryQualityMetadata(data: DirectoryImportData | null | undefined): DirectoryQualityMetadata {
  const result: DirectoryQualityMetadata = {};
  for (const field of directoryQualityFields) {
    const status = data?.[directoryQualityStatusSourceKey(field)];
    const checkedAt = data?.[directoryQualityCheckedAtSourceKey(field)];
    if (!isResolutionStatus(status)) continue;
    result[field] = {
      status,
      checkedAt: typeof checkedAt === "string" ? checkedAt : "",
    };
  }
  return result;
}

export function isDirectoryQualityResolutionCurrent(
  metadata: DirectoryQualityMetadata | null | undefined,
  field: DirectoryQualityField,
  now = new Date(),
) {
  const resolution = metadata?.[field];
  if (!resolution || !isResolutionStatus(resolution.status)) return false;
  const checkedAt = Date.parse(resolution.checkedAt);
  if (!Number.isFinite(checkedAt)) return false;
  const cutoff = now.getTime() - DIRECTORY_QUALITY_RECHECK_DAYS * 24 * 60 * 60 * 1000;
  return checkedAt >= cutoff;
}

export function directoryQualityCheckedAtSummary(metadata: DirectoryQualityMetadata | null | undefined) {
  const values = directoryQualityFields
    .map((field) => metadata?.[field]?.checkedAt ?? "")
    .filter((value) => Number.isFinite(Date.parse(value)));
  if (!values.length) return "";
  return values.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

export function mergeDirectoryQualityMetadata(
  current: DirectoryImportData | null | undefined,
  input: DirectoryQualityResolutionInput | undefined,
  present: Partial<Record<DirectoryQualityField, boolean>>,
  nowIso = new Date().toISOString(),
  options: { refreshCheckedAt?: boolean } = {},
) {
  const next: DirectoryImportData = { ...(current ?? {}) };
  const existing = readDirectoryQualityMetadata(next);

  for (const field of directoryQualityFields) {
    const statusKey = directoryQualityStatusSourceKey(field);
    const checkedAtKey = directoryQualityCheckedAtSourceKey(field);

    if (present[field]) {
      delete next[statusKey];
      delete next[checkedAtKey];
      continue;
    }

    const requested = input?.[field];
    if (requested === undefined) continue;
    if (!requested || !isResolutionStatus(requested)) {
      delete next[statusKey];
      delete next[checkedAtKey];
      continue;
    }

    next[statusKey] = requested;
    next[checkedAtKey] = options.refreshCheckedAt
      ? nowIso
      : existing[field]?.status === requested && existing[field]?.checkedAt
        ? existing[field]!.checkedAt
        : nowIso;
  }

  return next;
}

const contactAliases = {
  phone: ["Telefón", "Telefon", "phone"],
  email: ["E-mail", "Email", "email"],
  website: ["Web", "Webstránka"],
  facebook: ["Facebook"],
  instagram: ["Instagram"],
} as const;

function firstValue(data: DirectoryImportData | null | undefined, keys: readonly string[]) {
  for (const key of keys) {
    const value = data?.[key];
    if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
  }
  return "";
}

export function readDirectoryPublicContacts(
  data: DirectoryImportData | null | undefined,
  websiteFallback = "",
) {
  return {
    phone: firstValue(data, contactAliases.phone),
    email: firstValue(data, contactAliases.email),
    website: firstValue(data, contactAliases.website) || websiteFallback,
    facebook: firstValue(data, contactAliases.facebook),
    instagram: firstValue(data, contactAliases.instagram),
  };
}

export function mergeDirectoryPublicContactData(
  current: DirectoryImportData | null | undefined,
  input: {
    publicPhone?: string;
    publicEmail?: string;
    websiteUrl?: string | null;
    facebookUrl?: string;
    instagramUrl?: string;
  },
) {
  const next: DirectoryImportData = { ...(current ?? {}) };
  const replace = (keys: readonly string[], canonical: string, value: string | null | undefined) => {
    if (value === undefined) return;
    for (const key of keys) delete next[key];
    if (value) next[canonical] = value;
  };

  replace(contactAliases.phone, "Telefón", input.publicPhone);
  replace(contactAliases.email, "E-mail", input.publicEmail);
  replace(contactAliases.website, "Web", input.websiteUrl);
  replace(contactAliases.facebook, "Facebook", input.facebookUrl);
  replace(contactAliases.instagram, "Instagram", input.instagramUrl);
  return next;
}
