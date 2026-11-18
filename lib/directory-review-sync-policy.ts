/**
 * The Admin review checkbox is the owner-controlled synchronization lock.
 * Notion mirrors that value but can never mark a profile reviewed or unlock it.
 * Whole-page timestamps are not a proof of intentional review changes.
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
  // Only an intentional Admin checkbox edit can lock/unlock a profile.
  return "push";
}
