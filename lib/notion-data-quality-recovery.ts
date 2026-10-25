/**
 * NOTION-DATA-QUALITY-RECOVERY-1: a bounded, value-free review queue.
 * Snapshot hashes are not field-level baselines. In a two-sided edit we can
 * identify differing CURRENT fields, but cannot choose a winner automatically.
 */
export const NOTION_REVIEW_BATCH_SIZE = 100;

export type NotionReviewReason =
  | "BIDIRECTIONAL_CONFLICT"
  | "BACKFILL_BASELINE_MISMATCH"
  | "LEGACY_BASELINE_MISMATCH"
  | "IDENTITY_CONFLICT"
  | "MAPPING_CONFLICT"
  | "MISSING_CANONICAL"
  | "OUT_OF_DOMAIN"
  | "DUPLICATE_CONFLICT";

export type NotionReviewItem = {
  entityId: number | null;
  notionPageId: string | null;
  reason: NotionReviewReason;
  fields: string[];
  action: "REVIEW_REQUIRED";
  // A hash cannot distinguish which individual field was edited first.
  baselineAvailable: boolean;
  notionChanged: boolean | null;
  psipediaChanged: boolean | null;
};

export type NotionReviewQueue = {
  total: number;
  items: NotionReviewItem[];
  remaining: number;
  batchSize: number;
};

export function emptyNotionReviewQueue(): NotionReviewQueue {
  return { total: 0, items: [], remaining: 0, batchSize: NOTION_REVIEW_BATCH_SIZE };
}

export function appendNotionReview(
  queue: NotionReviewQueue,
  input: Omit<NotionReviewItem, "action">,
): void {
  queue.total += 1;
  if (queue.items.length < NOTION_REVIEW_BATCH_SIZE) {
    queue.items.push({
      ...input,
      fields: [...new Set(input.fields)].sort((a, b) => a.localeCompare(b, "sk-SK")),
      action: "REVIEW_REQUIRED",
    });
  }
  queue.remaining = Math.max(0, queue.total - queue.items.length);
}

/** Only an independently confirmed identical CURRENT snapshot may clear
 * a historic CONFLICT flag. Other validation failures must remain visible. */
export function canClearResolvedNotionConflict(input: {
  canonicalHash: string;
  notionHash: string;
  syncStatus: string;
  syncError: string;
}): boolean {
  return Boolean(
    input.canonicalHash
    && input.canonicalHash === input.notionHash
    && input.syncStatus === "Chyba"
    && input.syncError.startsWith("CONFLICT:"),
  );
}

/**
 * A repeated already-recorded conflict must not PATCH Notion again.
 * Rewriting an unchanged error advances Notion's last_edited_time and can
 * create phantom bidirectional changes. Real divergent data still needs review.
 */
export function notionConflictMetadataNeedsWrite(input: {
  syncStatus: string;
  syncError: string;
  message: string;
}): boolean {
  const expected = `CONFLICT: ${input.message}`.slice(0, 1800);
  return input.syncStatus !== "Chyba" || input.syncError !== expected;
}

export type DirectorySyncErrorKind =
  | "BIDIRECTIONAL_CONFLICT"
  | "CONFIRMED_SITE_REVIEW_REQUIRED"
  | "MISSING_HOUSE_NUMBER"
  | "INVALID_LOCALITY"
  | "ILLEGAL_INVOCATION"
  | "INVALID_PHONE"
  | "INVALID_EMAIL"
  | "INVALID_WEBSITE"
  | "REMOTE_IMAGE_HTTP_403"
  | "REMOTE_IMAGE_HTTP_522"
  | "INVALID_IMAGE_FORMAT"
  | "REMOTE_IMAGE_BLOCKED"
  | "DUPLICATE_IDENTITY"
  | "GOOGLE_PLACE_MISMATCH"
  | "PRIVACY_REVIEW_REQUIRED"
  | "LEGACY_BASELINE_MISMATCH"
  | "OTHER";

export function classifyDirectorySyncError(message: string): DirectorySyncErrorKind {
  const error = message.trim().toLowerCase();
  if (/^conflict:|bidirectional.conflict/.test(error)) return "BIDIRECTIONAL_CONFLICT";
  if (/illegal invocation|incorrect .this. reference/.test(error)) return "ILLEGAL_INVOCATION";
  if (/potvrden.*prevádz|confirmed.service.location/.test(error)) return "CONFIRMED_SITE_REVIEW_REQUIRED";
  if (/duplic|duplicitn|identity already/.test(error)) return "DUPLICATE_IDENTITY";
  if (/google.place.*mismatch|nesúlad.*google.miesto/.test(error)) return "GOOGLE_PLACE_MISMATCH";
  if (/privacy|súkromn.*lokalit|verejn.*presnos/.test(error)) return "PRIVACY_REVIEW_REQUIRED";
  if (/legacy.*baseline|stale baseline|baseline mismatch/.test(error)) return "LEGACY_BASELINE_MISMATCH";
  if (/číslo domu/.test(error)) return "MISSING_HOUSE_NUMBER";
  if (/kraj|okres|obec|lokalit/.test(error)) return "INVALID_LOCALITY";
  if (/telefón/.test(error)) return "INVALID_PHONE";
  if (/e-mail/.test(error)) return "INVALID_EMAIL";
  if (/webov/.test(error)) return "INVALID_WEBSITE";
  if (/http[\s(:-]*403/.test(error)) return "REMOTE_IMAGE_HTTP_403";
  if (/http[\s(:-]*522/.test(error)) return "REMOTE_IMAGE_HTTP_522";
  if (/neplatn.*formát.*obráz|invalid.image.format|unsupported.image|image.*mime/.test(error)) return "INVALID_IMAGE_FORMAT";
  if (/obrázok|http 404/.test(error)) return "REMOTE_IMAGE_BLOCKED";
  return "OTHER";
}
