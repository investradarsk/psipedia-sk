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

export type DirectorySyncErrorKind =
  | "MISSING_HOUSE_NUMBER"
  | "INVALID_LOCALITY"
  | "ILLEGAL_INVOCATION"
  | "INVALID_PHONE"
  | "INVALID_EMAIL"
  | "INVALID_WEBSITE"
  | "REMOTE_IMAGE_BLOCKED"
  | "OTHER";

export function classifyDirectorySyncError(message: string): DirectorySyncErrorKind {
  const error = message.trim().toLowerCase();
  if (/illegal invocation|incorrect `this` reference/.test(error)) return "ILLEGAL_INVOCATION";
  if (/číslo domu/.test(error)) return "MISSING_HOUSE_NUMBER";
  if (/kraj|okres|obec|lokalit/.test(error)) return "INVALID_LOCALITY";
  if (/telefón/.test(error)) return "INVALID_PHONE";
  if (/e-mail/.test(error)) return "INVALID_EMAIL";
  if (/webov/.test(error)) return "INVALID_WEBSITE";
  if (/obrázok|http 403|http 404/.test(error)) return "REMOTE_IMAGE_BLOCKED";
  return "OTHER";
}
