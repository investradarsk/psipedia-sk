import { notionPageMustSkipInboundSync } from "./admin-record-lifecycle";
import { notionDirectoryPageBelongsToSource, NotionDirectoryUnsafeTargetError } from "./notion-directory-update-safety";
import {
  notionFlagEnabled,
  notionPropertyRecord,
  notionRequest,
  notionRichTextProperty,
  type NotionSyncBindings,
} from "./notion-sync-shared";

/**
 * The Admin/D1 SQL checkbox is the sole authority. Notion mirrors this flag
 * but never writes it back to D1, and the historical source_data_json is not
 * read or updated by this isolated synchronization path.
 */
export const DIRECTORY_REVIEW_NOTION_PROPERTY = "Odkontrolované";

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
  status: string;
  updated_at: string;
  reviewed_at: string;
  unlock_pending: number;
  review_updated_at: string;
};

export type DirectoryReviewSyncResult =
  | "disabled"
  | "unmapped"
  | "skipped"
  | "unchanged"
  | "pushed";

function reviewedInNotion(page: DirectoryReviewPage): boolean {
  const value = notionPropertyRecord(page, DIRECTORY_REVIEW_NOTION_PROPERTY)?.checkbox;
  if (typeof value !== "boolean") {
    throw new Error("DIRECTORY_REVIEW_NOTION_CHECKBOX_MISSING");
  }
  return value;
}

const REVIEW_SQL = [
  "SELECT p.status,p.updated_at,",
  "COALESCE(s.reviewed_at,'') AS reviewed_at,",
  "COALESCE(s.unlock_pending,0) AS unlock_pending,",
  "COALESCE(s.updated_at,'') AS review_updated_at",
  "FROM directory_profiles p",
  "LEFT JOIN directory_profile_review_state s ON s.profile_id=p.id",
  "WHERE p.id=? LIMIT 1",
].join(" ");

async function loadReviewRow(database: D1Database, profileId: number) {
  return database.prepare(REVIEW_SQL).bind(profileId).first<DirectoryReviewRow>();
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

function sameReviewRevision(left: DirectoryReviewRow, right: DirectoryReviewRow): boolean {
  return left.updated_at === right.updated_at &&
    left.review_updated_at === right.review_updated_at &&
    left.reviewed_at === right.reviewed_at &&
    Number(left.unlock_pending) === Number(right.unlock_pending);
}

/**
 * Mirror one mapped profile's Admin-controlled review flag from SQL to Notion.
 * No data import, old JSON baseline, editorial hash, or D1 content write.
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

  const state = await loadReviewRow(input.database, input.profileId);
  if (!state || state.status === "archived" || Number(state.unlock_pending) === 1) {
    return "skipped";
  }
  const adminReviewed = Boolean(state.reviewed_at?.trim());
  const page = input.page ?? await fetchReviewPage(input.bindings, mapping.notion_page_id);
  verifyReviewPage({
    page, pageId: mapping.notion_page_id, profileId: input.profileId, sourceId,
  });
  if (reviewedInNotion(page) === adminReviewed) return "unchanged";

  // Refetch both sides to avoid applying a stale webhook or Admin snapshot.
  const latest = await fetchReviewPage(input.bindings, mapping.notion_page_id);
  verifyReviewPage({
    page: latest, pageId: mapping.notion_page_id, profileId: input.profileId, sourceId,
  });
  if (reviewedInNotion(latest) === adminReviewed) return "unchanged";
  const current = await loadReviewRow(input.database, input.profileId);
  if (!current || current.status === "archived" ||
      Number(current.unlock_pending) === 1 || !sameReviewRevision(state, current)) {
    throw new Error("DIRECTORY_REVIEW_CONCURRENT_CHANGE");
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
  verifyReviewPage({
    page: echo, pageId: mapping.notion_page_id, profileId: input.profileId, sourceId,
  });
  if (reviewedInNotion(echo) !== adminReviewed) {
    throw new Error("DIRECTORY_REVIEW_NOTION_ECHO_MISMATCH");
  }
  return "pushed";
}
