import { notionRequest, type NotionPage, type NotionSyncBindings } from "./notion-sync-shared";
import { notionPageBelongsToDataSource } from "./notion-sync-page-ownership";

type OwnedPage = NotionPage & {
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean;
  in_trash?: boolean;
};

/** Fetch one complete Notion breed data source, verifying page ownership. */
export async function fetchBreedNotionInventory(
  source: string, bindings: NotionSyncBindings,
): Promise<OwnedPage[]> {
  if (!/^[a-f0-9]{8}(?:-?[a-f0-9]{4}){3}-?[a-f0-9]{12}$/i.test(source))
    throw Error("BREED_WORKCOPY_SOURCE_ID_INVALID");
  const pages: OwnedPage[] = [], seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const response = await notionRequest<{
      results?: OwnedPage[];
      has_more?: boolean; next_cursor?: string | null;
    }>(bindings, "/data_sources/" + encodeURIComponent(source) + "/query", {
      method: "POST",
      body: JSON.stringify({
        page_size: 100, ...(cursor ? { start_cursor: cursor } : {}),
      }),
    });
    if (!Array.isArray(response.results) || typeof response.has_more !== "boolean")
      throw Error("BREED_WORKCOPY_SOURCE_INVENTORY_INVALID");
    for (const page of response.results) {
      if (!notionPageBelongsToDataSource(page, source) || seen.has(page.id))
        throw Error("BREED_WORKCOPY_SOURCE_OWNERSHIP_INVALID");
      seen.add(page.id);
      pages.push(page);
    }
    if (pages.length > 500 || (response.has_more && !response.next_cursor))
      throw Error("BREED_WORKCOPY_SOURCE_INVENTORY_INCOMPLETE");
    cursor = response.has_more ? response.next_cursor ?? null : null;
  } while (cursor);
  return pages;
}
