import { notionPageMustSkipInboundSync } from "./admin-record-lifecycle";
import { directory0173ReviewSqlMirrorStatement } from "./directory-0173-review-state-sql";
import {
  mergeDirectoryProfileReviewMetadata,
  readDirectoryProfileReviewMetadata,
  type DirectoryImportData,
} from "./directory-profile-metadata";
import { planDirectoryReviewSync } from "./directory-review-sync-policy";
import { notionDirectoryPageBelongsToSource, NotionDirectoryUnsafeTargetError } from "./notion-directory-update-safety";
import {
  notionFlagEnabled,
  notionPropertyRecord,
  notionRequest,
  notionRichTextProperty,
  type NotionSyncBindings,
} from "./notion-sync-shared";

export const DIRECTORY_REVIEW_NOTION_PROPERTY = "Odkontrolované";
const REVIEW_SYNC_BASELINE_KEY = "_psipedia_profile_review_notion_synced";

type DirectoryReviewBindings = NotionSyncBindings & {
  NOTION_DIRECTORY_SYNC_ENABLED?: string;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
};

type DirectoryReviewPage = {
  id: string;
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean;
  in_trash?: boolean;
  properties?: Record<string, unknown>;
};

type DirectoryReviewRow = {
  source_data_json: string;
  status: string;
  updated_at: string;
};

export type DirectoryReviewSyncResult =
  | "disabled"
  | "unmapped"
  | "skipped"
  | "unchanged"
  | "acknowledged"
  | "pushed"
  | "pulled";

function reviewedInNotion(page: DirectoryReviewPage): boolean {
  const value = notionPropertyRecord(page, DIRECTORY_REVIEW_NOTION_PROPERTY)?.checkbox;
  if (typeof value !== "boolean") {
    throw new Error("DIRECTORY_REVIEW_NOTION_CHECKBOX_MISSING");
  }
  return value;
}

function sourceDataFromRow(row: DirectoryReviewRow): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(row.source_data_json);
  } catch {
    throw new Error("DIRECTORY_REVIEW_SOURCE_JSON_INVALID");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("DIRECTORY_REVIEW_SOURCE_JSON_INVALID");
  }
  return value as Record<string, unknown>;
}

function storedReviewBaseline(source: Record<string, unknown>): boolean | null {
  if (source[REVIEW_SYNC_BASELINE_KEY] === "1") return true;
  if (source[REVIEW_SYNC_BASELINE_KEY] === "0") return false;
  return null;
}

async function loadSourceRow(database: D1Database, profileId: number) {
  return database.prepare(
    "SELECT source_data_json, status, updated_at FROM directory_profiles WHERE id=? LIMIT 1",
  ).bind(profileId).first<DirectoryReviewRow>();
}

async function saveReviewedAndBaseline(input: {
  database: D1Database;
  profileId: number;
  row: DirectoryReviewRow;
  source: Record<string, unknown>;
  reviewed: boolean;
  changedByNotion: boolean;
}) {
  // A metadata-only CAS prevents this field mirror from overwriting a
  // concurrent Admin editor save or another Notion field-event patch.
  const next = input.changedByNotion
    ? mergeDirectoryProfileReviewMetadata(
        input.source as DirectoryImportData,
        input.reviewed,
        "notion-directory-sync@psipedia.sk",
      )
    : { ...input.source };
  next[REVIEW_SYNC_BASELINE_KEY] = input.reviewed ? "1" : "0";
  const activateLock = input.changedByNotion && input.reviewed;
  const projectedAt = new Date().toISOString();
  const projectedBy = "notion-directory-sync@psipedia.sk";
  const nextSourceJson = JSON.stringify(next);
  const profileUpdatedAt = activateLock ? projectedAt : input.row.updated_at;
  const sql = "UPDATE directory_profiles SET source_data_json=?" +
    (activateLock ? ", updated_at=?, updated_by=?" : "") +
    " WHERE id=? AND source_data_json=? AND updated_at=? RETURNING id";
  const values = activateLock
    ? [nextSourceJson, projectedAt,
        projectedBy, input.profileId,
        input.row.source_data_json, input.row.updated_at]
    : [nextSourceJson, input.profileId, input.row.source_data_json, input.row.updated_at];
  // Acknowledging the checkbox baseline also projects the *current* owner
  // lock; an outdated Notion checkbox is not allowed to unlock a profile.
  const canonical = input.database.prepare(sql).bind(...values);
  const reviewMirror = directory0173ReviewSqlMirrorStatement({
    database: input.database, profileId: input.profileId,
    sourceDataJson: nextSourceJson, profileUpdatedAt,
    projectedAt, projectedBy,
  });
  const responses = await input.database.batch([canonical, reviewMirror]);
  if (!(responses[0]?.results?.[0] as { id?: number } | undefined)?.id)
    throw new Error("DIRECTORY_REVIEW_CONCURRENT_CHANGE");
}

async function fetchReviewPage(bindings: DirectoryReviewBindings, pageId: string) {
  return notionRequest<DirectoryReviewPage>(
    bindings, "/pages/" + encodeURIComponent(pageId),
  );
}

function verifyReviewPage(input: {
  page: DirectoryReviewPage;
  pageId: string;
  profileId: number;
  sourceId: string;
}) {
  if (input.page.id !== input.pageId ||
      !notionDirectoryPageBelongsToSource(input.page, input.sourceId) ||
      notionRichTextProperty(input.page, "Psipedia ID") !== String(input.profileId)) {
    throw new NotionDirectoryUnsafeTargetError("DIRECTORY_REVIEW_NOTION_IDENTITY_MISMATCH");
  }
  reviewedInNotion(input.page);
}

/**
 * Reconcile ONLY the review checkbox of one already mapped directory profile.
 * This never touches editorial hashes, unrelated profile values or Sync stav.
 * Admin is the sole authority for locking/unlocking. This isolated
 * checkbox mirror remains permitted even after the editorial sync lock.
 */
export async function syncDirectoryReviewedWithNotion(input: {
  database: D1Database;
  bindings: DirectoryReviewBindings;
  profileId: number;
  page?: DirectoryReviewPage;
}): Promise<DirectoryReviewSyncResult> {
  if (!notionFlagEnabled(input.bindings.NOTION_DIRECTORY_SYNC_ENABLED)) return "disabled";
  const sourceId = input.bindings.NOTION_DIRECTORY_DATA_SOURCE_ID?.trim() ?? "";
  if (!input.bindings.NOTION_API_TOKEN?.trim() || !sourceId) {
    throw new Error("DIRECTORY_REVIEW_NOTION_CONFIGURATION_MISSING");
  }
  if (!Number.isSafeInteger(input.profileId) || input.profileId <= 0) {
    throw new Error("DIRECTORY_REVIEW_PROFILE_ID_INVALID");
  }
  const mapping = await input.database.prepare(
    "SELECT notion_page_id FROM directory_notion_sync WHERE directory_profile_id=? LIMIT 1",
  ).bind(input.profileId).first<{ notion_page_id: string }>();
  if (!mapping) return "unmapped";
  if (await notionPageMustSkipInboundSync(input.database, mapping.notion_page_id)) {
    return "skipped";
  }

  const row = await loadSourceRow(input.database, input.profileId);
  if (!row) return "skipped";
  if (row.status === "archived") return "skipped";
  const source = sourceDataFromRow(row);
  const adminReviewed = readDirectoryProfileReviewMetadata(source as DirectoryImportData).reviewed;
  const baseline = storedReviewBaseline(source);

  const page = input.page ?? await fetchReviewPage(input.bindings, mapping.notion_page_id);
  verifyReviewPage({
    page, pageId: mapping.notion_page_id, profileId: input.profileId, sourceId,
  });
  const notionReviewed = reviewedInNotion(page);
  const plan = planDirectoryReviewSync({ adminReviewed, notionReviewed, baseline });
  if (plan === "unchanged") return "unchanged";

  if (plan === "acknowledge") {
    await saveReviewedAndBaseline({
      database: input.database, profileId: input.profileId, row, source,
      reviewed: adminReviewed, changedByNotion: false,
    });
    return "acknowledged";
  }

  // Refresh a stale scan/webhook page before applying either direction.
  const latest = await fetchReviewPage(input.bindings, mapping.notion_page_id);
  verifyReviewPage({
    page: latest, pageId: mapping.notion_page_id, profileId: input.profileId, sourceId,
  });
  if (reviewedInNotion(latest) !== notionReviewed) {
    throw new Error("DIRECTORY_REVIEW_NOTION_VALUE_CHANGED");
  }
  const beforeWrite = await loadSourceRow(input.database, input.profileId);
  if (!beforeWrite || beforeWrite.source_data_json !== row.source_data_json) {
    throw new Error("DIRECTORY_REVIEW_CONCURRENT_CHANGE");
  }

  if (plan === "pull") {
    await saveReviewedAndBaseline({
      database: input.database, profileId: input.profileId, row, source,
      reviewed: notionReviewed, changedByNotion: true,
    });
    return "pulled";
  }

  const echo = await notionRequest<DirectoryReviewPage>(
    input.bindings, "/pages/" + encodeURIComponent(mapping.notion_page_id),
    {
      method: "PATCH",
      body: JSON.stringify({
        properties: { [DIRECTORY_REVIEW_NOTION_PROPERTY]: { checkbox: adminReviewed } },
      }),
    },
  );
  if (echo.id !== mapping.notion_page_id ||
      !notionDirectoryPageBelongsToSource(echo, sourceId) ||
      reviewedInNotion(echo) !== adminReviewed) {
    throw new Error("DIRECTORY_REVIEW_NOTION_ECHO_MISMATCH");
  }
  await saveReviewedAndBaseline({
    database: input.database, profileId: input.profileId, row, source,
    reviewed: adminReviewed, changedByNotion: false,
  });
  return "pushed";
}
