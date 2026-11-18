/**
 * The Admin review checkbox is the owner-controlled synchronization lock.
 * Notion mirrors that value but cannot mark a profile reviewed or unlock it.
 * Whole-page timestamps are not proof of a specific field edit.
 */
export type DirectoryReviewPlan = "unchanged" | "acknowledge" | "push" | "pull";

export function planDirectoryReviewSync(input: {
  adminReviewed: boolean;
  notionReviewed: boolean;
  baseline: boolean | null;
}): DirectoryReviewPlan {
  const { adminReviewed, notionReviewed, baseline } = input;
  // The marker is controlled ONLY in Admin, including initial review and unlock.
  if (baseline === null) {
    return adminReviewed === notionReviewed ? "acknowledge" : "push";
  }
  if (adminReviewed === notionReviewed) {
    return adminReviewed === baseline ? "unchanged" : "acknowledge";
  }
  return "push";
}
