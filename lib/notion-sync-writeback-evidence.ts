/**
 * A response is not a durable synchronized baseline until Notion echoes the
 * exact existing page ID and the full canonical editorial snapshot.
 *
 * Keep transport/normalization owned by the calling agenda. This helper does
 * no writes, retries or logging, and cannot authorize publication.
 */
export async function requireNotionWritebackEvidence<TPage extends {
  id: string;
  properties?: Record<string, unknown>;
}>(
  page: TPage | null | undefined,
  expectedPageId: string,
  expectedHash: string,
  hashPage: (page: TPage) => Promise<string>,
): Promise<void> {
  if (!expectedPageId || !expectedHash || !page?.id
    || page.id !== expectedPageId || !page.properties
    || await hashPage(page) !== expectedHash) {
    throw new Error("NOTION_EDITORIAL_WRITEBACK_ECHO_MISMATCH");
  }
}
