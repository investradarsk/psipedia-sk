import { isTransientPublicReadError } from "./public-read-retry.ts";

/** Identify the failing read boundary, not SQL or visitor-supplied filters. */
export type DirectoryPublicReadStage =
  | "listing"
  | "category_previews"
  | "hero_visual"
  | "article_discovery";

export function reportDirectoryPublicReadFailure(stage: DirectoryPublicReadStage, error: unknown): never {
  console.error(JSON.stringify({
    event: "public_directory_read_failed",
    stage,
    transient: isTransientPublicReadError(error),
    errorType: error instanceof Error ? "Error" : "unknown",
  }));
  // Preserve the existing SSR failure and error handling. Never fabricate
  // an empty directory on a database outage.
  throw error;
}
