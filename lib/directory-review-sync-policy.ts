/**
 * Per-checkbox last-acknowledged comparison. Whole-page Notion timestamps are
 * not evidence of a specific field change. On the first run, D1 wins so legacy
 * test checkmarks cannot be silently imported from a new empty Notion column.
 */
export type DirectoryReviewPlan = "unchanged" | "acknowledge" | "push" | "pull";

export function planDirectoryReviewSync(input: {
  adminReviewed: boolean;
  notionReviewed: boolean;
  baseline: boolean | null;
}): DirectoryReviewPlan {
  const { adminReviewed, notionReviewed, baseline } = input;
  if (baseline === null) {
    return adminReviewed === notionReviewed ? "acknowledge" : "push";
  }
  if (adminReviewed === notionReviewed) {
    return adminReviewed === baseline ? "unchanged" : "acknowledge";
  }
  return adminReviewed === baseline ? "pull" : "push";
}
